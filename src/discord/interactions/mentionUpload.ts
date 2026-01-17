/**
 * What: Handler for @mention uploads - when users mention the bot with a PDF attachment.
 * How: Listens for messages that mention the bot and have PDF attachments, then uploads to backend.
 */
import { Message } from 'discord.js';
import FormData from 'form-data';
import { logger } from '../../util/log.js';
import { config, isGuildAllowed, isChannelAllowed } from '../../config/env.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

type LibrarianUploadResponse = {
  success: boolean;
  book_id?: string;
  filename: string;
  chunks_count?: number;
  status: 'indexed' | 'already_exists' | 'failed_parse' | 'failed_embed' | 'failed_insert' | 'failed_save';
  error?: string;
};

export async function handleMentionUpload(message: Message, botUserId: string): Promise<void> {
  // Check if bot is mentioned
  if (!message.mentions.has(botUserId)) {
    return;
  }

  // Check for PDF attachments
  const pdfAttachments = message.attachments.filter(
    (att) => att.name?.toLowerCase().endsWith('.pdf')
  );

  if (pdfAttachments.size === 0) {
    return; // No PDFs attached, ignore
  }

  // Context guards
  if (!message.guildId || !message.channelId) {
    return;
  }

  if (!isGuildAllowed(message.guildId)) {
    logger.info('Upload mention from non-allowed guild', { guildId: message.guildId });
    return;
  }

  if (!isChannelAllowed(message.guildId, message.channelId)) {
    logger.info('Upload mention from non-allowed channel', { guildId: message.guildId, channelId: message.channelId });
    return;
  }

  // Process each PDF attachment
  for (const [, attachment] of pdfAttachments) {
    // Validate file size
    if (attachment.size > MAX_FILE_SIZE) {
      await message.reply({
        content: `**${attachment.name}** is too large. Maximum size is 25MB. Your file is ${(attachment.size / (1024 * 1024)).toFixed(1)}MB.`,
      });
      continue;
    }

    // React to show we're processing
    try {
      await message.react('📚');
    } catch {
      // Ignore reaction errors
    }

    try {
      // Download file from Discord CDN
      logger.info({ filename: attachment.name, size: attachment.size, url: attachment.url }, 'Downloading attachment from Discord');

      const downloadRes = await fetch(attachment.url);
      if (!downloadRes.ok) {
        throw new Error(`Failed to download file from Discord: ${downloadRes.status}`);
      }

      const fileBuffer = Buffer.from(await downloadRes.arrayBuffer());

      // Build multipart form data
      const form = new FormData();
      form.append('file', fileBuffer, {
        filename: attachment.name,
        contentType: 'application/pdf',
      });

      // POST to librarian backend
      const url = `${config.librarianBaseUrl}/upload`;
      const headers: Record<string, string> = {
        ...form.getHeaders(),
      };
      if (config.librarianApiKey) {
        headers.Authorization = `Bearer ${config.librarianApiKey}`;
      }

      logger.info({ filename: attachment.name, url }, 'Uploading to librarian backend');

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: form.getBuffer(),
      });

      const data = (await res.json()) as LibrarianUploadResponse;

      // Build response message based on status
      let replyMessage: string;
      if (data.success) {
        if (data.status === 'already_exists') {
          replyMessage = `📚 **${data.filename}** already exists in the library.\nBook ID: \`${data.book_id}\`\nChunks: ${data.chunks_count ?? 'unknown'}`;
        } else {
          replyMessage = `✅ **${data.filename}** has been indexed successfully!\nBook ID: \`${data.book_id}\`\nChunks: ${data.chunks_count ?? 'unknown'}`;
        }
      } else {
        replyMessage = `❌ Failed to process **${data.filename}**\nStatus: ${data.status}\nError: ${data.error ?? 'Unknown error'}`;
      }

      await message.reply({ content: replyMessage });

      logger.info('MENTION UPLOAD completed', {
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author?.id,
        filename: attachment.name,
        success: data.success,
        status: data.status,
      });
    } catch (err: any) {
      logger.error('Mention upload request failed', { err: String(err), filename: attachment.name });
      await message.reply({ content: `❌ Upload failed for **${attachment.name}**: ${String(err)}` });
    }
  }
}

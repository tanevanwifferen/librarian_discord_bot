/**
 * What: Handler for /librarian upload subcommand that uploads PDFs to the Librarian backend.
 * How: Validates attachment, downloads from Discord CDN, POSTs to backend /upload endpoint.
 */
import { ChatInputCommandInteraction } from 'discord.js';
import FormData from 'form-data';
import { logger } from '../../util/log.js';
import { config } from '../../config/env.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

type LibrarianUploadResponse = {
  success: boolean;
  book_id?: string;
  filename: string;
  chunks_count?: number;
  status: 'indexed' | 'already_exists' | 'failed_parse' | 'failed_embed' | 'failed_insert' | 'failed_save';
  error?: string;
};

export async function handleUpload(interaction: ChatInputCommandInteraction) {
  const attachment = interaction.options.getAttachment('file', true);

  // Validate file extension
  if (!attachment.name.toLowerCase().endsWith('.pdf')) {
    await interaction.reply({
      content: 'Only PDF files are allowed. Please upload a file with a .pdf extension.',
      ephemeral: true,
    });
    return;
  }

  // Validate file size
  if (attachment.size > MAX_FILE_SIZE) {
    await interaction.reply({
      content: `File too large. Maximum size is 25MB. Your file is ${(attachment.size / (1024 * 1024)).toFixed(1)}MB.`,
      ephemeral: true,
    });
    return;
  }

  // Defer reply since upload may take a while
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false });
    }
  } catch (err) {
    logger.info('Failed to defer reply (/upload)', { err: String(err) });
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
    let message: string;
    if (data.success) {
      if (data.status === 'already_exists') {
        message = `📚 **${data.filename}** already exists in the library.\nBook ID: \`${data.book_id}\`\nChunks: ${data.chunks_count ?? 'unknown'}`;
      } else {
        message = `✅ **${data.filename}** has been indexed successfully!\nBook ID: \`${data.book_id}\`\nChunks: ${data.chunks_count ?? 'unknown'}`;
      }
    } else {
      message = `❌ Failed to process **${data.filename}**\nStatus: ${data.status}\nError: ${data.error ?? 'Unknown error'}`;
    }

    const payload = { content: message };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply(payload);
    }

    logger.info('UPLOAD completed', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user?.id,
      filename: attachment.name,
      success: data.success,
      status: data.status,
    });
  } catch (err: any) {
    logger.error('Upload request failed', { err: String(err) });
    const payload = { content: `❌ Upload failed: ${String(err)}` };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }
  }
}

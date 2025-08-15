/**
 * What: Button interaction handler for Librarian result actions that performs actual upload to Discord.
 * How:
 *  - UPLOAD: Downloads the file from Librarian GET /books/by-filename/:filename/download and replies with it as an attachment.
 *  - ASK: Provides a helper message to use /librarian chat.
 */
import { AttachmentBuilder, ButtonInteraction } from 'discord.js';
import { logger } from '../../util/log.js';
import { parseCustomId } from '../../util/discord.js';
import { config } from '../../config/env.js';

function parseFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
  // content-disposition: attachment; filename="file name.pdf"
  const m = /filename\*?=(?:UTF-8''|")?([^\";]+)"?/i.exec(cd);
  if (m && m[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return null;
}

export async function handleButton(interaction: ButtonInteraction) {
  const { customId } = interaction;

  const parsed = parseCustomId(customId);
  if (!parsed) {
    logger.warn('Unknown or malformed custom_id', { customId });
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'Unknown action for this button.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Unknown action for this button.', ephemeral: true });
    }
    return;
  }

  const ctx = {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user?.id,
    filename: 'filename' in parsed ? parsed.filename : undefined,
    id: 'id' in parsed ? parsed.id : undefined,
    action: parsed.action,
  };

  switch (parsed.action) {
    case 'UPLOAD': {
      logger.info('BUTTON UPLOAD clicked', ctx);

      // Defer immediately (public message) to avoid 3s timeout while we fetch the file.
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: false });
        }
      } catch (err) {
        logger.info('Failed to defer reply (BUTTON UPLOAD)', { err: String(err) });
      }

      const url =
        'id' in parsed
          ? `${config.librarianBaseUrl}/books/${parsed.id}/download`
          : `${config.librarianBaseUrl}/books/by-filename/${encodeURIComponent(parsed.filename)}/download`;
      try {
        const headers: Record<string, string> = {};
        if (config.librarianApiKey) headers.Authorization = `Bearer ${config.librarianApiKey}`;

        const res = await fetch(url, { method: 'GET', headers });
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const data = await res.json();
            msg = (data as any)?.error?.message || msg;
          } catch {}
          const display = 'filename' in parsed ? parsed.filename : parsed.id;
          const payload = { content: `Download failed for ${display}: ${msg}` };
          if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
          else await interaction.reply({ ...payload, ephemeral: true });
          return;
        }

        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);

        const cd = res.headers.get('content-disposition');
        const detectedName = parseFilenameFromContentDisposition(cd) || ('filename' in parsed ? parsed.filename : `${parsed.id}.bin`);

        const attachment = new AttachmentBuilder(buf, { name: detectedName });

        const payload = {
          content: `Uploading ${detectedName}`,
          files: [attachment],
        };

        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.reply({ ...payload, ephemeral: false });
      } catch (err: any) {
        const display = 'filename' in parsed ? parsed.filename : parsed.id;
        const payload = { content: `Download failed for ${display}: ${String(err)}` };
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.reply({ ...payload, ephemeral: true });
      }
      break;
    }
    case 'ASK': {
      logger.info('BUTTON ASK clicked', ctx);
      const reply = {
        content:
          `Use /librarian chat to ask your question. The assistant will reference indexed content as context.`,
        ephemeral: true as const,
      };
      if (interaction.deferred || interaction.replied) await interaction.followUp(reply);
      else await interaction.reply(reply);
      break;
    }
  }
}
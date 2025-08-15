/**
 * What: Handler for /librarian request subcommand that uploads the requested book file to Discord.
 * How:
 *  - First tries GET {LIBRARIAN_BASE_URL}/books/by-filename/:filename/download
 *  - If not found (book_not_found), falls back to GET {LIBRARIAN_BASE_URL}/books and looks up an ID match by filename
 *    (case-insensitive, exact match), then calls GET /books/:id/download
 */
import { AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../util/log.js';
import { config } from '../../config/env.js';

function parseFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null;
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

async function fetchAndReplyWithFile(interaction: ChatInputCommandInteraction, url: string, displayName: string) {
  const headers: Record<string, string> = {};
  if (config.librarianApiKey) headers.Authorization = `Bearer ${config.librarianApiKey}`;

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = (data as any)?.error?.message || msg;
    } catch {}
    const payload = { content: `Download failed for ${displayName}: ${msg}` };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply({ ...payload, ephemeral: true });
    return false;
  }

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const cd = res.headers.get('content-disposition');
  const detectedName = parseFilenameFromContentDisposition(cd) || displayName;
  const attachment = new AttachmentBuilder(buf, { name: detectedName });

  const payload = { content: `Uploading ${detectedName}`, files: [attachment] };
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, ephemeral: false });

  return true;
}

export async function handleRequest(interaction: ChatInputCommandInteraction) {
  // Immediately acknowledge the interaction to avoid Discord's ~3s timeout.
  // We defer first, then edit the reply with the file attachment or an error.
  const filename = interaction.options.getString('filename', true);

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false });
    }
  } catch (err) {
    logger.info('Failed to defer reply (/request)', { err: String(err) });
  }

  const byFilenameUrl = `${config.librarianBaseUrl}/books/by-filename/${encodeURIComponent(filename)}/download`;

  try {
    // 1) Try by-filename download
    const headers: Record<string, string> = {};
    if (config.librarianApiKey) headers.Authorization = `Bearer ${config.librarianApiKey}`;
    const res = await fetch(byFilenameUrl, { method: 'GET', headers });

    if (res.ok) {
      // Happy path: stream reply
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const cd = res.headers.get('content-disposition');
      const detectedName = parseFilenameFromContentDisposition(cd) || filename;
      const attachment = new AttachmentBuilder(buf, { name: detectedName });
      const payload = { content: `Uploading ${detectedName}`, files: [attachment] };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, ephemeral: false });

      logger.info('REQUEST upload completed', {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user?.id,
        filename,
      });
      return;
    }

    // 2) If 404 book_not_found, try to resolve by listing /books and matching filename -> id.
    let shouldFallbackToList = false;
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      const serverMsg = (data as any)?.error?.message;
      if (serverMsg) errMsg = serverMsg;
      if (serverMsg === 'book_not_found' && res.status === 404) {
        shouldFallbackToList = true;
      }
    } catch {
      // ignore parse errors
    }

    if (!shouldFallbackToList) {
      const payload = { content: `Download failed for ${filename}: ${errMsg}` };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, ephemeral: true });
      return;
    }

    // 3) Fallback: GET /books, try to find case-insensitive exact filename match, then download by ID.
    const listHeaders: Record<string, string> = {};
    if (config.librarianApiKey) listHeaders.Authorization = `Bearer ${config.librarianApiKey}`;
    const listUrl = `${config.librarianBaseUrl}/books`;
    const listRes = await fetch(listUrl, { method: 'GET', headers: listHeaders });
    if (!listRes.ok) {
      const payload = { content: `Download failed for ${filename}: could not list books (HTTP ${listRes.status})` };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, ephemeral: true });
      return;
    }
    const listData = (await listRes.json()) as { items?: Array<{ id: string; filename: string }> };
    const items = Array.isArray(listData?.items) ? listData.items : [];
    const target = items.find((b) => b.filename?.toLowerCase() === filename.toLowerCase());
    if (!target) {
      const payload = { content: `Download failed for ${filename}: book_not_found` };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, ephemeral: true });
      return;
    }

    const byIdUrl = `${config.librarianBaseUrl}/books/${target.id}/download`;
    await fetchAndReplyWithFile(interaction, byIdUrl, target.filename || filename);
  } catch (err: any) {
    logger.error('Librarian download failed', { err: String(err) });
    const payload = { content: `Download failed for ${filename}: ${String(err)}` };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }
  }
}
// What: Discord UI helpers for embeds, components, and custom_id parsing.
// How: Provides functions to build up to 5 result embeds, action rows with Upload/Ask buttons,
//      and utilities/constants to encode/decode button custom IDs with basic validation.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

export const CUSTOM_ID = {
  UPLOAD: 'LIB:UPLOAD',
  ASK: 'LIB:ASK',
} as const;

// Support filename-based routing (preferred). Keep backward compatibility for older messages carrying bookId.
export type CustomIdParsed =
  | { action: 'UPLOAD'; id: string }
  | { action: 'UPLOAD'; filename: string }
  | { action: 'ASK'; id: string }
  | { action: 'ASK'; filename: string };

export function buildSearchEmbeds(results: Array<{ id?: string; filename?: string; title: string; author?: string; score?: number }>): EmbedBuilder[] {
  const top = results.slice(0, 5); // enforce top-5 only
  return top.map((r, idx) =>
    new EmbedBuilder()
      .setTitle(r.title || `Result ${idx + 1}`)
      .setDescription([
        r.author ? `Author: ${r.author}` : undefined,
        r.score !== undefined ? `Score: ${r.score.toFixed(3)}` : undefined,
        r.filename ? `Filename: ${r.filename}` : (r.id ? `ID: ${r.id}` : undefined),
      ].filter(Boolean).join('\n'))
      .setColor(0x5865F2) // blurple
  );
}

export function buildResultButtons(bookId: string, bookFilename: string, rowIndex?: number) {
  // Ensure unique custom_id per message by suffixing row/button indices.
  // This avoids Discord API error: COMPONENT_CUSTOM_ID_DUPLICATED.
  // Prefer using stable bookId for downstream fetching; filename is still shown in UI embeds.
  const uploadBtn = new ButtonBuilder()
    .setCustomId(encodeCustomId('UPLOAD', bookId, rowIndex, 0, 'bookId'))
    .setLabel('Upload file')
    .setStyle(ButtonStyle.Primary);

  const askBtn = new ButtonBuilder()
    .setCustomId(encodeCustomId('ASK', bookId, rowIndex, 1, 'bookId'))
    .setLabel('Ask about')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(uploadBtn, askBtn);
}

export function encodeCustomId(
  action: 'UPLOAD' | 'ASK',
  value: string,
  rowIndex?: number,
  buttonIndex?: number,
  valueKey: 'filename' | 'bookId' = 'filename'
): string {
  // Encoding with optional suffix to guarantee uniqueness within a single message.
  // Keep IDs short to respect Discord limit (100 chars). Trim value to a safe length when using filenames.
  const safe = String(value);
  const trimmed =
    valueKey === 'filename'
      ? (safe.replace(/[\s]/g, '').length > 64 ? safe.replace(/[\s]/g, '').slice(0, 64) : safe.replace(/[\s]/g, ''))
      : safe; // do not mangle UUIDs
  const base = `${action === 'UPLOAD' ? CUSTOM_ID.UPLOAD : CUSTOM_ID.ASK}:${valueKey}=${trimmed}`;
  if (rowIndex === undefined || buttonIndex === undefined) return base;
  return `${base};r=${rowIndex};b=${buttonIndex}`;
}

export function parseCustomId(customId: string): CustomIdParsed | null {
  // Expected formats (new):
  //  - LIB:UPLOAD:filename=foo.pdf
  //  - LIB:ASK:filename=foo.pdf
  // Optional uniqueness suffix (ignored on parse):
  //  - ...:filename=foo.pdf;r=2;b=1
  // Back-compat (old):
  //  - LIB:UPLOAD:bookId=123
  //  - LIB:ASK:bookId=123
  if (typeof customId !== 'string') return null;
  const parts = customId.split(':');
  if (parts.length !== 3 || parts[0] !== 'LIB') return null;

  const action = parts[1];
  const third = String(parts[2] ?? '');
  const firstKV = third.split(';')[0] ?? ''; // ignore any ;r=...;b=... suffix used for uniqueness
  if (!firstKV) return null;
  const kv = firstKV.split('=');
  if (kv.length !== 2 || !kv[0] || !kv[1]) return null;

  const key = kv[0];
  const value = kv[1];
  if (!value) return null;

  // Return a discriminated union carrying either id or filename.
  if (key === 'bookId') {
    if (action === 'UPLOAD') return { action: 'UPLOAD', id: value };
    if (action === 'ASK') return { action: 'ASK', id: value };
    return null;
  }
  if (key === 'filename') {
    if (action === 'UPLOAD') return { action: 'UPLOAD', filename: value };
    if (action === 'ASK') return { action: 'ASK', filename: value };
    return null;
  }
  return null;
}
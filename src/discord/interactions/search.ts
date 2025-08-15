/**
 * What: Handler for /librarian search subcommand that forwards to Librarian HTTP API.
 * How: POSTs { query, topK: 5 } to {LIBRARIAN_BASE_URL}/search, maps matches to embeds and per-result buttons.
 */
import { ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../util/log.js';
import { config } from '../../config/env.js';
import { buildSearchEmbeds, buildResultButtons } from '../../util/discord.js';

type LibrarianSearchRequest = {
  query: string;
  topK?: number;
};

type LibrarianSearchResponse = {
  query: string;
  topK: number;
  matches: Array<{
    book: { id: string; filename: string; path: string };
    chunk_index: number;
    // Server no longer returns raw chunk content; keep optional for compatibility
    content?: string;
    distance: number;
    score: number;
  }>;
  error?: { message: string };
};

export async function handleSearch(interaction: ChatInputCommandInteraction) {
  // Immediately acknowledge the interaction to avoid Discord's ~3s timeout.
  // We defer first, then edit the reply with the final result or error.
  const query = interaction.options.getString('query', true);

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false });
    }
  } catch (err) {
    logger.info('Failed to defer reply (/search)', { err: String(err) });
  }

  const url = `${config.librarianBaseUrl}/search`;
  const body: LibrarianSearchRequest = { query, topK: 5 };

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.librarianApiKey) headers.Authorization = `Bearer ${config.librarianApiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as LibrarianSearchResponse;
    if (!res.ok || (data as any)?.error) {
      const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
      logger.error('Librarian /search error', { status: res.status, msg });

      const payload = { content: `Search failed: ${msg}` };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: true });
      }
      return;
    }

    // Data returns matches of chunks; pick up to 5 items (first by chunk order) mapped to embeds/buttons by book.
    const results = data.matches.slice(0, 5).map((m) => ({
      id: m.book.id,
      filename: m.book.filename,
      title: m.book.filename,
      author: undefined as string | undefined,
      score: Number((1 - m.distance).toFixed(3)), // clampSimilarity is applied server-side; present an intuitive score
    }));
  
    const embeds = buildSearchEmbeds(results);
    // Pass row index to ensure unique custom_id per button row
    const components = results.map((r, i) => buildResultButtons(r.id!, r.filename!, i));

    const payload = {
      content: `Top ${results.length} results for: "${data.query}"`,
      embeds,
      components,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: false });
    }

    logger.info('SEARCH forwarded', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user?.id,
      query,
      returned: results.length,
    });
  } catch (err: any) {
    logger.error('Librarian /search request failed', { err: String(err) } );
    const payload = { content: `Search failed: ${String(err)}` };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }
  }
}
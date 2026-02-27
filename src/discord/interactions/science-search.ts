/**
 * What: Handler for /librarian science-search subcommand that searches arXiv papers.
 * How: POSTs { query, topK: 5 } to {LIBRARIAN_BASE_URL}/arxiv/search, maps results to embeds with arXiv link buttons.
 */
import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { logger } from '../../util/log.js';
import { config } from '../../config/env.js';

type ArxivSearchResponse = {
  query: string;
  topK: number;
  matches: Array<{
    arxiv_id: string;
    title: string;
    authors: string;
    abstract: string;
    similarity: number;
    categories: string;
  }>;
  error?: { message: string };
};

export async function handleScienceSearch(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString('query', true);

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false });
    }
  } catch (err) {
    logger.info('Failed to defer reply (/science-search)', { err: String(err) });
  }

  const url = `${config.librarianBaseUrl}/arxiv/search`;
  const body = { query, topK: 5 };

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.librarianApiKey) headers.Authorization = `Bearer ${config.librarianApiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as ArxivSearchResponse;
    if (!res.ok || (data as any)?.error) {
      const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
      logger.error('Librarian /arxiv/search error', { status: res.status, msg });

      const payload = { content: `Science search failed: ${msg}` };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply({ ...payload, ephemeral: true });
      }
      return;
    }

    const results = data.matches.slice(0, 5);

    const embeds = results.map((r, idx) =>
      new EmbedBuilder()
        .setTitle(r.title || `Result ${idx + 1}`)
        .setDescription(
          [
            r.authors ? `**Authors:** ${r.authors}` : undefined,
            r.similarity !== undefined ? `**Similarity:** ${r.similarity.toFixed(3)}` : undefined,
            r.categories ? `**Categories:** ${r.categories}` : undefined,
            r.abstract
              ? `\n${r.abstract.length > 300 ? r.abstract.slice(0, 300) + '...' : r.abstract}`
              : undefined,
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .setColor(0xB31B1B), // arXiv red
    );

    const components = results.map((r) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('View on arXiv')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://arxiv.org/abs/${r.arxiv_id}`),
        new ButtonBuilder()
          .setLabel('PDF')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://arxiv.org/pdf/${r.arxiv_id}`),
      ),
    );

    const payload = {
      content: `Top ${results.length} arXiv results for: "${data.query}"`,
      embeds,
      components,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: false });
    }

    logger.info('SCIENCE-SEARCH forwarded', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user?.id,
      query,
      returned: results.length,
    });
  } catch (err: any) {
    logger.error('Librarian /arxiv/search request failed', { err: String(err) });
    const payload = { content: `Science search failed: ${String(err)}` };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }
  }
}

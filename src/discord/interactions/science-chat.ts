/**
 * What: Handler for /librarian science-chat subcommand that chats with arXiv papers as context.
 * How: POSTs to {LIBRARIAN_BASE_URL}/arxiv/chat, formats answer with arXiv source links.
 */
import { ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../util/log.js';
import { config } from '../../config/env.js';

type ArxivChatResponse = {
  answer: string;
  sources?: Array<{ arxiv_id: string; title: string; authors: string; similarity: number }>;
  used_topK?: number;
  error?: { message: string };
};

export async function handleScienceChat(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString('prompt', true);
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  } catch (err) {
    logger.info('Failed to defer reply (/science-chat)', { err: String(err) });
  }

  const url = `${config.librarianBaseUrl}/arxiv/chat`;
  const body = {
    messages: [{ role: 'user', content: prompt }],
    topK: 8,
    temperature: 1,
  };

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.librarianApiKey) headers.Authorization = `Bearer ${config.librarianApiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as ArxivChatResponse;
    if (!res.ok || (data as any)?.error) {
      const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
      logger.error('Librarian /arxiv/chat error', { status: res.status, msg });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Science chat failed: ${msg}` });
      } else {
        await interaction.reply({ content: `Science chat failed: ${msg}`, ephemeral });
      }
      return;
    }

    const sources =
      data.sources && data.sources.length > 0
        ? `\n\nSources:\n${data.sources
            .slice(0, 10)
            .map((s) => `• [${s.title}](https://arxiv.org/abs/${s.arxiv_id})`)
            .join('\n')}`
        : '';

    let content = `${data.answer || '(no answer)'}${sources}`;
    const end = ' {... content truncated ...}';
    if (content.length > 2000) {
      content = content.slice(0, 2000 - end.length) + end;
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral });
    }

    logger.info('SCIENCE-CHAT forwarded', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user?.id,
      used_topK: data.used_topK,
    });
  } catch (err: any) {
    logger.error('Librarian /arxiv/chat request failed', { err: String(err) });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `Science chat failed: ${String(err)}` });
    } else {
      await interaction.reply({ content: `Science chat failed: ${String(err)}`, ephemeral });
    }
  }
}

/**
 * What: Handler for /librarian chat subcommand that forwards to the Librarian HTTP API.
 * How: Extracts 'prompt' and 'ephemeral', calls POST {LIBRARIAN_BASE_URL}/chat with a minimal messages array,
 *      then formats the answer and source citations back to Discord. Uses optional API key for Authorization.
 */
import { ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../util/log.js';
import { config } from '../../config/env.js';

type LibrarianChatRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  topK?: number;
  temperature?: number;
};

type LibrarianChatResponse = {
  answer: string;
  sources?: Array<{ filename: string; chunk_index: number }>;
  used_topK?: number;
  error?: { message: string };
};

export async function handleChat(interaction: ChatInputCommandInteraction) {
  // Immediately acknowledge the interaction to avoid Discord's ~3s timeout.
  // We defer first, then edit the reply with the final result or error.
  const prompt = interaction.options.getString('prompt', true);
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral });
    }
  } catch (err) {
    // If deferring fails (rare), continue; we'll fall back to reply/edit later.
    logger.info('Failed to defer reply', { err: String(err) });
  }

  const url = `${config.librarianBaseUrl}/chat`;
  const body: LibrarianChatRequest = {
    messages: [{ role: 'user', content: prompt }],
    topK: 8,
    temperature: 1,
  };

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.librarianApiKey) {
      headers.Authorization = `Bearer ${config.librarianApiKey}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as LibrarianChatResponse;
    if (!res.ok || (data as any)?.error) {
      const msg = (data as any)?.error?.message || `HTTP ${res.status}`;
      logger.error('Librarian /chat error', { status: res.status, msg });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: `Chat failed: ${msg}` });
      } else {
        await interaction.reply({ content: `Chat failed: ${msg}`, ephemeral });
      }
      return;
    }

    const sources =
      data.sources && data.sources.length > 0
        ? `\n\nSources:\n${data.sources
            .slice(0, 10)
            .map((s) => `• [${s.filename}#${s.chunk_index}]`)
            .join('\n')}`
        : '';

    const content = `${data.answer || '(no answer)'}`; // + sources;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral });
    }

    logger.info('CHAT forwarded', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user?.id,
      used_topK: data.used_topK,
    });
  } catch (err: any) {
    logger.error('Librarian /chat request failed', { err: String(err) });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `Chat failed: ${String(err)}` });
    } else {
      await interaction.reply({ content: `Chat failed: ${String(err)}`, ephemeral });
    }
  }
}
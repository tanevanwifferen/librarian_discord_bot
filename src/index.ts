/**
 * What: Application entrypoint for the Discord bot.
 * How: Loads environment config, initializes logger and Discord client, wires the interaction handler, and logs lifecycle events.
 *      All Librarian API calls are deferred to placeholders; no HTTP calls are made here.
 */

import type { Interaction, Message } from 'discord.js';
import { logger } from './util/log.js';
import { config } from './config/env.js';
import { createClient, loginClient } from './discord/client.js';
import { handleInteractionCreate } from './discord/interactions/handlers.js';
import { handleMentionUpload } from './discord/interactions/mentionUpload.js';

async function main() {
  // Boot log (allowed-context behavior is documented in config/env.ts)
  logger.info('Boot starting', { appId: config.appId });

  const client = createClient();

  client.once('ready', () => {
    logger.info('Client ready', { userTag: client.user?.tag });
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    logger.interaction('received', {
      type: interaction.type,
      guildId: interaction.guildId ?? 'DM',
      channelId: interaction.channelId ?? 'DM',
      userId: interaction.user?.id,
    });

    try {
      await handleInteractionCreate(interaction);
      logger.interaction('responded', {
        type: interaction.type,
        guildId: interaction.guildId ?? 'DM',
        channelId: interaction.channelId ?? 'DM',
        userId: interaction.user?.id,
      });
    } catch (err) {
      logger.error('Unhandled error in interactionCreate', { err });
      if (interaction.isRepliable()) {
        // Best-effort generic error
        const content = 'An unexpected error occurred.';
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content, ephemeral: true });
          } else {
            await interaction.reply({ content, ephemeral: true });
          }
        } catch {
          // swallow
        }
      }
    }
  });

  // Handle @mentions with PDF attachments for uploads
  client.on('messageCreate', async (message: Message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    try {
      await handleMentionUpload(message, client.user!.id);
    } catch (err) {
      logger.error('Unhandled error in messageCreate (mention upload)', { err });
    }
  });

  await loginClient(client);
}

main().catch((err) => {
  logger.error('Fatal boot error', { err });
  process.exitCode = 1;
});
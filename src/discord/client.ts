// What: Discord client factory and context gating helpers.
// How: Creates a discord.js Client with necessary intents, logs in, and exports a helper to validate whether an interaction
//      originates from an allowed guild/channel per env config. Denied interactions are logged and can be replied to by guards.

import { Client, GatewayIntentBits, Partials, Interaction } from 'discord.js';
import { logger } from '../util/log.js';
import { config } from '../config/env.js';

export function createClient(): Client {
  // Minimal intents for application commands and message follow-ups if needed.
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages, // future follow-ups or context checks
    ],
    partials: [Partials.Channel],
  });
  return client;
}

export async function loginClient(client: Client): Promise<Client> {
  await client.login(config.discordToken);
  logger.info('Discord client logged in');
  return client;
}

/**
 * What: Check whether an interaction is allowed based on configured guild/channel lists.
 * How: Validates the interaction's guildId and channelId against env allowlists; returns { allowed, reason }.
 *      Guards will use this to decide whether to public-reply with a denial notice.
 */
export function isAllowedContext(interaction: Interaction): { allowed: boolean; reason?: string } {
  // Deny DMs here; a separate guard will handle messaging but we surface the reason.
  if (!interaction.inGuild()) {
    return { allowed: false, reason: 'dm_disallowed' };
  }
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId!;

  if (config.allowedGuildIds.length > 0 && !config.allowedGuildIds.includes(guildId)) {
    logger.gate('deny', 'guild_not_allowed', { guildId });
    return { allowed: false, reason: 'guild_not_allowed' };
  }

  if (config.allowedChannelIds.length > 0 && !config.allowedChannelIds.includes(channelId)) {
    logger.gate('deny', 'channel_not_allowed', { guildId, channelId });
    return { allowed: false, reason: 'channel_not_allowed' };
  }

  logger.gate('allow', 'context_allowed', { guildId, channelId });
  return { allowed: true };
}
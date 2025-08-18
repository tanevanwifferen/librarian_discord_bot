/**
 * What: Interaction guards enforcing DM disallow and allowed guild/channel context.
 * How: Centralizes public-facing copy via util/messages and uses env helpers that treat empty allow-lists as "allow all".
 */

import { Interaction } from 'discord.js';
import type { RepliableInteraction } from 'discord.js';
import { logger } from '../../util/log.js';
import { isGuildAllowed, isChannelAllowed, contactUserMention } from '../../config/env.js';
import { DM_BLOCKED, SERVER_BLOCKED, CHANNEL_BLOCKED } from '../../util/messages.js';

export async function disallowDM(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable()) return;
  const ri = interaction as RepliableInteraction;
  try {
    const content = DM_BLOCKED;
    if (ri.deferred || ri.replied) {
      await ri.followUp({ content, ephemeral: false });
    } else {
      await ri.reply({ content, ephemeral: false });
    }
  } catch (err) {
    logger.warn('Failed to send DM disallow notice', { err });
  }
}

export async function enforceAllowedContext(interaction: Interaction): Promise<boolean> {
  if (!interaction.isRepliable()) return false;

  // DMs always disallowed with a public notice
  if (!interaction.inGuild()) {
    await disallowDM(interaction);
    return false;
  }

  const guildId = interaction.guildId!;
  const channelId = interaction.channelId!;

  // Guild allow check (empty list = allow all)
  if (!isGuildAllowed(guildId)) {
    const mention = contactUserMention() ?? undefined;
    const content = SERVER_BLOCKED(mention);
    logger.gate('deny', 'guild_not_allowed', { guildId, channelId, userId: interaction.user?.id, contact: mention });
    await replyPublic(interaction as RepliableInteraction, content);
    return false;
  }

  // Channel allow check driven by allowed-context.json:
  // - Missing file: allow everywhere
  // - Guild present with empty list: allow all channels in that guild
  // - Guild not present: allowed only when NONVERIFIED_SERVERS_ALLOWED=true
  if (!isChannelAllowed(guildId, channelId)) {
    const content = CHANNEL_BLOCKED;
    logger.gate('deny', 'channel_not_allowed', { guildId, channelId, userId: interaction.user?.id });
    await replyPublic(interaction as RepliableInteraction, content);
    return false;
  }

  logger.gate('allow', 'context_allowed', { guildId, channelId, userId: interaction.user?.id });
  return true;
}

async function replyPublic(interaction: RepliableInteraction, content: string): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: false });
    } else {
      await interaction.reply({ content, ephemeral: false });
    }
  } catch (err) {
    logger.warn('Failed to send allowed-context denial notice', { err });
  }
}
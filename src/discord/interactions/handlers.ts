// What: Top-level Discord interaction router for the Librarian bot.
// How: Applies guards (DM + allowed guild/channel), then routes ChatInputCommand to subcommand handlers,
//      and routes ButtonInteraction by custom_id prefixes (LIB:UPLOAD / LIB:ASK). All handlers are placeholders.

import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
} from 'discord.js';
import { logger } from '../../util/log.js';
import { disallowDM, enforceAllowedContext } from './guards.js';
import { LIBRARIAN_COMMAND_NAME } from '../commands/librarian.js';
import { handleChat } from './chat.js';
import { handleSearch } from './search.js';
import { handleRequest } from './request.js';
import { handleButton } from './buttons.js';

export async function handleInteractionCreate(interaction: Interaction) {
  // DM guard: single-line notice
  if (!interaction.inGuild()) {
    await disallowDM(interaction);
    return;
  }

  // Context guard: allowed guild/channel
  const allowed = await enforceAllowedContext(interaction);
  if (!allowed) return;

  // Slash commands
  if (interaction.isChatInputCommand()) {
    await routeChatInput(interaction);
    return;
  }

  // Buttons
  if (interaction.isButton()) {
    await routeButton(interaction);
    return;
  }

  // Ignore other interaction types for now (select menus, modals, etc.)
  logger.debug('Ignoring unsupported interaction type', { type: interaction.type });
}

async function routeChatInput(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName !== LIBRARIAN_COMMAND_NAME) {
    // Not ours
    return;
  }

  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'chat':
      await handleChat(interaction);
      break;
    case 'search':
      await handleSearch(interaction);
      break;
    case 'request':
      await handleRequest(interaction);
      break;
    default:
      await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
      logger.warn('Unknown subcommand for /librarian', { sub });
  }
}

async function routeButton(interaction: ButtonInteraction) {
  await handleButton(interaction);
}
// What: Slash command definition for /librarian and a thin router for subcommands.
// How: Uses discord.js's SlashCommandBuilder to define subcommands (chat, search, request).
//      Exports the command data for registration and a name constant for routing. Actual handlers live under interactions/*.

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

// Command name constant for consistent reference
export const LIBRARIAN_COMMAND_NAME = 'librarian' as const;

// Slash command builder defining subcommands and options
export const librarianCommand = new SlashCommandBuilder()
  .setName(LIBRARIAN_COMMAND_NAME)
  .setDescription('Librarian actions')
  .addSubcommand((sub) =>
    sub
      .setName('chat')
      .setDescription('Ask a question (optional ephemeral response)')
      .addStringOption((opt) =>
        opt
          .setName('prompt')
          .setDescription('Your prompt or question')
          .setRequired(true),
      )
      .addBooleanOption((opt) =>
        opt
          .setName('ephemeral')
          .setDescription('Reply ephemerally (default false)')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('search')
      .setDescription('Search your library (top 5 results)')
      .addStringOption((opt) =>
        opt
          .setName('query')
          .setDescription('Search query')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('request')
      .setDescription('Upload a file by filename')
      .addStringOption((opt) =>
        opt
          .setName('filename')
          .setDescription('Exact filename to upload')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('upload')
      .setDescription('Upload a PDF book to the library')
      .addAttachmentOption((opt) =>
        opt
          .setName('file')
          .setDescription('PDF file (max 25MB)')
          .setRequired(true),
      ),
  );

// Export JSON for REST registration
export const librarianCommandJSON = librarianCommand.toJSON();

// Optional: local type guard usage example
export function isLibrarianCommand(i: ChatInputCommandInteraction) {
  return i.commandName === LIBRARIAN_COMMAND_NAME;
}
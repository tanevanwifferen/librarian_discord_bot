/**
 * What: Script to register the /librarian command.
 * How: If DISCORD_ALLOWED_GUILD_IDS is set, register as GUILD commands for those guilds (fast propagation).
 *      If not set (allow all), register as GLOBAL application commands so any server can use them (slower propagation).
 */
 
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { librarianCommandJSON } from './librarian.js';
import { config } from '../../config/env.js';
import { logger } from '../../util/log.js';

async function main() {
  const { appId, discordToken } = config;

  // Legacy behavior: if DISCORD_ALLOWED_GUILD_IDS is provided, register guild-scoped for those IDs.
  // Otherwise register GLOBAL commands so the bot works in any server that invites it.
  const allowedGuildIds = (process.env.DISCORD_ALLOWED_GUILD_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const rest = new REST({ version: '10' }).setToken(discordToken);
  const body = [librarianCommandJSON];

  if (allowedGuildIds.length === 0) {
    logger.info('No DISCORD_ALLOWED_GUILD_IDS set; registering GLOBAL application commands', { action: 'register-commands' });
    await rest.put(Routes.applicationCommands(String(appId)), { body });
    logger.info('Registered GLOBAL application commands (propagation can take up to 1 hour)');
    process.exit(0);
    return;
  }

  for (let i = 0; i < allowedGuildIds.length; i++) {
    const guildId = allowedGuildIds[i];
    try {
      logger.info('Registering commands for guild', { guildId });
      await rest.put(Routes.applicationGuildCommands(String(appId), String(guildId)), { body });
      logger.info('Registered commands for guild', { guildId });
    } catch (err) {
      logger.error('Failed to register commands for guild', { guildId, err });
      if (i === 0) {
        throw err;
      }
    }
  }
}

main().catch((err) => {
  logger.error('register-commands failed', { err });
  process.exitCode = 1;
});
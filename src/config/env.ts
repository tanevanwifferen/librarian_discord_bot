/**
 * What: Environment configuration loader and validator for the Discord bot.
 * How: Uses zod to validate required variables, parses comma-separated lists into arrays (default []),
 *       and exports a typed config object plus helpers. Loads .env via dotenv (import side-effect) and
 *       fails fast if DISCORD_TOKEN or DISCORD_APP_ID are missing/empty.
 *       Important: Empty DISCORD_ALLOWED_GUILD_IDS / DISCORD_ALLOWED_CHANNEL_IDS now mean "allow all".
 */

import 'dotenv/config';
import { z } from 'zod';

const csvToList = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APP_ID: z.string().min(1, 'DISCORD_APP_ID is required'),
  DISCORD_ALLOWED_GUILD_IDS: z.string().optional(),
  DISCORD_ALLOWED_CHANNEL_IDS: z.string().optional(),
  DISCORD_CONTACT_USER_ID: z.string().optional(), // Optional: Mentioned in server-blocked notices if provided
  LIBRARIAN_BASE_URL: z.string().url().default('http://localhost:3000'),
  LIBRARIAN_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Throw a readable error early in startup
  const issues = parsed.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const env = parsed.data;

export type BotConfig = {
  discordToken: string;
  appId: string;
  allowedGuildIds: string[];   // Empty = allow all guilds
  allowedChannelIds: string[]; // Empty = allow all channels
  librarianBaseUrl: string;
  librarianApiKey?: string;
  logLevel?: typeof env.LOG_LEVEL;
  contactUserId?: string;
};

export const config: BotConfig = {
  discordToken: env.DISCORD_TOKEN,
  appId: env.DISCORD_APP_ID,
  allowedGuildIds: csvToList(env.DISCORD_ALLOWED_GUILD_IDS),
  allowedChannelIds: csvToList(env.DISCORD_ALLOWED_CHANNEL_IDS),
  librarianBaseUrl: env.LIBRARIAN_BASE_URL,
  librarianApiKey: env.LIBRARIAN_API_KEY,
  logLevel: env.LOG_LEVEL,
  contactUserId: env.DISCORD_CONTACT_USER_ID,
};

/**
 * allowAllGuilds: true when no guild IDs are configured (whitelist disabled).
 */
export function allowAllGuilds(): boolean {
  return config.allowedGuildIds.length === 0;
}

/**
 * allowAllChannels: true when no channel IDs are configured (whitelist disabled).
 */
export function allowAllChannels(): boolean {
  return config.allowedChannelIds.length === 0;
}

/**
 * isGuildAllowed: If allow-all, always true; otherwise checks membership.
 */
export function isGuildAllowed(guildId: string | null | undefined): boolean {
  if (allowAllGuilds()) return true;
  if (!guildId) return false;
  return config.allowedGuildIds.includes(guildId);
}

/**
 * isChannelAllowed: If allow-all, always true; otherwise checks membership.
 */
export function isChannelAllowed(channelId: string | null | undefined): boolean {
  if (allowAllChannels()) return true;
  if (!channelId) return false;
  return config.allowedChannelIds.includes(channelId);
}

/**
 * contactUserMention: Returns `<@ID>` if DISCORD_CONTACT_USER_ID is set, else null.
 */
export function contactUserMention(): string | null {
  return env.DISCORD_CONTACT_USER_ID ? `<@${env.DISCORD_CONTACT_USER_ID}>` : null;
}
/**
 * What: Environment configuration and allowed-context loader for the Discord bot.
 * How: Validates required env with zod, loads a root-level allowed-context.json (if present)
 *       that maps guildId -> array of allowed channelIds. If the file is missing, everything
 *       is allowed everywhere. Behavior flags:
 *         - NONVERIFIED_SERVERS_ALLOWED (default true): when a guildId is not present in the JSON,
 *           allow if true, block if false.
 *       Exports:
 *         - config: typed runtime config (tokens, URLs, etc.)
 *         - isGuildAllowed(guildId): guild-level gate derived from JSON + env flag
 *         - isChannelAllowed(guildId, channelId): channel-level gate derived from JSON map
 *         - contactUserMention(): <@id> or null for public notices
 */

import 'dotenv/config';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';

/**
 * JSON shape:
 * {
 *   "123456789012345678": ["111111111111111111", "222222222222222222"],
 *   "222222222222222222": []
 * }
 * - Key: guildId (string)
 * - Value: array of channelIds (strings)
 *   - Empty array means "all channels allowed within that guild"
 */
type AllowedContextMap = Record<string, string[]>;

/**
 * Try to locate allowed-context.json at repository root.
 * Candidates:
 *  - $CWD/allowed-context.json
 *  - $CWD/../allowed-context.json           (when running from discord_bot/)
 */
function loadAllowedContext(): { map: AllowedContextMap | null; loadedPath?: string } {
  const candidates = [
    path.resolve(process.cwd(), 'allowed-context.json'),
    path.resolve(process.cwd(), '..', 'allowed-context.json'),
  ];

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw);

      // Validate: object with string[] values
      const schema = z.record(z.array(z.string()));
      const map = schema.parse(parsed);

      return { map, loadedPath: p };
    } catch (err) {
      // If invalid JSON or validation fails, treat as "no map" (allow everywhere) but do not crash.
      // eslint-disable-next-line no-console
      console.warn('[env] Failed to load allowed-context.json, falling back to allow-everywhere.', err);
      return { map: null };
    }
  }

  // File not found anywhere -> allow everywhere
  return { map: null };
}

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_APP_ID: z.string().min(1, 'DISCORD_APP_ID is required'),
  // Kept for backward compatibility but ignored when allowed-context.json is used
  DISCORD_ALLOWED_GUILD_IDS: z.string().optional(),
  DISCORD_ALLOWED_CHANNEL_IDS: z.string().optional(),
  DISCORD_CONTACT_USER_ID: z.string().optional(),
  LIBRARIAN_BASE_URL: z.string().url().default('http://localhost:3000'),
  LIBRARIAN_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  NONVERIFIED_SERVERS_ALLOWED: z
    .string()
    .optional()
    .transform((v) => {
      if (v == null || v === '') return true; // default true
      const normalized = v.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const env = parsed.data;

// Load JSON map once at startup
const { map: allowedMap, loadedPath } = loadAllowedContext();
if (loadedPath) {
  // eslint-disable-next-line no-console
  console.info(`[env] loaded allowed-context.json from: ${loadedPath}`);
}

export type BotConfig = {
  discordToken: string;
  appId: string;
  librarianBaseUrl: string;
  librarianApiKey?: string;
  logLevel?: typeof env.LOG_LEVEL;
  contactUserId?: string;
  nonverifiedServersAllowed: boolean;
};

export const config: BotConfig = {
  discordToken: env.DISCORD_TOKEN,
  appId: env.DISCORD_APP_ID,
  librarianBaseUrl: env.LIBRARIAN_BASE_URL,
  librarianApiKey: env.LIBRARIAN_API_KEY,
  logLevel: env.LOG_LEVEL,
  contactUserId: env.DISCORD_CONTACT_USER_ID,
  nonverifiedServersAllowed: env.NONVERIFIED_SERVERS_ALLOWED ?? true,
};

/**
 * isGuildAllowed:
 * - If allowed-context.json is missing -> allow (everywhere).
 * - If guildId present as a key -> allow.
 * - If guildId NOT present -> allow when NONVERIFIED_SERVERS_ALLOWED=true, else block.
 */
export function isGuildAllowed(guildId: string | null | undefined): boolean {
  if (!guildId) return false;
  if (!allowedMap) return true; // file missing -> allow everywhere
  if (Object.prototype.hasOwnProperty.call(allowedMap, guildId)) return true;
  return config.nonverifiedServersAllowed;
}

/**
 * isChannelAllowed:
 * - If allowed-context.json is missing -> allow (everywhere).
 * - If guildId is not allowed by isGuildAllowed -> false.
 * - If guildId exists in map:
 *     - Empty array: allow all channels within that guild.
 *     - Non-empty array: channel must be listed.
 * - If guildId does not exist in map:
 *     - Allowed only when NONVERIFIED_SERVERS_ALLOWED=true (consistent with isGuildAllowed).
 *     - When allowed via the flag, treat as "all channels allowed within that guild".
 */
export function isChannelAllowed(guildId: string | null | undefined, channelId: string | null | undefined): boolean {
  if (!guildId || !channelId) return false;
  if (!allowedMap) return true; // file missing -> allow everywhere
  if (!isGuildAllowed(guildId)) return false;

  const channels = allowedMap[guildId];
  if (channels === undefined) {
    // Not listed guild: allowed only via the nonverified flag; if allowed, treat as allow-all channels.
    return config.nonverifiedServersAllowed;
  }
  if (channels.length === 0) return true; // empty list == all channels allowed in this guild
  return channels.includes(channelId);
}

/**
 * contactUserMention: Returns <@ID> if DISCORD_CONTACT_USER_ID is set, else null.
 */
export function contactUserMention(): string | null {
  return env.DISCORD_CONTACT_USER_ID ? `<@${env.DISCORD_CONTACT_USER_ID}>` : null;
}
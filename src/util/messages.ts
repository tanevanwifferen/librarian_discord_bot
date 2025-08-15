/**
 * What: Centralized user-facing message strings for the Discord bot.
 * How: Exports constants/functions for standardized public copy so interaction handlers and guards
 *      can import and reuse consistent wording. No side effects.
 */

export const DM_BLOCKED = "This bot is not available in DMs.";

export function SERVER_BLOCKED(contact?: string): string {
  return contact
    ? `This bot is not available in this server. Please contact ${contact}.`
    : "This bot is not available in this server.";
}

export const CHANNEL_BLOCKED = "This bot is not available in this channel.";

export const OVERSIZE_UPLOAD = "file too large to upload";
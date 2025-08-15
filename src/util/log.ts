// What: Minimal structured logger wrapper for the Discord bot using pino.
// How: Creates a pino instance with redaction rules (tokens, secrets) and exports typed helpers for consistent logging.

import pino, { LoggerOptions } from 'pino';

// Redact sensitive fields in any object we log (env, options, headers later, etc.)
const redactionPaths = [
  'DISCORD_TOKEN',
  'token',
  'authorization',
  'Authorization',
  'headers.authorization',
  'headers.Authorization',
  'apiKey',
  'API_KEY',
  'LIBRARIAN_API_KEY',
];

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: redactionPaths,
    censor: '**redacted**',
  },
  base: undefined, // don't include pid/hostname
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const log = pino(options);

// Convenience typed helpers (retain structured logging style)
export const logger = {
  // General
  info: (msg: string, obj?: Record<string, unknown>) => (obj ? log.info(obj, msg) : log.info(msg)),
  warn: (msg: string, obj?: Record<string, unknown>) => (obj ? log.warn(obj, msg) : log.warn(msg)),
  error: (msg: string, obj?: Record<string, unknown>) => (obj ? log.error(obj, msg) : log.error(msg)),
  debug: (msg: string, obj?: Record<string, unknown>) => (obj ? log.debug(obj, msg) : log.debug(msg)),

  // Domain-specific helpers for consistency
  interaction: (phase: 'received' | 'responded' | 'denied', details: Record<string, unknown>) =>
    log.info({ phase, ...details }, 'interaction'),

  gate: (action: 'allow' | 'deny', reason: string, details?: Record<string, unknown>) =>
    log.info({ action, reason, ...(details || {}) }, 'gate'),
};
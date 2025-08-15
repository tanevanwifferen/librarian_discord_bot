# Librarian Discord Bot (Scaffold)

What: Minimal, runnable TypeScript scaffold for a Discord bot that will integrate with the Librarian service later.
How: Provides project structure, environment validation, logging, Discord client bootstrap, slash command registration, and interaction handlers with placeholders (no HTTP calls yet).

Note: Use Node 22 LTS. The project enforces engines.node >= 22 and targets ES2022.

## Features (Scaffolded)
- Slash command: `/librarian`
  - `chat prompt:string ephemeral:boolean` (default: public; ephemeral optional)
  - `search query:string` (shows up to top 5 placeholder results; no pagination)
  - `request id:string` (ack placeholder)
- Buttons on search results (placeholders):
  - Upload file: replies "not implemented"
  - Ask about: replies "not implemented"
- Guards:
  - Enforce allowed guild/channel context with allow-all defaults when lists are empty
  - DMs disallowed with a single-line notice
- Structured logging (tokens redacted)
- Guild command registration for development

## Environment behavior

- Missing DISCORD_TOKEN or DISCORD_APP_ID: startup fails immediately with a useful error.
- Empty DISCORD_ALLOWED_GUILD_IDS:
  - `npm run register-commands` prints a WARN “No DISCORD_ALLOWED_GUILD_IDS set; skipping guild command registration” and exits 0 without attempting registration.
  - At runtime, an empty guild allow-list means “allow all guilds”.
- Empty DISCORD_ALLOWED_CHANNEL_IDS:
  - At runtime, an empty channel allow-list means “allow all channels”.
- If allow-lists are non-empty:
  - Only those guilds/channels are allowed; others receive a public refusal message.
  - Server blocked → “This bot is not available in this server.” or “… Please contact <@ID>.” if DISCORD_CONTACT_USER_ID provided.
  - Channel blocked → “This bot is not available in this channel.”
- DM behavior: “This bot is not available in DMs.”
- Oversize uploads: “file too large to upload”.
- Responses are public by default; DMs are disallowed.

## Getting Started

1) Copy environment variables
- Copy [.env.example](./.env.example) to `.env` and fill values:
  - DISCORD_TOKEN: Bot token
  - DISCORD_APP_ID: Application ID
  - DISCORD_ALLOWED_GUILD_IDS: Comma-separated guild IDs where the bot is allowed and where commands are registered. If empty, allow all at runtime; register-commands will skip.
  - DISCORD_ALLOWED_CHANNEL_IDS: Comma-separated channel IDs that are allowed. If empty, allow all at runtime.
  - DISCORD_CONTACT_USER_ID: Optional Discord user ID to mention in non-allowed server notices.
  - LIBRARIAN_BASE_URL, LIBRARIAN_API_KEY: Not used yet

2) Install dependencies
- From the [`discord_bot`](./) directory:
  - `npm install`

3) Register slash commands (guild scope for dev)
- Ensure `DISCORD_APP_ID` and at least one ID in `DISCORD_ALLOWED_GUILD_IDS` if you want to register to specific dev guilds
- Run:
  - `npm run register-commands`
- This registers the `/librarian` command for all allowed guilds in the list.

4) Run the bot (development)
- `npm run dev` (ts-node-dev with hot reload)
- The bot logs in and responds to placeholders

5) Run the bot (compiled)
- `npm run build`
- `npm start`

## Behavior and Constraints

- Public responses by default; ephemeral optional for `/librarian chat`
- Search returns top 5 placeholder results only (no pagination)
- Upload button: replies “not implemented” and logs
- Ask button: replies “not implemented” and logs
- Oversize upload message constant: “file too large to upload”
- Gating: Empty allow-lists mean allow all; otherwise only configured guilds/channels are allowed
- DMs disallowed with a single-line notice
- No HTTP calls to Librarian yet; only structure and placeholders
- Do not modify Librarian service from here

## Project Structure

- [src/index.ts](./src/index.ts): Bootstraps env, logger, client, and wires interaction handlers
- [src/config/env.ts](./src/config/env.ts): Validates and loads environment with zod, parses comma-separated lists
- [src/util/log.ts](./src/util/log.ts): Pino logger wrapper with redaction
- [src/discord/client.ts](./src/discord/client.ts): Discord client factory and context gating helpers
- [src/discord/commands/register.ts](./src/discord/commands/register.ts): Guild command registration script
- [src/discord/commands/librarian.ts](./src/discord/commands/librarian.ts): Slash command builder and router
- [src/discord/interactions/handlers.ts](./src/discord/interactions/handlers.ts): Top-level interaction router
- [src/discord/interactions/guards.ts](./src/discord/interactions/guards.ts): Allowed guild/channel and DM guards
- [src/discord/interactions/chat.ts](./src/discord/interactions/chat.ts): Placeholder handler for /librarian chat
- [src/discord/interactions/search.ts](./src/discord/interactions/search.ts): Placeholder handler for /librarian search with 5 embeds and buttons
- [src/discord/interactions/request.ts](./src/discord/interactions/request.ts): Placeholder handler for /librarian request
- [src/discord/interactions/buttons.ts](./src/discord/interactions/buttons.ts): Button handlers for Upload/Ask
- [src/util/discord.ts](./src/util/discord.ts): Helpers for embeds, components, and custom_id parsing
- [src/librarian/api.ts](./src/librarian/api.ts): Function signatures only; implementations TODO after API contract

## Limitations (to be implemented later)
- No actual HTTP requests, streaming, or file uploads
- API schemas and error handling TBD after API contract analysis
- File size checks and Discord CDN download/upload logic TBD

## Troubleshooting
- If commands don’t appear: ensure `register-commands` ran with correct `DISCORD_APP_ID` and guild IDs
- Ensure the bot has permission to read and send messages in the target channels
- Check logs for gating decisions (guild/channel allowed/denied)
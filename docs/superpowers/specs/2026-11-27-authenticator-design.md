# Authenticator Suite — Design

## Context
`/Users/mello/Sites/authenticator` is empty. Goal: a self-hosted 2FA authenticator (Proton Authenticator look) synced through our own backend, delivered as 4 apps: API, website, Electron desktop, React Native mobile. Deployed to a Dokploy server.

## Decisions made by the user
- **Codes are generated on the server.** Secrets stored encrypted in MongoDB; server holds the key and returns codes. (Trade-off accepted: no offline codes; server compromise exposes secrets.)
- **Sub-accounts = family/team members** under an owner account, with shared entries.
- **Structure A:** pnpm monorepo; web and desktop share one React UI; mobile has its own RN screens; shared package for logic.
- Stack: TypeScript, NestJS, MongoDB, Docker/Dokploy, React, Electron, React Native.
- Biometric gate (Touch ID / Face ID / fingerprint) on mac + mobile, re-prompt ~every 1h, always on cold launch.
- Minimal Proton Authenticator–style UI, using REA on the installed `/Applications/Proton Authenticator.app` as reference.

## Approaches (structure)
- **A (picked):** monorepo, web=desktop UI, mobile own screens, shared API client/types/tokens. Best web quality, desktop nearly free, low drift.
- B: Expo + react-native-web everywhere — least code, weakest website, most fragile tooling.
- C: 4 independent folders — simplest per app, highest drift/maintenance.

## App ID (user)
`com.sz4h.authenticator` everywhere: iOS `bundleIdentifier`, Android `package`, Electron `appId` (electron-builder), macOS keychain/safeStorage service name.

## Dokploy (user: Dokploy deploys straight from this repo)
- Root `docker-compose.yml` is the Dokploy **Compose** source: Dokploy pulls `github.com/Mello21century/authenticator` (`main`), builds `apps/api/Dockerfile` and `apps/web/Dockerfile` (nginx serving the Vite build + `/api` proxy to api), plus `mongo:7` with a named volume. Both Dockerfiles use the repo root as build context so the pnpm workspace + `packages/shared` resolve.
- No published host ports; the web service joins `dokploy-network` and Traefik routes the domain to it (domain set in the Dokploy UI). Mongo stays internal-only.
- Secrets come from Dokploy env: `VAULT_MASTER_KEY`, `JWT_SECRET`, `MONGO_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`, `SIGNUP_ENABLED`. Repo ships `.env.example` only.
- Auto-deploy on push to `main` via Dokploy's GitHub integration/webhook, so each phase push redeploys. Check exact Compose/Traefik conventions against current Dokploy docs (Context7) during Phase 1.

## Layout
```
apps/api        NestJS (Fastify adapter) + Mongoose, Dockerfile
apps/web        Vite + React + React Router + TanStack Query
apps/desktop    Electron; loads apps/web build; Touch ID, tray, lock
apps/mobile     Expo (React Native), expo-local-authentication, expo-camera
packages/shared API client (fetch), types, otpauth URI parse/build, import parsers, design tokens
docker-compose.yml  api + mongo + web(nginx) — deployed as a Dokploy Compose app
```

## Backend (apps/api)
- **Signup (user):** open, multi-owner — every signup is an owner of its own space; `SIGNUP_ENABLED` env flag closes it.
- **Login 2FA (user):** TOTP second factor for account login (enroll via QR in Settings; 10 one-time recovery codes). My call: optional per user with a persistent "enable 2FA" nudge; flip to required later if wanted.
- **Password reset (user):** email link via **Resend** (`RESEND_API_KEY`, `MAIL_FROM` env), single-use hashed token, 30 min expiry, revokes all refresh tokens. Also used for member welcome emails.
- **Auth:** email + password (argon2id). JWT access token (15 min) + rotating refresh token (hashed in DB). Web: refresh in httpOnly Secure cookie; desktop/mobile: refresh in OS keychain (Electron `safeStorage`, `expo-secure-store`). Helmet, CORS allowlist, `@nestjs/throttler` on auth routes, DTO validation (class-validator) everywhere.
- **Encryption:** AES-256-GCM via `node:crypto`; `VAULT_MASTER_KEY` (32-byte base64) from Dokploy env; per-entry random 12-byte IV; store `{iv, ct, tag, keyVersion}` so the key can rotate. Secret is never sent back to clients except in export.
- **Codes:** RFC 6238 TOTP implemented with `node:crypto` HMAC (SHA1/256/512, 6–8 digits, any period) + Steam variant. `GET /codes` returns `[{entryId, code, period, expiresAt}]` for all entries visible to the user; clients refetch at the next `expiresAt`. HOTP skipped (add when someone needs it).
- **Collections:**
  - `users {email, passwordHash, role: owner|member, ownerId?, createdAt}`
  - `entries {ownerId, issuer, label, enc, algorithm, digits, period, type, sharedWith[userId], order, createdAt}`
  - `refreshTokens {userId, hash, expiresAt, device}`
- **Endpoints:** `/auth/{signup,login,refresh,logout}`, `/entries` CRUD + reorder, `/codes`, `/members` (owner: create/list/delete, set shared entries), `/vault/import`, `/vault/export` (requires password re-confirm).
- **Members (my call):** owner creates a member by email; Resend sends a set-password link. Members see entries shared with them read-only (code only, no secret, no edit) and may keep their own private entries. Owner cannot see member private entries. Member export excludes shared entries. Deleting a member removes their access and their account.
- **API URL (my call):** web + API on one domain, nginx proxies `/api` (no CORS/cookie cross-site issues). Desktop/mobile: build-time default URL, overridable via "Server" field under Advanced on the login screen.
- **Import (my call):** otpauth URI list, Google Authenticator migration QR (`otpauth-migration://` protobuf), Aegis plain JSON, Proton Authenticator JSON export, 2FAS JSON. Parsed in `packages/shared` on the client, sent as normalized entries. **Export:** JSON of otpauth URIs (plaintext, behind password re-confirm). Encrypted export skipped for v1.
- **Deploy:** multi-stage Dockerfile (node:24-alpine), healthcheck `/health`, compose with mongo volume.

## Website (apps/web) & Desktop (apps/desktop)
- Screens: Login, Signup, Vault (search + list: issuer icon/initial, label, big code, circular countdown, tap to copy), Add/Edit entry (manual, paste URI, upload/paste QR image decoded with `jsqr`), Members (owner), Import/Export, Settings.
- Desktop adds: preload bridge (`contextIsolation`, no nodeIntegration), Touch ID via `systemPreferences.promptTouchID` on macOS; **Windows: account-password re-entry as the lock (Windows Hello later)**; tray icon; electron-builder → mac dmg + win nsis (signing left to user).
- Web has no biometric lock (browser); session only.

## Mobile (apps/mobile)
- Same screens, native: camera QR scan, haptics on copy.
- **Platforms (user):** iOS + Android, published to App Store + Play Store. EAS Build/Submit, store listings, privacy labels. Needs a custom dev build (Expo Go can't test Face ID). Apple/Google developer accounts are the user's.
- **Lock rule (mac desktop + mobile):** lock on cold launch always; re-lock when ≥1h since last unlock (setting: 1 min / 15 min / 1h / never-after-launch, default 1h); codes rendered only when unlocked; app-switcher privacy cover on background.

## Design
- Use REA (`inspect_desktop_application` / `capture_native_ui_scenario`) on Proton Authenticator to extract palette, spacing, typography, list layout. Dark theme default + light. Tokens live in `packages/shared/tokens.ts`, used by web CSS variables and RN StyleSheet. Original implementation, no Proton assets/branding.

## Build order
1. `packages/shared` + `apps/api` (TOTP + crypto + auth + entries + codes + members) with docker-compose.
2. `apps/web`.
3. `apps/desktop` wrapping web.
4. `apps/mobile`.
**Git:** `git init` + remote `https://github.com/Mello21century/authenticator` (private, empty). Phase 0 commits this design to `docs/superpowers/specs/2026-11-27-authenticator-design.md` and pushes `main`. After each phase passes its checks: commit + `git push`. No Claude/AI attribution or session trailers in commit messages. `.env`/keys gitignored.

Speckit not needed; this design + a writing-plans implementation plan suffice.

## Verification
- TOTP unit tests against RFC 6238 test vectors; AES-GCM roundtrip + tamper test; import parser tests with sample files.
- API e2e (supertest + mongodb-memory-server): signup/login/refresh rotation, member cannot read unshared/edit shared entries, export requires password.
- `docker compose up` → hit `/health`, create account via web, add entry, compare code to Proton/G Authenticator for the same secret.
- Desktop: `pnpm --filter desktop dev`, confirm Touch ID prompt on launch and after timeout (shortened for test). Mobile: EAS dev build on device/simulator, Face ID/fingerprint on cold start.
- Auth extras: login TOTP enroll + challenge + recovery code; password-reset email via Resend (test key) and token single-use.

## Left to the builder
Exact lib versions (check via Context7), file layout inside each app, icon fetching approach (initial-letter fallback is fine), CI.

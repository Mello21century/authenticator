# Phases 2–4 — Web, Desktop, Mobile Implementation Plan

> Executed inline (user asked for one shot). Spec: `docs/superpowers/specs/2026-11-27-authenticator-design.md`. API contract: `packages/shared/src/api.ts`.

## Global Constraints
- App ID `com.sz4h.authenticator` (Electron `appId`, iOS bundle id, Android package).
- All clients use `createApi` from `@auth/shared`; web = cookie mode, desktop/mobile = native mode (refresh token in OS secure storage).
- Codes are never cached to disk. Secrets are never shown except in export.
- Lock rule (desktop macOS + mobile): locked on cold launch; re-lock when ≥ lock timeout since last unlock (default 1 h; options 1 min / 15 min / 1 h / launch only); codes hidden while locked; privacy cover when backgrounded (mobile).
- Design: minimal dark-first, accent from Proton Authenticator asset catalog (REA/assetutil): light `#6d4aff`, dark `#b080ff`. Original layout, no Proton branding/assets.
- Push to `main` after each phase.

## Phase 2 — Web (`apps/web`)
Files: `src/main.tsx` (router + QueryClient), `src/lib/api.ts` (api instance; base URL `VITE_API_URL` or `/api`; desktop bridge override), `src/lib/auth.tsx` (AuthProvider: refresh on boot, user, logout), `src/lib/codes.ts` (`nextRefreshDelay(codes, serverTime, clientNow)` + `useCodes()`), `src/lib/qr.ts` (decode QR from File/clipboard image via `jsqr`), `src/styles.css` (tokens → CSS vars), pages `Login, Signup, Forgot, Reset, Vault, Settings`, components `EntryCard, EntryForm, Countdown, Modal`.
- Vault: search, list cards (issuer initial avatar, issuer, label, big grouped code, ring countdown, click-to-copy toast), `+` → EntryForm (manual / paste otpauth URI / QR image upload or paste), edit/delete/share (owner) on card menu, read-only badge for shared.
- Settings: account (email, change password), two-factor login (setup QR via `qrcode`, enable, recovery codes, disable), members (owner: invite, list, remove), import (file/text → `importVault` → preview count → `importEntries`), export (password + code → download JSON), security (desktop only: lock timeout).
- Tests: `src/lib/codes.test.ts` — `nextRefreshDelay` returns ms until earliest `expiresAt` adjusted by clock offset, min 250 ms; empty list → 30 s.
- Docker: `apps/web/Dockerfile` (build with pnpm → nginx:alpine), `apps/web/nginx.conf` (SPA fallback, `/api/` proxy to `api:3000`, security headers, no-store on index.html). Compose service `web` (expose 80, dokploy-network).
- Verify: `pnpm --filter web build`, `docker compose up --build`, browser e2e via Chrome tools on `http://localhost:8080`: signup → add entry → code matches API → import/export → member invite.

## Phase 3 — Desktop (`apps/desktop`)
Files: `src/main.ts`, `src/preload.ts`, `electron-builder.yml`.
- Registers privileged `app://` scheme serving `apps/web/dist` (SPA fallback). CSP via web build. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, navigation/new-window blocked except external links → `shell.openExternal`.
- Preload exposes `window.desktop = { native: true, platform, apiUrl(), setApiUrl(u), getRefreshToken(), setRefreshToken(t), unlock(): Promise<boolean>, canBiometric(): boolean, lockTimeoutMs get/set, onLock(cb) }`.
- Refresh token stored with `safeStorage` encrypted file in `userData`. Lock: main process tracks `lastUnlock`; locked at launch; timer checks every 30 s and on `browser-window-focus`; Touch ID via `systemPreferences.promptTouchID`; Windows/Linux fallback = web shows password re-entry (verify via `/auth/login` against own email).
- Tray icon with show/quit. `electron-builder.yml`: appId `com.sz4h.authenticator`, mac dmg (arm64+x64), win nsis, linux AppImage.
- Verify: `pnpm --filter desktop build`, launch with `electron .` and inspect via REA/Electron tools: window loads, locked overlay shown.

## Phase 4 — Mobile (`apps/mobile`)
Files: `App.tsx`, `src/api.ts`, `src/auth.tsx`, `src/lock.tsx`, `src/screens/{Login,Vault,AddEntry,Scan,Settings,Members}.tsx`, `src/theme.ts`, `metro.config.js` (monorepo), `eas.json`.
- `expo-secure-store` for refresh token + server URL; `expo-local-authentication` lock (rule above) using AppState; privacy cover on `inactive/background`; `expo-camera` QR scan (otpauth + migration QR); `expo-clipboard` + haptics on copy.
- `eas.json`: development (dev client), preview (internal), production (store) profiles; `submit.production` placeholders.
- Verify: `npx tsc --noEmit`, iOS simulator build + launch, screenshot.

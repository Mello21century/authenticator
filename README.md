# Authenticator

Self-hosted 2FA authenticator: NestJS API (codes generated server-side, secrets AES-256-GCM encrypted in MongoDB), React web app, Electron desktop app, Expo mobile app.

```
apps/api        NestJS + Fastify + MongoDB
apps/web        Vite + React (also loaded by the desktop app)
apps/desktop    Electron (Touch ID lock on macOS)
apps/mobile     Expo / React Native (Face ID / fingerprint lock)
packages/shared API client, types, otpauth + importers, design tokens
```

## Develop

```sh
pnpm install
cp .env.example .env   # fill VAULT_MASTER_KEY (openssl rand -base64 32) and JWT_SECRET
pnpm test              # all workspace tests (API tests use an in-memory MongoDB)
```

## Deploy on Dokploy

1. Dokploy → Create service → **Compose** → provider GitHub → this repo, branch `main`, compose path `./docker-compose.yml`.
2. Environment (Dokploy writes it to `.env` next to the compose file):
   ```
   JWT_SECRET=<openssl rand -base64 48>
   VAULT_MASTER_KEY=<openssl rand -base64 32>   # back this up; losing it loses every secret
   RESEND_API_KEY=re_...
   MAIL_FROM=Authenticator <no-reply@your-domain>
   APP_URL=https://auth.your-domain
   SIGNUP_ENABLED=true
   CORS_ORIGINS=app://authenticator
   ```
3. Domains → add `auth.your-domain` → service **web**, port **80**, HTTPS on.
4. Enable auto deploy (webhook) so each push to `main` redeploys.

Local run of the same stack: `docker network create dokploy-network` once, then `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` → http://localhost:8080

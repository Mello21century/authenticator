# Phase 1 — Shared Package + API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pnpm monorepo with `packages/shared` (client logic) and `apps/api` (NestJS + MongoDB) that stores TOTP secrets encrypted, serves codes, handles auth (+login TOTP, password reset via Resend), members/sharing, import/export, and deploys on Dokploy via root `docker-compose.yml`.

**Architecture:** NestJS 11 on Fastify, Mongoose, global prefix `/api`. Secrets encrypted with AES-256-GCM (`node:crypto`), codes computed server-side (RFC 6238 via `node:crypto` HMAC). Clients (later phases) consume `packages/shared` as TS source.

**Tech Stack:** Node 24, pnpm workspaces, TypeScript 5, NestJS 11 + `@nestjs/platform-fastify`, `@fastify/cookie`, `@fastify/helmet`, `@nestjs/mongoose` + mongoose 8, `@nestjs/jwt`, `@nestjs/throttler`, class-validator/class-transformer, argon2, jest + `@swc/jest`, `mongodb-memory-server`; shared tests with vitest. Resend called with `fetch` (no SDK).

**Spec:** `docs/superpowers/specs/2026-11-27-authenticator-design.md`

## Global Constraints
- App ID `com.sz4h.authenticator` (used from Phase 3/4; reserve the string in `packages/shared/src/constants.ts` as `APP_ID`).
- All routes under `/api`. Health: `GET /api/health` → `{ ok: true }`.
- Env: `PORT` (3000), `MONGO_URL`, `JWT_SECRET` (≥32 chars), `VAULT_MASTER_KEY` (base64, decodes to exactly 32 bytes), `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`, `SIGNUP_ENABLED` (default `true`), `CORS_ORIGINS` (comma list). App refuses to boot on invalid env.
- Secrets never returned by any endpoint except `POST /api/vault/export`.
- Passwords: argon2id, min length 10, max 256.
- Access JWT 15 min; refresh token 30 days, opaque random 32 bytes, stored as SHA-256 hash, rotated on every use.
- Commit messages: no Claude/AI attribution, no session trailers. Never commit `.env`.
- Dokploy compose: no `container_name`, use `expose` not host `ports`, `${VAR}` env interpolation, external network `dokploy-network`.

## Review Focus
1. Secret input with spaces/lowercase/padding (`jbsw y3dp ehpk 3pxp`, `JBSWY3DPEHPK3PXP====`) → normalized and accepted; non-base32 → 400. Test in Task 2 + Task 9.
2. Refresh token reuse (stolen old token used after rotation) → 401 and every session of that user revoked. Test in Task 6.
3. Member hitting owner-only routes or another owner's entry ids (IDOR) → 403/404, never data. Test in Task 10.
4. Unknown email on login/forgot → same response/timing shape as known email (no account enumeration). Test in Task 6 + Task 8.
5. Malformed/unsupported import file (wrong JSON, encrypted Aegis/2FAS, junk QR payload) → clear error, nothing partially imported. Test in Task 3 + Task 11.

---

## File Structure
```
package.json  pnpm-workspace.yaml  tsconfig.base.json  .env.example  docker-compose.yml  .dockerignore
packages/shared/
  package.json  tsconfig.json  vitest.config.ts
  src/index.ts constants.ts types.ts base32.ts otpauth.ts tokens.ts api.ts
  src/importers/{index,aegis,twofas,proton,gauth-migration,uri-list}.ts
  test/*.test.ts  test/fixtures/*
apps/api/
  package.json  tsconfig.json  jest.config.js  Dockerfile  nest-cli.json
  src/main.ts app.module.ts config.ts
  src/crypto/{vault-cipher.ts,totp.ts,base32.ts}
  src/users/{user.schema.ts,users.service.ts}
  src/auth/{auth.module.ts,auth.controller.ts,auth.service.ts,tokens.service.ts,refresh-token.schema.ts,jwt.guard.ts,current-user.decorator.ts,mfa.service.ts,dto.ts}
  src/mail/mail.service.ts
  src/entries/{entry.schema.ts,entries.module.ts,entries.controller.ts,entries.service.ts,codes.controller.ts,dto.ts}
  src/members/{members.module.ts,members.controller.ts,members.service.ts}
  src/vault/{vault.module.ts,vault.controller.ts,vault.service.ts}
  test/{helpers.ts,*.e2e-spec.ts}  src/**/*.spec.ts
```
`apps/api` does not import `packages/shared` (keeps the Docker build simple); base32 is a ~25-line file duplicated deliberately (`// ponytail: duplicated from shared to avoid workspace build in api image`).

---

### Task 1: Workspace scaffold

**Files:** Create root `package.json` (private, `packageManager: pnpm@<installed>`, scripts `test: pnpm -r test`, `lint: pnpm -r lint`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `tsconfig.base.json` (strict, ES2022, moduleResolution bundler), `.env.example` (all Global Constraints env keys with dummy values + comment `openssl rand -base64 32` for key), `.dockerignore` (node_modules, .git, apps/*/dist, .env).

- [ ] Step 1: Create files; `pnpm install` succeeds with empty workspaces.
- [ ] Step 2: Commit `chore: pnpm workspace scaffold`.

### Task 2: shared — base32, otpauth, types, tokens, constants

**Files:** `packages/shared/{package.json,tsconfig.json,vitest.config.ts}`, `src/{constants,types,base32,otpauth,tokens,index}.ts`, `test/otpauth.test.ts`. `package.json`: `"name": "@auth/shared"`, `"main": "src/index.ts"`, `"types": "src/index.ts"`, script `test: vitest run`.

**Interfaces — Produces:**
```ts
// constants.ts
export const APP_ID = 'com.sz4h.authenticator';
// types.ts
export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';
export type EntryType = 'totp' | 'steam';
export interface EntryInput { issuer: string; label: string; secret: string; algorithm: Algorithm; digits: 6|7|8; period: number; type: EntryType; }
export interface Entry { id: string; issuer: string; label: string; algorithm: Algorithm; digits: number; period: number; type: EntryType; order: number; readOnly: boolean; sharedWith: string[]; }
export interface CodeItem { entryId: string; code: string; period: number; expiresAt: number /* epoch ms */; }
export interface CodesResponse { serverTime: number; codes: CodeItem[]; }
export interface User { id: string; email: string; role: 'owner'|'member'; mfaEnabled: boolean; }
export interface AuthResponse { accessToken: string; refreshToken?: string; user: User; }
export interface MfaRequired { mfaRequired: true; mfaToken: string; }
export interface Member { id: string; email: string; activated: boolean; createdAt: string; }
export interface ExportFile { version: 1; exportedAt: string; entries: (EntryInput & { uri: string })[]; }
// base32.ts
export function normalizeBase32(s: string): string;        // strip spaces/'-', uppercase, strip '=' ; throws Error('Invalid base32') on chars outside A-Z2-7
export function base32Encode(bytes: Uint8Array): string;    // no padding
export function base32Decode(s: string): Uint8Array;
// otpauth.ts
export function parseOtpauthUri(uri: string): EntryInput;   // throws Error with message on invalid
export function buildOtpauthUri(e: EntryInput): string;
// tokens.ts
export const tokens: { color: { dark: Record<string,string>; light: Record<string,string> }; radius: Record<string,number>; space: number[]; font: { family: string; mono: string; size: Record<string,number> } };
```
Defaults: algorithm SHA1, digits 6, period 30, type totp. `otpauth://totp/Issuer:label?secret=..&issuer=..` → issuer from `issuer` param, else label prefix before `:`; label is the part after `:` (URL-decoded). `otpauth://steam/...` or `encoder=steam` param → type steam, digits 5. Tokens: placeholder values now (dark bg `#16141c`, surface `#1f1d26`, text `#f2f1f5`, muted `#9a98a6`, accent `#8b7cf6`, danger `#e5484d`); Phase 2 refines them from REA inspection of Proton Authenticator.

- [ ] Step 1: Write failing tests:
```ts
expect(normalizeBase32('jbsw y3dp-ehpk 3pxp==')).toBe('JBSWY3DPEHPK3PXP');
expect(() => normalizeBase32('JBSW1')).toThrow('Invalid base32');
expect(base32Encode(base32Decode('JBSWY3DPEHPK3PXP'))).toBe('JBSWY3DPEHPK3PXP');
expect(parseOtpauthUri('otpauth://totp/ACME%20Co:john@example.com?secret=JBSWY3DPEHPK3PXP&issuer=ACME%20Co&algorithm=SHA256&digits=8&period=60'))
  .toEqual({ issuer:'ACME Co', label:'john@example.com', secret:'JBSWY3DPEHPK3PXP', algorithm:'SHA256', digits:8, period:60, type:'totp' });
expect(parseOtpauthUri('otpauth://totp/x?secret=jbswy3dpehpk3pxp').issuer).toBe('');
expect(() => parseOtpauthUri('otpauth://hotp/x?secret=AAAA')).toThrow(); // HOTP unsupported
expect(() => parseOtpauthUri('https://x')).toThrow();
expect(parseOtpauthUri(buildOtpauthUri(sample))).toEqual(sample); // roundtrip
```
- [ ] Step 2: `pnpm --filter @auth/shared test` → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Tests PASS.
- [ ] Step 5: Commit `feat(shared): base32, otpauth uri, types, tokens`.

### Task 3: shared — importers

**Files:** `src/importers/*.ts`, `test/importers.test.ts`, `test/fixtures/{aegis.json,aegis-encrypted.json,2fas.json,proton.json,uris.txt}` (hand-made, fake secrets).

**Interfaces — Produces:**
```ts
export type ImportFormat = 'auto'|'aegis'|'2fas'|'proton'|'gauth-migration'|'uri-list';
export interface ImportResult { entries: EntryInput[]; errors: string[]; } // errors: per-item problems, item skipped
export function importVault(text: string, format?: ImportFormat): ImportResult; // throws Error(msg) when the file as a whole is unrecognized or encrypted
```
Formats: **Aegis** plain `{db:{entries:[{type,name,issuer,info:{secret,algo,digits,period}}]}}`; if `db` is a string → throw `'Encrypted Aegis export not supported; export unencrypted'`. **2FAS** `{services:[{name,secret,otp:{issuer,account,algorithm,digits,period,tokenType}}]}`; `servicesEncrypted` present → throw similar. **Proton** `{version, entries:[{content:{uri,entry_type,name}}]}` → parse `content.uri`. **uri-list**: one `otpauth://` per line, blanks ignored. **gauth-migration**: `otpauth-migration://offline?data=<base64>`; hand-decode protobuf (`MigrationPayload.otp_parameters` field 1 repeated: secret=1 bytes, name=2, issuer=3, algorithm=4 enum 1=SHA1 2=SHA256 3=SHA512, digits=5 enum 1=6 2=8, type=6 enum 2=TOTP; HOTP items → `errors`). Write a minimal varint/length-delimited reader (~40 lines), no protobuf dependency. `auto` sniffs: starts with `otpauth-migration://` → gauth; `otpauth://` → uri-list; JSON with `db` → aegis, `services`/`servicesEncrypted` → 2fas, `entries[0].content` → proton; else throw `'Unrecognized import format'`.

- [ ] Step 1: Failing tests, one per format, asserting exact `EntryInput[]` from fixtures; encrypted Aegis throws `/Encrypted Aegis/`; `importVault('{"foo":1}')` throws `'Unrecognized import format'`; uri-list with one bad line → 1 entry in `entries`, 1 message in `errors`. GA migration test uses a payload built in the test with a tiny encoder helper (secret bytes `Hello!\xde\xad\xbe\xef`, name `john`, issuer `ACME`) → secret `JBSWY3DPEHPK3PXP`.
- [ ] Step 2: Run → FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(shared): vault importers`.

### Task 4: shared — API client

**Files:** `src/api.ts`, `test/api.test.ts`.

**Interfaces — Produces:**
```ts
export interface ApiOptions { baseUrl: string; native: boolean; getRefreshToken?(): Promise<string|null>; setRefreshToken?(t: string|null): Promise<void>; onAuthLost?(): void; }
export class ApiError extends Error { status: number; body: unknown; }
export function createApi(o: ApiOptions): {
  setAccessToken(t: string|null): void;
  signup(email: string, password: string): Promise<AuthResponse>;
  login(email: string, password: string): Promise<AuthResponse|MfaRequired>;
  loginMfa(mfaToken: string, code: string): Promise<AuthResponse>;   // code = 6-digit or recovery code
  refresh(): Promise<AuthResponse>; logout(): Promise<void>; me(): Promise<User>;
  forgotPassword(email: string): Promise<void>; resetPassword(token: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  mfaSetup(): Promise<{ secret: string; otpauthUri: string }>; mfaEnable(code: string): Promise<{ recoveryCodes: string[] }>; mfaDisable(password: string, code: string): Promise<void>;
  listEntries(): Promise<Entry[]>; createEntry(e: EntryInput): Promise<Entry>; updateEntry(id: string, e: Partial<EntryInput>): Promise<Entry>; deleteEntry(id: string): Promise<void>; reorder(ids: string[]): Promise<void>; shareEntry(id: string, memberIds: string[]): Promise<Entry>;
  codes(): Promise<CodesResponse>;
  listMembers(): Promise<Member[]>; addMember(email: string): Promise<Member>; removeMember(id: string): Promise<void>;
  importEntries(entries: EntryInput[]): Promise<{ imported: number; skipped: number }>;
  exportVault(password: string, code?: string): Promise<ExportFile>;
};
```
Behavior: sends `Authorization: Bearer <access>`; `native: true` adds header `X-Client: native` and sends/stores refresh token in body via get/setRefreshToken; `native: false` uses `credentials: 'include'` (cookie). On 401 for a non-auth route: call `refresh()` once (single in-flight promise shared by concurrent callers), retry; if refresh fails → `setAccessToken(null)`, `onAuthLost()`, throw `ApiError(401)`.

- [ ] Step 1: Failing tests with a stubbed `globalThis.fetch`: (a) bearer header sent; (b) two concurrent 401s trigger exactly one `/auth/refresh` call then both retry and succeed; (c) refresh failure calls `onAuthLost` once; (d) native mode posts `{refreshToken}` and stores the rotated one.
- [ ] Step 2: FAIL. Step 3: Implement (paths: same as API endpoints below, relative to `baseUrl` which already ends in `/api`). Step 4: PASS.
- [ ] Step 5: Commit `feat(shared): typed API client with refresh`.

### Task 5: api — scaffold, config, health, crypto, TOTP

**Files:** `apps/api/{package.json,tsconfig.json,nest-cli.json,jest.config.js}`, `src/{main,app.module,config}.ts`, `src/crypto/{vault-cipher,totp,base32}.ts`, `src/crypto/*.spec.ts`, `test/helpers.ts`, `test/health.e2e-spec.ts`.

**Interfaces — Produces:**
```ts
// config.ts
export interface AppConfig { port: number; mongoUrl: string; jwtSecret: string; vaultKey: Buffer; resendApiKey: string; mailFrom: string; appUrl: string; signupEnabled: boolean; corsOrigins: string[]; }
export function loadConfig(env = process.env): AppConfig;   // throws Error listing every invalid key
export const CONFIG = Symbol('CONFIG');                     // provider token
// crypto/vault-cipher.ts
export interface Sealed { iv: string; ct: string; tag: string; kv: number; } // base64 fields
export class VaultCipher { constructor(key: Buffer, keyVersion = 1); seal(plain: string): Sealed; open(s: Sealed): string; fingerprint(plain: string): string; } // fingerprint = HMAC-SHA256(key,'fp:'+plain) hex
// crypto/totp.ts
export function totp(secret: Buffer, opts: { algorithm: 'SHA1'|'SHA256'|'SHA512'; digits: number; period: number; type: 'totp'|'steam'; now?: number /*ms*/ }): { code: string; expiresAt: number };
export function verifyTotp(secret: Buffer, code: string, now?: number): boolean; // SHA1/6/30, window ±1 step, constant-time compare
// test/helpers.ts
export async function makeApp(overrides?: Partial<AppConfig>): Promise<{ app: NestFastifyApplication; mail: { sent: {to:string; subject:string; text:string}[] }; close(): Promise<void> }>; // mongodb-memory-server, MailService replaced by recorder
export async function signupUser(app, email?: string, password?: string): Promise<{ accessToken: string; refreshToken: string; userId: string }>;
```
`main.ts`: FastifyAdapter, `setGlobalPrefix('api')`, `@fastify/helmet`, `@fastify/cookie`, CORS from `corsOrigins` with credentials, global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, `ThrottlerModule` 100 req/min global. `VaultCipher.open` with `kv` ≠ current → throw (`// ponytail: single key version; add VAULT_OLD_KEYS map when rotating`). Steam: 5 chars from alphabet `23456789BCDFGHJKMNPQRTVWXY` using the RFC 4226 truncated int, repeatedly `% 26`.

- [ ] Step 1: Failing unit tests:
  - `loadConfig({})` throws mentioning `MONGO_URL`, `JWT_SECRET`, `VAULT_MASTER_KEY`; 16-byte key throws.
  - RFC 6238 vectors (8 digits, period 30): SHA1 key `'12345678901234567890'` @59s → `94287082`, @1111111109s → `07081804`; SHA256 key `'12345678901234567890123456789012'` @59s → `46119246`; SHA512 key = `'1234567890'`×6+`'1234'` @59s → `90693936`. `expiresAt` for now=59000 period 30 → `60000`.
  - Steam code matches `/^[23456789BCDFGHJKMNPQRTVWXY]{5}$/`.
  - `open(seal(x)) === x`; flipping one byte of `ct` → `open` throws; two seals of same text have different `iv`; `fingerprint` deterministic.
  - e2e: `GET /api/health` → 200 `{ ok: true }` via `app.inject`.
- [ ] Step 2: `pnpm --filter api test` → FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(api): scaffold, config, vault cipher, totp`.

### Task 6: api — users + auth (signup/login/refresh/logout/me/change password)

**Files:** `src/users/*`, `src/auth/{auth.module,auth.controller,auth.service,tokens.service,refresh-token.schema,jwt.guard,current-user.decorator,dto}.ts`, `test/auth.e2e-spec.ts`.

**Schema:** `users {email (unique, lowercased, trimmed), passwordHash: string|null, role: 'owner'|'member', ownerId?: ObjectId, mfa?: {secret: Sealed, enabled: boolean, recoveryHashes: string[]}, createdAt}`; `refreshTokens {userId, hash (unique), family: string, expiresAt (TTL index), revokedAt?: Date, device?: string}`.

**Endpoints (all under `/api/auth`, auth routes throttled 10/min/IP):**
- `POST /signup {email,password}` → 403 `{message:'Signup disabled'}` if `!signupEnabled`; 409 if email exists; else 201 `AuthResponse` (role owner).
- `POST /login {email,password}` → 401 `'Invalid credentials'` for unknown email or bad password (always run argon2 verify against a fixed dummy hash for unknown email); member with `passwordHash null` → 401 same message; if `mfa.enabled` → 200 `MfaRequired` (mfaToken = JWT `{sub, purpose:'mfa'}` 5 min); else 200 `AuthResponse`.
- `POST /refresh` (token from cookie `rt` or body `refreshToken`) → new pair; old token marked `revokedAt`; presenting a revoked token → revoke every token of that user, 401.
- `POST /logout` → revoke presented token, clear cookie, 204.
- `GET /me` (JWT) → `User`. `POST /password/change {current,next}` (JWT) → 204; revokes other refresh tokens.
- Delivery: header `X-Client: native` → `refreshToken` in JSON body; otherwise cookie `rt` (httpOnly, Secure, SameSite=Strict, Path=`/api/auth`, 30 days) and no `refreshToken` in body.

**Interfaces — Produces:** `JwtGuard` (validates access JWT, sets `req.user = { id, role, ownerId? }`), `@CurrentUser()` param decorator, `TokensService.issue(user, reply, req): Promise<AuthResponse>`, `UsersService.toPublic(user): User`.

- [ ] Step 1: Failing e2e tests: signup → 201 has accessToken; duplicate → 409; `SIGNUP_ENABLED=false` → 403; password length 9 → 400; login unknown email and wrong password give identical status+body; web login sets `rt` cookie with HttpOnly+SameSite=Strict and no body refreshToken; native refresh rotates (new ≠ old); reusing old refresh → 401 and the newest token is also dead afterwards (Review Focus 2); `/me` without token → 401; change password then old password login → 401.
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(api): auth with rotating refresh tokens`.

### Task 7: api — login TOTP (MFA)

**Files:** `src/auth/mfa.service.ts`, controller additions, `test/mfa.e2e-spec.ts`.

**Endpoints (`/api/auth`):**
- `POST /mfa/setup` (JWT) → `{secret, otpauthUri}` (20 random bytes; issuer `Authenticator`, label = email); stores sealed secret with `enabled:false`. 409 if already enabled.
- `POST /mfa/enable {code}` → verifies via `verifyTotp`; sets enabled; returns `{recoveryCodes}` (10 codes, format `xxxx-xxxx` lowercase base32 chars, stored as SHA-256 hashes).
- `POST /login/mfa {mfaToken, code}` → accepts valid TOTP or unused recovery code (recovery code removed after use) → `AuthResponse`; bad → 401. Throttled 5/min.
- `POST /mfa/disable {password, code}` → 204; clears `mfa`.

- [ ] Step 1: Failing e2e: setup→enable with code from `totp()` → 10 recovery codes; login now returns `mfaRequired`; `/login/mfa` with correct code → tokens; with recovery code → tokens, same recovery code again → 401; expired/garbage mfaToken → 401; access token cannot be used as mfaToken (purpose check).
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(api): login TOTP with recovery codes`.

### Task 8: api — mail (Resend) + password reset

**Files:** `src/mail/mail.service.ts`, `src/auth` additions (`resetTokens` collection: `{userId, hash, expiresAt TTL, purpose:'reset'|'invite', usedAt?}`), `test/reset.e2e-spec.ts`.

**Interfaces — Produces:** `MailService.send(to: string, subject: string, text: string, html?: string): Promise<void>` — `POST https://api.resend.com/emails` with `Authorization: Bearer ${resendApiKey}`, body `{from: mailFrom, to, subject, text, html}`; non-2xx → log and throw. `ResetService.createToken(userId, purpose): Promise<string>` (32 random bytes base64url; `reset` 30 min, `invite` 72 h).

**Endpoints:** `POST /api/auth/password/forgot {email}` → always 204 (send only if user exists; link `${appUrl}/reset?token=...`). `POST /api/auth/password/reset {token, password}` → 204, sets password, marks token used, revokes all refresh tokens; used/expired/unknown token → 400 `'Invalid or expired link'`.

- [ ] Step 1: Failing e2e (mail recorder from `makeApp`): forgot for unknown email → 204 and 0 mails (Review Focus 4); for known → 1 mail whose text contains `/reset?token=`; reset with that token → 204, new password logs in, old refresh token → 401; same token again → 400.
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(api): password reset via Resend`.

### Task 9: api — entries CRUD, reorder, codes

**Files:** `src/entries/*`, `test/entries.e2e-spec.ts`.

**Schema:** `entries {ownerId (index), issuer, label, enc: Sealed, fp (index with ownerId, unique), algorithm, digits, period, type, sharedWith: ObjectId[] (index), order, createdAt}`.

**DTO `EntryDto`:** issuer ≤100, label ≤200, secret (normalized base32, decoded length 10–128 bytes), algorithm in enum, digits in [6,7,8], period 15–120 (default 30), type in enum (steam forces digits 5). Same validation rules as shared types.

**Endpoints (JWT):**
- `GET /api/entries` → own entries (`readOnly:false`, `sharedWith` ids) + entries where `sharedWith` contains me (`readOnly:true`, `sharedWith: []`), sorted by `order` then `createdAt`.
- `POST /api/entries` → 201 `Entry`; duplicate secret for same owner (`fp`) → 409.
- `PATCH /api/entries/:id` → only owner of entry; others 404.
- `DELETE /api/entries/:id` → owner only; 204.
- `PUT /api/entries/order {ids}` → sets `order` = index for ids the user owns; ignores others.
- `GET /api/codes` → `CodesResponse` for every visible entry, computed with `totp()` at one `now`.

- [ ] Step 1: Failing e2e: create with `'jbsw y3dp ehpk 3pxp'` → stored, listed with no `secret` field anywhere in response JSON (Review Focus 1); `'JBSW1!'` → 400; duplicate → 409; `/codes` code equals `totp(base32Decode('JBSWY3DPEHPK3PXP'), …)` at serverTime; user B PATCH/DELETE A's entry → 404; reorder changes list order; raw Mongo document has no plaintext secret.
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(api): encrypted entries and server codes`.

### Task 10: api — members + sharing

**Files:** `src/members/*`, `PUT /api/entries/:id/share` in entries controller, `test/members.e2e-spec.ts`.

**Rules:** only `role:'owner'` may call `/api/members*` and share (member → 403). `POST /api/members {email}` → creates `{role:'member', ownerId, passwordHash:null}`, sends invite mail (`${appUrl}/reset?token=...&invite=1`, invite token), 201 `Member` (`activated` = passwordHash != null); existing email → 409. `GET /api/members` → my members. `DELETE /api/members/:id` → only my member; deletes member user, their entries, their refresh/reset tokens, and `$pull` from all my entries' `sharedWith`; 204. `PUT /api/entries/:id/share {memberIds}` → entry must be mine and every id must be my member, else 400; replaces `sharedWith`.

- [ ] Step 1: Failing e2e: owner adds member → invite mail sent; member sets password via reset endpoint and logs in; shared entry visible to member with `readOnly:true` and code in `/codes`; member PATCH/DELETE/share that entry → 404/403; member `/api/members` → 403; owner sharing to another owner's member → 400; member's private entry not visible to owner; delete member → member login 401 and `sharedWith` empty (Review Focus 3).
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(api): members and entry sharing`.

### Task 11: api — vault import/export

**Files:** `src/vault/*`, `test/vault.e2e-spec.ts`.

**Endpoints (JWT):**
- `POST /api/vault/import {entries: EntryDto[]}` (max 1000) → validates all first; any invalid → 400 listing indexes, nothing written (Review Focus 5); duplicates (`fp`, also within the batch) skipped → `{imported, skipped}`.
- `POST /api/vault/export {password, code?}` → verifies password; if MFA enabled requires valid `code`; returns `ExportFile` of **own** entries only (members' shared entries excluded), each with `uri` via an api-side `buildOtpauthUri` (same format as shared). Throttled 5/min.

- [ ] Step 1: Failing e2e: import 3 (one duplicate of existing) → `{imported:2, skipped:1}`; batch with one bad secret → 400 and count unchanged; export wrong password → 401; with MFA enabled and no code → 401; export as member excludes shared entries; export→import into a fresh account recreates identical codes.
- [ ] Step 2: FAIL. Step 3: Implement. Step 4: PASS.
- [ ] Step 5: Commit `feat(api): vault import and export`.

### Task 12: Docker + Dokploy compose, push

**Files:** `apps/api/Dockerfile`, `docker-compose.yml`, `README.md` (deploy steps only: create Dokploy Compose app from this repo, set env, add domain → service `web` port 80 once Phase 2 lands; until then service `api` port 3000).

`apps/api/Dockerfile` (build context = repo root): stage `deps` node:24-alpine + corepack pnpm, copy lockfile + workspace manifests, `pnpm install --frozen-lockfile --filter api...`; stage `build` `pnpm --filter api build`; stage `run` node:24-alpine, non-root `node` user, `pnpm deploy --prod` output, `EXPOSE 3000`, `HEALTHCHECK` via `wget -qO- http://localhost:3000/api/health`, `CMD ["node","dist/main.js"]`.

`docker-compose.yml`:
```yaml
services:
  api:
    build: { context: ., dockerfile: apps/api/Dockerfile }
    restart: unless-stopped
    expose: ["3000"]
    environment:
      - PORT=3000
      - MONGO_URL=mongodb://mongo:27017/authenticator
      - JWT_SECRET=${JWT_SECRET}
      - VAULT_MASTER_KEY=${VAULT_MASTER_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
      - MAIL_FROM=${MAIL_FROM}
      - APP_URL=${APP_URL}
      - SIGNUP_ENABLED=${SIGNUP_ENABLED:-true}
      - CORS_ORIGINS=${CORS_ORIGINS:-}
    depends_on: [mongo]
    networks: [default, dokploy-network]
  mongo:
    image: mongo:7
    restart: unless-stopped
    volumes: [mongo-data:/data/db]
    networks: [default]
volumes: { mongo-data: {} }
networks: { dokploy-network: { external: true } }
```
For local runs: `docker network create dokploy-network` once (README note).

- [ ] Step 1: `docker network create dokploy-network || true; cp .env.example .env` with generated key; `docker compose up -d --build`.
- [ ] Step 2: `docker compose exec api wget -qO- http://localhost:3000/api/health` → `{"ok":true}`; signup via `wget --post-data` from inside container → 201.
- [ ] Step 3: `pnpm test` at root → all green.
- [ ] Step 4: `docker compose down`; commit `chore: api Dockerfile and Dokploy compose`; `git push`.

---

## Self-review notes
- Spec coverage: auth/MFA/reset/members/entries/codes/import/export/Docker all mapped (Tasks 5–12); shared client logic Tasks 2–4. Web, desktop, mobile, REA design pass, biometric lock → Phase 2–4 plans.
- Proto import parsing lives client-side (shared); server receives normalized `EntryDto[]` — matches spec.

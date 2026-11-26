import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../src/app.module';
import type { AppConfig } from '../src/config';
import { MailService } from '../src/mail/mail.service';
import { configureApp } from '../src/setup';

export interface SentMail { to: string; subject: string; text: string }

let mongo: MongoMemoryServer | undefined;

export async function makeApp(overrides: Partial<AppConfig> = {}) {
  mongo ??= await MongoMemoryServer.create();
  const cfg: AppConfig = {
    port: 0, mongoUrl: mongo.getUri(`t${randomBytes(6).toString('hex')}`), jwtSecret: 'x'.repeat(40), vaultKey: randomBytes(32),
    resendApiKey: 're_test', mailFrom: 'test@example.com', appUrl: 'https://app.test', signupEnabled: true, corsOrigins: [],
    disableThrottle: true, ...overrides,
  };
  const mail = { sent: [] as SentMail[] };
  const mod = await Test.createTestingModule({ imports: [AppModule.forRoot(cfg)] })
    .overrideProvider(MailService).useValue({ send: async (to: string, subject: string, text: string) => { mail.sent.push({ to, subject, text }); } })
    .compile();
  const app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApp(app, cfg);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, cfg, mail, close: () => app.close() };
}

export type TestApp = Awaited<ReturnType<typeof makeApp>>;

export const NATIVE = { 'x-client': 'native' };

export async function signupUser(app: NestFastifyApplication, email = `u${randomBytes(4).toString('hex')}@example.com`, password = 'correct horse battery') {
  const r = await app.inject({ method: 'POST', url: '/api/auth/signup', headers: NATIVE, payload: { email, password } });
  if (r.statusCode !== 201) throw new Error(`signup failed ${r.statusCode} ${r.body}`);
  const b = r.json();
  return { accessToken: b.accessToken as string, refreshToken: b.refreshToken as string, userId: b.user.id as string, email, password };
}

export const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

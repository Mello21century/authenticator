import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AppConfig } from './config';

export async function configureApp(app: NestFastifyApplication, cfg: AppConfig): Promise<void> {
  app.setGlobalPrefix('api');
  await app.register(helmet as any);
  await app.register(cookie as any);
  const allowed = new Set([cfg.appUrl, ...cfg.corsOrigins]);
  app.enableCors({ origin: (o, cb) => cb(null, !o || allowed.has(o)), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}

/** trustProxy as a hop count: req.ip = the address the outermost trusted proxy saw, never a client-supplied XFF entry. */
export function createAdapter(cfg: AppConfig) {
  return new FastifyAdapter({ trustProxy: cfg.trustProxyHops > 0 ? cfg.trustProxyHops : false });
}

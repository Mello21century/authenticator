import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { configureApp } from './setup';

const cfg = loadConfig();
const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(cfg), new FastifyAdapter({ trustProxy: true }));
await configureApp(app, cfg);
app.enableShutdownHooks();
await app.listen(cfg.port, '0.0.0.0');

import { z } from 'zod';

const isoDatetimeSchema = z.string().datetime({ offset: true });
const deviceAliasRecordSchema = z.object({
  alias: z.string().min(1),
  applyWhenOriginalName: z.string().min(1).optional(),
  source: z.enum(['seed', 'manual']),
  note: z.string().min(1).optional(),
  updatedAt: isoDatetimeSchema,
});

export const appConfigSchema = z.object({
  version: z.string().min(1),
  userId: z.string().min(1),
  miHome: z.object({
    provider: z.literal('mijia-api'),
    accountId: z.string().min(1).optional(),
    authStoragePath: z.string().min(1),
    region: z.enum(['cn', 'de', 'us']),
    lastLoginAt: isoDatetimeSchema.optional(),
    token: z.string().min(1).optional(),
  }),
  services: z.object({
    mihomeBridge: z.object({
      baseUrl: z.string().url(),
      timeoutMs: z.number().int().min(1000).max(60000),
    }),
    localControl: z.object({
      enabled: z.boolean(),
      baseUrl: z.string().url(),
      timeoutMs: z.number().int().min(1000).max(60000),
    }),
  }),
  window: z.object({
    width: z.number().int().min(320),
    height: z.number().int().min(400),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    alwaysOnTop: z.boolean(),
    opacity: z.number().min(0.1).max(1).default(1),
    backgroundOpacity: z.number().min(0.2).max(1).default(0.72),
    interactionOpacity: z.number().min(0.2).max(1).default(0.88),
    skipTaskbar: z.boolean(),
  }),
  appearance: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    fontSize: z.number().int().min(12).max(24),
    language: z.enum(['zh-CN', 'en']),
  }),
  devices: z.object({
    autoRefresh: z.boolean(),
    refreshInterval: z.number().int().min(30).max(3600),
    lastSyncAt: isoDatetimeSchema.optional(),
    aliases: z.record(z.string(), deviceAliasRecordSchema).default({}),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    maxFiles: z.number().int().min(1).max(30),
    maxSize: z.string().min(2),
  }),
  createdAt: isoDatetimeSchema,
  updatedAt: isoDatetimeSchema,
});

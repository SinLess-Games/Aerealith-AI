import { z } from 'zod';

import type { StorageConfig } from '../types/storage';

const optionalNonEmptyStringSchema = z.string().trim().min(1).optional();

const optionalUrlSchema = z.string().trim().url().optional();

const stringArraySchema = z.array(z.string().trim().min(1)).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const storageProviderSchema = z.union([
  z.literal('cloudflare-r2'),
  z.literal('s3'),
  z.literal('minio'),
  z.literal('local'),
  z.literal('memory'),
  z.string().trim().min(1),
]);

export const storageAccessModeSchema = z.union([
  z.literal('private'),
  z.literal('public-read'),
  z.literal('signed-url'),
  z.literal('worker-mediated'),
  z.string().trim().min(1),
]);

export const storageObjectCategorySchema = z.union([
  z.literal('uploads'),
  z.literal('avatars'),
  z.literal('attachments'),
  z.literal('exports'),
  z.literal('artifacts'),
  z.literal('logs'),
  z.literal('backups'),
  z.literal('datasets'),
  z.literal('models'),
  z.literal('memory'),
  z.string().trim().min(1),
]);

export const storageBucketSchema = z
  .object({
    name: z.string().trim().min(1),

    bucket: z.string().trim().min(1),

    binding: optionalNonEmptyStringSchema,

    prefix: optionalNonEmptyStringSchema,

    category: storageObjectCategorySchema.optional(),

    accessMode: storageAccessModeSchema.default('private'),

    publicUrl: optionalUrlSchema,

    cdnUrl: optionalUrlSchema,

    maxObjectSizeBytes: z.number().int().positive().optional(),

    cacheTtlSeconds: z.number().int().nonnegative().optional(),

    versioningEnabled: z.boolean().optional(),

    encryptionRequired: z.boolean().optional(),

    storageClass: optionalNonEmptyStringSchema,

    retentionDays: z.number().int().nonnegative().optional(),

    lifecycleRules: stringArraySchema.optional(),

    allowedContentTypes: stringArraySchema.optional(),
  })
  .strict();

export const s3CompatibleStorageSchema = z
  .object({
    endpoint: optionalUrlSchema,

    region: optionalNonEmptyStringSchema,

    accessKeyIdRef: optionalNonEmptyStringSchema,

    secretAccessKeyRef: optionalNonEmptyStringSchema,

    forcePathStyle: z.boolean().optional(),
  })
  .strict();

export const localStorageSchema = z
  .object({
    rootDirectory: optionalNonEmptyStringSchema,

    publicUrl: optionalUrlSchema,
  })
  .strict();

export const storageSchema = z
  .object({
    enabled: z.boolean().default(false),

    provider: storageProviderSchema.default('disabled'),

    defaultBucket: optionalNonEmptyStringSchema,

    buckets: z.record(z.string(), storageBucketSchema).default({}),

    s3: s3CompatibleStorageSchema.optional(),

    local: localStorageSchema.optional(),

    signedUploadsEnabled: z.boolean().optional(),

    signedUrlTtlSeconds: z.number().int().positive().optional(),

    workerMediatedDownloadsEnabled: z.boolean().optional(),

    metadata: metadataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    if (Object.keys(value.buckets).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buckets'],
        message: 'At least one storage bucket is required when storage is enabled.',
      });
    }

    if (value.defaultBucket && !(value.defaultBucket in value.buckets)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultBucket'],
        message: 'defaultBucket must reference a key in buckets.',
      });
    }

    if (value.provider === 'cloudflare-r2') {
      for (const [bucketKey, bucket] of Object.entries(value.buckets)) {
        if (!bucket.binding) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['buckets', bucketKey, 'binding'],
            message:
              'Cloudflare R2 buckets should define a Worker binding name.',
          });
        }
      }
    }

    if (
      value.signedUploadsEnabled &&
      (!value.signedUrlTtlSeconds || value.signedUrlTtlSeconds <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signedUrlTtlSeconds'],
        message:
          'signedUrlTtlSeconds is required when signedUploadsEnabled is true.',
      });
    }
  }) satisfies z.ZodType<StorageConfig>;

export type StorageConfigInput = z.input<typeof storageSchema>;

export type StorageConfigOutput = z.output<typeof storageSchema>;

export function parseStorageConfig(input: StorageConfigInput): StorageConfig {
  return storageSchema.parse(input);
}

export function safeParseStorageConfig(input: unknown) {
  return storageSchema.safeParse(input);
}
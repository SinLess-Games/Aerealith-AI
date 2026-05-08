import { z } from 'zod';

import type { StorageConfig } from '../types/storage';

const nonEmptyStringSchema = z.string().trim().min(1);

const optionalNonEmptyStringSchema = nonEmptyStringSchema.optional();

const optionalUrlSchema = z.string().trim().url().optional();

const stringArraySchema = z.array(nonEmptyStringSchema).default([]);

const metadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

export const storageProviderSchema = nonEmptyStringSchema;

export const storageAccessModeSchema = nonEmptyStringSchema;

export const storageObjectCategorySchema = nonEmptyStringSchema;

export const storageBucketSchema = z
  .object({
    name: nonEmptyStringSchema,

    bucket: nonEmptyStringSchema,

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
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.accessMode === 'public-read' &&
      !value.publicUrl &&
      !value.cdnUrl
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicUrl'],
        message:
          'publicUrl or cdnUrl should be provided when accessMode is public-read.',
      });
    }

    if (value.prefix && value.prefix.startsWith('/')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prefix'],
        message: 'prefix should not start with "/".',
      });
    }
  });

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

    if (value.provider === 'disabled') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provider'],
        message: 'An enabled storage config cannot use provider "disabled".',
      });
    }

    if (Object.keys(value.buckets).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buckets'],
        message:
          'At least one storage bucket is required when storage is enabled.',
      });
    }

    if (value.defaultBucket && !(value.defaultBucket in value.buckets)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultBucket'],
        message: 'defaultBucket must reference a key in buckets.',
      });
    }

    for (const [bucketKey, bucket] of Object.entries(value.buckets)) {
      if (bucket.name !== bucketKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['buckets', bucketKey, 'name'],
          message:
            'Storage bucket name should match its registry key for predictable lookups.',
        });
      }
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
      value.provider === 's3' ||
      value.provider === 'minio' ||
      value.provider === 'cloudflare-r2'
    ) {
      const needsS3Credentials =
        value.provider === 's3' || value.provider === 'minio';

      if (needsS3Credentials && !value.s3?.accessKeyIdRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['s3', 'accessKeyIdRef'],
          message:
            's3.accessKeyIdRef is required when using an S3-compatible storage provider.',
        });
      }

      if (needsS3Credentials && !value.s3?.secretAccessKeyRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['s3', 'secretAccessKeyRef'],
          message:
            's3.secretAccessKeyRef is required when using an S3-compatible storage provider.',
        });
      }
    }

    if (value.provider === 'local' && !value.local?.rootDirectory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['local', 'rootDirectory'],
        message:
          'local.rootDirectory is required when storage provider is local.',
      });
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
  });

export type StorageConfigInput = z.input<typeof storageSchema>;

export type StorageConfigOutput = z.output<typeof storageSchema>;

export function parseStorageConfig(input: StorageConfigInput): StorageConfig {
  return storageSchema.parse(input) as StorageConfig;
}

export function safeParseStorageConfig(input: unknown) {
  return storageSchema.safeParse(input);
}
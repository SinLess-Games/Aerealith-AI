import type { StorageConfig } from '../types/storage';

export const defaultStorageConfig = {
  enabled: false,

  /**
   * Disabled by default so local/test environments do not accidentally write
   * files to a real object storage provider.
   */
  provider: 'disabled',

  defaultBucket: undefined,

  buckets: {},

  /**
   * S3-compatible settings for Cloudflare R2, AWS S3, MinIO, Garage, etc.
   *
   * For Cloudflare R2, the endpoint is:
   * https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   *
   * Keep credentials as references only.
   */
  s3: {
    endpoint: undefined,
    region: 'auto',
    accessKeyIdRef: undefined,
    secretAccessKeyRef: undefined,
    forcePathStyle: false,
  },

  /**
   * Local/dev fallback.
   */
  local: {
    rootDirectory: './.data/storage',
    publicUrl: undefined,
  },

  signedUploadsEnabled: false,

  signedUrlTtlSeconds: 900,

  workerMediatedDownloadsEnabled: true,
} satisfies StorageConfig;

export const defaultCloudflareR2StorageConfig = {
  enabled: true,

  provider: 'cloudflare-r2',

  defaultBucket: 'uploads',

  buckets: {
    uploads: {
      name: 'uploads',
      bucket: 'helix-uploads',
      binding: 'HELIX_UPLOADS_BUCKET',
      prefix: 'uploads',
      category: 'uploads',
      accessMode: 'worker-mediated',
      publicUrl: undefined,
      cdnUrl: undefined,
      maxObjectSizeBytes: 25 * 1024 * 1024,
      cacheTtlSeconds: 3600,
      versioningEnabled: false,
      encryptionRequired: true,
      storageClass: undefined,
      retentionDays: undefined,
      lifecycleRules: [],
      allowedContentTypes: [],
    },

    avatars: {
      name: 'avatars',
      bucket: 'helix-avatars',
      binding: 'HELIX_AVATARS_BUCKET',
      prefix: 'avatars',
      category: 'avatars',
      accessMode: 'worker-mediated',
      publicUrl: undefined,
      cdnUrl: undefined,
      maxObjectSizeBytes: 5 * 1024 * 1024,
      cacheTtlSeconds: 86400,
      versioningEnabled: false,
      encryptionRequired: true,
      storageClass: undefined,
      retentionDays: undefined,
      lifecycleRules: [],
      allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    },

    exports: {
      name: 'exports',
      bucket: 'helix-exports',
      binding: 'HELIX_EXPORTS_BUCKET',
      prefix: 'exports',
      category: 'exports',
      accessMode: 'private',
      publicUrl: undefined,
      cdnUrl: undefined,
      maxObjectSizeBytes: 100 * 1024 * 1024,
      cacheTtlSeconds: undefined,
      versioningEnabled: false,
      encryptionRequired: true,
      storageClass: undefined,
      retentionDays: 30,
      lifecycleRules: ['delete-expired-exports'],
      allowedContentTypes: [],
    },

    artifacts: {
      name: 'artifacts',
      bucket: 'helix-artifacts',
      binding: 'HELIX_ARTIFACTS_BUCKET',
      prefix: 'artifacts',
      category: 'artifacts',
      accessMode: 'private',
      publicUrl: undefined,
      cdnUrl: undefined,
      maxObjectSizeBytes: 250 * 1024 * 1024,
      cacheTtlSeconds: undefined,
      versioningEnabled: true,
      encryptionRequired: true,
      storageClass: undefined,
      retentionDays: undefined,
      lifecycleRules: [],
      allowedContentTypes: [],
    },
  },

  s3: {
    endpoint: undefined,
    region: 'auto',
    accessKeyIdRef: 'R2_ACCESS_KEY_ID',
    secretAccessKeyRef: 'R2_SECRET_ACCESS_KEY',
    forcePathStyle: false,
  },

  local: undefined,

  signedUploadsEnabled: true,

  signedUrlTtlSeconds: 900,

  workerMediatedDownloadsEnabled: true,
} satisfies StorageConfig;

export const defaultLocalStorageConfig = {
  enabled: true,

  provider: 'local',

  defaultBucket: 'uploads',

  buckets: {
    uploads: {
      name: 'uploads',
      bucket: 'local-uploads',
      binding: undefined,
      prefix: 'uploads',
      category: 'uploads',
      accessMode: 'private',
      publicUrl: undefined,
      cdnUrl: undefined,
      maxObjectSizeBytes: 25 * 1024 * 1024,
      cacheTtlSeconds: 0,
      versioningEnabled: false,
      encryptionRequired: false,
      storageClass: undefined,
      retentionDays: undefined,
      lifecycleRules: [],
      allowedContentTypes: [],
    },
  },

  s3: undefined,

  local: {
    rootDirectory: './.data/storage',
    publicUrl: undefined,
  },

  signedUploadsEnabled: false,

  signedUrlTtlSeconds: 900,

  workerMediatedDownloadsEnabled: true,
} satisfies StorageConfig;

export default defaultStorageConfig;
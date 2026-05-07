export type StorageProvider =
  | 'cloudflare-r2'
  | 's3'
  | 'minio'
  | 'local'
  | 'memory'
  | string;

export type StorageAccessMode =
  | 'private'
  | 'public-read'
  | 'signed-url'
  | 'worker-mediated'
  | string;

export type StorageObjectCategory =
  | 'uploads'
  | 'avatars'
  | 'attachments'
  | 'exports'
  | 'artifacts'
  | 'logs'
  | 'backups'
  | 'datasets'
  | 'models'
  | 'memory'
  | string;

export interface StorageBucketConfig {
  /**
   * Logical application name for this bucket.
   *
   * Example:
   * uploads, artifacts, exports, audit-logs
   */
  name: string;

  /**
   * Physical bucket name in the backing provider.
   *
   * For Cloudflare R2, this maps to the R2 bucket name.
   * For S3-compatible providers, this maps to the S3 bucket name.
   */
  bucket: string;

  /**
   * Optional binding name used by runtimes such as Cloudflare Workers.
   *
   * Example:
   * HELIX_UPLOADS_BUCKET
   */
  binding?: string;

  /**
   * Optional object key prefix for namespacing objects inside a bucket.
   *
   * Example:
   * production/uploads
   */
  prefix?: string;

  /**
   * What this bucket primarily stores.
   */
  category?: StorageObjectCategory;

  /**
   * Default access model for objects in this bucket.
   */
  accessMode: StorageAccessMode;

  /**
   * Optional public base URL for public or worker-mediated assets.
   */
  publicUrl?: string;

  /**
   * Optional CDN/custom domain for this bucket.
   */
  cdnUrl?: string;

  /**
   * Maximum object size in bytes.
   */
  maxObjectSizeBytes?: number;

  /**
   * Default cache TTL for served objects, in seconds.
   */
  cacheTtlSeconds?: number;

  /**
   * Whether object versioning is expected or required.
   */
  versioningEnabled?: boolean;

  /**
   * Whether object encryption is expected or required.
   */
  encryptionRequired?: boolean;

  /**
   * Optional storage class/tier name.
   *
   * Keep provider-neutral because values differ between providers.
   */
  storageClass?: string;

  /**
   * Optional retention period in days.
   */
  retentionDays?: number;

  /**
   * Optional lifecycle rule names that should exist in the provider.
   */
  lifecycleRules?: string[];

  /**
   * Optional allowed MIME/content types for uploads.
   */
  allowedContentTypes?: string[];
}

export interface S3CompatibleStorageConfig {
  /**
   * S3-compatible endpoint.
   *
   * For Cloudflare R2 S3 API:
   * https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   */
  endpoint?: string;

  /**
   * Region name for S3-compatible clients.
   *
   * Cloudflare R2 commonly uses "auto" for region.
   */
  region?: string;

  /**
   * Access key ID environment variable or secret reference name.
   *
   * Do not store the actual secret value in committed config.
   */
  accessKeyIdRef?: string;

  /**
   * Secret access key environment variable or secret reference name.
   *
   * Do not store the actual secret value in committed config.
   */
  secretAccessKeyRef?: string;

  /**
   * Whether the provider requires path-style addressing.
   */
  forcePathStyle?: boolean;
}

export interface LocalStorageConfig {
  /**
   * Filesystem root for local/dev storage.
   *
   * Example:
   * ./.data/storage
   */
  rootDirectory?: string;

  /**
   * Optional base URL when local files are served by a dev server.
   */
  publicUrl?: string;
}

export interface StorageConfig {
  /**
   * Global storage enablement.
   */
  enabled: boolean;

  /**
   * Primary storage provider.
   */
  provider: StorageProvider;

  /**
   * Default bucket logical name.
   */
  defaultBucket?: string;

  /**
   * Logical bucket map used by the application.
   */
  buckets: Record<string, StorageBucketConfig>;

  /**
   * S3-compatible provider settings for R2, AWS S3, MinIO, Garage, etc.
   */
  s3?: S3CompatibleStorageConfig;

  /**
   * Local filesystem storage for development, tests, or air-gapped installs.
   */
  local?: LocalStorageConfig;

  /**
   * Whether uploads should use pre-signed URLs when supported.
   */
  signedUploadsEnabled?: boolean;

  /**
   * Default signed URL expiration, in seconds.
   */
  signedUrlTtlSeconds?: number;

  /**
   * Whether application code should route downloads through the app/Worker/API
   * instead of exposing provider URLs directly.
   */
  workerMediatedDownloadsEnabled?: boolean;
}
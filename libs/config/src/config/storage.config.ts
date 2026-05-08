import type { StorageConfig } from '../types/storage';

import {
  defaultCloudflareR2StorageConfig,
  defaultLocalStorageConfig,
  defaultStorageConfig,
} from '../defaults/storage.defaults';
import { storageSchema } from '../schema/storage.schema';
import { deepMerge, setDeepValue } from '../utils/deep-merge';
import {
  getEnv,
  getEnvBoolean,
  getEnvInteger,
  getEnvList,
  isCloudflareEnv,
  type EnvRecord,
} from '../utils/env';
import {
  ConfigValidationError,
  safeValidateConfig,
} from '../utils/validation';

export type StorageConfigProfile = 'default' | 'local' | 'cloudflare-r2' | 'auto';

export type ResolvedStorageConfigProfile = Exclude<StorageConfigProfile, 'auto'>;

export type StorageConfigOptions = {
  name?: string;
  profile?: StorageConfigProfile;
  defaults?: StorageConfig;
};

export function createStorageConfig(
  env: EnvRecord = {},
  options: StorageConfigOptions = {},
): StorageConfig {
  const configName = options.name ?? 'storage config';
  const profile = resolveStorageConfigProfile(env, options.profile ?? 'auto');
  const defaults = options.defaults ?? resolveStorageConfigDefaults(profile);
  const overrides = buildStorageConfigOverrides(env);

  const mergedConfig = deepMerge(defaults, overrides, {
    arrayStrategy: 'replace',
    undefinedStrategy: 'ignore',
  });

  const validation = safeValidateConfig(storageSchema, mergedConfig, {
    name: configName,
  });

  if (!validation.success) {
    throw new ConfigValidationError(configName, validation.error);
  }

  return validation.data as StorageConfig;
}

export function buildStorageConfigOverrides(
  env: EnvRecord,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  applyOptionalBoolean(env, overrides, 'STORAGE_ENABLED', 'enabled');
  applyOptionalString(env, overrides, 'STORAGE_PROVIDER', 'provider');
  applyOptionalString(env, overrides, 'STORAGE_DEFAULT_BUCKET', 'defaultBucket');

  applyOptionalString(env, overrides, 'STORAGE_S3_ENDPOINT', 's3.endpoint');
  applyOptionalString(env, overrides, 'STORAGE_S3_REGION', 's3.region');
  applyOptionalBoolean(
    env,
    overrides,
    'STORAGE_S3_FORCE_PATH_STYLE',
    's3.forcePathStyle',
  );

  applyOptionalString(
    env,
    overrides,
    'STORAGE_S3_ACCESS_KEY_ID_REF',
    's3.accessKeyIdRef',
  );
  applyOptionalString(
    env,
    overrides,
    'STORAGE_S3_SECRET_ACCESS_KEY_REF',
    's3.secretAccessKeyRef',
  );

  applyOptionalString(env, overrides, 'R2_ACCESS_KEY_ID_REF', 's3.accessKeyIdRef');
  applyOptionalString(
    env,
    overrides,
    'R2_SECRET_ACCESS_KEY_REF',
    's3.secretAccessKeyRef',
  );

  applyOptionalString(env, overrides, 'LOCAL_STORAGE_ROOT', 'local.rootDirectory');
  applyOptionalString(env, overrides, 'LOCAL_STORAGE_PUBLIC_URL', 'local.publicUrl');

  applyOptionalBoolean(
    env,
    overrides,
    'SIGNED_UPLOADS_ENABLED',
    'signedUploadsEnabled',
  );
  applyOptionalInteger(
    env,
    overrides,
    'SIGNED_URL_TTL_SECONDS',
    'signedUrlTtlSeconds',
  );
  applyOptionalBoolean(
    env,
    overrides,
    'WORKER_MEDIATED_DOWNLOADS_ENABLED',
    'workerMediatedDownloadsEnabled',
  );

  applyBucketOverrides(env, overrides);
  applyCloudflareR2DerivedOverrides(env, overrides);
  applyStorageEnabledDerivedOverrides(env, overrides);

  return overrides;
}

export function resolveStorageConfigProfile(
  env: EnvRecord,
  profile: StorageConfigProfile = 'auto',
): ResolvedStorageConfigProfile {
  if (profile !== 'auto') {
    return profile;
  }

  const explicitProvider = getEnv(env, 'STORAGE_PROVIDER');

  if (explicitProvider === 'cloudflare-r2') {
    return 'cloudflare-r2';
  }

  if (explicitProvider === 'local') {
    return 'local';
  }

  if (hasR2Signal(env) || isCloudflareEnv(env)) {
    return 'cloudflare-r2';
  }

  return 'default';
}

export function resolveStorageConfigDefaults(
  profile: ResolvedStorageConfigProfile,
): StorageConfig {
  if (profile === 'cloudflare-r2') {
    return defaultCloudflareR2StorageConfig;
  }

  if (profile === 'local') {
    return defaultLocalStorageConfig;
  }

  return defaultStorageConfig;
}

/**
 * Backward-compatible default export.
 *
 * Prefer createStorageConfig(env) in runtime code:
 * - Next.js / Node can pass process.env.
 * - Cloudflare Workers can pass the Worker env object.
 * - Tests can pass a plain object.
 */
export const storageConfig = createStorageConfig();

export default storageConfig;

function applyBucketOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  applyNamedBucketOverrides(env, overrides, {
    bucketKey: 'uploads',
    envPrefix: 'UPLOADS',
    defaultBinding: 'HELIX_UPLOADS_BUCKET',
    defaultCategory: 'uploads',
  });

  applyNamedBucketOverrides(env, overrides, {
    bucketKey: 'avatars',
    envPrefix: 'AVATARS',
    defaultBinding: 'HELIX_AVATARS_BUCKET',
    defaultCategory: 'avatars',
  });

  applyNamedBucketOverrides(env, overrides, {
    bucketKey: 'exports',
    envPrefix: 'EXPORTS',
    defaultBinding: 'HELIX_EXPORTS_BUCKET',
    defaultCategory: 'exports',
  });

  applyNamedBucketOverrides(env, overrides, {
    bucketKey: 'artifacts',
    envPrefix: 'ARTIFACTS',
    defaultBinding: 'HELIX_ARTIFACTS_BUCKET',
    defaultCategory: 'artifacts',
  });
}

function applyNamedBucketOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
  options: {
    bucketKey: string;
    envPrefix: string;
    defaultBinding: string;
    defaultCategory: string;
  },
): void {
  const basePath = `buckets.${options.bucketKey}`;
  const bucketName =
    getEnv(env, `STORAGE_${options.envPrefix}_BUCKET`) ??
    getEnv(env, `R2_${options.envPrefix}_BUCKET`);

  const binding =
    getEnv(env, `STORAGE_${options.envPrefix}_BINDING`) ??
    getEnv(env, `R2_${options.envPrefix}_BINDING`);

  const prefix = getEnv(env, `STORAGE_${options.envPrefix}_PREFIX`);
  const publicUrl = getEnv(env, `STORAGE_${options.envPrefix}_PUBLIC_URL`);
  const cdnUrl = getEnv(env, `STORAGE_${options.envPrefix}_CDN_URL`);
  const accessMode = getEnv(env, `STORAGE_${options.envPrefix}_ACCESS_MODE`);
  const category = getEnv(env, `STORAGE_${options.envPrefix}_CATEGORY`);

  const maxObjectSizeBytes = getEnvInteger(
    env,
    `STORAGE_${options.envPrefix}_MAX_OBJECT_SIZE_BYTES`,
  );

  const cacheTtlSeconds = getEnvInteger(
    env,
    `STORAGE_${options.envPrefix}_CACHE_TTL_SECONDS`,
  );

  const retentionDays = getEnvInteger(
    env,
    `STORAGE_${options.envPrefix}_RETENTION_DAYS`,
  );

  const versioningEnabled = getEnvBoolean(
    env,
    `STORAGE_${options.envPrefix}_VERSIONING_ENABLED`,
  );

  const encryptionRequired = getEnvBoolean(
    env,
    `STORAGE_${options.envPrefix}_ENCRYPTION_REQUIRED`,
  );

  const lifecycleRules = getEnvList(
    env,
    `STORAGE_${options.envPrefix}_LIFECYCLE_RULES`,
  );

  const allowedContentTypes = getEnvList(
    env,
    `STORAGE_${options.envPrefix}_ALLOWED_CONTENT_TYPES`,
  );

  if (
    bucketName === undefined &&
    binding === undefined &&
    prefix === undefined &&
    publicUrl === undefined &&
    cdnUrl === undefined &&
    accessMode === undefined &&
    category === undefined &&
    maxObjectSizeBytes === undefined &&
    cacheTtlSeconds === undefined &&
    retentionDays === undefined &&
    versioningEnabled === undefined &&
    encryptionRequired === undefined &&
    lifecycleRules.length === 0 &&
    allowedContentTypes.length === 0
  ) {
    return;
  }

  setDeepValue(overrides, `${basePath}.name`, options.bucketKey);
  setDeepValue(overrides, `${basePath}.binding`, binding ?? options.defaultBinding);
  setDeepValue(overrides, `${basePath}.category`, category ?? options.defaultCategory);

  if (bucketName !== undefined) {
    setDeepValue(overrides, `${basePath}.bucket`, bucketName);
  }

  if (prefix !== undefined) {
    setDeepValue(overrides, `${basePath}.prefix`, prefix);
  }

  if (publicUrl !== undefined) {
    setDeepValue(overrides, `${basePath}.publicUrl`, publicUrl);
  }

  if (cdnUrl !== undefined) {
    setDeepValue(overrides, `${basePath}.cdnUrl`, cdnUrl);
  }

  if (accessMode !== undefined) {
    setDeepValue(overrides, `${basePath}.accessMode`, accessMode);
  }

  if (maxObjectSizeBytes !== undefined) {
    setDeepValue(overrides, `${basePath}.maxObjectSizeBytes`, maxObjectSizeBytes);
  }

  if (cacheTtlSeconds !== undefined) {
    setDeepValue(overrides, `${basePath}.cacheTtlSeconds`, cacheTtlSeconds);
  }

  if (retentionDays !== undefined) {
    setDeepValue(overrides, `${basePath}.retentionDays`, retentionDays);
  }

  if (versioningEnabled !== undefined) {
    setDeepValue(overrides, `${basePath}.versioningEnabled`, versioningEnabled);
  }

  if (encryptionRequired !== undefined) {
    setDeepValue(overrides, `${basePath}.encryptionRequired`, encryptionRequired);
  }

  if (lifecycleRules.length > 0) {
    setDeepValue(overrides, `${basePath}.lifecycleRules`, lifecycleRules);
  }

  if (allowedContentTypes.length > 0) {
    setDeepValue(overrides, `${basePath}.allowedContentTypes`, allowedContentTypes);
  }
}

function applyCloudflareR2DerivedOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (!hasR2Signal(env)) {
    return;
  }

  setDeepValue(overrides, 'enabled', true);
  setDeepValue(overrides, 'provider', 'cloudflare-r2');

  const accountId = getEnv(env, 'CLOUDFLARE_ACCOUNT_ID') ?? getEnv(env, 'R2_ACCOUNT_ID');

  if (accountId && !getEnv(env, 'STORAGE_S3_ENDPOINT')) {
    setDeepValue(
      overrides,
      's3.endpoint',
      `https://${accountId}.r2.cloudflarestorage.com`,
    );
  }

  if (!getEnv(env, 'STORAGE_S3_REGION')) {
    setDeepValue(overrides, 's3.region', 'auto');
  }

  setDeepValue(
    overrides,
    's3.accessKeyIdRef',
    getEnv(env, 'R2_ACCESS_KEY_ID_REF') ??
      getEnv(env, 'STORAGE_S3_ACCESS_KEY_ID_REF') ??
      'R2_ACCESS_KEY_ID',
  );

  setDeepValue(
    overrides,
    's3.secretAccessKeyRef',
    getEnv(env, 'R2_SECRET_ACCESS_KEY_REF') ??
      getEnv(env, 'STORAGE_S3_SECRET_ACCESS_KEY_REF') ??
      'R2_SECRET_ACCESS_KEY',
  );
}

function applyStorageEnabledDerivedOverrides(
  env: EnvRecord,
  overrides: Record<string, unknown>,
): void {
  if (getEnvBoolean(env, 'STORAGE_ENABLED') !== undefined) {
    return;
  }

  if (
    getEnv(env, 'STORAGE_PROVIDER') ||
    getEnv(env, 'STORAGE_DEFAULT_BUCKET') ||
    getEnv(env, 'STORAGE_S3_ENDPOINT') ||
    getEnv(env, 'LOCAL_STORAGE_ROOT') ||
    hasR2Signal(env)
  ) {
    setDeepValue(overrides, 'enabled', true);
  }
}

function hasR2Signal(env: EnvRecord): boolean {
  return Boolean(
    getEnv(env, 'R2_ACCOUNT_ID') ||
      getEnv(env, 'R2_ACCESS_KEY_ID_REF') ||
      getEnv(env, 'R2_SECRET_ACCESS_KEY_REF') ||
      getEnv(env, 'R2_UPLOADS_BUCKET') ||
      getEnv(env, 'R2_AVATARS_BUCKET') ||
      getEnv(env, 'R2_EXPORTS_BUCKET') ||
      getEnv(env, 'R2_ARTIFACTS_BUCKET') ||
      getEnv(env, 'STORAGE_S3_ENDPOINT') ||
      getEnv(env, 'STORAGE_PROVIDER') === 'cloudflare-r2',
  );
}

function applyOptionalString(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnv(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalBoolean(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvBoolean(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}

function applyOptionalInteger(
  env: EnvRecord,
  target: Record<string, unknown>,
  envKey: string,
  path: string,
): void {
  const value = getEnvInteger(env, envKey);

  if (value !== undefined) {
    setDeepValue(target, path, value);
  }
}
import { AuthError } from '@helix-ai/api';
import { AuthPasswordSchemas } from '@helix-ai/contracts';

const {
  AUTH_PASSWORD_LIMITS,
  AUTH_PASSWORD_REGEX,
  AUTH_PASSWORD_SPECIAL_CHARACTERS,
  authStrongPasswordSchema,
} = AuthPasswordSchemas;

export const PASSWORD_HASH_ALGORITHM = {
  PBKDF2_SHA256: 'pbkdf2_sha256',
} as const;

export type PasswordHashAlgorithm =
  (typeof PASSWORD_HASH_ALGORITHM)[keyof typeof PASSWORD_HASH_ALGORITHM];

export type PasswordPolicy = {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  allowedSymbols: string;
};

export type PasswordValidationIssue = {
  code: string;
  message: string;
};

export type PasswordValidationResult = {
  valid: boolean;
  issues: PasswordValidationIssue[];
};

export type PasswordHashOptions = {
  algorithm?: PasswordHashAlgorithm;
  iterations?: number;
  saltLength?: number;
};

export type PasswordHashParts = {
  algorithm: PasswordHashAlgorithm;
  iterations: number;
  salt: string;
  hash: string;
};

export type PasswordServiceOptions = {
  policy?: Partial<PasswordPolicy>;
  hash?: PasswordHashOptions;
};

type RuntimeGlobal = typeof globalThis & {
  crypto?: Crypto;
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: AUTH_PASSWORD_LIMITS.PASSWORD_MIN_LENGTH,
  maxLength: AUTH_PASSWORD_LIMITS.PASSWORD_MAX_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
  allowedSymbols: AUTH_PASSWORD_SPECIAL_CHARACTERS,
};

export const DEFAULT_PASSWORD_HASH_OPTIONS: Required<PasswordHashOptions> = {
  algorithm: PASSWORD_HASH_ALGORITHM.PBKDF2_SHA256,
  iterations: 310_000,
  saltLength: 32,
};

const TEXT_ENCODER = new TextEncoder();

const getCrypto = (): Crypto => {
  const runtime = globalThis as RuntimeGlobal;

  if (runtime.crypto === undefined) {
    throw new Error('Web Crypto API is not available in this runtime.');
  }

  return runtime.crypto;
};

const getSubtleCrypto = (): SubtleCrypto => {
  const crypto = getCrypto();

  if (crypto.subtle === undefined) {
    throw new Error('SubtleCrypto API is not available in this runtime.');
  }

  return crypto.subtle;
};

const base64UrlEncode = (bytes: Uint8Array): string => {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    '',
  );
  const base64 = btoa(binary);

  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const base64UrlDecode = (value: string): Uint8Array => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);

  getCrypto().getRandomValues(bytes);

  return bytes;
};

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = TEXT_ENCODER.encode(left);
  const rightBytes = TEXT_ENCODER.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
};

const normalizePasswordPolicy = (
  policy: Partial<PasswordPolicy> = {},
): PasswordPolicy => {
  return {
    ...DEFAULT_PASSWORD_POLICY,
    ...policy,
  };
};

const normalizeHashOptions = (
  options: PasswordHashOptions = {},
): Required<PasswordHashOptions> => {
  return {
    ...DEFAULT_PASSWORD_HASH_OPTIONS,
    ...options,
  };
};

const createSpecialCharacterRegex = (allowedSymbols: string): RegExp => {
  const escapedSymbols = allowedSymbols.replace(
    /[\\^$.*+?()[\]{}|/-]/g,
    '\\$&',
  );

  return new RegExp(`[${escapedSymbols}]`);
};

const importPasswordKey = async (password: string): Promise<CryptoKey> => {
  return getSubtleCrypto().importKey(
    'raw',
    TEXT_ENCODER.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
};

const derivePasswordHash = async ({
  password,
  salt,
  iterations,
}: {
  password: string;
  salt: Uint8Array;
  iterations: number;
}): Promise<string> => {
  const key = await importPasswordKey(password);

  const derivedBits = await getSubtleCrypto().deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    key,
    256,
  );

  return base64UrlEncode(new Uint8Array(derivedBits));
};

const parsePasswordHash = (passwordHash: string): PasswordHashParts => {
  const [algorithm, iterations, salt, hash] = passwordHash.split('$');

  if (
    algorithm !== PASSWORD_HASH_ALGORITHM.PBKDF2_SHA256 ||
    iterations === undefined ||
    salt === undefined ||
    hash === undefined
  ) {
    throw AuthError.passwordInvalid();
  }

  const parsedIterations = Number(iterations);

  if (!Number.isInteger(parsedIterations) || parsedIterations <= 0) {
    throw AuthError.passwordInvalid();
  }

  return {
    algorithm,
    iterations: parsedIterations,
    salt,
    hash,
  };
};

export class PasswordService {
  private readonly policy: PasswordPolicy;

  private readonly hashOptions: Required<PasswordHashOptions>;

  public constructor(options: PasswordServiceOptions = {}) {
    this.policy = normalizePasswordPolicy(options.policy);
    this.hashOptions = normalizeHashOptions(options.hash);
  }

  public validatePassword(password: string): PasswordValidationResult {
    const issues: PasswordValidationIssue[] = [];

    const schemaResult = authStrongPasswordSchema.safeParse(password);

    if (!schemaResult.success) {
      for (const issue of schemaResult.error.issues) {
        issues.push({
          code: 'PASSWORD_SCHEMA_INVALID',
          message: issue.message,
        });
      }
    }

    if (password.length < this.policy.minLength) {
      issues.push({
        code: 'PASSWORD_TOO_SHORT',
        message: `Password must be at least ${this.policy.minLength} characters.`,
      });
    }

    if (password.length > this.policy.maxLength) {
      issues.push({
        code: 'PASSWORD_TOO_LONG',
        message: `Password must be at most ${this.policy.maxLength} characters.`,
      });
    }

    if (
      this.policy.requireUppercase &&
      !AUTH_PASSWORD_REGEX.UPPERCASE.test(password)
    ) {
      issues.push({
        code: 'PASSWORD_MISSING_UPPERCASE',
        message: 'Password must include at least one capital letter.',
      });
    }

    if (
      this.policy.requireLowercase &&
      !AUTH_PASSWORD_REGEX.LOWERCASE.test(password)
    ) {
      issues.push({
        code: 'PASSWORD_MISSING_LOWERCASE',
        message: 'Password must include at least one lowercase letter.',
      });
    }

    if (
      this.policy.requireNumber &&
      !AUTH_PASSWORD_REGEX.NUMBER.test(password)
    ) {
      issues.push({
        code: 'PASSWORD_MISSING_NUMBER',
        message: 'Password must include at least one number.',
      });
    }

    if (
      this.policy.requireSymbol &&
      !createSpecialCharacterRegex(this.policy.allowedSymbols).test(password)
    ) {
      issues.push({
        code: 'PASSWORD_MISSING_SYMBOL',
        message: `Password must include at least one special character: ${this.policy.allowedSymbols}`,
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  public assertValidPassword(password: string): void {
    const result = this.validatePassword(password);

    if (!result.valid) {
      throw AuthError.passwordWeak({
        issues: result.issues,
      });
    }
  }

  public async hashPassword(password: string): Promise<string> {
    this.assertValidPassword(password);

    const salt = randomBytes(this.hashOptions.saltLength);
    const hash = await derivePasswordHash({
      password,
      salt,
      iterations: this.hashOptions.iterations,
    });

    return [
      this.hashOptions.algorithm,
      this.hashOptions.iterations,
      base64UrlEncode(salt),
      hash,
    ].join('$');
  }

  public async verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    const parsed = parsePasswordHash(passwordHash);

    const hash = await derivePasswordHash({
      password,
      salt: base64UrlDecode(parsed.salt),
      iterations: parsed.iterations,
    });

    return constantTimeEqual(hash, parsed.hash);
  }

  public async assertPasswordMatches(
    password: string,
    passwordHash: string,
  ): Promise<void> {
    const matches = await this.verifyPassword(password, passwordHash);

    if (!matches) {
      throw AuthError.passwordInvalid();
    }
  }

  public needsRehash(passwordHash: string): boolean {
    const parsed = parsePasswordHash(passwordHash);

    return (
      parsed.algorithm !== this.hashOptions.algorithm ||
      parsed.iterations < this.hashOptions.iterations
    );
  }
}

export const createPasswordService = (
  options: PasswordServiceOptions = {},
): PasswordService => {
  return new PasswordService(options);
};

export const passwordService = createPasswordService();

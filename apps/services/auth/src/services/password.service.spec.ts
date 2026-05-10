import { describe, expect, it } from 'vitest';

import {
  PASSWORD_HASH_ALGORITHM,
  createPasswordService,
  type PasswordHashOptions,
  type PasswordPolicy,
} from './password.service';

const VALID_PASSWORD = 'ValidPass123!';
const WRONG_PASSWORD = 'WrongPass123!';
const MISSING_UPPERCASE_PASSWORD = 'validpass123!';
const MISSING_LOWERCASE_PASSWORD = 'VALIDPASS123!';
const MISSING_NUMBER_PASSWORD = 'ValidPassword!';
const MISSING_SYMBOL_PASSWORD = 'ValidPass123';
const TOO_SHORT_PASSWORD = 'Aa1!';

const TEST_HASH_OPTIONS: Required<PasswordHashOptions> = {
  algorithm: PASSWORD_HASH_ALGORITHM.PBKDF2_SHA256,
  iterations: 2,
  saltLength: 16,
};

const createTestPasswordService = ({
  policy,
  hash,
}: {
  policy?: Partial<PasswordPolicy>;
  hash?: PasswordHashOptions;
} = {}) => {
  return createPasswordService({
    policy,
    hash: {
      ...TEST_HASH_OPTIONS,
      ...hash,
    },
  });
};

const parsePasswordHash = (passwordHash: string) => {
  const [algorithm, iterations, salt, hash] = passwordHash.split('$');

  return {
    algorithm,
    iterations,
    salt,
    hash,
    parts: passwordHash.split('$'),
  };
};

describe('PasswordService', () => {
  describe('validatePassword', () => {
    it('accepts a strong password', () => {
      const service = createTestPasswordService();

      const result = service.validatePassword(VALID_PASSWORD);

      expect(result).toEqual({
        valid: true,
        issues: [],
      });
    });

    it('rejects a password without a capital letter', () => {
      const service = createTestPasswordService();

      const result = service.validatePassword(MISSING_UPPERCASE_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PASSWORD_MISSING_UPPERCASE',
          }),
        ]),
      );
    });

    it('rejects a password without a lowercase letter', () => {
      const service = createTestPasswordService();

      const result = service.validatePassword(MISSING_LOWERCASE_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PASSWORD_MISSING_LOWERCASE',
          }),
        ]),
      );
    });

    it('rejects a password without a number', () => {
      const service = createTestPasswordService();

      const result = service.validatePassword(MISSING_NUMBER_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PASSWORD_MISSING_NUMBER',
          }),
        ]),
      );
    });

    it('rejects a password without a special character', () => {
      const service = createTestPasswordService();

      const result = service.validatePassword(MISSING_SYMBOL_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PASSWORD_MISSING_SYMBOL',
          }),
        ]),
      );
    });

    it('rejects a password that is too short', () => {
      const service = createTestPasswordService();

      const result = service.validatePassword(TOO_SHORT_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PASSWORD_TOO_SHORT',
          }),
        ]),
      );
    });

    it('honors a stricter custom max length policy', () => {
      const service = createTestPasswordService({
        policy: {
          maxLength: 8,
        },
      });

      const result = service.validatePassword(VALID_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PASSWORD_TOO_LONG',
          }),
        ]),
      );
    });

    it('honors custom allowed symbols', () => {
      const service = createTestPasswordService({
        policy: {
          allowedSymbols: '#',
        },
      });

      const result = service.validatePassword(VALID_PASSWORD);

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PASSWORD_MISSING_SYMBOL',
          }),
        ]),
      );
    });
  });

  describe('assertValidPassword', () => {
    it('does not throw for a valid password', () => {
      const service = createTestPasswordService();

      expect(() => {
        service.assertValidPassword(VALID_PASSWORD);
      }).not.toThrow();
    });

    it('throws for a weak password', () => {
      const service = createTestPasswordService();

      expect(() => {
        service.assertValidPassword(MISSING_SYMBOL_PASSWORD);
      }).toThrow();
    });
  });

  describe('hashPassword', () => {
    it('hashes a valid password using the configured algorithm and options', async () => {
      const service = createTestPasswordService();

      const passwordHash = await service.hashPassword(VALID_PASSWORD);
      const parsed = parsePasswordHash(passwordHash);

      expect(parsed.parts).toHaveLength(4);
      expect(parsed.algorithm).toBe(PASSWORD_HASH_ALGORITHM.PBKDF2_SHA256);
      expect(parsed.iterations).toBe(String(TEST_HASH_OPTIONS.iterations));
      expect(parsed.salt).toEqual(expect.any(String));
      expect(parsed.hash).toEqual(expect.any(String));
      expect(parsed.salt).not.toBe('');
      expect(parsed.hash).not.toBe('');
      expect(passwordHash).not.toContain(VALID_PASSWORD);
    });

    it('uses a different salt for each hash', async () => {
      const service = createTestPasswordService();

      const firstHash = await service.hashPassword(VALID_PASSWORD);
      const secondHash = await service.hashPassword(VALID_PASSWORD);

      expect(firstHash).not.toBe(secondHash);
      expect(parsePasswordHash(firstHash).salt).not.toBe(
        parsePasswordHash(secondHash).salt,
      );
    });

    it('rejects weak passwords before hashing', async () => {
      const service = createTestPasswordService();

      await expect(
        service.hashPassword(MISSING_SYMBOL_PASSWORD),
      ).rejects.toThrow();
    });
  });

  describe('verifyPassword', () => {
    it('returns true when the password matches the hash', async () => {
      const service = createTestPasswordService();

      const passwordHash = await service.hashPassword(VALID_PASSWORD);

      await expect(
        service.verifyPassword(VALID_PASSWORD, passwordHash),
      ).resolves.toBe(true);
    });

    it('returns false when the password does not match the hash', async () => {
      const service = createTestPasswordService();

      const passwordHash = await service.hashPassword(VALID_PASSWORD);

      await expect(
        service.verifyPassword(WRONG_PASSWORD, passwordHash),
      ).resolves.toBe(false);
    });

    it('throws for malformed password hashes', async () => {
      const service = createTestPasswordService();

      await expect(
        service.verifyPassword(VALID_PASSWORD, 'not-a-valid-password-hash'),
      ).rejects.toThrow();
    });

    it('throws for invalid iteration values', async () => {
      const service = createTestPasswordService();

      await expect(
        service.verifyPassword(
          VALID_PASSWORD,
          `${PASSWORD_HASH_ALGORITHM.PBKDF2_SHA256}$0$salt$hash`,
        ),
      ).rejects.toThrow();
    });

    it('throws for unsupported hash algorithms', async () => {
      const service = createTestPasswordService();

      await expect(
        service.verifyPassword(
          VALID_PASSWORD,
          `argon2id$${TEST_HASH_OPTIONS.iterations}$salt$hash`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('assertPasswordMatches', () => {
    it('does not throw when the password matches', async () => {
      const service = createTestPasswordService();

      const passwordHash = await service.hashPassword(VALID_PASSWORD);

      await expect(
        service.assertPasswordMatches(VALID_PASSWORD, passwordHash),
      ).resolves.toBeUndefined();
    });

    it('throws when the password does not match', async () => {
      const service = createTestPasswordService();

      const passwordHash = await service.hashPassword(VALID_PASSWORD);

      await expect(
        service.assertPasswordMatches(WRONG_PASSWORD, passwordHash),
      ).rejects.toThrow();
    });
  });

  describe('needsRehash', () => {
    it('returns false when the hash uses the current algorithm and iteration count', async () => {
      const service = createTestPasswordService();

      const passwordHash = await service.hashPassword(VALID_PASSWORD);

      expect(service.needsRehash(passwordHash)).toBe(false);
    });

    it('returns true when the hash iteration count is lower than the configured count', async () => {
      const oldService = createTestPasswordService({
        hash: {
          iterations: 1,
        },
      });
      const currentService = createTestPasswordService({
        hash: {
          iterations: 2,
        },
      });

      const passwordHash = await oldService.hashPassword(VALID_PASSWORD);

      expect(currentService.needsRehash(passwordHash)).toBe(true);
    });

    it('throws for malformed hashes', () => {
      const service = createTestPasswordService();

      expect(() => {
        service.needsRehash('not-a-valid-password-hash');
      }).toThrow();
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EmailVerificationEmailService,
  createEmailVerificationMailer,
  createEmailVerificationMailerFromEnv,
} from './email-verification-email.service';
import type {
  EmailVerificationMailer,
  EmailVerificationMailInput,
} from './email-verification-email.service';
import type {
  EmailAddress,
  EmailDeliveryResult,
  EmailService,
  SendEmailInput,
} from './email.service';

type MutableProcessEnv = NodeJS.ProcessEnv & Record<string, string | undefined>;

type MockSendEmail = EmailService['sendEmail'] & {
  mock: {
    calls: Array<[SendEmailInput]>;
  };
};

const ORIGINAL_ENV = { ...process.env };

const resetEnv = (): void => {
  process.env = { ...ORIGINAL_ENV };
};

const setEnv = (values: Record<string, string | undefined>): void => {
  const env = process.env as MutableProcessEnv;

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete env[key];
      continue;
    }

    env[key] = value;
  }
};

const formatAddress = (address: EmailAddress): string => {
  if (typeof address === 'string') {
    return address;
  }

  if (!address.name) {
    return address.address;
  }

  const escapedName = address.name.replaceAll('"', '\\"');

  return `"${escapedName}" <${address.address}>`;
};

const formatRecipients = (
  recipients: EmailAddress | EmailAddress[],
): string[] => {
  const addresses = Array.isArray(recipients) ? recipients : [recipients];

  return addresses.map(formatAddress);
};

const createMockEmailService = (): {
  emailService: EmailService;
  sendEmail: MockSendEmail;
} => {
  const sendEmail = vi.fn(
    async (input: SendEmailInput): Promise<EmailDeliveryResult> => ({
      provider: 'mock',
      accepted: formatRecipients(input.to),
    }),
  ) as unknown as MockSendEmail;

  return {
    emailService: {
      sendEmail,
    },
    sendEmail,
  };
};

const createMailInput = (
  overrides: Partial<EmailVerificationMailInput> = {},
): EmailVerificationMailInput => {
  return {
    user: {
      username: 'sinless777',
      email: 'sinless777@example.com',
      displayName: 'Sinless777',
    },
    emailVerificationToken: {
      token: 'verification_token',
      expiresAt: '2026-05-12T00:00:00.000Z',
    },
    ...overrides,
  };
};

describe('EmailVerificationEmailService', () => {
  it('sends a verification email with text and html content', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      from: 'Helix AI <noreply@mail.helixaibot.com>',
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/api/V1/auth/verify-email',
      productName: 'Helix AI',
      supportEmail: 'support@helixaibot.com',
    });

    await service.sendEmailVerification(createMailInput());

    expect(sendEmail).toHaveBeenCalledTimes(1);

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input).toBeDefined();
    expect(input?.to).toBe('sinless777@example.com');
    expect(input?.from).toBe('Helix AI <noreply@mail.helixaibot.com>');
    expect(input?.subject).toBe('Verify your Helix AI account');

    expect(input?.text).toContain('Verify your Helix AI account');
    expect(input?.text).toContain('Hi Sinless777,');
    expect(input?.text).toContain(
      'https://helixaibot.com/api/V1/auth/verify-email?token=verification_token',
    );
    expect(input?.text).toContain('2026-05-12T00:00:00.000Z');
    expect(input?.text).toContain('support@helixaibot.com');

    expect(input?.html).toContain('Verify your Helix AI account');
    expect(input?.html).toContain('Hi Sinless777,');
    expect(input?.html).toContain(
      'https://helixaibot.com/api/V1/auth/verify-email?token=verification_token',
    );
    expect(input?.html).toContain('support@helixaibot.com');
  });

  it('does not set from when from is omitted', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(createMailInput());

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.from).toBeUndefined();
  });

  it('uses username when displayName is missing', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        user: {
          username: 'sinless777',
          email: 'sinless777@example.com',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain('Hi sinless777,');
    expect(input?.html).toContain('Hi sinless777,');
  });

  it('uses email when displayName and username are empty strings', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        user: {
          username: '',
          email: 'sinless777@example.com',
          displayName: '',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain('Hi sinless777@example.com,');
    expect(input?.html).toContain('Hi sinless777@example.com,');
  });

  it('supports token from rawToken', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        emailVerificationToken: {
          rawToken: 'raw_token',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=raw_token',
    );
  });

  it('supports token from plainToken', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        emailVerificationToken: {
          plainToken: 'plain_token',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=plain_token',
    );
  });

  it('supports token from verificationToken', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        emailVerificationToken: {
          verificationToken: 'verification_token_value',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=verification_token_value',
    );
  });

  it('supports token from value', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        emailVerificationToken: {
          value: 'value_token',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=value_token',
    );
  });

  it('supports nested token from data', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        emailVerificationToken: {
          data: {
            token: 'nested_data_token',
            expiresAt: '2026-06-01T00:00:00.000Z',
          },
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=nested_data_token',
    );
    expect(input?.text).toContain('2026-06-01T00:00:00.000Z');
  });

  it('supports nested token from response', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        emailVerificationToken: {
          response: {
            token: 'nested_response_token',
            expiresAt: '2026-06-02T00:00:00.000Z',
          },
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=nested_response_token',
    );
    expect(input?.text).toContain('2026-06-02T00:00:00.000Z');
  });

  it('throws when token cannot be read', async () => {
    const { emailService } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      productName: 'Helix AI',
    });

    await expect(
      service.sendEmailVerification(
        createMailInput({
          emailVerificationToken: {
            response: {},
          },
        }),
      ),
    ).rejects.toThrow(
      'Email verification token could not be read from the token result.',
    );
  });

  it('builds the verification URL with a normalized path', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com/',
      verifyEmailPath: 'verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(createMailInput());

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=verification_token',
    );
  });

  it('URL encodes the verification token', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(
      createMailInput({
        emailVerificationToken: {
          token: 'token with spaces+symbols',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=token+with+spaces%2Bsymbols',
    );
  });

  it('escapes user-controlled HTML values', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      productName: 'Helix <AI>',
      supportEmail: 'support<test>@helixaibot.com',
    });

    await service.sendEmailVerification(
      createMailInput({
        user: {
          username: 'sinless777',
          email: 'sinless777@example.com',
          displayName: '<script>alert("xss")</script>',
        },
      }),
    );

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.html).toContain('Helix &lt;AI&gt;');
    expect(input?.html).toContain(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(input?.html).toContain('support&lt;test&gt;@helixaibot.com');
    expect(input?.html).not.toContain('<script>alert("xss")</script>');
  });

  it('omits support email text when supportEmail is not configured', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      productName: 'Helix AI',
    });

    await service.sendEmailVerification(createMailInput());

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).not.toContain('Need help? Contact');
    expect(input?.html).not.toContain('Need help? Contact');
  });

  it('uses default public url and default verify path when options are omitted', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
    });

    await service.sendEmailVerification(createMailInput());

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'http://localhost:3000/api/V1/auth/verify-email?token=verification_token',
    );
  });
});

describe('createEmailVerificationMailer', () => {
  afterEach(() => {
    resetEnv();
  });

  it('creates a mailer with an injected email service', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const mailer = createEmailVerificationMailer({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await mailer.sendEmailVerification(createMailInput());

    expect(sendEmail).toHaveBeenCalledTimes(1);

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.subject).toBe('Verify your Helix AI account');
    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=verification_token',
    );
  });

  it('uses environment configuration when options are omitted', async () => {
    resetEnv();
    setEnv({
      AUTH_EMAIL_ENABLED: 'false',
      FRONTEND_PUBLIC_URL: 'https://helixaibot.com',
      AUTH_VERIFY_EMAIL_PATH: '/verify-email',
      AUTH_PRODUCT_NAME: 'Helix AI',
      AUTH_SUPPORT_EMAIL: 'support@helixaibot.com',
    });

    const mailer = createEmailVerificationMailer();

    await expect(mailer.sendEmailVerification(createMailInput())).resolves.toBe(
      undefined,
    );
  });

  it('respects explicit options over environment configuration', async () => {
    resetEnv();
    setEnv({
      AUTH_EMAIL_ENABLED: 'false',
      FRONTEND_PUBLIC_URL: 'https://wrong.example.com',
      AUTH_VERIFY_EMAIL_PATH: '/wrong',
      AUTH_PRODUCT_NAME: 'Wrong Product',
      AUTH_SUPPORT_EMAIL: 'wrong@example.com',
    });

    const { emailService, sendEmail } = createMockEmailService();

    const mailer = createEmailVerificationMailer({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
      supportEmail: 'support@helixaibot.com',
    });

    await mailer.sendEmailVerification(createMailInput());

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.subject).toBe('Verify your Helix AI account');
    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=verification_token',
    );
    expect(input?.text).toContain('support@helixaibot.com');
    expect(input?.text).not.toContain('wrong.example.com');
    expect(input?.text).not.toContain('Wrong Product');
    expect(input?.text).not.toContain('wrong@example.com');
  });
});

describe('createEmailVerificationMailerFromEnv', () => {
  afterEach(() => {
    resetEnv();
  });

  it('is an alias for createEmailVerificationMailer', async () => {
    resetEnv();
    setEnv({
      AUTH_EMAIL_ENABLED: 'false',
      FRONTEND_PUBLIC_URL: 'https://helixaibot.com',
      AUTH_VERIFY_EMAIL_PATH: '/verify-email',
      AUTH_PRODUCT_NAME: 'Helix AI',
    });

    const mailer: EmailVerificationMailer =
      createEmailVerificationMailerFromEnv();

    await expect(mailer.sendEmailVerification(createMailInput())).resolves.toBe(
      undefined,
    );
  });
});

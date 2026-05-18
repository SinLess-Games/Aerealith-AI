import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConsoleEmailService,
  DisabledEmailService,
  EmailVerificationEmailService,
  ResendEmailService,
  createEmailService,
  createEmailServiceFromEnv,
  createEmailVerificationMailer,
} from './email.service';
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

describe('DisabledEmailService', () => {
  it('returns a disabled delivery result without sending email', async () => {
    const service = new DisabledEmailService();

    const result = await service.sendEmail({
      to: 'user@example.com',
      subject: 'Test subject',
      text: 'Test body',
    });

    expect(result).toEqual({
      provider: 'disabled',
      accepted: ['user@example.com'],
    });
  });

  it('normalizes multiple recipient address formats', async () => {
    const service = new DisabledEmailService();

    const result = await service.sendEmail({
      to: [
        'one@example.com',
        {
          name: 'Two Example',
          address: 'two@example.com',
        },
      ],
      subject: 'Test subject',
      text: 'Test body',
    });

    expect(result).toEqual({
      provider: 'disabled',
      accepted: ['one@example.com', '"Two Example" <two@example.com>'],
    });
  });
});

describe('ConsoleEmailService', () => {
  it('logs the email payload and returns accepted recipients', async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const service = new ConsoleEmailService({
      from: 'Helix AI <noreply@mail.helixaibot.com>',
      logger,
    });

    const result = await service.sendEmail({
      to: {
        name: 'Test User',
        address: 'user@example.com',
      },
      subject: 'Verify account',
      text: 'Please verify your account.',
      html: '<p>Please verify your account.</p>',
    });

    expect(result).toEqual({
      provider: 'console',
      accepted: ['"Test User" <user@example.com>'],
    });

    expect(logger.info).toHaveBeenCalledWith(
      '[email:console] Email send requested.',
      {
        from: 'Helix AI <noreply@mail.helixaibot.com>',
        to: ['"Test User" <user@example.com>'],
        subject: 'Verify account',
        text: 'Please verify your account.',
        html: '<p>Please verify your account.</p>',
      },
    );
  });
});

describe('ResendEmailService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetEnv();
  });

  it('throws when no Resend API key is configured', () => {
    resetEnv();
    setEnv({
      RESEND_API_KEY: undefined,
    });

    expect(() => new ResendEmailService()).toThrow(
      'RESEND_API_KEY is required when using Resend email.',
    );
  });

  it('sends email through Resend and returns the Resend id', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: 'resend_email_id',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const service = new ResendEmailService({
      from: 'Helix AI <noreply@mail.helixaibot.com>',
      resend: {
        apiKey: 'test_resend_key',
        endpoint: 'https://resend.test/emails',
      },
    });

    const result = await service.sendEmail({
      to: ['user@example.com'],
      replyTo: 'support@helixaibot.com',
      subject: 'Verify account',
      text: 'Please verify your account.',
      html: '<p>Please verify your account.</p>',
    });

    expect(fetchMock).toHaveBeenCalledWith('https://resend.test/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test_resend_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Helix AI <noreply@mail.helixaibot.com>',
        to: ['user@example.com'],
        subject: 'Verify account',
        text: 'Please verify your account.',
        html: '<p>Please verify your account.</p>',
        reply_to: 'support@helixaibot.com',
      }),
    });

    expect(result).toEqual({
      provider: 'resend',
      id: 'resend_email_id',
      accepted: ['user@example.com'],
    });
  });

  it('throws when Resend returns a non-success response', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          message: 'Invalid API key.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const service = new ResendEmailService({
      resend: {
        apiKey: 'bad_key',
        endpoint: 'https://resend.test/emails',
      },
    });

    await expect(
      service.sendEmail({
        to: 'user@example.com',
        subject: 'Verify account',
        text: 'Please verify your account.',
      }),
    ).rejects.toThrow(
      'Resend email request failed with status 401: Invalid API key.',
    );
  });
});

describe('EmailVerificationEmailService', () => {
  it('sends a verification email with a verification URL', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      from: 'Helix AI <noreply@mail.helixaibot.com>',
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/api/V1/auth/verify-email',
      productName: 'Helix AI',
      supportEmail: 'support@helixaibot.com',
    });

    await service.sendEmailVerification({
      user: {
        username: 'sinless777',
        email: 'sinless777@example.com',
        displayName: 'Sinless777',
      },
      emailVerificationToken: {
        token: 'verification_token',
        expiresAt: '2026-05-12T00:00:00.000Z',
      },
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input).toBeDefined();
    expect(input?.to).toBe('sinless777@example.com');
    expect(input?.from).toBe('Helix AI <noreply@mail.helixaibot.com>');
    expect(input?.subject).toBe('Verify your Helix AI account');
    expect(input?.text).toContain('Hi Sinless777,');
    expect(input?.text).toContain(
      'https://helixaibot.com/api/V1/auth/verify-email?token=verification_token',
    );
    expect(input?.text).toContain('support@helixaibot.com');
    expect(input?.html).toContain('Verify your Helix AI account');
    expect(input?.html).toContain(
      'https://helixaibot.com/api/V1/auth/verify-email?token=verification_token',
    );
  });

  it('uses username when displayName is not available', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
    });

    await service.sendEmailVerification({
      user: {
        username: 'sinless777',
        email: 'sinless777@example.com',
      },
      emailVerificationToken: {
        token: 'verification_token',
      },
    });

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain('Hi sinless777,');
  });

  it('supports nested token response payloads', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
    });

    await service.sendEmailVerification({
      user: {
        username: 'sinless777',
        email: 'sinless777@example.com',
      },
      emailVerificationToken: {
        response: {
          token: 'nested_token',
          expiresAt: '2026-05-12T00:00:00.000Z',
        },
      },
    });

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=nested_token',
    );
    expect(input?.text).toContain('2026-05-12T00:00:00.000Z');
  });

  it('throws when a token cannot be read from the token result', async () => {
    const { emailService } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
    });

    await expect(
      service.sendEmailVerification({
        user: {
          username: 'sinless777',
          email: 'sinless777@example.com',
        },
        emailVerificationToken: {
          response: {},
        },
      }),
    ).rejects.toThrow(
      'Email verification token could not be read from the token result.',
    );
  });

  it('escapes user-controlled HTML content', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const service = new EmailVerificationEmailService({
      emailService,
      publicUrl: 'https://helixaibot.com',
      productName: 'Helix <AI>',
    });

    await service.sendEmailVerification({
      user: {
        username: 'sinless777',
        email: 'sinless777@example.com',
        displayName: '<script>alert("xss")</script>',
      },
      emailVerificationToken: {
        token: 'verification_token',
      },
    });

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.html).toContain('Helix &lt;AI&gt;');
    expect(input?.html).toContain(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(input?.html).not.toContain('<script>alert("xss")</script>');
  });
});

describe('createEmailService', () => {
  afterEach(() => {
    resetEnv();
  });

  it('creates a disabled email service when explicitly disabled', () => {
    const service = createEmailService({
      enabled: false,
    });

    expect(service).toBeInstanceOf(DisabledEmailService);
  });

  it('creates a disabled email service when provider is disabled', () => {
    const service = createEmailService({
      provider: 'disabled',
    });

    expect(service).toBeInstanceOf(DisabledEmailService);
  });

  it('creates a console email service by default when Resend is not configured', () => {
    resetEnv();
    setEnv({
      RESEND_API_KEY: undefined,
    });

    const service = createEmailService();

    expect(service).toBeInstanceOf(ConsoleEmailService);
  });

  it('creates a Resend email service when provider is resend', () => {
    const service = createEmailService({
      provider: 'resend',
      resend: {
        apiKey: 'test_resend_key',
      },
    });

    expect(service).toBeInstanceOf(ResendEmailService);
  });
});

describe('createEmailServiceFromEnv', () => {
  afterEach(() => {
    resetEnv();
  });

  it('creates a disabled email service when AUTH_EMAIL_ENABLED is false', () => {
    resetEnv();
    setEnv({
      AUTH_EMAIL_ENABLED: 'false',
      AUTH_EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'test_resend_key',
    });

    const service = createEmailServiceFromEnv();

    expect(service).toBeInstanceOf(DisabledEmailService);
  });

  it('creates a Resend email service from env configuration', () => {
    resetEnv();
    setEnv({
      AUTH_EMAIL_ENABLED: 'true',
      AUTH_EMAIL_PROVIDER: 'resend',
      AUTH_EMAIL_FROM: 'Helix AI <noreply@mail.helixaibot.com>',
      RESEND_API_KEY: 'test_resend_key',
      RESEND_API_ENDPOINT: 'https://resend.test/emails',
    });

    const service = createEmailServiceFromEnv();

    expect(service).toBeInstanceOf(ResendEmailService);
  });
});

describe('createEmailVerificationMailer', () => {
  afterEach(() => {
    resetEnv();
  });

  it('creates an email verification mailer with an injected email service', async () => {
    const { emailService, sendEmail } = createMockEmailService();

    const mailer = createEmailVerificationMailer({
      emailService,
      publicUrl: 'https://helixaibot.com',
      verifyEmailPath: '/verify-email',
      productName: 'Helix AI',
    });

    await mailer.sendEmailVerification({
      user: {
        username: 'sinless777',
        email: 'sinless777@example.com',
      },
      emailVerificationToken: {
        token: 'verification_token',
      },
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);

    const [input] = sendEmail.mock.calls[0] ?? [];

    expect(input?.subject).toBe('Verify your Helix AI account');
    expect(input?.text).toContain(
      'https://helixaibot.com/verify-email?token=verification_token',
    );
  });

  it('uses environment defaults when options are omitted', async () => {
    resetEnv();
    setEnv({
      AUTH_EMAIL_ENABLED: 'false',
      FRONTEND_PUBLIC_URL: 'https://helixaibot.com',
      AUTH_VERIFY_EMAIL_PATH: '/verify-email',
      AUTH_PRODUCT_NAME: 'Helix AI',
      AUTH_SUPPORT_EMAIL: 'support@helixaibot.com',
    });

    const mailer = createEmailVerificationMailer();

    await expect(
      mailer.sendEmailVerification({
        user: {
          username: 'sinless777',
          email: 'sinless777@example.com',
        },
        emailVerificationToken: {
          token: 'verification_token',
        },
      }),
    ).resolves.toBeUndefined();
  });
});

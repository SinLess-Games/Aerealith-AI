type JsonRecord = Record<string, unknown>;

export type EmailAddress =
  | string
  | {
      name?: string;
      address: string;
    };

export type SendEmailInput = {
  to: EmailAddress | EmailAddress[];
  from?: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  text: string;
  html?: string;
};

export type EmailDeliveryResult = {
  provider: string;
  id?: string;
  accepted: string[];
};

export type EmailService = {
  sendEmail: (input: SendEmailInput) => Promise<EmailDeliveryResult>;
};

export type EmailVerificationUser = {
  username: string;
  email: string;
  displayName?: string | null;
};

export type EmailVerificationMailInput = {
  user: EmailVerificationUser;
  emailVerificationToken: unknown;
  request?: {
    origin?: string | undefined;
    userAgent?: string | undefined;
    ipAddress?: string | undefined;
  };
};

export type EmailVerificationMailer = {
  sendEmailVerification: (
    input: EmailVerificationMailInput,
  ) => Promise<void>;
};

export type TransactionalEmailProvider = 'console' | 'disabled' | 'resend';

export type TransactionalEmailServiceOptions = {
  provider?: TransactionalEmailProvider;
  from?: EmailAddress;
  enabled?: boolean;
  resend?: {
    apiKey?: string;
    endpoint?: string;
  };
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
};

export type EmailVerificationMailerOptions = {
  emailService: EmailService;
  from?: EmailAddress;
  publicUrl?: string;
  verifyEmailPath?: string;
  productName?: string;
  supportEmail?: string;
};

const DEFAULT_EMAIL_FROM = 'Helix AI <noreply@mail.helixaibot.com>';
const DEFAULT_PRODUCT_NAME = 'Helix AI';
const DEFAULT_VERIFY_EMAIL_PATH = '/api/V1/auth/verify-email';
const DEFAULT_PUBLIC_URL = 'http://localhost:3000';
const DEFAULT_RESEND_ENDPOINT = 'https://api.resend.com/emails';

const readRecord = (value: unknown): JsonRecord => {
  if (typeof value === 'object' && value !== null) {
    return value as JsonRecord;
  }

  return {};
};

const readStringProperty = (
  value: unknown,
  property: string,
): string | undefined => {
  const propertyValue = readRecord(value)[property];

  if (typeof propertyValue === 'string' && propertyValue.trim()) {
    return propertyValue.trim();
  }

  return undefined;
};

const readNestedStringProperty = (
  value: unknown,
  path: string[],
): string | undefined => {
  let current: unknown = value;

  for (const part of path) {
    current = readRecord(current)[part];
  }

  if (typeof current === 'string' && current.trim()) {
    return current.trim();
  }

  return undefined;
};

const readEnv = (name: string): string | undefined => {
  const value = process.env[name];

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return undefined;
};

const normalizeUrlBase = (value: string): string => {
  return value.replace(/\/+$/, '');
};

const normalizeUrlPath = (value: string): string => {
  return value.startsWith('/') ? value : `/${value}`;
};

const getEmailAddressValue = (address: EmailAddress): string => {
  if (typeof address === 'string') {
    return address;
  }

  if (!address.name) {
    return address.address;
  }

  const escapedName = address.name.replaceAll('"', '\\"');

  return `"${escapedName}" <${address.address}>`;
};

const getEmailAddressList = (addresses: EmailAddress | EmailAddress[]) => {
  return Array.isArray(addresses) ? addresses : [addresses];
};

const getEmailAddressValues = (
  addresses: EmailAddress | EmailAddress[],
): string[] => {
  return getEmailAddressList(addresses).map(getEmailAddressValue);
};

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
};

const extractVerificationToken = (value: unknown): string => {
  const directToken =
    readStringProperty(value, 'token') ??
    readStringProperty(value, 'rawToken') ??
    readStringProperty(value, 'plainToken') ??
    readStringProperty(value, 'verificationToken') ??
    readStringProperty(value, 'value');

  if (directToken !== undefined) {
    return directToken;
  }

  const nestedToken =
    readNestedStringProperty(value, ['data', 'token']) ??
    readNestedStringProperty(value, ['data', 'rawToken']) ??
    readNestedStringProperty(value, ['data', 'plainToken']) ??
    readNestedStringProperty(value, ['data', 'verificationToken']) ??
    readNestedStringProperty(value, ['response', 'token']) ??
    readNestedStringProperty(value, ['response', 'rawToken']) ??
    readNestedStringProperty(value, ['response', 'plainToken']) ??
    readNestedStringProperty(value, ['response', 'verificationToken']);

  if (nestedToken !== undefined) {
    return nestedToken;
  }

  throw new Error(
    'Email verification token could not be read from the token result.',
  );
};

const getVerificationExpiresAt = (value: unknown): string | undefined => {
  return (
    readStringProperty(value, 'expiresAt') ??
    readNestedStringProperty(value, ['data', 'expiresAt']) ??
    readNestedStringProperty(value, ['response', 'expiresAt'])
  );
};

const createVerificationUrl = ({
  publicUrl,
  verifyEmailPath,
  token,
}: {
  publicUrl: string;
  verifyEmailPath: string;
  token: string;
}): string => {
  const url = new URL(
    normalizeUrlPath(verifyEmailPath),
    `${normalizeUrlBase(publicUrl)}/`,
  );

  url.searchParams.set('token', token);

  return url.toString();
};

const createTextVerificationEmail = ({
  productName,
  displayName,
  verifyUrl,
  expiresAt,
  supportEmail,
}: {
  productName: string;
  displayName: string;
  verifyUrl: string;
  expiresAt?: string;
  supportEmail?: string;
}): string => {
  const lines = [
    `Verify your ${productName} account`,
    '',
    `Hi ${displayName},`,
    '',
    `Click the link below to verify your email address:`,
    '',
    verifyUrl,
    '',
    expiresAt ? `This link expires at ${expiresAt}.` : 'This link expires soon.',
    '',
    `If you did not create a ${productName} account, you can ignore this email.`,
  ];

  if (supportEmail !== undefined) {
    lines.push('', `Need help? Contact ${supportEmail}.`);
  }

  return lines.join('\n');
};

const createHtmlVerificationEmail = ({
  productName,
  displayName,
  verifyUrl,
  expiresAt,
  supportEmail,
}: {
  productName: string;
  displayName: string;
  verifyUrl: string;
  expiresAt?: string;
  supportEmail?: string;
}): string => {
  const safeProductName = escapeHtml(productName);
  const safeDisplayName = escapeHtml(displayName);
  const safeVerifyUrl = escapeHtml(verifyUrl);
  const safeExpiresAt =
    expiresAt === undefined ? undefined : escapeHtml(expiresAt);
  const safeSupportEmail =
    supportEmail === undefined ? undefined : escapeHtml(supportEmail);

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Verify your ${safeProductName} account</title>
  </head>
  <body style="margin:0;padding:0;background:#050716;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050716;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#090a1a;border:1px solid rgba(246,6,111,0.34);border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <h1 style="margin:0;color:#ffffff;font-size:26px;line-height:1.2;">
                  Verify your ${safeProductName} account
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 0;color:#dbeafe;font-size:16px;line-height:1.6;">
                <p style="margin:0 0 16px;">Hi ${safeDisplayName},</p>
                <p style="margin:0 0 20px;">
                  Click the button below to verify your email address and finish setting up your account.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px;">
                <a href="${safeVerifyUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:linear-gradient(135deg,#f6066f,#5c00ff);color:#ffffff;text-decoration:none;font-weight:700;">
                  Verify email
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;color:#aabedc;font-size:14px;line-height:1.6;">
                <p style="margin:0 0 12px;">
                  ${
                    safeExpiresAt === undefined
                      ? 'This link expires soon.'
                      : `This link expires at ${safeExpiresAt}.`
                  }
                </p>
                <p style="margin:0 0 12px;">
                  If the button does not work, copy and paste this URL into your browser:
                </p>
                <p style="margin:0;word-break:break-all;">
                  <a href="${safeVerifyUrl}" style="color:#8be9ff;">${safeVerifyUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;background:rgba(139,233,255,0.06);color:#aabedc;font-size:13px;line-height:1.6;">
                <p style="margin:0;">
                  If you did not create a ${safeProductName} account, you can ignore this email.
                  ${
                    safeSupportEmail === undefined
                      ? ''
                      : ` Need help? Contact ${safeSupportEmail}.`
                  }
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
};

export class DisabledEmailService implements EmailService {
  public async sendEmail(input: SendEmailInput): Promise<EmailDeliveryResult> {
    return {
      provider: 'disabled',
      accepted: getEmailAddressValues(input.to),
    };
  }
}

export class ConsoleEmailService implements EmailService {
  private readonly from: EmailAddress;

  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  public constructor(options: TransactionalEmailServiceOptions = {}) {
    this.from = options.from ?? DEFAULT_EMAIL_FROM;
    this.logger = options.logger ?? console;
  }

  public async sendEmail(input: SendEmailInput): Promise<EmailDeliveryResult> {
    const from = getEmailAddressValue(input.from ?? this.from);
    const to = getEmailAddressValues(input.to);

    this.logger.info('[email:console] Email send requested.', {
      from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    return {
      provider: 'console',
      accepted: to,
    };
  }
}

export class ResendEmailService implements EmailService {
  private readonly apiKey: string;

  private readonly endpoint: string;

  private readonly from: EmailAddress;

  public constructor(options: TransactionalEmailServiceOptions = {}) {
    const apiKey = options.resend?.apiKey ?? readEnv('RESEND_API_KEY');

    if (apiKey === undefined) {
      throw new Error('RESEND_API_KEY is required when using Resend email.');
    }

    this.apiKey = apiKey;
    this.endpoint = options.resend?.endpoint ?? DEFAULT_RESEND_ENDPOINT;
    this.from = options.from ?? DEFAULT_EMAIL_FROM;
  }

  public async sendEmail(input: SendEmailInput): Promise<EmailDeliveryResult> {
    const to = getEmailAddressValues(input.to);
    const from = getEmailAddressValue(input.from ?? this.from);
    const replyTo =
      input.replyTo === undefined
        ? undefined
        : getEmailAddressValue(input.replyTo);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        text: input.text,
        ...(input.html === undefined ? {} : { html: input.html }),
        ...(replyTo === undefined ? {} : { reply_to: replyTo }),
      }),
    });

    const data = await response.json().catch(() => undefined);

    if (!response.ok) {
      const message =
        readStringProperty(data, 'message') ??
        readStringProperty(data, 'error') ??
        'Unknown Resend error.';

      throw new Error(
        `Resend email request failed with status ${response.status}: ${message}`,
      );
    }

    return {
      provider: 'resend',
      id: readStringProperty(data, 'id'),
      accepted: to,
    };
  }
}

export class EmailVerificationEmailService
  implements EmailVerificationMailer
{
  private readonly emailService: EmailService;

  private readonly from?: EmailAddress;

  private readonly publicUrl: string;

  private readonly verifyEmailPath: string;

  private readonly productName: string;

  private readonly supportEmail?: string;

  public constructor(options: EmailVerificationMailerOptions) {
    this.emailService = options.emailService;
    this.from = options.from;
    this.publicUrl = options.publicUrl ?? DEFAULT_PUBLIC_URL;
    this.verifyEmailPath = options.verifyEmailPath ?? DEFAULT_VERIFY_EMAIL_PATH;
    this.productName = options.productName ?? DEFAULT_PRODUCT_NAME;
    this.supportEmail = options.supportEmail;
  }

  public async sendEmailVerification({
    user,
    emailVerificationToken,
    request,
  }: EmailVerificationMailInput): Promise<void> {
    const token = extractVerificationToken(emailVerificationToken);
    const expiresAt = getVerificationExpiresAt(emailVerificationToken);
    const publicUrl = this.publicUrl || request?.origin || DEFAULT_PUBLIC_URL;

    const verifyUrl = createVerificationUrl({
      publicUrl,
      verifyEmailPath: this.verifyEmailPath,
      token,
    });

    const displayName = user.displayName || user.username || user.email;
    const subject = `Verify your ${this.productName} account`;

    const text = createTextVerificationEmail({
      productName: this.productName,
      displayName,
      verifyUrl,
      expiresAt,
      supportEmail: this.supportEmail,
    });

    const html = createHtmlVerificationEmail({
      productName: this.productName,
      displayName,
      verifyUrl,
      expiresAt,
      supportEmail: this.supportEmail,
    });

    await this.emailService.sendEmail({
      to: user.email,
      ...(this.from === undefined ? {} : { from: this.from }),
      subject,
      text,
      html,
    });
  }
}

export const createEmailService = (
  options: TransactionalEmailServiceOptions = {},
): EmailService => {
  if (options.enabled === false) {
    return new DisabledEmailService();
  }

  const provider = options.provider ?? (readEnv('RESEND_API_KEY') ? 'resend' : 'console');

  if (provider === 'disabled') {
    return new DisabledEmailService();
  }

  if (provider === 'resend') {
    return new ResendEmailService(options);
  }

  return new ConsoleEmailService(options);
};

export const createEmailServiceFromEnv = (): EmailService => {
  const provider = readEnv('AUTH_EMAIL_PROVIDER') as
    | TransactionalEmailProvider
    | undefined;

  const enabled = readEnv('AUTH_EMAIL_ENABLED');

  return createEmailService({
    provider,
    enabled: enabled === undefined ? undefined : enabled !== 'false',
    from: readEnv('AUTH_EMAIL_FROM') ?? DEFAULT_EMAIL_FROM,
    resend: {
      apiKey: readEnv('RESEND_API_KEY'),
      endpoint: readEnv('RESEND_API_ENDPOINT'),
    },
  });
};

export const createEmailVerificationMailer = (
  options: Omit<EmailVerificationMailerOptions, 'emailService'> & {
    emailService?: EmailService;
  } = {},
): EmailVerificationMailer => {
  return new EmailVerificationEmailService({
    emailService: options.emailService ?? createEmailServiceFromEnv(),
    ...(options.from === undefined ? {} : { from: options.from }),
    publicUrl:
      options.publicUrl ??
      readEnv('FRONTEND_PUBLIC_URL') ??
      readEnv('AUTH_PUBLIC_URL') ??
      readEnv('APP_URL') ??
      DEFAULT_PUBLIC_URL,
    verifyEmailPath:
      options.verifyEmailPath ??
      readEnv('AUTH_VERIFY_EMAIL_PATH') ??
      DEFAULT_VERIFY_EMAIL_PATH,
    productName:
      options.productName ?? readEnv('AUTH_PRODUCT_NAME') ?? DEFAULT_PRODUCT_NAME,
    ...(options.supportEmail === undefined
      ? readEnv('AUTH_SUPPORT_EMAIL') === undefined
        ? {}
        : { supportEmail: readEnv('AUTH_SUPPORT_EMAIL') }
      : { supportEmail: options.supportEmail }),
  });
};

export const createEmailVerificationMailerFromEnv =
  createEmailVerificationMailer;

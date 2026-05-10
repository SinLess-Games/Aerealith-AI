export const AUTH_ERROR_CODE = {
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  FORBIDDEN: 'AUTH_FORBIDDEN',

  USER_NOT_FOUND: 'AUTH_USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'AUTH_USER_ALREADY_EXISTS',
  USER_DISABLED: 'AUTH_USER_DISABLED',
  USER_LOCKED: 'AUTH_USER_LOCKED',
  USER_DELETED: 'AUTH_USER_DELETED',

  ACCOUNT_NOT_FOUND: 'AUTH_ACCOUNT_NOT_FOUND',
  ACCOUNT_ALREADY_EXISTS: 'AUTH_ACCOUNT_ALREADY_EXISTS',
  ACCOUNT_PROVIDER_NOT_SUPPORTED: 'AUTH_ACCOUNT_PROVIDER_NOT_SUPPORTED',

  SESSION_NOT_FOUND: 'AUTH_SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  SESSION_REVOKED: 'AUTH_SESSION_REVOKED',

  TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  TOKEN_TYPE_INVALID: 'AUTH_TOKEN_TYPE_INVALID',
  TOKEN_SCOPE_MISSING: 'AUTH_TOKEN_SCOPE_MISSING',

  EMAIL_ALREADY_VERIFIED: 'AUTH_EMAIL_ALREADY_VERIFIED',
  EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  VERIFICATION_TOKEN_NOT_FOUND: 'AUTH_VERIFICATION_TOKEN_NOT_FOUND',
  VERIFICATION_TOKEN_INVALID: 'AUTH_VERIFICATION_TOKEN_INVALID',
  VERIFICATION_TOKEN_EXPIRED: 'AUTH_VERIFICATION_TOKEN_EXPIRED',

  PASSWORD_INVALID: 'AUTH_PASSWORD_INVALID',
  PASSWORD_WEAK: 'AUTH_PASSWORD_WEAK',
  PASSWORD_RESET_TOKEN_INVALID: 'AUTH_PASSWORD_RESET_TOKEN_INVALID',
  PASSWORD_RESET_TOKEN_EXPIRED: 'AUTH_PASSWORD_RESET_TOKEN_EXPIRED',

  USERNAME_ACCESS_DENIED: 'AUTH_USERNAME_ACCESS_DENIED',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODE)[keyof typeof AUTH_ERROR_CODE];

export type AuthErrorDetails = Record<string, unknown>;

export type AuthErrorOptions = {
  details?: unknown;
  expose?: boolean;
};

export class AuthError extends Error {
  public override readonly name = 'AuthError';

  public readonly code: AuthErrorCode;

  public readonly status: number;

  public readonly statusCode: number;

  public readonly details?: unknown;

  public readonly expose: boolean;

  public constructor(
    code: AuthErrorCode,
    message: string,
    status: number,
    options: AuthErrorOptions = {},
  ) {
    super(message);

    this.code = code;
    this.status = status;
    this.statusCode = status;
    this.details = options.details;
    this.expose = options.expose ?? status < 500;

    Object.setPrototypeOf(this, new.target.prototype);
  }

  public static invalidCredentials(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.INVALID_CREDENTIALS,
      'Invalid username, email, or password.',
      401,
    );
  }

  public static unauthorized(
    message = 'Authentication is required.',
  ): AuthError {
    return new AuthError(AUTH_ERROR_CODE.UNAUTHORIZED, message, 401);
  }

  public static forbidden(message = 'Access denied.'): AuthError {
    return new AuthError(AUTH_ERROR_CODE.FORBIDDEN, message, 403);
  }

  public static usernameAccessDenied(
    authenticatedUsername: string,
    requestedUsername: string,
  ): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.USERNAME_ACCESS_DENIED,
      'You are not allowed to access auth data for this username.',
      403,
      {
        details: {
          authenticatedUsername,
          requestedUsername,
        },
      },
    );
  }

  public static userNotFound(usernameOrId?: string): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.USER_NOT_FOUND,
      'User not found.',
      404,
      {
        details: usernameOrId === undefined ? undefined : { usernameOrId },
      },
    );
  }

  public static userAlreadyExists(field: 'email' | 'username'): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.USER_ALREADY_EXISTS,
      `A user with that ${field} already exists.`,
      409,
      {
        details: { field },
      },
    );
  }

  public static userDisabled(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.USER_DISABLED,
      'This user account is disabled.',
      403,
    );
  }

  public static userLocked(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.USER_LOCKED,
      'This user account is locked.',
      403,
    );
  }

  public static userDeleted(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.USER_DELETED,
      'This user account has been deleted.',
      403,
    );
  }

  public static accountNotFound(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.ACCOUNT_NOT_FOUND,
      'Auth account not found.',
      404,
    );
  }

  public static accountAlreadyExists(provider: string): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.ACCOUNT_ALREADY_EXISTS,
      'An account already exists for this provider.',
      409,
      {
        details: { provider },
      },
    );
  }

  public static accountProviderNotSupported(provider: string): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.ACCOUNT_PROVIDER_NOT_SUPPORTED,
      'This account provider is not supported.',
      400,
      {
        details: { provider },
      },
    );
  }

  public static sessionNotFound(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.SESSION_NOT_FOUND,
      'Session not found.',
      404,
    );
  }

  public static sessionExpired(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.SESSION_EXPIRED,
      'Session has expired.',
      401,
    );
  }

  public static sessionRevoked(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.SESSION_REVOKED,
      'Session has been revoked.',
      401,
    );
  }

  public static tokenMissing(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.TOKEN_MISSING,
      'Authentication token is missing.',
      401,
    );
  }

  public static tokenInvalid(
    message = 'Authentication token is invalid.',
  ): AuthError {
    return new AuthError(AUTH_ERROR_CODE.TOKEN_INVALID, message, 401);
  }

  public static tokenExpired(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.TOKEN_EXPIRED,
      'Authentication token has expired.',
      401,
    );
  }

  public static tokenRevoked(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.TOKEN_REVOKED,
      'Authentication token has been revoked.',
      401,
    );
  }

  public static tokenTypeInvalid(
    expectedType: string,
    actualType?: string,
  ): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.TOKEN_TYPE_INVALID,
      'Authentication token type is invalid.',
      401,
      {
        details: {
          expectedType,
          actualType,
        },
      },
    );
  }

  public static tokenScopeMissing(scopes: string[]): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.TOKEN_SCOPE_MISSING,
      'Authentication token is missing required scope.',
      403,
      {
        details: { scopes },
      },
    );
  }

  public static emailAlreadyVerified(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.EMAIL_ALREADY_VERIFIED,
      'Email address is already verified.',
      409,
    );
  }

  public static emailNotVerified(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.EMAIL_NOT_VERIFIED,
      'Email address is not verified.',
      403,
    );
  }

  public static verificationTokenNotFound(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.VERIFICATION_TOKEN_NOT_FOUND,
      'Verification token not found.',
      404,
    );
  }

  public static verificationTokenInvalid(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.VERIFICATION_TOKEN_INVALID,
      'Verification token is invalid.',
      400,
    );
  }

  public static verificationTokenExpired(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.VERIFICATION_TOKEN_EXPIRED,
      'Verification token has expired.',
      400,
    );
  }

  public static passwordInvalid(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.PASSWORD_INVALID,
      'Current password is invalid.',
      401,
    );
  }

  public static passwordWeak(details?: unknown): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.PASSWORD_WEAK,
      'Password does not meet security requirements.',
      400,
      {
        details,
      },
    );
  }

  public static passwordResetTokenInvalid(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.PASSWORD_RESET_TOKEN_INVALID,
      'Password reset token is invalid.',
      400,
    );
  }

  public static passwordResetTokenExpired(): AuthError {
    return new AuthError(
      AUTH_ERROR_CODE.PASSWORD_RESET_TOKEN_EXPIRED,
      'Password reset token has expired.',
      400,
    );
  }
}

export const isAuthError = (error: unknown): error is AuthError => {
  return error instanceof AuthError;
};

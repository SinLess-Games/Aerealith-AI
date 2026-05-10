export {
  createAuthEmailVerificationRoutes,
  authEmailVerificationRoutes,
} from './auth-email-verification.routes';
export type { AuthEmailVerificationRoutesOptions } from './auth-email-verification.routes';

export {
  createAuthPasswordRoutes,
  authPasswordRoutes,
} from './auth-password.routes';
export type { AuthPasswordRoutesOptions } from './auth-password.routes';

export { createAuthPublicRoutes, authPublicRoutes } from './auth-public.routes';
export type {
  ApiSuccessResponse as AuthPublicApiSuccessResponse,
  ApiValidationErrorResponse as AuthPublicApiValidationErrorResponse,
  AuthPublicRoutesOptions,
} from './auth-public.routes';

export { createAuthRoutes, authRoutes } from './auth.routes';
export type { AuthRoutesOptions } from './auth.routes';

export {
  createAuthSessionRoutes,
  authSessionRoutes,
} from './auth-session.routes';
export type { AuthSessionRoutesOptions } from './auth-session.routes';

export {
  createAuthUsernameRoutes,
  authUsernameRoutes,
} from './auth-username.routes';
export type { AuthUsernameRoutesOptions } from './auth-username.routes';

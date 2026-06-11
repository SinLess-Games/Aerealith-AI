// libs/content/src/types/login.ts

import type { UserProfileMenuUser } from './user';

export type LoginSignupSuccessPayload = {
  user: UserProfileMenuUser;
  accessToken?: string | null;
  refreshToken?: string | null;
  sessionId?: string | null;
  redirectTo?: string | null;
  message?: string | null;
  isNewUser?: boolean;
};

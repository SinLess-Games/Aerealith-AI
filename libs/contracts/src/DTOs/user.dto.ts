import type { ApiResponse } from '../response-types/api.response';
import type { PaginatedResponse } from '../response-types/paginated.response';
import type {
  AvatarUrl,
  CreateUserProfileRequestInput,
  DisplayName,
  OnboardingStatus,
  PublicUserProfileInput,
  PublicUserProfileResponseInput,
  UpdateUserConsentRequestInput,
  UpdateUserPreferencesRequestInput,
  UpdateUserProfileRequestInput,
  UserConsentId,
  UserConsentInput,
  UserConsentResponseInput,
  UserEmail,
  UserId,
  UserPreferenceId,
  UserPreferencesInput,
  UserPreferencesResponseInput,
  UserProfileId,
  UserProfileInput,
  UserProfileResponseInput,
  UserStatus,
  Username,
} from '../zod-schemas/user.schema';

/**
 * User DTOs shared across Helix services and clients.
 *
 * This file is type-only and framework-agnostic:
 * - no Hono imports
 * - no Cloudflare Worker imports
 * - no database imports
 * - no frontend imports
 */

export type {
  AvatarUrl,
  DisplayName,
  OnboardingStatus,
  UserConsentId,
  UserEmail,
  UserId,
  UserPreferenceId,
  UserProfileId,
  UserStatus,
  Username,
};

export type UserProfileDto = UserProfileInput;

export type PublicUserProfileDto = PublicUserProfileInput;

export type CreateUserProfileRequestDto = CreateUserProfileRequestInput;

export type UpdateUserProfileRequestDto = UpdateUserProfileRequestInput;

export type UserProfileResponseDto = UserProfileResponseInput;

export type PublicUserProfileResponseDto = PublicUserProfileResponseInput;

export type UserPreferencesDto = UserPreferencesInput;

export type UpdateUserPreferencesRequestDto = UpdateUserPreferencesRequestInput;

export type UserPreferencesResponseDto = UserPreferencesResponseInput;

export type UserConsentDto = UserConsentInput;

export type UpdateUserConsentRequestDto = UpdateUserConsentRequestInput;

export type UserConsentResponseDto = UserConsentResponseInput;

export type GetCurrentUserResponseDto = {
  profile: UserProfileDto;
  preferences: UserPreferencesDto;
  consent: UserConsentDto;
};

export type UserSummaryDto = {
  userId: UserId;
  username: Username | null;
  displayName: DisplayName | null;
  avatarUrl: AvatarUrl | null;
  status: UserStatus;
};

export type UserIdentityDto = {
  userId: UserId;
  email: UserEmail;
  status: UserStatus;
  emailVerified: boolean;
};

export type UserAccountDto = {
  identity: UserIdentityDto;
  profile: UserProfileDto;
  preferences: UserPreferencesDto;
  consent: UserConsentDto;
};

export type UserOnboardingStateDto = {
  userId: UserId;
  onboardingStatus: OnboardingStatus;
  completedSteps: string[];
  nextStep: string | null;
};

export type UpdateUserOnboardingStateRequestDto = {
  onboardingStatus: OnboardingStatus;
  completedSteps?: string[];
  nextStep?: string | null;
};

export type UserProfileApiResponseDto = ApiResponse<UserProfileResponseDto>;

export type PublicUserProfileApiResponseDto =
  ApiResponse<PublicUserProfileResponseDto>;

export type UserPreferencesApiResponseDto =
  ApiResponse<UserPreferencesResponseDto>;

export type UserConsentApiResponseDto = ApiResponse<UserConsentResponseDto>;

export type CurrentUserApiResponseDto = ApiResponse<GetCurrentUserResponseDto>;

export type UserAccountApiResponseDto = ApiResponse<UserAccountDto>;

export type UserOnboardingStateApiResponseDto =
  ApiResponse<UserOnboardingStateDto>;

export type PaginatedUserProfilesResponseDto =
  PaginatedResponse<UserProfileDto>;

export type PaginatedPublicUserProfilesResponseDto =
  PaginatedResponse<PublicUserProfileDto>;

export type PaginatedUserSummariesResponseDto =
  PaginatedResponse<UserSummaryDto>;

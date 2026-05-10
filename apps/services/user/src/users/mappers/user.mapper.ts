import type {
  PublicUserServiceDto,
  UserServiceStatus,
  UserServiceUserId,
  UserServiceUsername,
} from '@helix-ai/contracts';

type DateLike = Date | string | null | undefined;

export type UserMapperStatus =
  | UserServiceStatus
  | 'pending_verification'
  | 'suspended'
  | 'locked'
  | string
  | null
  | undefined;

export interface UserMapperInput {
  id?: string;
  username?: string | null;
  displayName?: string | null;
  status?: UserMapperStatus;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

export const toPublicUserDto = (user: UserMapperInput): PublicUserServiceDto => {
  const id = resolveUserId(user);
  const username = resolveUsername(user);

  return {
    id: id as UserServiceUserId,
    username: username as UserServiceUsername,
    displayName: user.displayName ?? username,
    status: normalizeUserStatus(user.status),
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  };
};

export const toPublicUserDtos = (
  users: UserMapperInput[],
): PublicUserServiceDto[] => users.map((user) => toPublicUserDto(user));

function resolveUserId(user: UserMapperInput): string {
  if (!user.id) {
    throw new Error('USER_MAPPER_MISSING_USER_ID');
  }

  return user.id;
}

function resolveUsername(user: UserMapperInput): string {
  if (!user.username) {
    throw new Error('USER_MAPPER_MISSING_USERNAME');
  }

  return user.username;
}

function normalizeUserStatus(status: UserMapperStatus): UserServiceStatus {
  switch (status) {
    case 'active':
      return 'active';

    case 'pending':
    case 'pending_verification':
      return 'pending';

    case 'disabled':
    case 'suspended':
    case 'locked':
      return 'disabled';

    case 'deleted':
      return 'deleted';

    default:
      return 'pending';
  }
}

function toIsoString(value: DateLike): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return new Date().toISOString();
}
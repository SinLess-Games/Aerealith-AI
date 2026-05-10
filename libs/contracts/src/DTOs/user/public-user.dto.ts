import type { UserId, Username, UserStatus } from '../../types/user';

export interface PublicUserDto {
  id: UserId;
  username: Username;
  displayName: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}
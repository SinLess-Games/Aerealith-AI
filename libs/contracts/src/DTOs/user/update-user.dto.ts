import type { UserStatus } from '../../types/user';

export interface UpdateUserDto {
  displayName?: string;
  status?: UserStatus;
}
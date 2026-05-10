import type { Username } from '../../types/user';

export interface CreateUserDto {
  username: Username;
  email: string;
  displayName?: string;
}
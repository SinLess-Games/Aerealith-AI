export interface UserHealthDto {
  ok: true;
  service: string;
  status: 'healthy';
  version: string;
  timestamp: string;
}
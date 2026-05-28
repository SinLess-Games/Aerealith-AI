import type { UserServiceHealthDto } from '@aerealith-ai/contracts';

export interface HealthServiceOptions {
  serviceName?: string;
  serviceVersion?: string;
}

export class HealthService {
  private readonly serviceName: string;
  private readonly serviceVersion: string;

  constructor(options: HealthServiceOptions = {}) {
    this.serviceName = options.serviceName ?? 'aerealith-user-service';
    this.serviceVersion = options.serviceVersion ?? '0.1.0';
  }

  check(): UserServiceHealthDto {
    return {
      ok: true,
      service: this.serviceName,
      status: 'healthy',
      version: this.serviceVersion,
      timestamp: new Date().toISOString(),
    };
  }
}
import app from './app';
import { getOrm } from '@aerealith-ai/db';
import type { UserServiceContextEnv } from './users/types';

export interface UserServiceWorker {
  fetch(
    request: Request,
    env: UserServiceContextEnv,
    executionContext: ExecutionContext,
  ): Response | Promise<Response>;
}

const startupOrmPromise = getOrm();

startupOrmPromise.catch(() => {
  // Keep health checks available when local database credentials are absent.
});

const worker: UserServiceWorker = {
  fetch(
    request: Request,
    env: UserServiceContextEnv,
    executionContext: ExecutionContext,
  ): Response | Promise<Response> {
    return app.fetch(request, env, executionContext);
  },
};

export default worker;

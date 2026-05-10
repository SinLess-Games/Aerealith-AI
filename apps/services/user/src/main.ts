import app from './app';
import type { UserServiceContextEnv } from './users/types';

export interface UserServiceWorker {
  fetch(
    request: Request,
    env: UserServiceContextEnv,
    executionContext: ExecutionContext,
  ): Response | Promise<Response>;
}

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
import { Hono } from 'hono';

import { healthController } from './health.controller';

export const healthRouter = new Hono();

healthRouter.get('/', healthController);

export default healthRouter;
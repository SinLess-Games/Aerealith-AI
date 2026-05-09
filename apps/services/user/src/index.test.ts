/* eslint-disable @typescript-eslint/no-empty-function */
import app from '.';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

describe('Test the application', () => {
  beforeAll(() => {});
  afterAll(() => {});
  it('Should return 200 response', async () => {
    const res = await app.request('http://localhost/');
    expect(res.status).toBe(200);
  });
});

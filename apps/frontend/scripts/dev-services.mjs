import { spawn } from 'node:child_process';

const workspaceRoot = new URL('../../../', import.meta.url);
const startupTimeoutMs = 30_000;
const serviceDiscoveryDelayMs = 1_500;

const children = new Set();
let shuttingDown = false;

function start(name, args) {
  const child = spawn('pnpm', args, {
    cwd: workspaceRoot,
    env: process.env,
    stdio: 'inherit',
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (!shuttingDown) {
      console.error(
        `[dev-services] ${name} exited unexpectedly (${signal ?? code ?? 'unknown'}).`,
      );
      shutdown(code ?? 1);
    }
  });

  return child;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForHttpOk(url, name) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' });

      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the service is listening.
    }

    await sleep(500);
  }

  throw new Error(`${name} did not become ready at ${url}.`);
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    child.kill('SIGINT');
  }

  setTimeout(() => {
    for (const child of children) {
      child.kill('SIGTERM');
    }

    process.exit(code);
  }, 1_000).unref();

  if (children.size === 0) {
    process.exit(code);
  }
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

try {
  start('auth', [
    'exec',
    'wrangler',
    'dev',
    '--config',
    'apps/services/auth/wrangler.toml',
  ]);

  await waitForHttpOk('http://127.0.0.1:8787/health', 'auth');
  await sleep(serviceDiscoveryDelayMs);

  start('user-service', [
    'exec',
    'wrangler',
    'dev',
    '--config',
    'apps/services/user/wrangler.toml',
  ]);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : '[dev-services] Startup failed.',
  );
  shutdown(1);
}

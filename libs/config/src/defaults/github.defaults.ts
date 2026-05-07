import type { GithubConfig } from '../types/github';

export const defaultGithubConfig = {
  enabled: false,

  /**
   * OAuth is useful for user sign-in.
   * GitHub App auth is better for repository automation.
   */
  authMode: 'none',

  /**
   * Backward-compatible OAuth fields.
   */
  clientId: undefined,
  redirectUri: undefined,

  repoUrl: 'https://github.com/SinLess-Games/Helix',

  repository: {
    owner: 'SinLess-Games',
    name: 'Helix',
    fullName: 'SinLess-Games/Helix',
    url: 'https://github.com/SinLess-Games/Helix',
    defaultBranch: 'main',
    visibility: 'private',
  },

  oauth: {
    clientId: undefined,
    clientSecretRef: undefined,
    redirectUri: undefined,
    scopes: [],
  },

  app: {
    appId: undefined,
    clientId: undefined,
    clientSecretRef: undefined,
    installationId: undefined,
    privateKeyRef: undefined,
    webhookSecretRef: undefined,
    permissions: {},
  },

  api: {
    baseUrl: 'https://api.github.com',
    webUrl: 'https://github.com',
    tokenRef: undefined,
    timeoutMs: 10_000,
    retriesEnabled: true,
  },
} satisfies GithubConfig;

export const defaultGithubOAuthConfig = {
  enabled: true,

  authMode: 'oauth-app',

  clientId: undefined,
  redirectUri: 'https://helixaibot.com/api/auth/callback/github',

  repoUrl: 'https://github.com/SinLess-Games/Helix',

  repository: {
    owner: 'SinLess-Games',
    name: 'Helix',
    fullName: 'SinLess-Games/Helix',
    url: 'https://github.com/SinLess-Games/Helix',
    defaultBranch: 'main',
    visibility: 'private',
  },

  oauth: {
    clientId: undefined,
    clientSecretRef: 'GITHUB_CLIENT_SECRET',
    redirectUri: 'https://helixaibot.com/api/auth/callback/github',
    scopes: ['read:user', 'user:email'],
  },

  app: undefined,

  api: {
    baseUrl: 'https://api.github.com',
    webUrl: 'https://github.com',
    tokenRef: undefined,
    timeoutMs: 10_000,
    retriesEnabled: true,
  },
} satisfies GithubConfig;

export const defaultGithubAppConfig = {
  enabled: true,

  authMode: 'github-app',

  /**
   * Keep OAuth fields unset for GitHub App automation.
   */
  clientId: undefined,
  redirectUri: undefined,

  repoUrl: 'https://github.com/SinLess-Games/Helix',

  repository: {
    owner: 'SinLess-Games',
    name: 'Helix',
    fullName: 'SinLess-Games/Helix',
    url: 'https://github.com/SinLess-Games/Helix',
    defaultBranch: 'main',
    visibility: 'private',
  },

  oauth: undefined,

  app: {
    appId: undefined,
    clientId: undefined,
    clientSecretRef: undefined,
    installationId: undefined,
    privateKeyRef: 'GITHUB_APP_PRIVATE_KEY',
    webhookSecretRef: 'GITHUB_WEBHOOK_SECRET',

    /**
     * Keep permissions narrow by default.
     *
     * Expand only when a workflow actually needs it.
     */
    permissions: {
      actions: 'read',
      checks: 'write',
      contents: 'write',
      deployments: 'write',
      issues: 'write',
      metadata: 'read',
      pull_requests: 'write',
      statuses: 'write',
    },
  },

  api: {
    baseUrl: 'https://api.github.com',
    webUrl: 'https://github.com',
    tokenRef: undefined,
    timeoutMs: 10_000,
    retriesEnabled: true,
  },
} satisfies GithubConfig;

export const defaultGithubActionsTokenConfig = {
  enabled: true,

  authMode: 'personal-access-token',

  clientId: undefined,
  redirectUri: undefined,

  repoUrl: 'https://github.com/SinLess-Games/Helix',

  repository: {
    owner: 'SinLess-Games',
    name: 'Helix',
    fullName: 'SinLess-Games/Helix',
    url: 'https://github.com/SinLess-Games/Helix',
    defaultBranch: 'main',
    visibility: 'private',
  },

  oauth: undefined,

  app: undefined,

  api: {
    baseUrl: 'https://api.github.com',
    webUrl: 'https://github.com',
    tokenRef: 'GITHUB_TOKEN',
    timeoutMs: 10_000,
    retriesEnabled: true,
  },
} satisfies GithubConfig;

export const defaultLocalGithubConfig = {
  enabled: false,

  authMode: 'none',

  clientId: undefined,
  redirectUri: 'http://localhost:3000/api/auth/callback/github',

  repoUrl: 'https://github.com/SinLess-Games/Helix',

  repository: {
    owner: 'SinLess-Games',
    name: 'Helix',
    fullName: 'SinLess-Games/Helix',
    url: 'https://github.com/SinLess-Games/Helix',
    defaultBranch: 'main',
    visibility: 'private',
  },

  oauth: {
    clientId: undefined,
    clientSecretRef: 'GITHUB_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/api/auth/callback/github',
    scopes: ['read:user', 'user:email'],
  },

  app: {
    appId: undefined,
    clientId: undefined,
    clientSecretRef: undefined,
    installationId: undefined,
    privateKeyRef: 'GITHUB_APP_PRIVATE_KEY',
    webhookSecretRef: 'GITHUB_WEBHOOK_SECRET',
    permissions: {},
  },

  api: {
    baseUrl: 'https://api.github.com',
    webUrl: 'https://github.com',
    tokenRef: undefined,
    timeoutMs: 10_000,
    retriesEnabled: true,
  },
} satisfies GithubConfig;

export default defaultGithubConfig;
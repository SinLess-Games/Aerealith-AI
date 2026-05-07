import type { AuthConfig } from '../types/auth';

const thirtyDaysInSeconds = 60 * 60 * 24 * 30;
const oneDayInSeconds = 60 * 60 * 24;
const fifteenMinutesInSeconds = 60 * 15;

export const defaultAuthConfig = {
  enabled: false,

  runtime: 'nextjs',

  providers: [],

  nextAuth: {
    enabled: false,
    secret: undefined,
    secretRef: 'AUTH_SECRET',
    url: undefined,
    trustHost: true,
    sessionStrategy: 'jwt',
    sessionMaxAgeSeconds: thirtyDaysInSeconds,
    sessionUpdateAgeSeconds: oneDayInSeconds,
  },

  google: {
    enabled: false,
    clientId: undefined,
    clientIdRef: 'GOOGLE_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'GOOGLE_CLIENT_SECRET',
    redirectUri: undefined,
    scopes: ['openid', 'email', 'profile'],
    issuer: 'https://accounts.google.com',
  },

  github: {
    enabled: false,
    clientId: undefined,
    clientIdRef: 'GITHUB_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'GITHUB_CLIENT_SECRET',
    redirectUri: undefined,
    scopes: ['read:user', 'user:email'],
    issuer: undefined,
  },

  discord: {
    enabled: false,
    clientId: undefined,
    clientIdRef: 'DISCORD_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'DISCORD_CLIENT_SECRET',
    redirectUri: undefined,
    scopes: ['identify', 'email'],
    issuer: undefined,
  },

  credentials: {
    enabled: false,
    emailPasswordEnabled: false,
    usernamePasswordEnabled: false,
    registrationEnabled: false,
  },

  passkeys: {
    enabled: false,
    rpId: undefined,
    rpName: 'Helix AI',
    origins: [],
  },

  magicLink: {
    enabled: false,
    tokenTtlSeconds: fifteenMinutesInSeconds,
    tokenSecretRef: 'AUTH_MAGIC_LINK_SECRET',
  },

  apiKeys: {
    enabled: false,
    headerName: 'x-api-key',
    keyPrefix: 'hx_',
    defaultExpirationDays: 90,
  },

  cookies: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    domain: undefined,
    path: '/',
  },

  requiredSecretRefs: [],

  metadata: {
    owner: 'SinLess Games LLC',
    app: 'helix-ai',
  },
} satisfies AuthConfig;

export const defaultProductionAuthConfig = {
  enabled: true,

  runtime: 'cloudflare-worker',

  providers: ['google', 'github', 'discord'],

  nextAuth: {
    enabled: true,
    secret: undefined,
    secretRef: 'AUTH_SECRET',
    url: 'https://helixaibot.com',
    trustHost: true,
    sessionStrategy: 'jwt',
    sessionMaxAgeSeconds: thirtyDaysInSeconds,
    sessionUpdateAgeSeconds: oneDayInSeconds,
  },

  google: {
    enabled: true,
    clientId: undefined,
    clientIdRef: 'GOOGLE_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'GOOGLE_CLIENT_SECRET',
    redirectUri: 'https://helixaibot.com/api/auth/callback/google',
    scopes: ['openid', 'email', 'profile'],
    issuer: 'https://accounts.google.com',
  },

  github: {
    enabled: true,
    clientId: undefined,
    clientIdRef: 'GITHUB_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'GITHUB_CLIENT_SECRET',
    redirectUri: 'https://helixaibot.com/api/auth/callback/github',
    scopes: ['read:user', 'user:email'],
    issuer: undefined,
  },

  discord: {
    enabled: true,
    clientId: undefined,
    clientIdRef: 'DISCORD_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'DISCORD_CLIENT_SECRET',
    redirectUri: 'https://helixaibot.com/api/auth/callback/discord',
    scopes: ['identify', 'email'],
    issuer: undefined,
  },

  credentials: {
    enabled: false,
    emailPasswordEnabled: false,
    usernamePasswordEnabled: false,
    registrationEnabled: false,
  },

  passkeys: {
    enabled: false,
    rpId: 'helixaibot.com',
    rpName: 'Helix AI',
    origins: ['https://helixaibot.com'],
  },

  magicLink: {
    enabled: false,
    tokenTtlSeconds: fifteenMinutesInSeconds,
    tokenSecretRef: 'AUTH_MAGIC_LINK_SECRET',
  },

  apiKeys: {
    enabled: true,
    headerName: 'x-api-key',
    keyPrefix: 'hx_',
    defaultExpirationDays: 90,
  },

  cookies: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    domain: 'helixaibot.com',
    path: '/',
  },

  requiredSecretRefs: [
    'AUTH_SECRET',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_SECRET',
    'DISCORD_CLIENT_SECRET',
  ],

  metadata: {
    owner: 'SinLess Games LLC',
    app: 'helix-ai',
    domain: 'helixaibot.com',
    runtime: 'cloudflare-worker',
  },
} satisfies AuthConfig;

export const defaultLocalAuthConfig = {
  enabled: true,

  runtime: 'nextjs',

  providers: ['google', 'github', 'discord'],

  nextAuth: {
    enabled: true,
    secret: undefined,
    secretRef: 'AUTH_SECRET',
    url: 'http://localhost:3000',
    trustHost: true,
    sessionStrategy: 'jwt',
    sessionMaxAgeSeconds: thirtyDaysInSeconds,
    sessionUpdateAgeSeconds: oneDayInSeconds,
  },

  google: {
    enabled: true,
    clientId: undefined,
    clientIdRef: 'GOOGLE_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'GOOGLE_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/api/auth/callback/google',
    scopes: ['openid', 'email', 'profile'],
    issuer: 'https://accounts.google.com',
  },

  github: {
    enabled: true,
    clientId: undefined,
    clientIdRef: 'GITHUB_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'GITHUB_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/api/auth/callback/github',
    scopes: ['read:user', 'user:email'],
    issuer: undefined,
  },

  discord: {
    enabled: true,
    clientId: undefined,
    clientIdRef: 'DISCORD_CLIENT_ID',
    clientSecret: undefined,
    clientSecretRef: 'DISCORD_CLIENT_SECRET',
    redirectUri: 'http://localhost:3000/api/auth/callback/discord',
    scopes: ['identify', 'email'],
    issuer: undefined,
  },

  credentials: {
    enabled: false,
    emailPasswordEnabled: false,
    usernamePasswordEnabled: false,
    registrationEnabled: false,
  },

  passkeys: {
    enabled: false,
    rpId: 'localhost',
    rpName: 'Helix AI Local',
    origins: ['http://localhost:3000'],
  },

  magicLink: {
    enabled: false,
    tokenTtlSeconds: fifteenMinutesInSeconds,
    tokenSecretRef: 'AUTH_MAGIC_LINK_SECRET',
  },

  apiKeys: {
    enabled: true,
    headerName: 'x-api-key',
    keyPrefix: 'hx_local_',
    defaultExpirationDays: 30,
  },

  cookies: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    domain: undefined,
    path: '/',
  },

  requiredSecretRefs: ['AUTH_SECRET'],

  metadata: {
    owner: 'SinLess Games LLC',
    app: 'helix-ai',
    runtime: 'local',
  },
} satisfies AuthConfig;

export const defaultCloudflareAuthConfig = defaultProductionAuthConfig;

export default defaultAuthConfig;
// OAuth provider configuration for Helix AI's custom account-linking flow.

import type { OAuthProviderConfig, OAuthProviderKey } from '../../types';

export const oauthProviderKeys = [
  'google',
  'discord',
  'github',
  'facebook',
  'twitch',
  'steam',
  'epic-games',
] as const satisfies readonly OAuthProviderKey[];

export const oauthProviders: Record<OAuthProviderKey, OAuthProviderConfig> = {
  google: {
    name: 'Google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scopes: ['openid', 'email', 'profile'],
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    redirectPath: '/api/oauth/google/callback',
  },

  discord: {
    name: 'Discord',
    authorizationEndpoint: 'https://discord.com/oauth2/authorize',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    userInfoEndpoint: 'https://discord.com/api/users/@me',
    scopes: ['identify', 'email'],
    clientIdEnv: 'DISCORD_OAUTH_CLIENT_ID',
    clientSecretEnv: 'DISCORD_OAUTH_CLIENT_SECRET',
    redirectPath: '/api/oauth/discord/callback',
  },

  github: {
    name: 'GitHub',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userInfoEndpoint: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    redirectPath: '/api/oauth/github/callback',
  },

  facebook: {
    name: 'Facebook',
    authorizationEndpoint: 'https://www.facebook.com/v25.0/dialog/oauth',
    tokenEndpoint: 'https://graph.facebook.com/v25.0/oauth/access_token',
    userInfoEndpoint: 'https://graph.facebook.com/v25.0/me?fields=id,name,email,picture',
    scopes: ['email', 'public_profile'],
    clientIdEnv: 'FACEBOOK_OAUTH_CLIENT_ID',
    clientSecretEnv: 'FACEBOOK_OAUTH_CLIENT_SECRET',
    redirectPath: '/api/oauth/facebook/callback',
  },

  twitch: {
    name: 'Twitch',
    authorizationEndpoint: 'https://id.twitch.tv/oauth2/authorize',
    tokenEndpoint: 'https://id.twitch.tv/oauth2/token',
    userInfoEndpoint: 'https://id.twitch.tv/oauth2/userinfo',
    scopes: ['openid', 'user:read:email'],
    clientIdEnv: 'TWITCH_OAUTH_CLIENT_ID',
    clientSecretEnv: 'TWITCH_OAUTH_CLIENT_SECRET',
    redirectPath: '/api/oauth/twitch/callback',
  },

  /**
   * Steam uses OpenID-style sign-in, not a normal OAuth2 authorization-code flow.
   *
   * Keep this entry only if your account-linking code has a Steam-specific handler.
   * `clientIdEnv` is used as the OpenID realm/env marker, while `clientSecretEnv`
   * points to the Steam Web API key needed for profile lookup.
   */
  steam: {
    name: 'Steam',
    authorizationEndpoint: 'https://steamcommunity.com/openid/login',
    tokenEndpoint: 'https://steamcommunity.com/openid/login',
    userInfoEndpoint: 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
    scopes: [],
    clientIdEnv: 'STEAM_OPENID_REALM',
    clientSecretEnv: 'STEAM_WEB_API_KEY',
    redirectPath: '/api/oauth/steam/callback',
  },

  'epic-games': {
    name: 'Epic Games',
    authorizationEndpoint: 'https://www.epicgames.com/id/authorize',
    tokenEndpoint: 'https://api.epicgames.dev/epic/oauth/v1/token',
    userInfoEndpoint: 'https://api.epicgames.dev/epic/oauth/v1/userInfo',
    scopes: ['basic_profile'],
    clientIdEnv: 'EPIC_GAMES_OAUTH_CLIENT_ID',
    clientSecretEnv: 'EPIC_GAMES_OAUTH_CLIENT_SECRET',
    redirectPath: '/api/oauth/epic-games/callback',
  },
};

export function getOAuthProviderConfig(provider: OAuthProviderKey): OAuthProviderConfig {
  return oauthProviders[provider];
}

export function isOAuthProviderKey(value: string): value is OAuthProviderKey {
  return oauthProviderKeys.includes(value as OAuthProviderKey);
}
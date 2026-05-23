export type OAuthProviderKey =
  | 'google'
  | 'discord'
  | 'github'
  | 'facebook'
  | 'twitch'
  | 'steam'
  | 'epic-games';

export interface OAuthProviderConfig {
  name: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectPath: string;
}
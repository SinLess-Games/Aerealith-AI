export type GitHubAuthMode =
  | 'oauth-app'
  | 'github-app'
  | 'personal-access-token'
  | 'none'
  | string;

export type GitHubRepositoryVisibility =
  | 'public'
  | 'private'
  | 'internal'
  | string;

export type GitHubPermissionLevel =
  | 'none'
  | 'read'
  | 'write'
  | 'admin'
  | string;

export interface GitHubRepositoryConfig {
  /**
   * Repository owner or organization.
   *
   * Example:
   * SinLess-Games
   */
  owner: string;

  /**
   * Repository name.
   *
   * Example:
   * Helix
   */
  name: string;

  /**
   * Full repository name.
   *
   * Example:
   * SinLess-Games/Helix
   */
  fullName: string;

  /**
   * HTTPS repository URL.
   *
   * Backward-compatible replacement for repoUrl.
   */
  url: string;

  /**
   * Repository default branch.
   */
  defaultBranch?: string;

  /**
   * Repository visibility.
   */
  visibility?: GitHubRepositoryVisibility;
}

export interface GitHubOAuthAppConfig {
  /**
   * GitHub OAuth App client ID.
   *
   * Backward-compatible field from the old config.
   */
  clientId?: string;

  /**
   * Secret reference name for the OAuth App client secret.
   *
   * Do not store the actual secret value here.
   */
  clientSecretRef?: string;

  /**
   * OAuth callback URL.
   *
   * Backward-compatible field from the old config.
   */
  redirectUri?: string;

  /**
   * OAuth scopes requested by the app.
   */
  scopes?: string[];
}

export interface GitHubAppConfig {
  /**
   * GitHub App ID.
   *
   * This is different from the OAuth client ID.
   */
  appId?: string;

  /**
   * GitHub App client ID.
   */
  clientId?: string;

  /**
   * Secret reference name for the GitHub App client secret.
   *
   * Do not store the actual secret value here.
   */
  clientSecretRef?: string;

  /**
   * GitHub App installation ID.
   */
  installationId?: string;

  /**
   * Secret reference name for the GitHub App private key.
   *
   * Do not store the actual private key here.
   */
  privateKeyRef?: string;

  /**
   * Secret reference name for the GitHub webhook secret.
   *
   * Do not store the actual webhook secret here.
   */
  webhookSecretRef?: string;

  /**
   * GitHub App permissions expected by Helix.
   */
  permissions?: Record<string, GitHubPermissionLevel>;
}

export interface GitHubApiConfig {
  /**
   * GitHub REST API base URL.
   */
  baseUrl?: string;

  /**
   * GitHub web base URL.
   */
  webUrl?: string;

  /**
   * Secret reference name for a GitHub token.
   *
   * Useful for GitHub Actions, local automation, or PAT-based development.
   * Do not store the actual token value here.
   */
  tokenRef?: string;

  /**
   * Request timeout in milliseconds.
   */
  timeoutMs?: number;

  /**
   * Whether API retries are enabled.
   */
  retriesEnabled?: boolean;
}

export type GithubConfig = {
  /**
   * Whether GitHub integration is enabled.
   */
  enabled: boolean;

  /**
   * Preferred authentication mode.
   */
  authMode: GitHubAuthMode;

  /**
   * Backward-compatible OAuth client ID.
   *
   * Prefer oauth.clientId or app.clientId in new code.
   */
  clientId?: string;

  /**
   * Backward-compatible OAuth redirect URI.
   *
   * Prefer oauth.redirectUri in new code.
   */
  redirectUri?: string;

  /**
   * Backward-compatible primary repository URL.
   *
   * Prefer repository.url in new code.
   */
  repoUrl: string;

  /**
   * Primary repository used by Helix automation.
   */
  repository: GitHubRepositoryConfig;

  /**
   * OAuth App configuration for user sign-in/authorization flows.
   */
  oauth?: GitHubOAuthAppConfig;

  /**
   * GitHub App configuration for repository automation.
   */
  app?: GitHubAppConfig;

  /**
   * GitHub API client defaults.
   */
  api?: GitHubApiConfig;
};
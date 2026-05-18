// libs/db/src/types/user-settings/security.type.ts

export type SecurityPreferenceMode = 'system' | 'enabled' | 'disabled';

export type SecurityAssuranceLevel =
  | 'aal1'
  | 'aal2'
  | 'aal3'
  | 'custom';

export type SecurityAuthenticationMethod =
  | 'password'
  | 'magic_link'
  | 'passkey'
  | 'webauthn'
  | 'totp'
  | 'hotp'
  | 'sms_otp'
  | 'email_otp'
  | 'push_approval'
  | 'backup_code'
  | 'security_key'
  | 'hardware_token'
  | 'biometric'
  | 'oauth'
  | 'saml'
  | 'oidc'
  | 'api_key'
  | 'service_account'
  | 'custom';

export type SecurityMfaPolicy =
  | 'disabled'
  | 'optional'
  | 'recommended'
  | 'required'
  | 'required_for_sensitive_actions'
  | 'required_for_new_devices'
  | 'required_for_admin_actions'
  | 'custom';

export type SecurityPasskeyPolicy =
  | 'disabled'
  | 'optional'
  | 'preferred'
  | 'required'
  | 'required_for_passwordless'
  | 'custom';

export type SecurityPasswordPolicy =
  | 'disabled'
  | 'standard'
  | 'strong'
  | 'enterprise'
  | 'passwordless_preferred'
  | 'passwordless_only'
  | 'custom';

export type SecuritySessionPolicy =
  | 'default'
  | 'relaxed'
  | 'standard'
  | 'strict'
  | 'high_security'
  | 'custom';

export type SecurityReauthenticationPolicy =
  | 'never'
  | 'sensitive_actions'
  | 'new_device'
  | 'new_location'
  | 'risk_based'
  | 'periodic'
  | 'always'
  | 'custom';

export type SecurityDeviceTrustLevel =
  | 'unknown'
  | 'untrusted'
  | 'trusted'
  | 'managed'
  | 'blocked';

export type SecurityDeviceType =
  | 'desktop'
  | 'laptop'
  | 'mobile'
  | 'tablet'
  | 'server'
  | 'browser'
  | 'cli'
  | 'api_client'
  | 'iot'
  | 'unknown';

export type SecurityLoginAlertLevel =
  | 'disabled'
  | 'suspicious_only'
  | 'new_device'
  | 'new_location'
  | 'all_logins'
  | 'custom';

export type SecurityRiskLevel =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type SecurityRiskAction =
  | 'allow'
  | 'challenge'
  | 'require_mfa'
  | 'require_reauthentication'
  | 'lock_account'
  | 'block'
  | 'notify'
  | 'custom';

export type SecurityRecoveryMethod =
  | 'backup_codes'
  | 'recovery_email'
  | 'recovery_phone'
  | 'trusted_contact'
  | 'admin_reset'
  | 'support_review'
  | 'identity_verification'
  | 'recovery_key'
  | 'custom';

export type SecurityApiKeyPolicy =
  | 'disabled'
  | 'read_only'
  | 'scoped'
  | 'full_access'
  | 'admin_only'
  | 'custom';

export type SecuritySecretHandlingPolicy =
  | 'standard'
  | 'redact'
  | 'redact_and_warn'
  | 'block'
  | 'custom';

export type SecurityAuditLogLevel =
  | 'disabled'
  | 'security_only'
  | 'important'
  | 'standard'
  | 'verbose'
  | 'custom';

export type SecurityEncryptionPreference =
  | 'default'
  | 'standard'
  | 'enhanced'
  | 'customer_managed_keys'
  | 'client_side'
  | 'custom';

export type SecurityTrustedDevice = {
  id?: string;
  name?: string;
  type?: SecurityDeviceType;
  trustLevel?: SecurityDeviceTrustLevel;
  fingerprintHash?: string;
  userAgent?: string;
  ipAddress?: string;
  locationLabel?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  trustedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
};

export type SecurityAuthenticationMethodSettings = {
  method: SecurityAuthenticationMethod;
  enabled?: boolean;
  preferred?: boolean;
  required?: boolean;
  addedAt?: string;
  lastUsedAt?: string;
  expiresAt?: string;
};

export type SecurityMfaSettings = {
  policy?: SecurityMfaPolicy;
  preferredMethods?: SecurityAuthenticationMethod[];
  enabledMethods?: SecurityAuthenticationMethodSettings[];
  requireBackupCodes?: boolean;
  backupCodesGeneratedAt?: string;
  backupCodesRemaining?: number;
  rememberMfaDevices?: boolean;
  rememberMfaDeviceDays?: number;
};

export type SecurityPasskeySettings = {
  policy?: SecurityPasskeyPolicy;
  allowPlatformAuthenticators?: boolean;
  allowRoamingAuthenticators?: boolean;
  requireUserVerification?: boolean;
  requireResidentKey?: boolean;
  allowSyncedPasskeys?: boolean;
  allowSecurityKeys?: boolean;
  passkeyCount?: number;
  lastPasskeyUsedAt?: string;
};

export type SecurityPasswordSettings = {
  policy?: SecurityPasswordPolicy;
  requirePasswordChange?: boolean;
  passwordChangedAt?: string;
  passwordExpiresAt?: string;
  minLength?: number;
  requireUniquePasswordHistory?: boolean;
  passwordHistoryCount?: number;
  blockCommonPasswords?: boolean;
  blockCompromisedPasswords?: boolean;
};

export type SecuritySessionSettings = {
  policy?: SecuritySessionPolicy;
  idleTimeoutMinutes?: number;
  absoluteTimeoutMinutes?: number;
  rememberMeDays?: number;
  maxConcurrentSessions?: number;
  revokeOtherSessionsOnPasswordChange?: boolean;
  revokeOtherSessionsOnMfaChange?: boolean;
  revokeOtherSessionsOnPasskeyChange?: boolean;
  requireSecureCookies?: boolean;
  requireSameSiteCookies?: boolean;
};

export type SecurityReauthenticationSettings = {
  policy?: SecurityReauthenticationPolicy;
  intervalMinutes?: number;
  requireForBilling?: boolean;
  requireForSecurityChanges?: boolean;
  requireForPrivacyChanges?: boolean;
  requireForDataExport?: boolean;
  requireForAccountDeletion?: boolean;
  requireForSensitiveFields?: boolean;
  requireForExternalActions?: boolean;
  requireForDestructiveActions?: boolean;
};

export type SecurityDeviceSettings = {
  trustNewDevicesByDefault?: boolean;
  allowTrustedDevices?: boolean;
  trustedDeviceExpirationDays?: number;
  notifyOnNewDevice?: boolean;
  notifyOnDeviceTrustChange?: boolean;
  autoRevokeInactiveDevices?: boolean;
  inactiveDeviceDays?: number;
  devices?: SecurityTrustedDevice[];
};

export type SecurityLoginAlertSettings = {
  level?: SecurityLoginAlertLevel;
  notifyOnSuccessfulLogin?: boolean;
  notifyOnFailedLogin?: boolean;
  notifyOnNewDevice?: boolean;
  notifyOnNewLocation?: boolean;
  notifyOnSuspiciousActivity?: boolean;
  notifyOnAccountLock?: boolean;
  notifyChannels?: Array<'in_app' | 'email' | 'sms' | 'push' | 'webhook'>;
};

export type SecurityRecoverySettings = {
  allowedMethods?: SecurityRecoveryMethod[];
  preferredMethod?: SecurityRecoveryMethod;
  requireRecoveryEmail?: boolean;
  requireRecoveryPhone?: boolean;
  requireBackupCodes?: boolean;
  allowAdminRecovery?: boolean;
  allowSupportRecovery?: boolean;
  requireIdentityVerificationForRecovery?: boolean;
  recoveryCooldownMinutes?: number;
};

export type SecurityRiskRule = {
  riskLevel: SecurityRiskLevel;
  action: SecurityRiskAction;
  requireNotification?: boolean;
  requireAuditLog?: boolean;
};

export type SecurityRiskSettings = {
  enabled?: boolean;
  defaultAction?: SecurityRiskAction;
  rules?: Partial<Record<SecurityRiskLevel, SecurityRiskRule>>;
  blockKnownBadIps?: boolean;
  challengeVpnOrProxy?: boolean;
  challengeTor?: boolean;
  challengeImpossibleTravel?: boolean;
  challengeNewCountry?: boolean;
  challengeNewDevice?: boolean;
};

export type SecurityApiKeySettings = {
  policy?: SecurityApiKeyPolicy;
  allowUserApiKeys?: boolean;
  allowServiceAccountKeys?: boolean;
  requireExpiration?: boolean;
  defaultExpirationDays?: number;
  maxExpirationDays?: number;
  allowLongLivedKeys?: boolean;
  requireScopedKeys?: boolean;
  requireKeyRotation?: boolean;
  rotationIntervalDays?: number;
};

export type SecuritySecretSettings = {
  handlingPolicy?: SecuritySecretHandlingPolicy;
  redactSecretsInUi?: boolean;
  redactSecretsInLogs?: boolean;
  redactSecretsInAiContext?: boolean;
  blockSecretSharing?: boolean;
  allowSecretReferences?: boolean;
  requireVaultBackedSecrets?: boolean;
};

export type SecurityAuditSettings = {
  level?: SecurityAuditLogLevel;
  logLogins?: boolean;
  logFailedLogins?: boolean;
  logSessionChanges?: boolean;
  logSecuritySettingChanges?: boolean;
  logPrivacySettingChanges?: boolean;
  logApiKeyUsage?: boolean;
  logIntegrationAccess?: boolean;
  logDataExports?: boolean;
  logAccountDeletionRequests?: boolean;
  retainAuditLogsDays?: number;
};

export type SecurityEncryptionSettings = {
  preference?: SecurityEncryptionPreference;
  requireEncryptionAtRest?: boolean;
  requireEncryptionInTransit?: boolean;
  allowCustomerManagedKeys?: boolean;
  customerKeyId?: string;
  rotateKeysAutomatically?: boolean;
  keyRotationDays?: number;
};

export type SecurityUserSettings = {
  mode?: SecurityPreferenceMode;
  assuranceLevel?: SecurityAssuranceLevel;
  authenticationMethods?: SecurityAuthenticationMethodSettings[];
  mfa?: SecurityMfaSettings;
  passkeys?: SecurityPasskeySettings;
  password?: SecurityPasswordSettings;
  sessions?: SecuritySessionSettings;
  reauthentication?: SecurityReauthenticationSettings;
  devices?: SecurityDeviceSettings;
  loginAlerts?: SecurityLoginAlertSettings;
  recovery?: SecurityRecoverySettings;
  risk?: SecurityRiskSettings;
  apiKeys?: SecurityApiKeySettings;
  secrets?: SecuritySecretSettings;
  audit?: SecurityAuditSettings;
  encryption?: SecurityEncryptionSettings;
};

export type SecurityUserSettingsPatch = {
  mode?: SecurityPreferenceMode;
  assuranceLevel?: SecurityAssuranceLevel;
  authenticationMethods?: Array<Partial<SecurityAuthenticationMethodSettings>>;
  mfa?: Partial<SecurityMfaSettings>;
  passkeys?: Partial<SecurityPasskeySettings>;
  password?: Partial<SecurityPasswordSettings>;
  sessions?: Partial<SecuritySessionSettings>;
  reauthentication?: Partial<SecurityReauthenticationSettings>;
  devices?: Partial<SecurityDeviceSettings>;
  loginAlerts?: Partial<SecurityLoginAlertSettings>;
  recovery?: Partial<SecurityRecoverySettings>;
  risk?: Partial<SecurityRiskSettings>;
  apiKeys?: Partial<SecurityApiKeySettings>;
  secrets?: Partial<SecuritySecretSettings>;
  audit?: Partial<SecurityAuditSettings>;
  encryption?: Partial<SecurityEncryptionSettings>;
};
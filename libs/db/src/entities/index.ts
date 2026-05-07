// libs/db/src/entities/index.ts

/**
 * Central export hub for all MikroORM entities currently implemented in Helix.
 *
 * Keep this file limited to entity files that actually exist. Add domain exports
 * back here only after the matching entity files are created.
 *
 * Example:
 * import { User, UserProfile, UserSettings } from '@helix-ai/db/entities';
 */

// ---------------------------------------------------------------------
// User & Profile
// ---------------------------------------------------------------------
export * from './user/user.entity.js';
export * from './user/profile.entity.js';
export * from './user/settings.entity.js';
export * from './user/account.entity.js';
export * from './user/session.entity.js';
export * from './user/verification-token.entity.js';
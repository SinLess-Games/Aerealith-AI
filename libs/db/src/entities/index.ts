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
export * from './user/user.entity';
export * from './user/profile.entity';
export * from './user/settings.entity';
export * from './user/account.entity';
export * from './user/session.entity';
export * from './user/verification-token.entity';


// ---------------------------------------------------------------------
// System & Misc
// ---------------------------------------------------------------------
export * from './system/waitlist';
// libs/db/src/enums/profile-status.enum.ts

/**
 * ProfileStatus enum representing user profile lifecycle status values.
 */
export enum ProfileStatus {
  PendingSetup = 'pending_setup',
  Active = 'active',
  Inactive = 'inactive',
  Hidden = 'hidden',
  Disabled = 'disabled',
  Suspended = 'suspended',
  Locked = 'locked',
  Flagged = 'flagged',
  UnderReview = 'under_review',
  Archived = 'archived',
  Deleted = 'deleted',
}
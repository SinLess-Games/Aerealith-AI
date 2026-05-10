export const USER_API_VERSION = 'V1';

export const USER_ROUTES = {
  root: `/api/${USER_API_VERSION}/users`,
  health: `/api/${USER_API_VERSION}/users/health`,

  collection: `/api/${USER_API_VERSION}/users`,
  byUsername: `/api/${USER_API_VERSION}/users/:username`,
  profile: `/api/${USER_API_VERSION}/users/:username/profile`,
  settings: `/api/${USER_API_VERSION}/users/:username/settings`,
} as const;

export const buildUserRoutes = {
  root: () => USER_ROUTES.root,
  health: () => USER_ROUTES.health,

  collection: () => USER_ROUTES.collection,

  byUsername: (username: string) =>
    `/api/${USER_API_VERSION}/users/${encodeURIComponent(username)}`,

  profile: (username: string) =>
    `/api/${USER_API_VERSION}/users/${encodeURIComponent(username)}/profile`,

  settings: (username: string) =>
    `/api/${USER_API_VERSION}/users/${encodeURIComponent(username)}/settings`,
} as const;

export type UserRouteKey = keyof typeof USER_ROUTES;
export type UserRoute = (typeof USER_ROUTES)[UserRouteKey];
'use client';

import * as React from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';

export type UserProfileMenuUser = {
  id?: string;
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
  image?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  picture?: string | null;
  username?: string | null;
  handle?: string | null;
  login?: string | null;
  userName?: string | null;
  user_name?: string | null;
};

export type UserProfileMenuAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

export type UserProfileMenuProps = {
  user?: UserProfileMenuUser | null;
  logoutEndpoint?: string;
  dashboardHref?: string;
  profileHref?: string;
  settingsHref?: string;
  actions?: UserProfileMenuAction[];
  onNavigate?: (href: string) => void;
  onLogout?: () => void | Promise<void>;
  onLogoutSuccess?: (response: unknown) => void;
  onLogoutError?: (error: unknown) => void;
  sx?: SxProps<Theme>;
  buttonSx?: SxProps<Theme>;
  menuSx?: SxProps<Theme>;
};

type StatusState = {
  severity: 'error';
  message: string;
};

type UserStringKey =
  | 'username'
  | 'handle'
  | 'login'
  | 'userName'
  | 'user_name'
  | 'name'
  | 'displayName'
  | 'email'
  | 'avatarUrl'
  | 'avatar'
  | 'image'
  | 'picture';

const h = React.createElement;

const MuiAccountCircleIcon = AccountCircleIcon as React.ElementType;
const MuiAvatar = Avatar as React.ElementType;
const MuiBox = Box as React.ElementType;
const MuiCircularProgress = CircularProgress as React.ElementType;
const MuiDashboardIcon = DashboardIcon as React.ElementType;
const MuiDivider = Divider as React.ElementType;
const MuiListItemIcon = ListItemIcon as React.ElementType;
const MuiLogoutIcon = LogoutIcon as React.ElementType;
const MuiMenu = Menu as React.ElementType;
const MuiMenuItem = MenuItem as React.ElementType;
const MuiPersonIcon = PersonIcon as React.ElementType;
const MuiStack = Stack as React.ElementType;
const MuiTypography = Typography as React.ElementType;

const CURRENT_USERNAME_STORAGE_KEY = 'helix.currentUsername';
const USERNAME_COOKIE_NAME = 'helix_username';

const EMPTY_USER: UserProfileMenuUser = {};

const FALLBACK_ACCOUNT_LABELS = new Set([
  'account',
  'authenticated-user',
  'current-user',
  'user',
]);

const profileTriggerSx: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  minWidth: 0,
  px: 0,
  py: 0,
  color: '#ffffff',
  backgroundColor: 'transparent',
  border: 0,
  borderRadius: 999,
  cursor: 'pointer',
  userSelect: 'none',
  outline: 'none',
  textTransform: 'none',
  transition: 'transform 180ms ease, filter 180ms ease',

  '&:hover': {
    transform: 'translateY(-1px)',
    filter: 'brightness(1.12)',
  },

  '&:focus-visible': {
    outline: '2px solid rgba(246, 6, 111, 0.85)',
    outlineOffset: 4,
  },
};

const usernameChipSx: SxProps<Theme> = {
  display: { xs: 'none', sm: 'inline-flex' },
  alignItems: 'center',
  maxWidth: { sm: 130, md: 155, lg: 180 },
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: '#ffffff',
  fontSize: '0.86rem',
  fontWeight: 800,
  letterSpacing: '0.03em',
  lineHeight: 1,
  textShadow:
    '0 0 6px rgba(139, 233, 255, 0.58), 0 0 12px rgba(246, 6, 111, 0.28)',
};

const avatarSx: SxProps<Theme> = {
  width: 30,
  height: 30,
  color: '#ffffff',
  bgcolor: 'rgba(246, 6, 111, 0.88)',
  border: '1px solid rgba(139, 233, 255, 0.52)',
  boxShadow:
    '0 0 12px rgba(246, 6, 111, 0.36), 0 0 10px rgba(139, 233, 255, 0.2)',
  fontSize: '0.78rem',
  fontWeight: 900,
};

const menuPaperSx: SxProps<Theme> = {
  mt: 1.25,
  minWidth: 245,
  color: '#ffffff',
  bgcolor: 'rgba(9, 10, 26, 0.96)',
  backgroundImage:
    'linear-gradient(135deg, rgba(246, 6, 111, 0.12), rgba(2, 35, 113, 0.22))',
  border: '1px solid rgba(246, 6, 111, 0.34)',
  borderRadius: 2,
  boxShadow:
    '0 0 30px rgba(246, 6, 111, 0.22), 0 0 22px rgba(139, 233, 255, 0.1)',
  backdropFilter: 'blur(12px)',
  overflow: 'hidden',

  '& .MuiMenu-list': {
    py: 0.75,
  },
};

const menuItemSx: SxProps<Theme> = {
  mx: 0.75,
  my: 0.25,
  borderRadius: 1.5,
  color: 'rgba(235, 244, 255, 0.92)',
  fontWeight: 600,

  '&:hover': {
    color: '#ffffff',
    bgcolor: 'rgba(246, 6, 111, 0.18)',
  },

  '&.Mui-disabled': {
    color: 'rgba(235, 244, 255, 0.34)',
  },

  '& .MuiListItemIcon-root': {
    minWidth: 34,
    color: '#8be9ff',
  },
};

const logoutItemSx: SxProps<Theme> = {
  ...menuItemSx,

  '& .MuiListItemIcon-root': {
    minWidth: 34,
    color: '#f6066f',
  },

  '&:hover': {
    color: '#ffffff',
    bgcolor: 'rgba(246, 6, 111, 0.22)',
  },
};

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readBrowserCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookies = document.cookie
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = safeDecodeURIComponent(
      cookie.slice(0, separatorIndex).trim(),
    );

    if (cookieName !== name) {
      continue;
    }

    const cookieValue = safeDecodeURIComponent(cookie.slice(separatorIndex + 1));

    return cookieValue.trim() || null;
  }

  return null;
}

function readLocalStorageUsername(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = window.localStorage.getItem(CURRENT_USERNAME_STORAGE_KEY);

    return value?.trim() || null;
  } catch {
    return null;
  }
}

function readPersistedUsername(): string | null {
  return readBrowserCookie(USERNAME_COOKIE_NAME) ?? readLocalStorageUsername();
}

function clearPersistedUsername(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(CURRENT_USERNAME_STORAGE_KEY);
  } catch {
    // Ignore localStorage failures.
  }

  for (const cookie of document.cookie.split(';')) {
    const [rawName] = cookie.split('=');
    const name = rawName?.trim();

    if (!name) {
      continue;
    }

    document.cookie = [
      `${encodeURIComponent(name)}=`,
      'Path=/',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'SameSite=Lax',
    ].join('; ');
  }
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

function readUserString(
  user: UserProfileMenuUser | null | undefined,
  keys: readonly UserStringKey[],
): string | null {
  if (!user) {
    return null;
  }

  for (const key of keys) {
    const value = normalizeText(user[key]);

    if (value) {
      return value;
    }
  }

  return null;
}

function isFallbackAccountLabel(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();

  return normalized ? FALLBACK_ACCOUNT_LABELS.has(normalized) : false;
}

function getUsername(user: UserProfileMenuUser | null | undefined): string | null {
  return (
    readUserString(user, [
      'username',
      'handle',
      'login',
      'userName',
      'user_name',
    ]) ?? readPersistedUsername()
  );
}

function getInitials(user: UserProfileMenuUser | null | undefined): string {
  const source =
    getUsername(user) ??
    readUserString(user, ['name', 'displayName', 'email']) ??
    'User';

  const parts = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function getDisplayName(user: UserProfileMenuUser | null | undefined): string {
  return (
    getUsername(user) ??
    readUserString(user, ['name', 'displayName', 'email']) ??
    'Account'
  );
}

function getProfileName(user: UserProfileMenuUser | null | undefined): string | null {
  const username = getUsername(user);
  const profileName = readUserString(user, ['name', 'displayName']);

  if (
    !profileName ||
    profileName === username ||
    isFallbackAccountLabel(profileName)
  ) {
    return null;
  }

  return profileName;
}

function getAvatarSource(
  user: UserProfileMenuUser | null | undefined,
): string | undefined {
  return (
    readUserString(user, ['avatarUrl', 'avatar', 'image', 'picture']) ??
    undefined
  );
}

function buildProfileHref(baseHref: string, username: string | null): string {
  const normalizedUsername = username?.trim();

  if (!normalizedUsername) {
    return baseHref;
  }

  const encodedUsername = encodeURIComponent(normalizedUsername);
  const normalizedBaseHref = baseHref.trim() || '/profile';

  if (normalizedBaseHref.includes('{username}')) {
    return normalizedBaseHref.replaceAll('{username}', encodedUsername);
  }

  if (normalizedBaseHref.includes(':username')) {
    return normalizedBaseHref.replaceAll(':username', encodedUsername);
  }

  if (normalizedBaseHref.endsWith(`/${encodedUsername}`)) {
    return normalizedBaseHref;
  }

  return `${normalizedBaseHref.replace(/\/+$/, '')}/${encodedUsername}`;
}

async function readApiResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function postLogout(endpoint: string): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    credentials: 'include',
  });

  const data = await readApiResponse(response);

  return data;
}

export function UserProfileMenu({
  user = EMPTY_USER,
  logoutEndpoint = '/api/V1/auth/logout',
  dashboardHref = '/dashboard',
  profileHref = '/profile',
  settingsHref = '/settings',
  actions,
  onNavigate,
  onLogout,
  onLogoutSuccess,
  onLogoutError,
  sx,
  buttonSx,
  menuSx,
}: UserProfileMenuProps): React.ReactElement {
  const safeUser = user ?? EMPTY_USER;

  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [status, setStatus] = React.useState<StatusState | null>(null);

  const open = Boolean(anchorEl);
  const username = getUsername(safeUser);
  const displayName = getDisplayName(safeUser);
  const profileName = getProfileName(safeUser);
  const avatarSource = getAvatarSource(safeUser);
  const initials = getInitials(safeUser);
  const resolvedProfileHref = buildProfileHref(profileHref, username);

  const menuId = 'helix-user-profile-menu';
  const triggerId = 'helix-user-profile-menu-trigger';

  const resolvedActions: UserProfileMenuAction[] =
    actions ??
    [
      {
        label: 'Dashboard',
        href: dashboardHref,
        icon: h(MuiDashboardIcon, { fontSize: 'small' }),
      },
      {
        label: 'Profile',
        href: resolvedProfileHref,
        icon: h(MuiPersonIcon, { fontSize: 'small' }),
      },
    ];

  const handleOpen = (event: MouseEvent<HTMLElement>): void => {
    setStatus(null);
    setAnchorEl(event.currentTarget);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    setStatus(null);
    setAnchorEl(event.currentTarget);
  };

  const handleClose = (): void => {
    if (loggingOut) {
      return;
    }

    setAnchorEl(null);
  };

  const handleNavigate = (href: string): void => {
    setAnchorEl(null);

    if (onNavigate) {
      onNavigate(href);
      return;
    }

    window.location.assign(href);
  };

  const handleActionClick = (action: UserProfileMenuAction): void => {
    if (action.disabled) {
      return;
    }

    setStatus(null);

    if (action.onClick) {
      action.onClick();
      setAnchorEl(null);
      return;
    }

    if (action.href) {
      handleNavigate(action.href);
    }
  };

  const handleLogout = async (): Promise<void> => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setStatus(null);

    try {
      if (onLogout) {
        await onLogout();
        clearPersistedUsername();
        setAnchorEl(null);
        onLogoutSuccess?.({});
        return;
      }

      const response = await postLogout(logoutEndpoint);
      clearPersistedUsername();
      onLogoutSuccess?.(response);
      setAnchorEl(null);
    } catch (error) {
      setStatus({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Logout failed.',
      });
      onLogoutError?.(error);
    } finally {
      setLoggingOut(false);
    }
  };

  return h(
    MuiBox,
    {
      sx: [
        {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          minWidth: 0,
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ] as SxProps<Theme>,
    },
    h(
      MuiBox,
      {
        id: triggerId,
        component: 'div',
        role: 'button',
        tabIndex: 0,
        onClick: handleOpen,
        onKeyDown: handleTriggerKeyDown,
        'aria-controls': open ? menuId : undefined,
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : undefined,
        sx: [
          profileTriggerSx,
          ...(Array.isArray(buttonSx) ? buttonSx : buttonSx ? [buttonSx] : []),
        ] as SxProps<Theme>,
      },
      h(
        MuiStack,
        {
          direction: 'row',
          spacing: 1,
          alignItems: 'center',
          justifyContent: 'flex-end',
          minWidth: 0,
        },
        h(
          MuiTypography,
          {
            component: 'span',
            sx: usernameChipSx,
          },
          displayName,
        ),
        h(
          MuiAvatar,
          {
            src: avatarSource,
            alt: displayName,
            sx: avatarSx,
          },
          avatarSource ? null : initials,
        ),
      ),
    ),
    h(
      MuiMenu,
      {
        id: menuId,
        anchorEl,
        open,
        onClose: handleClose,
        MenuListProps: {
          'aria-labelledby': triggerId,
        },
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'right',
        },
        transformOrigin: {
          vertical: 'top',
          horizontal: 'right',
        },
        PaperProps: {
          sx: [
            menuPaperSx,
            ...(Array.isArray(menuSx) ? menuSx : menuSx ? [menuSx] : []),
          ] as SxProps<Theme>,
        },
      },
      h(
        MuiBox,
        {
          sx: {
            px: 2,
            py: 1.35,
          },
        },
        h(
          MuiStack,
          {
            direction: 'row',
            spacing: 1.25,
            alignItems: 'center',
            minWidth: 0,
          },
          h(
            MuiAvatar,
            {
              src: avatarSource,
              alt: displayName,
              sx: {
                ...avatarSx,
                width: 38,
                height: 38,
              },
            },
            avatarSource ? null : initials,
          ),
          h(
            MuiBox,
            {
              sx: {
                minWidth: 0,
              },
            },
            h(
              MuiTypography,
              {
                sx: {
                  color: '#ffffff',
                  fontWeight: 800,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 165,
                },
              },
              displayName,
            ),
            profileName
              ? h(
                  MuiTypography,
                  {
                    sx: {
                      color: 'rgba(170, 190, 220, 0.76)',
                      fontSize: '0.78rem',
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 165,
                    },
                  },
                  profileName,
                )
              : null,
            safeUser.email
              ? h(
                  MuiTypography,
                  {
                    sx: {
                      color: 'rgba(170, 190, 220, 0.76)',
                      fontSize: '0.78rem',
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 165,
                    },
                  },
                  safeUser.email,
                )
              : null,
          ),
        ),
      ),
      status
        ? h(
            MuiBox,
            {
              sx: {
                px: 1.5,
                pb: 1,
              },
            },
            h(
              MuiTypography,
              {
                sx: {
                  color: '#ffffff',
                  bgcolor: 'rgba(246, 6, 111, 0.16)',
                  border: '1px solid rgba(246, 6, 111, 0.32)',
                  borderRadius: 1.5,
                  px: 1.25,
                  py: 0.75,
                  fontSize: '0.8rem',
                  lineHeight: 1.35,
                },
              },
              status.message,
            ),
          )
        : null,
      h(MuiDivider, {
        sx: {
          borderColor: 'rgba(139, 233, 255, 0.14)',
          my: 0.5,
        },
      }),
      ...resolvedActions.map((action) =>
        h(
          MuiMenuItem,
          {
            key: action.label,
            onClick: () => handleActionClick(action),
            disabled: action.disabled || loggingOut,
            sx: menuItemSx,
          },
          action.icon
            ? h(MuiListItemIcon, null, action.icon)
            : h(
                MuiListItemIcon,
                null,
                h(MuiAccountCircleIcon, { fontSize: 'small' }),
              ),
          h(MuiTypography, { component: 'span' }, action.label),
        ),
      ),
      h(MuiDivider, {
        sx: {
          borderColor: 'rgba(139, 233, 255, 0.14)',
          my: 0.5,
        },
      }),
      h(
        MuiMenuItem,
        {
          onClick: handleLogout,
          disabled: loggingOut,
          sx: logoutItemSx,
        },
        h(
          MuiListItemIcon,
          null,
          loggingOut
            ? h(MuiCircularProgress, {
                size: 18,
                thickness: 5,
                sx: {
                  color: '#f6066f',
                },
              })
            : h(MuiLogoutIcon, { fontSize: 'small' }),
        ),
        h(
          MuiTypography,
          {
            component: 'span',
            sx: {
              fontWeight: 700,
            },
          },
          loggingOut ? 'Logging out...' : 'Logout',
        ),
      ),
    ),
  );
}

export default UserProfileMenu;

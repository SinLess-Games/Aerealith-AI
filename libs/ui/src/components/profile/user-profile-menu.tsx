'use client';

import * as React from 'react';

import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { SxProps, Theme } from '@mui/material/styles';

export type UserProfileMenuUser = {
  [key: string]: unknown;
  id?: string;
  name?: string | null;
  username?: string | null;
  handle?: string | null;
  login?: string | null;
  userName?: string | null;
  user_name?: string | null;
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  avatar?: string | null;
  image?: string | null;
  picture?: string | null;
};

export type UserProfileMenuAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export interface UserProfileMenuProps {
  actions?: readonly UserProfileMenuAction[];
  buttonSx?: SxProps<Theme>;
  dashboardHref?: string;
  label?: string;
  logoutEndpoint?: string;
  onLogout?: () => void | Promise<void>;
  onLogoutError?: (error: unknown) => void;
  onLogoutSuccess?: (response: unknown) => void;
  onNavigate?: (href: string) => void;
  profileHref?: string;
  settingsHref?: string;
  sx?: SxProps<Theme>;
  user?: UserProfileMenuUser | null;
}

export function UserProfileMenu({
  actions = [],
  buttonSx,
  dashboardHref = '/dashboard',
  label,
  onLogout,
  onLogoutError,
  onLogoutSuccess,
  onNavigate,
  profileHref = '/app/profile',
  settingsHref = '/app/profile#settings',
  sx,
  user,
}: UserProfileMenuProps): React.ReactElement {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Button
        aria-controls={open ? 'user-profile-menu' : undefined}
        aria-expanded={open ? 'true' : undefined}
        aria-haspopup="menu"
        onClick={(event) => setAnchorEl(event.currentTarget)}
        sx={[
          { color: 'inherit' },
          ...(Array.isArray(buttonSx) ? buttonSx : [buttonSx]),
        ]}
      >
        {label ?? user?.displayName ?? user?.username ?? 'Profile'}
      </Button>
      <Menu
        anchorEl={anchorEl}
        id="user-profile-menu"
        onClose={() => setAnchorEl(null)}
        open={open}
      >
        {[
          { label: 'Dashboard', href: dashboardHref },
          { label: 'Profile', href: profileHref },
          { label: 'Settings', href: settingsHref },
          ...actions,
          { label: 'Sign out', onClick: onLogout },
        ].map((item) => (
          <MenuItem
            component={item.href ? 'a' : 'li'}
            href={item.href}
            key={item.label}
            onClick={() => {
              if (item.href) {
                onNavigate?.(item.href);
              }

              Promise.resolve(item.onClick?.())
                .then((response) => onLogoutSuccess?.(response))
                .catch((error: unknown) => onLogoutError?.(error));
              setAnchorEl(null);
            }}
            sx={sx}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export default UserProfileMenu;

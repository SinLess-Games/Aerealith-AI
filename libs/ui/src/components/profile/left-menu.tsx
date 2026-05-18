import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';
import type {
  ProfileIdentityScaffold,
  ProfileSidebarItem,
  ProfileViewMode,
} from './types';

export type ProfileLeftMenuProps = {
  identity?: ProfileIdentityScaffold;
  items?: ProfileSidebarItem[];
  activeHref?: string;
  mode?: ProfileViewMode;
  logoutEndpoint?: string;
};

function getInitials(identity?: ProfileIdentityScaffold): string {
  if (identity?.initials) {
    return identity.initials;
  }

  if (identity?.username) {
    return identity.username.slice(0, 2).toUpperCase();
  }

  return '--';
}

export function ProfileLeftMenu({
  identity,
  items = [],
  activeHref = '#overview',
  mode = 'public',
  logoutEndpoint = '/api/V1/auth/logout',
}: ProfileLeftMenuProps): React.ReactElement {
  const visibleItems = items.filter((item) => mode === 'private' || !item.privateOnly);

  const handleLogout = async (): Promise<void> => {
    await fetch(logoutEndpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    }).catch(() => undefined);

    if (typeof document !== 'undefined') {
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

    window.location.assign('/');
  };

  return (
    <Box
      component="aside"
      aria-label="Profile navigation"
      sx={{
        position: { xs: 'relative', lg: 'fixed' },
        top: 0,
        left: 0,
        bottom: { lg: 0 },
        zIndex: 2,
        height: { xs: 'auto', lg: '100dvh' },
        minHeight: { lg: '100dvh' },
        maxHeight: { lg: '100dvh' },
        width: { xs: '100%', lg: 292 },
        flexShrink: 0,
        overflow: 'hidden',
        px: 2.25,
        py: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2.25,
        border: '1px solid rgba(236, 23, 153, 0.28)',
        borderWidth: { xs: 1, lg: '0 1px 0 0' },
        borderRadius: { xs: 2, lg: 0 },
        background:
          'linear-gradient(180deg, rgba(7, 13, 38, 0.92), rgba(5, 9, 28, 0.84))',
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.42)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <Stack alignItems="center" spacing={1.5}>
        <Box
          sx={{
            width: 138,
            height: 138,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            border: '2px solid rgba(236, 23, 153, 0.88)',
            boxShadow:
              '0 0 28px rgba(236, 23, 153, 0.52), inset 0 0 18px rgba(58, 216, 255, 0.22)',
          }}
        >
          <Box
            sx={{
              width: 112,
              height: 112,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(227, 11, 114, 0.82)',
              color: '#ffffff',
              fontSize: '2rem',
              fontWeight: 900,
            }}
          >
            {getInitials(identity)}
          </Box>
        </Box>
        <Box sx={{ textAlign: 'center', minWidth: 0 }}>
          <Typography sx={{ fontSize: 30, fontWeight: 900, lineHeight: 1.05 }}>
            {identity?.username ?? 'Profile'}
          </Typography>
          <Typography sx={{ color: '#00e5ff', fontWeight: 800 }}>
            {identity?.handle ?? 'Public profile'}
          </Typography>
        </Box>
      </Stack>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

      <Stack component="nav" spacing={0.7}>
        {visibleItems.map((item) => {
          const active = item.href === activeHref;

          return (
            <Button
              key={item.href}
              href={item.href}
              startIcon={<ProfileIcon name={item.icon} />}
              sx={{
                justifyContent: 'flex-start',
                minHeight: 50,
                px: 2,
                borderRadius: 1,
                color: active ? '#ffffff' : 'rgba(235, 242, 255, 0.86)',
                border: active
                  ? '1px solid rgba(236, 23, 153, 0.62)'
                  : '1px solid transparent',
                background: active
                  ? 'linear-gradient(90deg, rgba(236, 23, 153, 0.32), rgba(236, 23, 153, 0.12))'
                  : 'transparent',
                fontWeight: 800,
                textTransform: 'none',
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </Stack>

      <Box sx={{ flexGrow: 1 }} />

      {mode === 'private' ? (
        <Button onClick={handleLogout} startIcon={<ProfileIcon name="logout" />} sx={{ justifyContent: 'flex-start', color: 'rgba(235, 242, 255, 0.9)', textTransform: 'none', fontWeight: 800 }}>
          Log out
        </Button>
      ) : null}

      <Typography component="div" sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 1, fontSize: 29, fontWeight: 900 }}>
        <Box component="span" sx={{ color: '#00e5ff', display: 'inline-flex' }}>
          <ProfileIcon name="integrations" size={34} />
        </Box>
        HELIX <Box component="span" sx={{ fontWeight: 500 }}>AI</Box>
      </Typography>
    </Box>
  );
}

export default ProfileLeftMenu;

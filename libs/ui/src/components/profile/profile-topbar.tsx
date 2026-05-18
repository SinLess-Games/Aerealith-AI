import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';
import type {
  ProfileIdentityScaffold,
  ProfileMetricScaffold,
  ProfileTopbarAction,
  ProfileViewMode,
} from './types';

export type ProfileTopbarProps = {
  identity?: ProfileIdentityScaffold;
  mode?: ProfileViewMode;
  primaryAction?: ProfileTopbarAction;
  metrics?: ProfileMetricScaffold[];
};

const defaultMetrics: ProfileMetricScaffold[] = [
  { label: 'Followers', icon: 'followers' },
  { label: 'Following', icon: 'connections' },
];

export function ProfileTopbar({
  identity,
  mode = 'public',
  primaryAction = {
    label: 'Go to Dashboard',
    href: '/dashboard',
    icon: 'dashboard',
  },
  metrics = defaultMetrics,
}: ProfileTopbarProps): React.ReactElement {
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" justifyContent="flex-end">
        {mode === 'private' ? (
          <Button component={Link} href={primaryAction.href} underline="none" startIcon={primaryAction.icon ? <ProfileIcon name={primaryAction.icon} /> : null} endIcon={<ProfileIcon name="arrow" />} sx={{ minHeight: 50, px: 2.4, borderRadius: 1, color: '#ffffff', border: '1px solid #00e5ff', bgcolor: 'rgba(4, 12, 35, 0.78)', boxShadow: '0 0 22px rgba(0,229,255,0.18)', fontWeight: 900, textTransform: 'none' }}>
            {primaryAction.label}
          </Button>
        ) : null}
      </Stack>

      <Paper elevation={0} sx={{ overflow: 'hidden', borderRadius: 1.25, border: '1px solid rgba(236, 23, 153, 0.28)', background: 'linear-gradient(180deg, rgba(7, 13, 38, 0.88), rgba(5, 9, 28, 0.82))', boxShadow: '0 24px 80px rgba(0, 0, 0, 0.42)', backdropFilter: 'blur(18px)' }}>
        <Box sx={{ p: { xs: 3, md: 4 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '220px minmax(0, 1fr) auto' }, gap: { xs: 3, md: 4 }, alignItems: 'center', background: 'radial-gradient(circle at 86% 14%, rgba(236, 23, 153, 0.46), transparent 18%), radial-gradient(circle at 60% 42%, rgba(0, 84, 255, 0.26), transparent 34%)' }}>
          <Box sx={{ width: { xs: 180, md: 210 }, height: { xs: 180, md: 210 }, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '3px solid #ff1494', boxShadow: '0 0 34px rgba(236, 23, 153, 0.58)' }}>
            <Box sx={{ width: '78%', height: '78%', borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#ffffff', background: 'radial-gradient(circle at 34% 26%, rgba(255,255,255,0.9), rgba(90, 34, 154, 0.8) 24%, rgba(4, 8, 25, 0.98) 68%)', border: '1px solid rgba(0, 229, 255, 0.52)', fontSize: 44, fontWeight: 900 }}>
              {identity?.initials ?? identity?.username?.slice(0, 2).toUpperCase() ?? '--'}
            </Box>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: '#ff1494', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
              {mode === 'private' ? 'User Profile' : 'Public Profile'}
            </Typography>
            <Typography component="h1" sx={{ mt: 1, color: '#ffffff', fontSize: { xs: 40, md: 48 }, fontWeight: 900, lineHeight: 1 }}>
              {identity?.username ?? 'Profile'}
            </Typography>
            <Typography sx={{ mt: 1, color: '#00e5ff', fontSize: 20, fontWeight: 800 }}>
              {identity?.handle ?? 'Profile handle'}
            </Typography>
            {identity?.bio ? (
              <Typography sx={{ mt: 2, maxWidth: 600, color: 'rgba(235, 242, 255, 0.82)', lineHeight: 1.7 }}>
                {identity.bio}
              </Typography>
            ) : null}
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row', md: 'row' }} gap={2}>
            {metrics.map((metric) => (
              <Paper key={metric.label} elevation={0} sx={{ p: 2.5, minWidth: { xs: '100%', sm: 190 }, borderRadius: 1, border: '1px solid rgba(54, 121, 255, 0.35)', background: 'linear-gradient(145deg, rgba(19, 26, 62, 0.84), rgba(9, 14, 39, 0.72))' }}>
                <Stack direction="row" spacing={1.4} alignItems="center">
                  <ProfileIcon name={metric.icon} />
                  <Box>
                    <Typography sx={{ color: 'rgba(235, 242, 255, 0.72)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                      {metric.label}
                    </Typography>
                    <Typography sx={{ fontSize: 29, fontWeight: 900, lineHeight: 1.1 }}>
                      {metric.value ?? '--'}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Paper>
    </Stack>
  );
}

export default ProfileTopbar;

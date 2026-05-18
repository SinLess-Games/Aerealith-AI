import * as React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';
import type { ProfileSummaryItem } from './types';

export type ProfileOverviewCardProps = {
  items?: ProfileSummaryItem[];
};

const emptyItems: ProfileSummaryItem[] = [
  { title: 'Projects', icon: 'projects' },
  { title: 'Models', icon: 'models' },
  { title: 'Activity', icon: 'activity' },
];

export function ProfileOverviewCard({
  items = emptyItems,
}: ProfileOverviewCardProps): React.ReactElement {
  return (
    <Box
      id="overview"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
        gap: 2,
      }}
    >
      {items.map((item) => (
        <Paper
          key={item.title}
          elevation={0}
          sx={{
            minHeight: 166,
            p: 2.25,
            borderRadius: 1,
            border: '1px solid rgba(84, 110, 186, 0.34)',
            bgcolor: 'rgba(9, 15, 42, 0.72)',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ color: '#00e5ff' }}>
              <ProfileIcon name={item.icon} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ color: 'rgba(235,242,255,0.72)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                {item.title}
              </Typography>
              <Typography sx={{ mt: 0.3, fontSize: 26, fontWeight: 900 }}>
                {item.value ?? '--'}
              </Typography>
            </Box>
          </Stack>
          <Typography sx={{ mt: 1.6, color: 'rgba(235,242,255,0.76)', lineHeight: 1.65 }}>
            {item.body ?? 'Profile data will appear here once it is available.'}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

export default ProfileOverviewCard;

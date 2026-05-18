import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { ProfileActivityItem } from './types';

export type ProfileRecentActivityCardProps = {
  items?: ProfileActivityItem[];
};

export function ProfileRecentActivityCard({
  items = [],
}: ProfileRecentActivityCardProps): React.ReactElement {
  return (
    <Paper
      id="recent-activity"
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 1,
        border: '1px solid rgba(84, 110, 186, 0.34)',
        bgcolor: 'rgba(9, 15, 42, 0.72)',
      }}
    >
      <Typography sx={{ mb: 2, color: '#ff1494', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
        Recent Activity
      </Typography>
      {items.length > 0 ? (
        <Stack spacing={1}>
          {items.map((item) => (
            <Paper key={`${item.title}:${item.meta ?? ''}`} elevation={0} sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(6, 12, 33, 0.62)' }}>
              <Typography sx={{ fontWeight: 900 }}>{item.title}</Typography>
              {item.meta ? <Typography sx={{ color: '#00e5ff', fontSize: 13 }}>{item.meta}</Typography> : null}
              {item.detail ? <Typography sx={{ mt: 0.8, color: 'rgba(235,242,255,0.75)' }}>{item.detail}</Typography> : null}
            </Paper>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: 'rgba(235,242,255,0.72)' }}>
          Recent activity will appear here after the profile feed is connected.
        </Typography>
      )}
    </Paper>
  );
}

export default ProfileRecentActivityCard;

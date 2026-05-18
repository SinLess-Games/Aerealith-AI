import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';
import type { ProfileAchievementItem } from './types';

export type ProfileAchievementsCardProps = {
  items?: ProfileAchievementItem[];
};

export function ProfileAchievementsCard({
  items = [],
}: ProfileAchievementsCardProps): React.ReactElement {
  return (
    <Paper id="achievements" elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(84, 110, 186, 0.34)', bgcolor: 'rgba(9, 15, 42, 0.72)' }}>
      <Typography sx={{ mb: 2, color: '#ff1494', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
        Achievements
      </Typography>
      {items.length > 0 ? (
        <Stack spacing={1}>
          {items.map((item) => (
            <Paper key={item.name} elevation={0} sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(6, 12, 33, 0.62)' }}>
              <Stack direction="row" spacing={1.4} alignItems="center">
                <ProfileIcon name="achievement" />
                <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
              </Stack>
              {item.detail ? <Typography sx={{ mt: 0.8, color: 'rgba(235,242,255,0.75)' }}>{item.detail}</Typography> : null}
            </Paper>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: 'rgba(235,242,255,0.72)' }}>
          Achievements will appear here after profile data is fetched.
        </Typography>
      )}
    </Paper>
  );
}

export default ProfileAchievementsCard;

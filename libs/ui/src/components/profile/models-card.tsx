import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';
import type { ProfileModelItem } from './types';

export type ProfileModelsCardProps = {
  items?: ProfileModelItem[];
};

export function ProfileModelsCard({
  items = [],
}: ProfileModelsCardProps): React.ReactElement {
  return (
    <Paper id="models" elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(84, 110, 186, 0.34)', bgcolor: 'rgba(9, 15, 42, 0.72)' }}>
      <Typography sx={{ mb: 2, color: '#ff1494', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
        Models
      </Typography>
      {items.length > 0 ? (
        <Stack spacing={1}>
          {items.map((item) => (
            <Paper key={item.name} elevation={0} sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(6, 12, 33, 0.62)' }}>
              <Stack direction="row" spacing={1.4} alignItems="center">
                <ProfileIcon name="models" />
                <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
              </Stack>
              {item.type ? <Typography sx={{ mt: 0.8, color: 'rgba(235,242,255,0.68)' }}>{item.type}</Typography> : null}
              {item.score ? <Typography sx={{ color: '#24f59d', fontWeight: 900 }}>{item.score}</Typography> : null}
            </Paper>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: 'rgba(235,242,255,0.72)' }}>
          Model usage and evaluations will appear here after data is connected.
        </Typography>
      )}
    </Paper>
  );
}

export default ProfileModelsCard;

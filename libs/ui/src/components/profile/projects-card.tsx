import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { ProfileProjectItem } from './types';

export type ProfileProjectsCardProps = {
  items?: ProfileProjectItem[];
};

export function ProfileProjectsCard({
  items = [],
}: ProfileProjectsCardProps): React.ReactElement {
  return (
    <Paper id="projects" elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(84, 110, 186, 0.34)', bgcolor: 'rgba(9, 15, 42, 0.72)' }}>
      <Typography sx={{ mb: 2, color: '#ff1494', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
        Projects
      </Typography>
      {items.length > 0 ? (
        <Stack spacing={1}>
          {items.map((item) => (
            <Paper key={item.name} elevation={0} sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(6, 12, 33, 0.62)' }}>
              <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
              {item.status ? <Typography sx={{ color: '#24f59d', fontSize: 13 }}>{item.status}</Typography> : null}
              {item.body ? <Typography sx={{ mt: 0.8, color: 'rgba(235,242,255,0.75)' }}>{item.body}</Typography> : null}
            </Paper>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: 'rgba(235,242,255,0.72)' }}>
          Projects will appear here after profile data is fetched.
        </Typography>
      )}
    </Paper>
  );
}

export default ProfileProjectsCard;

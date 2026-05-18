import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { ProfileIntegrationItem } from './types';

export type ProfileIntegrationsCardProps = {
  items?: ProfileIntegrationItem[];
};

export function ProfileIntegrationsCard({
  items = [],
}: ProfileIntegrationsCardProps): React.ReactElement {
  return (
    <Paper id="integrations" elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(84, 110, 186, 0.34)', bgcolor: 'rgba(9, 15, 42, 0.72)' }}>
      <Typography sx={{ mb: 2, color: '#ff1494', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
        Integrations
      </Typography>
      {items.length > 0 ? (
        <Stack spacing={1}>
          {items.map((item) => (
            <Paper key={item.name} elevation={0} sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(6, 12, 33, 0.62)' }}>
              <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
              <Typography sx={{ color: 'rgba(235,242,255,0.68)' }}>
                {item.category ?? 'Integration'}
              </Typography>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Typography sx={{ color: 'rgba(235,242,255,0.72)' }}>
          Integration scaffolding is ready for fetched service data.
        </Typography>
      )}
    </Paper>
  );
}

export default ProfileIntegrationsCard;

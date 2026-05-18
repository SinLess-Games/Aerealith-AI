import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';
import type { ProfileMetricScaffold } from './types';

export type ProfileActivityCardProps = {
  metrics?: ProfileMetricScaffold[];
};

const defaultMetrics: ProfileMetricScaffold[] = [
  { label: 'Profile Activity', icon: 'activity' },
  { label: 'Automation Runs', icon: 'analytics' },
];

export function ProfileActivityCard({
  metrics = defaultMetrics,
}: ProfileActivityCardProps): React.ReactElement {
  return (
    <Paper
      id="activity"
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 1,
        border: '1px solid rgba(84, 110, 186, 0.34)',
        bgcolor: 'rgba(9, 15, 42, 0.72)',
      }}
    >
      <Typography sx={{ mb: 2, color: '#ff1494', fontSize: 13, fontWeight: 900, textTransform: 'uppercase' }}>
        Activity
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
        {metrics.map((metric) => (
          <Paper
            key={metric.label}
            elevation={0}
            sx={{
              flex: 1,
              p: 2,
              borderRadius: 1,
              border: '1px solid rgba(84, 110, 186, 0.24)',
              bgcolor: 'rgba(6, 12, 33, 0.62)',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <ProfileIcon name={metric.icon} />
              <Typography sx={{ fontWeight: 900 }}>{metric.label}</Typography>
            </Stack>
            <Typography sx={{ mt: 1.4, fontSize: 28, fontWeight: 900 }}>
              {metric.value ?? '--'}
            </Typography>
            <Typography sx={{ color: 'rgba(235,242,255,0.68)' }}>
              {metric.helperText ?? 'Waiting for profile data.'}
            </Typography>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}

export default ProfileActivityCard;

import * as React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';

export type ProfileFollowersCardProps = {
  followersLabel?: string;
  followingLabel?: string;
};

export function ProfileFollowersCard({
  followersLabel = 'Followers',
  followingLabel = 'Following',
}: ProfileFollowersCardProps): React.ReactElement {
  return (
    <Stack id="followers" direction={{ xs: 'column', sm: 'row' }} gap={2}>
      {[followersLabel, followingLabel].map((label) => (
        <Paper key={label} elevation={0} sx={{ flex: 1, p: 2.5, borderRadius: 1, border: '1px solid rgba(54, 121, 255, 0.35)', bgcolor: 'rgba(9, 15, 42, 0.72)' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <ProfileIcon name="followers" />
            <Typography sx={{ color: 'rgba(235,242,255,0.72)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
              {label}
            </Typography>
          </Stack>
          <Typography sx={{ mt: 1.2, fontSize: 29, fontWeight: 900 }}>--</Typography>
          <Typography sx={{ color: 'rgba(235,242,255,0.68)' }}>
            Fetched profile counts will render here.
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}

export default ProfileFollowersCard;

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { ProfileIcon } from './icons';
import type { ProfileConnectionCategory, ProfileConnectionItem } from './types';

export type ProfileConnectionsCardProps = {
  categories?: ProfileConnectionCategory[];
  items?: ProfileConnectionItem[];
};

export function ProfileConnectionsCard({
  categories = [],
  items = [],
}: ProfileConnectionsCardProps): React.ReactElement {
  const [selectedCategory, setSelectedCategory] = React.useState(
    () => categories[0]?.label ?? 'All Connections',
  );
  const activeCategory = categories.some(
    (category) => category.label === selectedCategory,
  )
    ? selectedCategory
    : categories[0]?.label ?? 'All Connections';

  const isAllCategory = (category: string): boolean =>
    category.toLowerCase().startsWith('all ');

  const getCategoryCount = (category: string): number => {
    if (isAllCategory(category)) {
      return items.length;
    }

    return items.filter((item) => item.category === category).length;
  };

  const visibleItems = isAllCategory(activeCategory)
    ? items
    : items.filter((item) => item.category === activeCategory);

  return (
    <Paper id="connections" elevation={0} sx={{ p: 2.5, borderRadius: 1, border: '1px solid rgba(84, 110, 186, 0.34)', bgcolor: 'rgba(9, 15, 42, 0.72)' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 900 }}>
            Connections
          </Typography>
          <Typography sx={{ mt: 0.7, color: 'rgba(235,242,255,0.72)' }}>
            Connected accounts and services will appear here after authentication data is available.
          </Typography>
        </Box>
        <Box sx={{ height: 44, px: 1.6, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 1, color: 'rgba(235,242,255,0.62)', border: '1px solid rgba(84, 110, 186, 0.34)', bgcolor: 'rgba(6, 12, 33, 0.72)' }}>
          <ProfileIcon name="search" />
          <Typography sx={{ fontSize: 14 }}>Search connections...</Typography>
        </Box>
      </Stack>

      <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0, 1fr)' }, gap: 2 }}>
        <Paper elevation={0} sx={{ p: 1, borderRadius: 1, border: '1px solid rgba(84, 110, 186, 0.28)', bgcolor: 'rgba(6, 12, 33, 0.54)' }}>
          <Typography sx={{ px: 1.25, py: 1.4, color: '#ff1494', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
            Categories
          </Typography>
          <Stack spacing={0.5}>
            {categories.map((category) => {
              const active = category.label === activeCategory;

              return (
                <Button
                  key={category.label}
                  startIcon={<ProfileIcon name={category.icon} />}
                  endIcon={<Chip label={getCategoryCount(category.label)} size="small" sx={{ height: 24, color: 'rgba(235,242,255,0.88)', bgcolor: active ? 'rgba(236, 23, 153, 0.2)' : 'rgba(143, 83, 255, 0.14)' }} />}
                  onClick={() => setSelectedCategory(category.label)}
                  aria-pressed={active}
                  sx={{
                    minHeight: 50,
                    justifyContent: 'space-between',
                    px: 1.4,
                    color: active ? '#ffffff' : '#eef4ff',
                    borderRadius: 1,
                    border: active ? '1px solid rgba(236, 23, 153, 0.52)' : '1px solid transparent',
                    bgcolor: active ? 'rgba(236, 23, 153, 0.16)' : 'transparent',
                    textTransform: 'none',
                    fontWeight: 800,
                  }}
                >
                  <Box component="span" sx={{ mr: 'auto' }}>
                    {category.label}
                  </Box>
                </Button>
              );
            })}
          </Stack>
        </Paper>

        <Paper elevation={0} sx={{ minHeight: 268, p: 2, borderRadius: 1, border: '1px solid rgba(84, 110, 186, 0.28)', bgcolor: 'rgba(6, 12, 33, 0.54)' }}>
          {visibleItems.length > 0 ? (
            <Stack spacing={1}>
              {visibleItems.map((item) => (
                <Paper key={item.name} elevation={0} sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(9, 15, 42, 0.72)' }}>
                  <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
                  <Typography sx={{ color: 'rgba(235,242,255,0.68)' }}>
                    {item.category ?? 'Uncategorized'}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ color: 'rgba(235,242,255,0.72)' }}>
              No connections are loaded for {activeCategory}.
            </Typography>
          )}
        </Paper>
      </Box>
    </Paper>
  );
}

export default ProfileConnectionsCard;

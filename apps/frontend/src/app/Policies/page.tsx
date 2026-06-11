import {
  Box,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { Metadata } from 'next';
import NextLink from 'next/link';

import { englishPolicies } from '@aerealith-ai/content';

export const metadata: Metadata = {
  title: 'Policies | Aerealith AI',
  description:
    'Review Aerealith AI policies, terms, privacy rules, security practices, support rules, AI transparency information, and platform governance documents.',
};

export default function PoliciesPage() {
  return (
    <Box component="main" sx={{ py: { xs: 4, md: 8 } }}>
      <Container maxWidth="lg">
        <Stack spacing={5}>
          <Paper
            elevation={0}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 4,
              p: { xs: 3, md: 5 },
            }}
          >
            <Stack spacing={2}>
              <Typography variant="h2">Policies</Typography>

              <Typography color="text.secondary" variant="h6">
                Review the legal, privacy, security, support, AI transparency,
                marketplace, developer, and platform governance policies for
                Aerealith AI.
              </Typography>

              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                  pt: 1,
                }}
              >
                <Chip label={`${englishPolicies.length} policies`} />
                <Chip label="Aerealith AI" />
                <Chip label="SinLess Games LLC" />
              </Box>
            </Stack>
          </Paper>

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(2, minmax(0, 1fr))',
              },
            }}
          >
            {englishPolicies.map((policy) => (
              <NextLink
                href={policy.path}
                key={policy.slug}
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 4,
                    height: '100%',
                    p: 3,
                    transition:
                      'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
                    '&:hover': {
                      borderColor: 'primary.main',
                      boxShadow: 3,
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <Stack spacing={2}>
                    <Stack spacing={1}>
                      <Typography variant="h5">
                        {policy.meta.title}
                      </Typography>

                      <Typography color="text.secondary">
                        {policy.meta.description}
                      </Typography>
                    </Stack>

                    <Divider />

                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 1,
                      }}
                    >
                      <Chip
                        label={`Status: ${policy.meta.status}`}
                        size="small"
                      />

                      <Chip
                        label={`Effective: ${policy.meta.effectiveDate}`}
                        size="small"
                      />

                      <Chip
                        label={`${policy.sections.length} sections`}
                        size="small"
                      />
                    </Box>
                  </Stack>
                </Paper>
              </NextLink>
            ))}
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}

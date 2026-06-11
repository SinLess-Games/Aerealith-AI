import {
  Box,
  Breadcrumbs,
  Chip,
  Container,
  Divider,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';

import { englishPolicies, type PolicySection } from '@aerealith-ai/content';

type PolicyPageProps = {
  params: Promise<{
    policy: string;
  }>;
};

type PolicySectionCardProps = {
  section: PolicySection;
};

function getPolicyBySlug(slug: string) {
  return englishPolicies.find((policy) => policy.slug === slug);
}

export function generateStaticParams() {
  return englishPolicies.map((policy) => ({
    policy: policy.slug,
  }));
}

export async function generateMetadata({
  params,
}: PolicyPageProps): Promise<Metadata> {
  const { policy: policySlug } = await params;
  const policy = getPolicyBySlug(policySlug);

  if (!policy) {
    return {
      title: 'Policy Not Found | Aerealith AI',
    };
  }

  return {
    title: `${policy.meta.title} | Aerealith AI`,
    description: policy.meta.description,
  };
}

function PolicySectionCard({ section }: PolicySectionCardProps) {
  return (
    <Paper
      component="section"
      elevation={0}
      key={section.id}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 4,
        p: { xs: 3, md: 4 },
      }}
    >
      <Stack spacing={2}>
        <Typography variant="h4">{section.title}</Typography>

        {section.body?.map((paragraph, index) => (
          <Typography
            key={`${section.id}-body-${index}`}
            sx={{ lineHeight: 1.8 }}
          >
            {paragraph}
          </Typography>
        ))}

        {section.bullets && section.bullets.length > 0 ? (
          <Box
            component="ul"
            sx={{
              m: 0,
              pl: 3,
            }}
          >
            {section.bullets.map((bullet, index) => (
              <Box
                component="li"
                key={`${section.id}-bullet-${index}`}
                sx={{
                  py: 0.5,
                }}
              >
                <Typography sx={{ lineHeight: 1.7 }}>{bullet}</Typography>
              </Box>
            ))}
          </Box>
        ) : null}

        {section.orderedItems && section.orderedItems.length > 0 ? (
          <Box
            component="ol"
            sx={{
              m: 0,
              pl: 3,
            }}
          >
            {section.orderedItems.map((item, index) => (
              <Box
                component="li"
                key={`${section.id}-ordered-${index}`}
                sx={{
                  py: 0.5,
                }}
              >
                <Typography sx={{ lineHeight: 1.7 }}>{item}</Typography>
              </Box>
            ))}
          </Box>
        ) : null}

        {section.links && section.links.length > 0 ? (
          <Box>
            <Divider sx={{ mb: 2 }} />

            <Typography gutterBottom variant="h6">
              Links
            </Typography>

            <Stack spacing={1}>
              {section.links.map((link) => (
                <Box key={`${section.id}-link-${link.href}-${link.label}`}>
                  <MuiLink
                    component={NextLink}
                    href={link.href}
                    underline="hover"
                  >
                    {link.label}
                  </MuiLink>

                  {link.description ? (
                    <Typography color="text.secondary" variant="body2">
                      {link.description}
                    </Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          </Box>
        ) : null}

        {section.contacts && section.contacts.length > 0 ? (
          <Box>
            <Divider sx={{ mb: 2 }} />

            <Typography gutterBottom variant="h6">
              Contacts
            </Typography>

            <Stack spacing={1}>
              {section.contacts.map((contact) => (
                <Box
                  key={`${section.id}-contact-${contact.email}-${contact.label}`}
                >
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 700,
                    }}
                  >
                    {contact.label}:{' '}
                  </Box>

                  <MuiLink href={contact.href ?? `mailto:${contact.email}`}>
                    {contact.email}
                  </MuiLink>
                </Box>
              ))}
            </Stack>
          </Box>
        ) : null}

        {section.note ? (
          <Paper
            elevation={0}
            sx={{
              bgcolor: 'action.hover',
              borderRadius: 3,
              p: 2,
            }}
          >
            <Typography color="text.secondary">{section.note}</Typography>
          </Paper>
        ) : null}
      </Stack>
    </Paper>
  );
}

export default async function PolicyPage({ params }: PolicyPageProps) {
  const { policy: policySlug } = await params;
  const policy = getPolicyBySlug(policySlug);

  if (!policy) {
    notFound();
  }

  return (
    <Box component="main" sx={{ py: { xs: 4, md: 8 } }}>
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Breadcrumbs aria-label="Policy breadcrumbs">
            <MuiLink component={NextLink} href="/" underline="hover">
              Home
            </MuiLink>

            <MuiLink component={NextLink} href="/Policies" underline="hover">
              Policies
            </MuiLink>

            <Typography color="text.primary">{policy.meta.title}</Typography>
          </Breadcrumbs>

          <Paper
            elevation={0}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 4,
              p: { xs: 3, md: 5 },
            }}
          >
            <Stack spacing={3}>
              <Stack spacing={1.5}>
                <Typography variant="h2">{policy.meta.title}</Typography>

                <Typography color="text.secondary" variant="h6">
                  {policy.meta.description}
                </Typography>
              </Stack>

              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1,
                }}
              >
                <Chip label={`Status: ${policy.meta.status}`} />
                <Chip label={`Effective: ${policy.meta.effectiveDate}`} />
                <Chip label={`Updated: ${policy.meta.lastUpdated}`} />
                <Chip label={`Owner: ${policy.meta.owner}`} />
              </Box>

              {policy.relatedPolicies && policy.relatedPolicies.length > 0 ? (
                <Box>
                  <Typography gutterBottom variant="h5">
                    Related Policies
                  </Typography>

                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    {policy.relatedPolicies.map((relatedPolicy) => (
                      <Chip
                        key={`${relatedPolicy.href}-${relatedPolicy.label}`}
                        clickable
                        component={NextLink}
                        href={relatedPolicy.href}
                        label={relatedPolicy.label}
                      />
                    ))}
                  </Box>
                </Box>
              ) : null}
            </Stack>
          </Paper>

          <Stack spacing={3}>
            {policy.sections.map((section) => (
              <PolicySectionCard key={section.id} section={section} />
            ))}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

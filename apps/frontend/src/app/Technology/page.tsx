'use client';

// apps/frontend/src/app/Technology/page.tsx

import * as React from 'react';
import Script from 'next/script';

import { Box, Button, Container, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';

import { Footer, Header, MediaImage } from '@helix-ai/ui';
import type { ReadonlyCardArray } from '@helix-ai/content';

import {
  footerProps,
  headerProps,
  technologyCardGroups,
} from '@helix-ai/content';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

type TechnologySourceCard = ReadonlyCardArray[number];
type TechnologyListItem = NonNullable<TechnologySourceCard['listItems']>[number];

type TechnologyItemCard = {
  readonly id: string;
  readonly title: string;
  readonly role: string;
  readonly description: string;
  readonly href: string;
  readonly target?: string;
  readonly image?: string;
  readonly icon?: string;
  readonly parentTitle: string;
  readonly groupKey: string;
  readonly groupTitle: string;
};

type TechnologyGroup = {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly cards: readonly TechnologySourceCard[];
  readonly items: readonly TechnologyItemCard[];
};

const TECHNOLOGY_IMAGE_URL = '/images/technology.png';

const TECHNOLOGY_GROUP_LABELS: Record<string, string> = {
  ai: 'AI & Intelligence',
  cloudPlatforms: 'Cloud Platforms',
  dataStorage: 'Data & Storage',
  development: 'Development',
  frameworks: 'Frameworks',
  infrastructure: 'Infrastructure',
  metricsExporters: 'Metrics & Exporters',
  networking: 'Networking',
  observability: 'Observability',
  programmingLanguages: 'Programming Languages',
  security: 'Security',
  tools: 'Tools',
};

const TECHNOLOGY_GROUP_DESCRIPTIONS: Record<string, string> = {
  ai: 'AI, model providers, inference systems, local runtimes, gateways, evaluation tools, and intelligence platforms that help power adaptive assistant behavior.',
  cloudPlatforms:
    'Hosted infrastructure, edge platforms, serverless runtimes, and deployment services used to run resilient applications at scale.',
  dataStorage:
    'Databases, caches, object storage, queues, registries, and vector systems for structured, unstructured, operational, and semantic data.',
  development:
    'Developer tooling, automation, CI/CD, GitOps, testing, collaboration systems, and AI-assisted development workflows used to build Helix AI.',
  frameworks:
    'Application frameworks, UI libraries, API layers, testing tools, monorepo systems, and code-quality tooling used to create scalable product experiences.',
  infrastructure:
    'Core platform systems for Kubernetes, runtime, networking, deployments, storage, security, operations, and environment management.',
  metricsExporters:
    'Metrics collectors, exporters, and telemetry agents that make infrastructure, services, and runtime behavior measurable.',
  networking:
    'Networking, ingress, DNS, tunneling, service discovery, routing, and traffic-management tools for connected systems.',
  observability:
    'Logs, metrics, traces, profiles, dashboards, alerting, frontend telemetry, and error-tracking tools used to understand production health.',
  programmingLanguages:
    'Languages and structured formats used across frontend, backend, automation, infrastructure, scripting, configuration, and systems development.',
  security:
    'Security, policy, identity, secrets, runtime protection, scanning, compliance, and hardening technologies used to protect the platform.',
  tools:
    'Supporting CLI and UI tools that improve productivity, documentation, local development, operations, automation, and delivery workflows.',
};

const GROUP_ORDER = [
  'ai',
  'programmingLanguages',
  'frameworks',
  'development',
  'dataStorage',
  'cloudPlatforms',
  'infrastructure',
  'networking',
  'observability',
  'metricsExporters',
  'security',
  'tools',
] as const;

const isTechnologySourceCard = (
  value: unknown,
): value is TechnologySourceCard =>
  typeof value === 'object' &&
  value !== null &&
  'title' in value &&
  'description' in value;

const normalizeTechnologyCards = (value: unknown): TechnologySourceCard[] => {
  if (Array.isArray(value)) {
    return value.filter(isTechnologySourceCard);
  }

  return isTechnologySourceCard(value) ? [value] : [];
};

const getGroupTitle = (key: string): string =>
  TECHNOLOGY_GROUP_LABELS[key] ??
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getGroupDescription = (key: string): string =>
  TECHNOLOGY_GROUP_DESCRIPTIONS[key] ??
  'Technologies selected to support Helix AI as a secure, scalable, observable, and extensible assistant platform.';

const isExternalHref = (href: string): boolean =>
  /^https?:\/\//i.test(href) || href.startsWith('//');

const getLinkTargetProps = (
  href: string,
  target?: string,
): {
  target?: string;
  rel?: string;
} => {
  const resolvedTarget = target ?? (isExternalHref(href) ? '_blank' : undefined);

  if (!resolvedTarget) {
    return {};
  }

  return {
    target: resolvedTarget,
    rel: resolvedTarget === '_blank' ? 'noopener noreferrer' : undefined,
  };
};

const sortByTitle = <T extends { readonly title: string }>(
  items: readonly T[],
): T[] =>
  [...items].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

function sortGroups(groups: TechnologyGroup[]): TechnologyGroup[] {
  return [...groups].sort((a, b) => {
    const aIndex = GROUP_ORDER.indexOf(a.key as (typeof GROUP_ORDER)[number]);
    const bIndex = GROUP_ORDER.indexOf(b.key as (typeof GROUP_ORDER)[number]);

    const safeAIndex = aIndex === -1 ? 999 : aIndex;
    const safeBIndex = bIndex === -1 ? 999 : bIndex;

    if (safeAIndex !== safeBIndex) {
      return safeAIndex - safeBIndex;
    }

    return a.title.localeCompare(b.title, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function getItemDescription(
  item: TechnologyListItem,
  fallbackDescription: string,
): string {
  const detailedDescription = item.detailedDescription?.trim();

  return detailedDescription.length > 0
    ? detailedDescription
    : fallbackDescription;
}

function buildTechnologyItems(
  groupKey: string,
  groupTitle: string,
  cards: readonly TechnologySourceCard[],
): TechnologyItemCard[] {
  const items = cards.flatMap((card, cardIndex) => {
    const parentTitle = card.title;
    const cardImage = card.image;
    const fallbackDescription = card.description;

    if (card.listItems?.length) {
      return card.listItems.map((item, itemIndex) => ({
        id: `${groupKey}-${parentTitle}-${item.text}-${itemIndex}`,
        title: item.text,
        role: item.role,
        description: getItemDescription(item, fallbackDescription),
        href: item.href ?? card.link,
        target: item.target,
        image: item.image ?? cardImage,
        icon: item.icon,
        parentTitle,
        groupKey,
        groupTitle,
      }));
    }

    return [
      {
        id: `${groupKey}-${parentTitle}-${cardIndex}`,
        title: parentTitle,
        role: 'Technology Category',
        description: fallbackDescription,
        href: card.link,
        image: cardImage,
        parentTitle,
        groupKey,
        groupTitle,
      },
    ];
  });

  return sortByTitle(items);
}

function TechnologyItemCardView({
  item,
  index,
}: {
  readonly item: TechnologyItemCard;
  readonly index: number;
}) {
  return (
    <Box
      component="article"
      data-testid="technology-item-card"
      data-card-title={item.title}
      sx={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        maxWidth: 540,
        height: { xs: 350, sm: 360, md: 380 },
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: { xs: '1rem', md: '1.25rem' },
        border: '1px solid rgba(255, 255, 255, 0.1)',
        background:
          'linear-gradient(145deg, rgba(5, 10, 30, 0.92), rgba(13, 14, 42, 0.8), rgba(35, 12, 50, 0.58))',
        boxShadow:
          '0 18px 48px rgba(0, 0, 0, 0.32), inset 0 0 28px rgba(255, 255, 255, 0.018)',
        px: { xs: 1.9, md: 2.15 },
        py: { xs: 1.9, md: 2.15 },
        transition:
          'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, background 220ms ease',

        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 85% 0%, rgba(246, 6, 111, 0.14), transparent 34%), radial-gradient(circle at 0% 100%, rgba(0, 219, 201, 0.09), transparent 38%)',
          opacity: 0.9,
        },

        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: 'rgba(246, 6, 111, 0.72)',
          background:
            'linear-gradient(145deg, rgba(7, 11, 36, 0.96), rgba(24, 14, 54, 0.86), rgba(49, 13, 64, 0.7))',
          boxShadow:
            '0 26px 70px rgba(0, 0, 0, 0.48), 0 0 30px rgba(246, 6, 111, 0.3), 0 0 56px rgba(124, 58, 237, 0.18), inset 0 0 44px rgba(246, 6, 111, 0.06)',
        },

        '&:hover .technology-item-image img': {
          transform: 'scale(1.06)',
          filter:
            'drop-shadow(0 0 18px rgba(246, 6, 111, 0.4)) drop-shadow(0 0 28px rgba(124, 58, 237, 0.28))',
        },
      }}
    >
      <Stack
        spacing={1.2}
        sx={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          minHeight: 0,
        }}
      >
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            flex: '0 0 auto',
            alignItems: 'flex-start',
          }}
        >
          {item.image ? (
            <Box
              className="technology-item-image"
              sx={{
                width: 50,
                height: 50,
                flex: '0 0 auto',
                borderRadius: '0.9rem',
                border: '1px solid rgba(0, 219, 201, 0.18)',
                bgcolor: 'rgba(0, 219, 201, 0.055)',
                p: 0.55,
                boxShadow: '0 0 24px rgba(0, 219, 201, 0.08)',
              }}
            >
              <MediaImage
                src={item.image}
                alt={`${item.title} logo or artwork`}
                aspectRatio="1 / 1"
                objectFit="contain"
                objectPosition="center center"
                sizes="50px"
                rounded={false}
                bordered={false}
                elevated={false}
                sx={{
                  width: '100%',
                  bgcolor: 'transparent',
                  border: 0,
                  boxShadow: 'none',
                  overflow: 'visible',

                  '& img': {
                    transition: 'transform 220ms ease, filter 220ms ease',
                  },
                }}
              />
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                width: 50,
                height: 50,
                flex: '0 0 auto',
                placeItems: 'center',
                borderRadius: '0.9rem',
                border: '1px solid rgba(0, 219, 201, 0.18)',
                bgcolor: 'rgba(0, 219, 201, 0.055)',
                color: '#00dbc9',
                fontSize: item.icon ? '1.2rem' : '0.86rem',
                fontWeight: 900,
              }}
            >
              {item.icon ?? index + 1}
            </Box>
          )}

          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="p"
              sx={{
                color: 'rgba(0, 219, 201, 0.9)',
                fontSize: '0.63rem',
                fontWeight: 900,
                letterSpacing: '0.13em',
                lineHeight: 1.2,
                textTransform: 'uppercase',
              }}
            >
              {item.groupTitle}
            </Typography>

            <Typography
              component="h4"
              sx={{
                mt: 0.35,
                color: '#F6066F',
                fontSize: { xs: '1.05rem', md: '1.18rem' },
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: '-0.025em',
                textShadow:
                  '0 0 14px rgba(246, 6, 111, 0.36), 0 0 24px rgba(140, 82, 255, 0.16)',
              }}
            >
              {item.title}
            </Typography>

            <Typography
              component="p"
              sx={{
                mt: 0.6,
                display: 'inline-flex',
                width: 'fit-content',
                maxWidth: '100%',
                borderRadius: 999,
                border: '1px solid rgba(0, 219, 201, 0.22)',
                bgcolor: 'rgba(0, 219, 201, 0.07)',
                color: 'rgba(255, 255, 255, 0.82)',
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.035em',
                lineHeight: 1.2,
                px: 0.9,
                py: 0.35,
              }}
            >
              {item.role}
            </Typography>
          </Box>
        </Stack>

        <Box
          sx={{
            flex: '1 1 auto',
            minHeight: 0,
            borderRadius: '0.9rem',
            border: '1px solid rgba(255, 255, 255, 0.085)',
            bgcolor: 'rgba(255, 255, 255, 0.035)',
            px: 1.45,
            py: 1.25,
            overflowX: 'hidden',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(246, 6, 111, 0.7) rgba(255, 255, 255, 0.06)',

            '&::-webkit-scrollbar': {
              width: 8,
            },

            '&::-webkit-scrollbar-track': {
              borderRadius: 999,
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
            },

            '&::-webkit-scrollbar-thumb': {
              borderRadius: 999,
              background:
                'linear-gradient(180deg, rgba(246, 6, 111, 0.85), rgba(0, 219, 201, 0.65))',
            },
          }}
        >
          <Typography
            component="p"
            sx={{
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: { xs: '0.82rem', md: '0.85rem' },
              lineHeight: 1.55,
            }}
          >
            {item.description}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flex: '0 0 auto',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            component="a"
            href={item.href}
            size="small"
            {...getLinkTargetProps(item.href, item.target)}
            sx={{
              minHeight: 30,
              borderRadius: 999,
              border: '1px solid rgba(255, 255, 255, 0.18)',
              bgcolor: 'rgba(246, 6, 111, 0.1)',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 900,
              letterSpacing: '0.04em',
              px: 1.45,
              py: 0.45,
              textTransform: 'none',

              '&:hover': {
                bgcolor: 'rgba(246, 6, 111, 0.18)',
                borderColor: 'rgba(246, 6, 111, 0.58)',
                boxShadow: '0 0 22px rgba(246, 6, 111, 0.34)',
              },
            }}
          >
            View
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

export default function TechnologyPage() {
  const groups = React.useMemo<TechnologyGroup[]>(() => {
    const normalizedGroups = Object.entries(technologyCardGroups)
      .map(([key, value]) => {
        const title = getGroupTitle(key);
        const cards = normalizeTechnologyCards(value);

        return {
          key,
          title,
          description: getGroupDescription(key),
          cards,
          items: buildTechnologyItems(key, title, cards),
        };
      })
      .filter((group) => group.items.length > 0);

    return sortGroups(normalizedGroups);
  }, []);

  const totalItems = groups.reduce(
    (total, group) => total + group.items.length,
    0,
  );

  React.useEffect(() => {
    if (!process.env.NEXT_PUBLIC_ADSENSE_CLIENT) {
      return;
    }

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ignore locally.
    }
  }, [groups.length]);

  return (
    <Box
      id="main-content"
      sx={{
        position: 'relative',
        display: 'flex',
        minHeight: '100dvh',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: 'visible',
        color: 'white',
        background:
          'radial-gradient(circle at 12% 12%, rgba(0, 219, 255, 0.14), transparent 28%), radial-gradient(circle at 88% 18%, rgba(246, 6, 111, 0.18), transparent 34%), linear-gradient(135deg, rgba(2, 8, 24, 0.98), rgba(8, 7, 27, 0.98), rgba(25, 7, 40, 0.98))',
      }}
    >
      {process.env.NEXT_PUBLIC_ADSENSE_CLIENT ? (
        <Script
          id="adsbygoogle-lib"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT}`}
          async
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      ) : null}

      {process.env.NEXT_PUBLIC_ADSENSE_CLIENT
        ? (['left', 'right'] as const).map((side) => (
            <Box
              key={side}
              component="ins"
              className="adsbygoogle"
              sx={{
                display: { xs: 'none', lg: 'block' },
                position: 'fixed',
                top: '50%',
                [side]: 0,
                transform: 'translateY(-50%)',
                width: 120,
                height: 600,
                zIndex: 40,
              }}
              data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT}
              data-ad-slot={process.env.NEXT_PUBLIC_ADSENSE_TECH_SIDEBAR_SLOT}
              data-ad-format="vertical"
              data-full-width-responsive="false"
              aria-hidden="true"
            />
          ))
        : null}

      <Box
        sx={{
          pointerEvents: 'none',
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          background:
            'linear-gradient(180deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.58))',
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 2 }}>
        <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />
      </Box>

      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          py: { xs: 6, md: 9, lg: 11 },
          overflow: 'visible',
        }}
      >
        <Container
          maxWidth={false}
          sx={{
            width: '100%',
            maxWidth: 1900,
            px: { xs: 2, sm: 3, md: 4, lg: 5 },
            overflow: 'visible',
          }}
        >
          <Box
            component="section"
            aria-labelledby="technology-title"
            sx={{
              mb: { xs: 7, md: 10, lg: 12 },
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  lg: 'minmax(0, 0.9fr) minmax(440px, 1.1fr)',
                },
                gap: { xs: 4, md: 6, lg: 9 },
                alignItems: 'center',
              }}
            >
              <Stack
                spacing={{ xs: 2.5, md: 3 }}
                sx={{
                  width: '100%',
                  maxWidth: { xs: '100%', lg: 860 },
                  alignItems: { xs: 'center', lg: 'flex-start' },
                  textAlign: { xs: 'center', lg: 'left' },
                }}
              >
                <Typography
                  component="p"
                  variant="overline"
                  sx={{
                    color: '#00dbc9',
                    fontWeight: 900,
                    letterSpacing: '0.14em',
                    lineHeight: 1.4,
                    textShadow: '0 0 16px rgba(0, 219, 201, 0.32)',
                  }}
                >
                  Platform Stack
                </Typography>

                <Typography
                  id="technology-title"
                  component="h1"
                  sx={{
                    color: '#F6066F',
                    fontFamily: '"Pinyon Script", cursive, sans-serif',
                    fontSize: {
                      xs: '3.4rem',
                      sm: '4.5rem',
                      md: '5.8rem',
                      lg: '6.6rem',
                    },
                    fontWeight: 700,
                    lineHeight: 0.9,
                    letterSpacing: '0.01em',
                    textShadow:
                      '0 0 18px rgba(246, 6, 111, 0.46), 0 0 42px rgba(140, 82, 255, 0.28)',
                  }}
                >
                  Technology
                </Typography>

                <Box
                  sx={{
                    width: '100%',
                    maxWidth: 860,
                    borderRadius: { xs: '1.15rem', md: '1.45rem' },
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background:
                      'linear-gradient(135deg, rgba(5, 7, 22, 0.42), rgba(18, 14, 42, 0.36), rgba(40, 12, 54, 0.3))',
                    boxShadow:
                      'inset 0 0 32px rgba(255, 255, 255, 0.025), 0 18px 48px rgba(0, 0, 0, 0.22)',
                    px: { xs: 2.5, sm: 3, md: 3.5 },
                    py: { xs: 2.5, md: 3 },
                    mt: { xs: 0.5, md: 1 },
                  }}
                >
                  <Typography
                    component="p"
                    sx={{
                      color: 'rgba(255, 255, 255, 0.86)',
                      fontSize: { xs: '1rem', md: '1.13rem', lg: '1.2rem' },
                      lineHeight: 1.85,
                      textShadow: '0 0 16px rgba(0, 0, 0, 0.65)',
                    }}
                  >
                    Helix AI is built on modern, battle-tested technologies
                    selected for performance, reliability, scalability,
                    security, observability, and long-term flexibility. The
                    stack supports a connected assistant platform that can
                    evolve across cloud, self-hosted, and air-gapped
                    environments while remaining fast, resilient, measurable,
                    and secure.
                  </Typography>
                </Box>

                <Grid
                  container
                  spacing={1.5}
                  sx={{
                    width: '100%',
                    maxWidth: 860,
                    pt: 1,
                  }}
                >
                  {[
                    ['Categories', groups.length, '#00dbc9'],
                    ['Technologies', totalItems, '#F6066F'],
                  ].map(([label, value, color]) => (
                    <Grid key={String(label)} size={{ xs: 12, sm: 6 }}>
                      <Box
                        sx={{
                          borderRadius: '1.1rem',
                          border: `1px solid ${String(color)}44`,
                          bgcolor: `${String(color)}12`,
                          px: 2,
                          py: 1.5,
                        }}
                      >
                        <Typography
                          component="p"
                          sx={{
                            color: String(color),
                            fontSize: '0.74rem',
                            fontWeight: 900,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {label}
                        </Typography>

                        <Typography
                          component="p"
                          sx={{
                            mt: 0.35,
                            color: 'rgba(255, 255, 255, 0.92)',
                            fontSize: { xs: '1.32rem', md: '1.55rem' },
                            fontWeight: 900,
                          }}
                        >
                          {value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Stack>

              <Box
                sx={{
                  width: '100%',
                  maxWidth: { xs: 760, md: 1050, lg: 1120, xl: 1240 },
                  mx: { xs: 'auto', lg: 0 },
                }}
              >
                <MediaImage
                  src={TECHNOLOGY_IMAGE_URL}
                  alt="Helix AI technology artwork showing modern systems, cloud infrastructure, security, and performance"
                  aspectRatio="16 / 9"
                  objectFit="contain"
                  objectPosition="center center"
                  priority
                  sizes="(max-width: 600px) 100vw, (max-width: 900px) 92vw, (max-width: 1200px) 88vw, 1240px"
                  rounded={false}
                  bordered={false}
                  elevated={false}
                  sx={{
                    width: '100%',
                    bgcolor: 'transparent',
                    border: 0,
                    boxShadow: 'none',
                    overflow: 'visible',

                    '& img': {
                      filter:
                        'drop-shadow(0 28px 80px rgba(0, 0, 0, 0.52)) drop-shadow(0 0 42px rgba(246, 6, 111, 0.2))',
                    },
                  }}
                />
              </Box>
            </Box>
          </Box>

          <Stack
            component="section"
            aria-labelledby="technology-groups-title"
            spacing={{ xs: 4, md: 5 }}
            sx={{
              overflow: 'visible',
            }}
          >
            <Stack
              spacing={1.5}
              sx={{
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <Typography
                component="p"
                variant="overline"
                sx={{
                  color: '#00dbc9',
                  fontWeight: 900,
                  letterSpacing: '0.14em',
                }}
              >
                Technical Foundation
              </Typography>

              <Typography
                id="technology-groups-title"
                component="h2"
                sx={{
                  color: '#F6066F',
                  fontFamily: '"Pinyon Script", cursive, sans-serif',
                  fontSize: { xs: '3rem', sm: '4rem', md: '5rem' },
                  fontWeight: 700,
                  lineHeight: 0.95,
                  textShadow:
                    '0 0 18px rgba(246, 6, 111, 0.42), 0 0 36px rgba(140, 82, 255, 0.22)',
                }}
              >
                Built With Purpose
              </Typography>

              <Typography
                component="p"
                sx={{
                  maxWidth: 980,
                  color: 'rgba(255, 255, 255, 0.76)',
                  fontSize: { xs: '0.98rem', md: '1.08rem' },
                  lineHeight: 1.75,
                }}
              >
                Each category displays individual tools as their own cards,
                sorted alphabetically and written with detailed descriptions so
                the stack is easier to scan, compare, and expand as Helix AI
                grows.
              </Typography>
            </Stack>

            {groups.map((group) => (
              <Box
                key={group.key}
                id={`technology-${group.key}`}
                component="section"
                aria-labelledby={`technology-group-${group.key}`}
                sx={{
                  position: 'relative',
                  overflow: 'visible',
                  minHeight: { lg: 'calc(100dvh - 96px)' },
                  scrollMarginTop: { xs: 96, lg: 128 },
                  borderRadius: { xs: '1.35rem', md: '1.85rem' },
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background:
                    'linear-gradient(135deg, rgba(5, 7, 22, 0.5), rgba(18, 14, 42, 0.36), rgba(40, 12, 54, 0.26))',
                  boxShadow:
                    '0 18px 60px rgba(0, 0, 0, 0.26), inset 0 0 38px rgba(255, 255, 255, 0.018)',
                  px: { xs: 2, sm: 2.5, md: 3 },
                  py: { xs: 3.25, md: 4 },

                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                    background:
                      'radial-gradient(circle at 8% 0%, rgba(0, 219, 201, 0.08), transparent 30%), radial-gradient(circle at 92% 18%, rgba(246, 6, 111, 0.1), transparent 34%)',
                  },
                }}
              >
                <Box
                  sx={{
                    position: 'relative',
                    zIndex: 1,
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      lg: 'minmax(280px, 0.28fr) minmax(0, 1fr)',
                    },
                    gap: { xs: 2.75, md: 3.5, lg: 4 },
                    alignItems: 'start',
                    overflow: 'visible',
                  }}
                >
                  <Box
                    sx={{
                      position: { xs: 'relative', lg: 'sticky' },
                      top: { lg: 112 },
                      alignSelf: 'start',
                      zIndex: 3,
                      py: { lg: 1 },
                    }}
                  >
                    <Stack
                      spacing={1.4}
                      sx={{
                        alignItems: { xs: 'center', lg: 'flex-start' },
                        textAlign: { xs: 'center', lg: 'left' },
                        borderRadius: { xs: '1rem', lg: '1.25rem' },
                        border: {
                          xs: '1px solid rgba(255, 255, 255, 0.08)',
                          lg: '1px solid rgba(246, 6, 111, 0.16)',
                        },
                        background: {
                          xs: 'rgba(255, 255, 255, 0.025)',
                          lg: 'linear-gradient(135deg, rgba(5, 10, 30, 0.72), rgba(26, 12, 42, 0.58))',
                        },
                        boxShadow: {
                          xs: 'none',
                          lg: '0 18px 46px rgba(0, 0, 0, 0.24), inset 0 0 28px rgba(246, 6, 111, 0.035)',
                        },
                        px: { xs: 2, lg: 2.5 },
                        py: { xs: 2, lg: 2.5 },
                      }}
                    >
                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 999,
                          border: '1px solid rgba(0, 219, 201, 0.24)',
                          bgcolor: 'rgba(0, 219, 201, 0.07)',
                          color: '#00dbc9',
                          fontSize: '0.72rem',
                          fontWeight: 900,
                          letterSpacing: '0.14em',
                          lineHeight: 1,
                          px: 1.35,
                          py: 0.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        {group.items.length} tools
                      </Box>

                      <Typography
                        id={`technology-group-${group.key}`}
                        component="h3"
                        sx={{
                          color: '#F6066F',
                          fontSize: {
                            xs: '2rem',
                            sm: '2.4rem',
                            md: '2.85rem',
                          },
                          lineHeight: 1,
                          fontWeight: 900,
                          letterSpacing: '-0.04em',
                          textShadow: '0 0 18px rgba(246, 6, 111, 0.34)',
                        }}
                      >
                        {group.title}
                      </Typography>

                      <Typography
                        component="p"
                        sx={{
                          maxWidth: { xs: 780, lg: 340 },
                          color: 'rgba(255, 255, 255, 0.72)',
                          fontSize: { xs: '0.96rem', md: '1rem' },
                          lineHeight: 1.7,
                        }}
                      >
                        {group.description}
                      </Typography>
                    </Stack>
                  </Box>

                  <Grid
                    container
                    spacing={{ xs: 2.25, md: 2.5 }}
                    sx={{
                      width: '100%',
                      alignItems: 'stretch',
                      justifyContent: 'center',
                      overflow: 'visible',
                    }}
                  >
                    {group.items.map((item, index) => (
                      <Grid
                        key={item.id}
                        size={{ xs: 12, sm: 6, lg: 4, xl: 3 }}
                        sx={{
                          display: 'flex',
                          justifyContent: 'center',
                        }}
                      >
                        <TechnologyItemCardView item={item} index={index} />
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </Box>
            ))}
          </Stack>
        </Container>
      </Box>

      <Box sx={{ position: 'relative', zIndex: 2 }}>
        <Footer {...footerProps} />
      </Box>
    </Box>
  );
}
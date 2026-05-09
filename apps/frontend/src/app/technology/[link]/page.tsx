'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Box, Button, Container, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';

import { Header } from '@helix-ai/ui';
import type { CardProps, ListItemProps } from '@helix-ai/ui';
import { headerProps } from '../../../content/header';
import * as technology from '../../../content/technology';

const HEADER_HEIGHT = 92;

function norm(path: string) {
  const p = path?.startsWith('/') ? path : `/${path ?? ''}`;
  return p.toLowerCase();
}

function getAllCards(): CardProps[] {
  return (Object.values(technology).flat() as CardProps[]).filter(Boolean);
}

function TechnologyListCard({ item }: { item: ListItemProps }) {
  return (
    <Box
      component="article"
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        minHeight: { xs: 'auto', md: 320 },
        px: { xs: 2.5, sm: 3, md: 3.5 },
        py: { xs: 3, md: 3.5 },
        borderRadius: { xs: '1.25rem', md: '1.5rem' },
        overflow: 'hidden',
        background:
          'linear-gradient(135deg, rgba(5, 7, 22, 0.86), rgba(13, 10, 34, 0.74), rgba(35, 12, 50, 0.62))',
        border: '1px solid rgba(246, 6, 111, 0.24)',
        boxShadow:
          '0 22px 60px rgba(0, 0, 0, 0.36), 0 0 30px rgba(2, 35, 113, 0.16), inset 0 0 38px rgba(246, 6, 111, 0.045)',
        backdropFilter: 'blur(18px) saturate(145%)',
        WebkitBackdropFilter: 'blur(18px) saturate(145%)',
        transition:
          'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, background 220ms ease',

        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 50% 0%, rgba(246, 6, 111, 0.14), transparent 34%), radial-gradient(circle at 80% 100%, rgba(2, 35, 113, 0.2), transparent 40%)',
          opacity: 0.9,
          transition: 'opacity 220ms ease',
        },

        '&::after': {
          content: '""',
          position: 'absolute',
          inset: -2,
          pointerEvents: 'none',
          borderRadius: 'inherit',
          background:
            'linear-gradient(135deg, rgba(246, 6, 111, 0.18), transparent 32%, rgba(124, 58, 237, 0.16), transparent 72%, rgba(2, 35, 113, 0.22))',
          opacity: 0,
          transition: 'opacity 220ms ease',
        },

        '&:hover': {
          transform: 'translateY(-5px)',
          borderColor: 'rgba(246, 6, 111, 0.72)',
          background:
            'linear-gradient(135deg, rgba(8, 8, 28, 0.92), rgba(29, 14, 54, 0.82), rgba(55, 13, 70, 0.7))',
          boxShadow:
            '0 30px 80px rgba(0, 0, 0, 0.5), 0 0 18px rgba(255, 255, 255, 0.08), 0 0 42px rgba(246, 6, 111, 0.38), 0 0 78px rgba(124, 58, 237, 0.26), 0 0 96px rgba(2, 35, 113, 0.28), inset 0 0 52px rgba(246, 6, 111, 0.09)',
        },

        '&:hover::before': {
          opacity: 1,
        },

        '&:hover::after': {
          opacity: 1,
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          gap: 2.25,
        }}
      >
        <Typography
          component="h2"
          sx={{
            color: '#F6066F',
            fontSize: { xs: '1.35rem', md: '1.55rem' },
            lineHeight: 1.2,
            fontWeight: 800,
            textAlign: 'center',
            letterSpacing: '0.01em',
            textShadow:
              '0 0 14px rgba(246, 6, 111, 0.44), 0 0 24px rgba(140, 82, 255, 0.22)',
          }}
        >
          {item.text}
        </Typography>

        <Box
          sx={{
            width: '100%',
            flex: 1,
            px: { xs: 2, md: 2.5 },
            py: { xs: 2.25, md: 2.5 },
            borderRadius: { xs: '1.25rem', md: '1.75rem' },
            backgroundColor: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(246, 6, 111, 0.14)',
            boxShadow: 'inset 0 0 28px rgba(255, 255, 255, 0.025)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography
            component="p"
            sx={{
              color: 'rgba(255, 255, 255, 0.78)',
              fontSize: {
                xs: '0.95rem',
                md: '0.98rem',
                lg: '0.95rem',
                xl: '1rem',
              },
              lineHeight: 1.65,
              textAlign: 'center',
              textWrap: 'pretty',
            }}
          >
            {item.detailedDescription}
          </Typography>
        </Box>

        {item.href ? (
          <Button
            component="a"
            href={item.href}
            sx={{
              mt: 'auto',
              px: 3,
              py: 1,
              minWidth: 150,
              borderRadius: 999,
              color: '#ffffff',
              background:
                'linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'none',
              boxShadow:
                '0 0 18px rgba(2, 35, 113, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)',
              transition:
                'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease',

              '&:hover': {
                color: '#ffffff',
                background:
                  'linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)',
                borderColor: 'rgba(255, 255, 255, 0.45)',
                boxShadow:
                  '0 0 18px rgba(255, 255, 255, 0.16), 0 0 34px rgba(246, 6, 111, 0.76), 0 0 54px rgba(124, 58, 237, 0.52), 0 0 72px rgba(2, 35, 113, 0.42), 0 16px 36px rgba(0, 0, 0, 0.42)',
                transform: 'translateY(-2px) scale(1.04)',
              },

              '&:active': {
                transform: 'translateY(0) scale(0.99)',
                boxShadow:
                  '0 0 18px rgba(246, 6, 111, 0.52), 0 10px 24px rgba(0, 0, 0, 0.35)',
              },
            }}
          >
            Learn more
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}

function NotFoundPage({ slug }: { slug: string }) {
  return (
    <Box
      component="main"
      sx={{
        position: 'relative',
        minHeight: '100vh',
        pt: `${HEADER_HEIGHT}px`,
        color: '#fff',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at top center, rgba(246, 6, 111, 0.18), transparent 34%), linear-gradient(180deg, #060014 0%, #050018 45%, #02000b 100%)',
      }}
    >
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          height: HEADER_HEIGHT,
          background:
            'linear-gradient(90deg, rgba(210, 0, 110, 0.92), rgba(20, 32, 130, 0.92))',
          borderBottom: '1px solid rgba(255,255,255,0.14)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />
      </Box>

      <Container
        maxWidth="md"
        sx={{
          position: 'relative',
          zIndex: 1,
          py: { xs: 8, md: 12 },
          textAlign: 'center',
        }}
      >
        <Typography
          component="h1"
          sx={{
            mb: 2,
            fontSize: { xs: '2rem', md: '3rem' },
            fontWeight: 900,
            textShadow: '0 0 28px rgba(246, 6, 111, 0.34)',
          }}
        >
          Page not found
        </Typography>

        <Typography
          sx={{
            mb: 4,
            color: 'rgba(255,255,255,0.76)',
            fontSize: '1.1rem',
            lineHeight: 1.7,
          }}
        >
          We couldn&apos;t find a technology matching{' '}
          <Box component="strong" sx={{ color: '#F6066F' }}>
            {slug}
          </Box>
          .
        </Typography>

        <Button
          component="a"
          href="/technology"
          sx={{
            px: 4,
            py: 1.25,
            borderRadius: 999,
            color: '#ffffff',
            background:
              'linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            fontWeight: 800,
            textTransform: 'none',
            boxShadow:
              '0 0 18px rgba(2, 35, 113, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)',

            '&:hover': {
              color: '#ffffff',
              background:
                'linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)',
              borderColor: 'rgba(255, 255, 255, 0.45)',
              boxShadow:
                '0 0 34px rgba(246, 6, 111, 0.76), 0 0 54px rgba(124, 58, 237, 0.52), 0 0 72px rgba(2, 35, 113, 0.42)',
            },
          }}
        >
          Back to Technologies
        </Button>
      </Container>
    </Box>
  );
}

export default function Page() {
  const params = useParams<{ link: string }>();
  const link = params?.link ?? '';
  const slug = decodeURIComponent(link);
  const target = norm(`/technology/${slug}`);

  const allCards = React.useMemo(() => getAllCards(), []);
  const matchedCard = allCards.find((card) => norm(card.link ?? '') === target);

  if (!matchedCard) {
    return <NotFoundPage slug={slug} />;
  }

  const { title, description, listItems } = matchedCard;
  const items = (listItems as ListItemProps[] | undefined) ?? [];

  return (
    <Box
      component="main"
      sx={{
        position: 'relative',
        minHeight: '100vh',
        pt: `${HEADER_HEIGHT}px`,
        color: '#fff',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at top center, rgba(246, 6, 111, 0.18), transparent 34%), linear-gradient(180deg, #060014 0%, #050018 45%, #02000b 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: 'url("/images/backgrounds/technology-bg.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.34,
          zIndex: 0,
        }}
      />

      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          height: HEADER_HEIGHT,
          background:
            'linear-gradient(90deg, rgba(210, 0, 110, 0.92), rgba(20, 32, 130, 0.92))',
          borderBottom: '1px solid rgba(255,255,255,0.14)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />
      </Box>

      <Container
        component="section"
        maxWidth={false}
        sx={{
          position: 'relative',
          zIndex: 1,
          mx: 'auto',
          maxWidth: 1560,
          px: { xs: 2, sm: 3, lg: 4 },
          py: { xs: 6, md: 8 },
        }}
      >
        <Box
          sx={{
            mb: { xs: 5, md: 7 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: { xs: 2, md: 3 },
            textAlign: 'center',
          }}
        >
          <Typography
            component="h1"
            sx={{
              color: '#F6066F',
              fontSize: {
                xs: '2.75rem',
                sm: '3.5rem',
                md: '4.75rem',
                lg: '5.5rem',
              },
              lineHeight: 0.98,
              fontWeight: 700,
              fontFamily: '"Pinyon Script", cursive, sans-serif',
              letterSpacing: '0.01em',
              textShadow:
                '0 0 18px rgba(246, 6, 111, 0.42), 0 0 36px rgba(140, 82, 255, 0.28)',
            }}
          >
            {title}
          </Typography>

          {description ? (
            <Typography
              component="p"
              sx={{
                mx: 'auto',
                maxWidth: { xs: '100', sm: 760, md: 1120, lg: 1240 },
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: { xs: '1rem', md: '1.2rem', lg: '1.28rem' },
                lineHeight: 1.8,
                textAlign: 'center',
                textShadow: '0 0 16px rgba(0, 0, 0, 0.65)',
              }}
            >
              {description}
            </Typography>
          ) : null}
        </Box>

        <Grid
          container
          spacing={{ xs: 3, md: 4 }}
          sx={{
            alignItems: 'stretch',
            justifyContent: 'center',
          }}
        >
          {items.map((item, idx) => (
            <Grid
              key={`${item.href ?? item.text}-${idx}`}
              size={{ xs: 12, md: 6, lg: 4 }}
              sx={{
                display: 'flex',
              }}
            >
              <TechnologyListCard item={item} />
            </Grid>
          ))}
        </Grid>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            mt: { xs: 5, md: 7 },
          }}
        >
          <Button
            component="a"
            href="/technology"
            sx={{
              px: 4,
              py: 1.25,
              minWidth: 190,
              borderRadius: 999,
              color: '#ffffff',
              background:
                'linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'none',
              boxShadow:
                '0 0 18px rgba(2, 35, 113, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)',
              transition:
                'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease',

              '&:hover': {
                color: '#ffffff',
                background:
                  'linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)',
                borderColor: 'rgba(255, 255, 255, 0.45)',
                boxShadow:
                  '0 0 18px rgba(255, 255, 255, 0.16), 0 0 34px rgba(246, 6, 111, 0.76), 0 0 54px rgba(124, 58, 237, 0.52), 0 0 72px rgba(2, 35, 113, 0.42), 0 16px 36px rgba(0, 0, 0, 0.42)',
                transform: 'translateY(-2px) scale(1.04)',
              },

              '&:active': {
                transform: 'translateY(0) scale(0.99)',
                boxShadow:
                  '0 0 18px rgba(246, 6, 111, 0.52), 0 10px 24px rgba(0, 0, 0, 0.35)',
              },
            }}
          >
            Back to Technologies
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
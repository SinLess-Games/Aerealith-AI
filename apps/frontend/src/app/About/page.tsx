'use client';

// apps/frontend/src/app/About/page.tsx

import React from 'react';

import { Box, Container, Grid, Stack, Typography } from '@mui/material';

import { Footer, Header, MediaImage } from '@helix-ai/ui';

import {
  AboutContent,
  AboutDescription,
  AboutHeader,
  footerProps,
  headerProps,
} from '@helix-ai/content';

type AboutSection = {
  readonly title: string;
  readonly icon?: React.ReactNode;
  readonly paragraphs: React.ReactNode | readonly React.ReactNode[];
};

const ABOUT_IMAGE_URL = '/images/about-us.png';

const ORDER_MAP: Record<string, number> = {
  'Who We Are': 1,
  'Our Mission': 2,
  'Our Story': 3,
  'Meet the Team': 4,
};

function normalizeParagraphs(
  paragraphs: React.ReactNode | readonly React.ReactNode[],
): readonly React.ReactNode[] {
  return Array.isArray(paragraphs) ? paragraphs : [paragraphs];
}

function sortSections(sections: readonly AboutSection[]): AboutSection[] {
  return [...sections].sort((a, b) => {
    const aOrder = ORDER_MAP[a.title] ?? 999;
    const bOrder = ORDER_MAP[b.title] ?? 999;

    return aOrder - bOrder;
  });
}

export default function AboutPage() {
  const sections = sortSections(
    (AboutContent ?? []) as unknown as readonly AboutSection[],
  );

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        minHeight: '100dvh',
        flexDirection: 'column',
        overflow: 'hidden',
        color: 'white',
        background:
          'radial-gradient(circle at 12% 12%, rgba(0, 219, 255, 0.14), transparent 28%), radial-gradient(circle at 88% 18%, rgba(246, 6, 111, 0.18), transparent 34%), linear-gradient(135deg, rgba(2, 8, 24, 0.98), rgba(8, 7, 27, 0.98), rgba(25, 7, 40, 0.98))',
      }}
    >
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
        }}
      >
        <Container
          maxWidth={false}
          sx={{
            width: '100%',
            maxWidth: 1900,
            px: { xs: 2, sm: 3, md: 4, lg: 5 },
          }}
        >
          <Box
            component="section"
            aria-labelledby="about-helix-title"
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
                alignItems: 'start',
              }}
            >
              <Stack
                spacing={{ xs: 2.5, md: 3 }}
                sx={{
                  width: '100%',
                  maxWidth: { xs: '100%', lg: 820 },
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
                  About the Platform
                </Typography>

                <Typography
                  id="about-helix-title"
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
                  {AboutHeader ?? 'About Helix AI'}
                </Typography>

                <Box
                  sx={{
                    width: '100%',
                    maxWidth: 840,
                    borderRadius: { xs: '1.15rem', md: '1.45rem' },
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
                    {AboutDescription}
                  </Typography>
                </Box>
              </Stack>

              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: { xs: 760, md: 1050, lg: 1120, xl: 1240 },
                  mx: { xs: 'auto', lg: 0 },
                  mt: {
                    xs: 0,
                    lg: 'clamp(9.75rem, 10vw, 12.5rem)',
                    xl: 'clamp(10.5rem, 9vw, 13rem)',
                  },
                  overflow: 'visible',
                }}
              >
                <MediaImage
                  src={ABOUT_IMAGE_URL}
                  alt="Helix AI about artwork"
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

          <Box
            component="section"
            aria-labelledby="about-sections-title"
            sx={{
              mb: { xs: 2, md: 4 },
            }}
          >
            <Stack
              spacing={1.5}
              sx={{
                alignItems: 'center',
                textAlign: 'center',
                mb: { xs: 4, md: 5 },
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
                What We Are Building
              </Typography>

              <Typography
                id="about-sections-title"
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
                The Helix AI Vision
              </Typography>
            </Stack>

            <Grid
              container
              spacing={{ xs: 3, md: 4 }}
              sx={{
                alignItems: 'stretch',
                justifyContent: 'center',
              }}
            >
              {sections.map((section, index) => {
                const paragraphs = normalizeParagraphs(section.paragraphs);
                const isLastOddCard =
                  sections.length % 2 === 1 && index === sections.length - 1;

                return (
                  <Grid
                    key={section.title}
                    size={{ xs: 12, lg: 6 }}
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      ...(isLastOddCard
                        ? {
                            mx: { lg: 'auto' },
                          }
                        : {}),
                    }}
                  >
                    <Box
                      component="article"
                      sx={{
                        position: 'relative',
                        display: 'flex',
                        width: '100%',
                        maxWidth: { xs: '100%', lg: 900 },
                        minHeight: { xs: 'auto', md: 360, lg: 390 },
                        flexDirection: 'column',
                        overflow: 'hidden',
                        borderRadius: { xs: '1.25rem', md: '1.75rem' },
                        border: '1px solid rgba(246, 6, 111, 0.26)',
                        background:
                          'linear-gradient(135deg, rgba(5, 7, 22, 0.9), rgba(13, 10, 34, 0.78), rgba(35, 12, 50, 0.66))',
                        boxShadow:
                          '0 24px 70px rgba(0, 0, 0, 0.38), 0 0 30px rgba(2, 35, 113, 0.16), inset 0 0 38px rgba(246, 6, 111, 0.045)',
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
                            'radial-gradient(circle at 16% 0%, rgba(246, 6, 111, 0.16), transparent 34%), radial-gradient(circle at 92% 100%, rgba(2, 35, 113, 0.24), transparent 42%)',
                          opacity: 0.9,
                          transition: 'opacity 220ms ease',
                        },

                        '&:hover': {
                          transform: 'translateY(-5px)',
                          borderColor: 'rgba(246, 6, 111, 0.74)',
                          background:
                            'linear-gradient(135deg, rgba(8, 8, 28, 0.94), rgba(29, 14, 54, 0.84), rgba(55, 13, 70, 0.72))',
                          boxShadow:
                            '0 34px 90px rgba(0, 0, 0, 0.52), 0 0 42px rgba(246, 6, 111, 0.36), 0 0 82px rgba(124, 58, 237, 0.24), inset 0 0 52px rgba(246, 6, 111, 0.09)',
                        },
                      }}
                    >
                      <Stack
                        spacing={2.25}
                        sx={{
                          position: 'relative',
                          zIndex: 1,
                          height: '100%',
                          p: { xs: 3, sm: 3.5, md: 4 },
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={2}
                          sx={{
                            alignItems: 'center',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'grid',
                              width: 48,
                              height: 48,
                              flex: '0 0 auto',
                              placeItems: 'center',
                              borderRadius: '1rem',
                              border: '1px solid rgba(0, 219, 201, 0.28)',
                              bgcolor: 'rgba(0, 219, 201, 0.08)',
                              boxShadow:
                                '0 0 24px rgba(0, 219, 201, 0.16)',
                              fontSize: '1.45rem',
                            }}
                          >
                            {section.icon ?? index + 1}
                          </Box>

                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              component="p"
                              variant="overline"
                              sx={{
                                color: 'rgba(0, 219, 201, 0.86)',
                                fontWeight: 900,
                                letterSpacing: '0.13em',
                                lineHeight: 1.2,
                              }}
                            >
                              Section {index + 1}
                            </Typography>

                            <Typography
                              component="h3"
                              sx={{
                                color: '#F6066F',
                                fontSize: {
                                  xs: '1.55rem',
                                  md: '1.85rem',
                                },
                                lineHeight: 1.12,
                                fontWeight: 900,
                                letterSpacing: '-0.025em',
                                textShadow:
                                  '0 0 14px rgba(246, 6, 111, 0.42)',
                              }}
                            >
                              {section.title}
                            </Typography>
                          </Box>
                        </Stack>

                        <Stack
                          spacing={1.65}
                          sx={{
                            flex: 1,
                            borderRadius: { xs: '1.1rem', md: '1.45rem' },
                            border: '1px solid rgba(255, 255, 255, 0.09)',
                            bgcolor: 'rgba(255, 255, 255, 0.035)',
                            boxShadow:
                              'inset 0 0 28px rgba(255, 255, 255, 0.022)',
                            px: { xs: 2.25, md: 2.75 },
                            py: { xs: 2.25, md: 2.75 },
                          }}
                        >
                          {paragraphs.map((paragraph, paragraphIndex) => (
                            <Typography
                              key={`${section.title}-paragraph-${paragraphIndex}`}
                              component="p"
                              sx={{
                                color: 'rgba(255, 255, 255, 0.78)',
                                fontSize: {
                                  xs: '0.95rem',
                                  sm: '0.99rem',
                                  md: '1.02rem',
                                },
                                lineHeight: { xs: 1.68, md: 1.74 },
                              }}
                            >
                              {paragraph}
                            </Typography>
                          ))}
                        </Stack>
                      </Stack>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </Container>
      </Box>

      <Box sx={{ position: 'relative', zIndex: 2 }}>
        <Footer {...footerProps} />
      </Box>
    </Box>
  );
}
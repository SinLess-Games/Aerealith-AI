'use client';

// apps/frontend/src/app/Contact/page.tsx

import React from 'react';

import { Box, Button, Container, Grid, Stack, Typography } from '@mui/material';

import { Footer, Header, MediaImage } from '@aerealith-ai/ui';

import {
  CONTACT_OPTIONS,
  ContactDescription,
  ContactImage,
  ContactHeader,
  footerProps,
  headerProps,
} from '@aerealith-ai/content';

type ContactOption = {
  readonly title: React.ReactNode;
  readonly description: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly image?: string;
  readonly link?: string;
  readonly buttonText?: string;
};


const DEFAULT_CONTACT_HEADER = 'Contact Helix AI';

const DEFAULT_CONTACT_DESCRIPTION =
  'Have a question, idea, bug report, or support request? Use the options below to connect with the Helix AI team, join the community, share feedback, request features, report issues, or follow the public build on Patreon. Every message helps improve the platform, refine the roadmap, and make Helix AI more useful, secure, and user-focused.';

const FALLBACK_CONTACT_ANCHOR = '#contact-options';

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//');
}

function getLinkTargetProps(href: string): {
  target?: '_blank';
  rel?: string;
} {
  return isExternalHref(href)
    ? {
        target: '_blank',
        rel: 'noopener noreferrer',
      }
    : {};
}

function getOptionTitle(option: ContactOption, index: number): string {
  return typeof option.title === 'string'
    ? option.title
    : `Contact Option ${index + 1}`;
}

export default function ContactPage() {
  const contactOptions = (CONTACT_OPTIONS ?? []) as readonly ContactOption[];
  const pageTitle = ContactHeader ?? DEFAULT_CONTACT_HEADER;
  const pageDescription = ContactDescription ?? DEFAULT_CONTACT_DESCRIPTION;

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
            aria-labelledby="contact-helix-title"
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
                  Contact
                </Typography>

                <Typography
                  id="contact-helix-title"
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
                  {pageTitle}
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
                    {pageDescription}
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
                  src={ContactImage}
                  alt="Helix AI contact artwork"
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
            id="contact-options"
            component="section"
            aria-labelledby="contact-options-title"
            sx={{
              mb: { xs: 2, md: 4 },
              scrollMarginTop: 120,
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
                Connect With Helix AI
              </Typography>

              <Typography
                id="contact-options-title"
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
                Ways To Reach Us
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
              {contactOptions.map((option, index) => {
                const optionTitle = getOptionTitle(option, index);
                const buttonHref = option.link || FALLBACK_CONTACT_ANCHOR;
                const buttonText = option.buttonText || `Open ${optionTitle}`;
                const isLastOddCard =
                  contactOptions.length % 2 === 1 &&
                  index === contactOptions.length - 1;

                return (
                  <Grid
                    key={`${optionTitle}-${index}`}
                    size={{ xs: 12, md: 6, lg: 4 }}
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
                        minHeight: { xs: 'auto', md: 520 },
                        flexDirection: 'column',
                        alignItems: 'center',
                        overflow: 'hidden',
                        borderRadius: { xs: '1.25rem', md: '1.5rem' },
                        border: '1px solid rgba(246, 6, 111, 0.24)',
                        background:
                          'linear-gradient(135deg, rgba(5, 7, 22, 0.86), rgba(13, 10, 34, 0.74), rgba(35, 12, 50, 0.62))',
                        boxShadow:
                          '0 22px 60px rgba(0, 0, 0, 0.36), 0 0 30px rgba(2, 35, 113, 0.16), inset 0 0 38px rgba(246, 6, 111, 0.045)',
                        backdropFilter: 'blur(18px) saturate(145%)',
                        WebkitBackdropFilter: 'blur(18px) saturate(145%)',
                        px: { xs: 2.5, sm: 3, md: 3.5 },
                        py: { xs: 3, md: 3.5 },
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

                        '&:hover .contact-card-image img': {
                          transform: 'scale(1.04)',
                          filter:
                            'drop-shadow(0 0 24px rgba(246, 6, 111, 0.42)) drop-shadow(0 0 34px rgba(124, 58, 237, 0.32))',
                        },
                      }}
                    >
                      <Stack
                        spacing={2.25}
                        sx={{
                          position: 'relative',
                          zIndex: 1,
                          width: '100%',
                          height: '100%',
                          alignItems: 'center',
                        }}
                      >
                        <Typography
                          component="h3"
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
                          {option.title}
                        </Typography>

                        {option.image ? (
                          <Box
                            className="contact-card-image"
                            sx={{
                              width: '100%',
                              maxWidth: { xs: 300, sm: 330, md: 350 },
                              mx: 'auto',
                              flexShrink: 0,
                              overflow: 'visible',
                              filter:
                                'drop-shadow(0 0 18px rgba(2, 35, 113, 0.36)) drop-shadow(0 0 26px rgba(246, 6, 111, 0.24))',
                            }}
                          >
                            <MediaImage
                              src={option.image}
                              alt={`${optionTitle} artwork`}
                              aspectRatio="1 / 1"
                              objectFit="contain"
                              objectPosition="center center"
                              sizes="(max-width: 600px) 300px, (max-width: 900px) 330px, 350px"
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
                                  transition:
                                    'transform 220ms ease, filter 220ms ease',
                                },
                              }}
                            />
                          </Box>
                        ) : option.icon ? (
                          <Box
                            sx={{
                              display: 'grid',
                              width: 96,
                              height: 96,
                              flex: '0 0 auto',
                              placeItems: 'center',
                              borderRadius: '1.5rem',
                              border: '1px solid rgba(0, 219, 201, 0.28)',
                              bgcolor: 'rgba(0, 219, 201, 0.08)',
                              boxShadow: '0 0 24px rgba(0, 219, 201, 0.16)',
                              fontSize: '2.6rem',
                            }}
                          >
                            {option.icon}
                          </Box>
                        ) : null}

                        <Box
                          sx={{
                            width: '100%',
                            flex: 1,
                            borderRadius: { xs: '1.25rem', md: '1.75rem' },
                            border: '1px solid rgba(246, 6, 111, 0.14)',
                            backgroundColor: 'rgba(255, 255, 255, 0.035)',
                            boxShadow:
                              'inset 0 0 28px rgba(255, 255, 255, 0.025)',
                            px: { xs: 2, md: 2.5 },
                            py: { xs: 2.25, md: 2.5 },
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
                            {option.description}
                          </Typography>
                        </Box>

                        <Button
                          component="a"
                          href={buttonHref}
                          {...getLinkTargetProps(buttonHref)}
                          sx={{
                            mt: 'auto',
                            minWidth: 150,
                            borderRadius: 999,
                            border: '1px solid rgba(255, 255, 255, 0.22)',
                            background:
                              'linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)',
                            boxShadow:
                              '0 0 18px rgba(246, 6, 111, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)',
                            color: '#ffffff',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textTransform: 'none',
                            px: 3,
                            py: 1,
                            transition:
                              'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease',

                            '&:hover': {
                              color: '#ffffff',
                              background:
                                'linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)',
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
                          {buttonText}
                        </Button>
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
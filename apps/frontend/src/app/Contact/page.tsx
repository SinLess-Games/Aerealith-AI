'use client';

import { Box, Button, Container, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import Image from 'next/image';

import { Header } from '@helix-ai/ui';

import { CONTACT_OPTIONS } from '../../content/contact';
import { headerProps } from '../../content/header';

const CONTACT_IMAGE_URL = '/images/contact-us.png';

export default function ContactPage() {
  return (
    <Box
      component="div"
      sx={{
        position: 'relative',
        minHeight: '100vh',
        color: 'white',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 2 }}>
        <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />

        <Container
          component="main"
          maxWidth={false}
          sx={{
            mx: 'auto',
            maxWidth: 1560,
            px: { xs: 2, sm: 3, lg: 4 },
            pt: { xs: 7, md: 9 },
            pb: { xs: 10, md: 14 },
          }}
        >
          <Box
            component="section"
            sx={{
              mb: { xs: 5, md: 7 },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: { xs: 3, md: 4 },
            }}
          >
            <Typography
              component="h1"
              sx={{
                textAlign: 'center',
                fontSize: {
                  xs: '3rem',
                  sm: '4rem',
                  md: '5.25rem',
                  lg: '6rem',
                },
                lineHeight: 0.95,
                fontWeight: 700,
                fontFamily: '"Pinyon Script", cursive, sans-serif',
                letterSpacing: '0.01em',
                color: '#F6066F',
                textShadow:
                  '0 0 18px rgba(246, 6, 111, 0.42), 0 0 36px rgba(140, 82, 255, 0.28)',
              }}
            >
              Contact Helix AI
            </Typography>

            <Box
              sx={{
                position: 'relative',
                width: '100%',
                maxWidth: { xs: 560, sm: 760, md: 1050, lg: 1200, xl: 1320 },
                aspectRatio: '16 / 9',
                borderRadius: { xs: '1rem', md: '1.35rem' },
                overflow: 'hidden',
                background:
                  'linear-gradient(135deg, rgba(2, 35, 113, 0.22), rgba(246, 6, 111, 0.16))',
                border: '3px solid rgba(246, 6, 111, 0.42)',
                boxShadow:
                  '0 0 0 1px rgba(255, 255, 255, 0.1), 0 22px 60px rgba(0, 0, 0, 0.42), 0 0 52px rgba(246, 6, 111, 0.24), 0 0 68px rgba(2, 35, 113, 0.34)',
                transform: 'translateZ(0)',

                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  borderRadius: 'inherit',
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 26%, transparent 76%, rgba(246, 6, 111, 0.1))',
                  opacity: 0.5,
                },
              }}
            >
              <Image
                src={CONTACT_IMAGE_URL}
                alt="Helix AI contact options showing Discord, email, and Patreon"
                fill
                priority
                sizes="(max-width: 600px) 100vw, (max-width: 900px) 92vw, (max-width: 1200px) 88vw, 1320px"
                style={{
                  objectFit: 'contain',
                  objectPosition: 'center center',
                }}
              />
            </Box>

            <Typography
              component="p"
              sx={{
                mx: 'auto',
                maxWidth: { xs: '100%', sm: 760, md: 1120, lg: 1240 },
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: { xs: '1rem', md: '1.2rem', lg: '1.28rem' },
                lineHeight: 1.8,
                textAlign: 'center',
                textShadow: '0 0 16px rgba(0, 0, 0, 0.65)',
              }}
            >
              Connect with Helix AI through the channels below for community
              updates, technical support, project feedback, feature requests,
              collaboration opportunities, and future launch announcements.
              Whether you want to follow development progress, ask a question,
              report an issue, suggest an integration, support the project, or
              share ideas that could help shape the future of the platform, this
              is the best place to reach us. Helix AI is being built around real
              users, real workflows, and real-world problems, so your feedback
              helps guide what we improve, prioritize, and build next.
            </Typography>
          </Box>

          <Grid
            container
            spacing={{ xs: 3, md: 4 }}
            sx={{
              alignItems: 'stretch',
              justifyContent: 'center',
            }}
          >
            {CONTACT_OPTIONS.map((option) => (
              <Grid
                key={option.title}
                size={{ xs: 12, md: 6, lg: 4 }}
                sx={{
                  display: 'flex',
                }}
              >
                <Box
                  component="article"
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '100%',
                    minHeight: { xs: 'auto', md: 520 },
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

                    '&:hover img': {
                      transform: 'scale(1.04)',
                      filter:
                        'drop-shadow(0 0 24px rgba(246, 6, 111, 0.42)) drop-shadow(0 0 34px rgba(124, 58, 237, 0.32))',
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
                      {option.title}
                    </Typography>

                    {option.image ? (
                      <Box
                        sx={{
                          position: 'relative',
                          width: '100%',
                          maxWidth: { xs: 300, sm: 330, md: 350 },
                          aspectRatio: '1 / 1',
                          mx: 'auto',
                          flexShrink: 0,
                          overflow: 'visible',
                          filter:
                            'drop-shadow(0 0 18px rgba(2, 35, 113, 0.36)) drop-shadow(0 0 26px rgba(246, 6, 111, 0.24))',
                        }}
                      >
                        <Image
                          src={option.image}
                          alt={`${option.title} artwork`}
                          fill
                          sizes="(max-width: 600px) 300px, (max-width: 900px) 330px, 350px"
                          style={{
                            objectFit: 'contain',
                            objectPosition: 'center center',
                            transition: 'transform 220ms ease, filter 220ms ease',
                          }}
                        />
                      </Box>
                    ) : null}

                    <Box
                      sx={{
                        width: '100%',
                        flex: 1,
                        px: { xs: 2, md: 2.5 },
                        py: { xs: 2.25, md: 2.5 },
                        borderRadius: { xs: '1.25rem', md: '1.75rem' },
                        backgroundColor: 'rgba(255, 255, 255, 0.035)',
                        border: '1px solid rgba(246, 6, 111, 0.14)',
                        boxShadow:
                          'inset 0 0 28px rgba(255, 255, 255, 0.025)',
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

                    {option.link && option.buttonText ? (
                      <Button
                        component="a"
                        href={option.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          mt: 'auto',
                          px: 3,
                          py: 1,
                          minWidth: 150,
                          borderRadius: 999,
                          color: '#ffffff',
                          background:
                            'linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.22)',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          textTransform: 'none',
                          boxShadow:
                            '0 0 18px rgba(246, 6, 111, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)',
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
                        {option.buttonText}
                      </Button>
                    ) : null}
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
'use client';

import { Box, Grid, Typography } from '@mui/material';
import Image from 'next/image';
import React from 'react';

import { Header } from '@helix-ai/ui';

import { AboutContent } from '../../content/about';
import { headerProps } from '../../content/header';

type AboutSection = {
  title: string;
  paragraphs: React.ReactNode | React.ReactNode[];
};

const ABOUT_IMAGE_URL = '/images/about-us.png';

const ORDER_MAP: Record<string, number> = {
  'Who We Are': 1,
  'Our Mission': 2,
  'Our Story': 3,
  'Meet the Team': 4,
};

function nodesToPlainText(nodes: React.ReactNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === 'string') {
        return node;
      }

      if (
        React.isValidElement<{ children?: React.ReactNode }>(node) &&
        typeof node.props.children === 'string'
      ) {
        return node.props.children;
      }

      return '';
    })
    .filter((value) => value.trim().length > 0)
    .join('\n\n')
    .trim();
}

function sectionToDescription(section: AboutSection): string {
  const paragraphs = Array.isArray(section.paragraphs)
    ? section.paragraphs
    : [section.paragraphs];

  if (paragraphs.length === 1 && typeof paragraphs[0] === 'string') {
    return paragraphs[0];
  }

  return nodesToPlainText(paragraphs);
}

export default function AboutPage() {
  const sections = (AboutContent as AboutSection[]) ?? [];

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

        <Box
          component="main"
          sx={{
            mx: 'auto',
            maxWidth: 1560,
            px: { xs: 2, sm: 3, lg: 4 },
            pt: { xs: 5, md: 8 },
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
              About Helix AI
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
                src={ABOUT_IMAGE_URL}
                alt="Helix AI about artwork"
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
              Helix AI is being built to help people bring order, intelligence,
              and automation into the digital systems they use every day. Our
              goal is to simplify complexity by connecting apps, organizing
              information, monitoring important systems, and turning scattered
              data into clear, useful action. Whether you are managing personal
              workflows, building software, operating infrastructure, creating
              content, or running a business, Helix AI is designed to give you
              one secure place to ask questions, understand what is happening,
              automate repetitive work, and make better decisions with
              confidence.
            </Typography>
          </Box>

          <Grid
            container
            spacing={{ xs: 3, md: 4 }}
            sx={{
              alignItems: 'stretch',
            }}
          >
            {sections.map((section) => {
              const description = sectionToDescription(section);

              return (
                <Grid
                  key={section.title}
                  size={{ xs: 12, lg: 6 }}
                  sx={{
                    order: {
                      xs: 0,
                      lg: ORDER_MAP[section.title] ?? 0,
                    },
                    display: 'flex',
                  }}
                >
                  <Box
                    component="article"
                    sx={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      width: '100%',
                      minHeight: { xs: 'auto', lg: 300 },
                      px: { xs: 2.5, sm: 3.5, md: 4 },
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
                        gap: 2,
                        height: '100%',
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
                        {section.title}
                      </Typography>

                      <Box
                        sx={{
                          width: '100%',
                          flex: 1,
                          px: { xs: 2, md: 3 },
                          py: { xs: 2.25, md: 2.75 },
                          borderRadius: { xs: '1.25rem', md: '1.75rem' },
                          backgroundColor: 'rgba(255, 255, 255, 0.035)',
                          border: '1px solid rgba(246, 6, 111, 0.14)',
                          boxShadow:
                            'inset 0 0 28px rgba(255, 255, 255, 0.025)',
                          transition:
                            'border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease',
                        }}
                      >
                        <Typography
                          component="p"
                          sx={{
                            color: 'rgba(255, 255, 255, 0.78)',
                            fontSize: {
                              xs: '0.92rem',
                              sm: '0.95rem',
                              md: '0.98rem',
                              lg: '0.95rem',
                              xl: '1rem',
                            },
                            lineHeight: { xs: 1.55, md: 1.6 },
                            textAlign: 'center',
                            textWrap: 'pretty',
                          }}
                        >
                          {description}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
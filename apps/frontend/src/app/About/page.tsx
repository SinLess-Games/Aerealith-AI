'use client';

import { Box, Grid, Typography } from '@mui/material';
import React from 'react';

import { Header, HelixCard } from '@helix-ai/ui';

import { AboutContent } from '../../content/about';
import { headerProps } from '../../content/header';

type AboutSection = {
  title: string;
  paragraphs: React.ReactNode | React.ReactNode[];
};

const ABOUT_IMAGE_URL = '/images/about-us.png';

const ORDER_MAP: Record<string, number> = {
  'Meet the Team': 1,
  'Who We Are': 2,
  'Our Mission': 3,
  'Our Story': 4,
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
        backgroundColor: '#050716',

        '&::before': {
          content: '""',
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          backgroundImage: `linear-gradient(
              rgba(5, 7, 22, 0.42),
              rgba(5, 7, 22, 0.72)
            ),
            url("${ABOUT_IMAGE_URL}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: { xs: 'scroll', md: 'fixed' },
        },

        '&::after': {
          content: '""',
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at 50% 20%, rgba(140, 82, 255, 0.22), transparent 34%), linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.55))',
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 2 }}>
        <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />

        <Box
          component="main"
          sx={{
            mx: 'auto',
            maxWidth: 1200,
            px: { xs: 2, sm: 3, lg: 4 },
            pt: { xs: 4, md: 6 },
            pb: { xs: 10, md: 14 },
          }}
        >
          <Box
            component="section"
            sx={{
              textAlign: 'center',
              mb: { xs: 4, md: 7 },
              px: { xs: 1, md: 4 },
            }}
          >
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: '2.5rem', sm: '3.25rem', md: '4.5rem' },
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: '0.04em',
                color: '#ffffff',
                textShadow: '0 0 28px rgba(140, 82, 255, 0.45)',
                mb: 2,
              }}
            >
              About Helix AI
            </Typography>

            <Typography
              component="p"
              sx={{
                mx: 'auto',
                maxWidth: 760,
                color: 'rgba(255, 255, 255, 0.82)',
                fontSize: { xs: '1rem', md: '1.2rem' },
                lineHeight: 1.7,
              }}
            >
              Building intelligent systems that help people automate the
              complex, understand their world, and elevate what they can create.
            </Typography>
          </Box>

          <Grid container spacing={4}>
            {sections.map((section) => {
              const description = sectionToDescription(section);

              return (
                <Grid
                  key={section.title}
                  size={{ xs: 12, sm: 6 }}
                  sx={{
                    order: {
                      xs: 0,
                      sm: ORDER_MAP[section.title] ?? 0,
                    },
                  }}
                >
                  <HelixCard
                    title={section.title}
                    description={description}
                    sx={{
                      height: '100%',
                      minHeight: 340,
                      backgroundColor: 'rgba(5, 7, 22, 0.58)',
                      borderColor: 'rgba(255, 255, 255, 0.14)',
                      borderWidth: 1,
                      borderStyle: 'solid',
                      boxShadow: '0 24px 70px rgba(0, 0, 0, 0.38)',
                      backdropFilter: 'blur(18px) saturate(145%)',
                      WebkitBackdropFilter: 'blur(18px) saturate(145%)',
                    }}
                  />
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}
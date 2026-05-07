'use client';

import { Box, Container, Typography } from '@mui/material';
import Grid from '@mui/material/Grid';
import Image from 'next/image';

import { Header, HelixCard } from '@helix-ai/ui';

import { CONTACT_OPTIONS } from '../../content/contact';
import { headerProps } from '../../content/header';

const CONTACT_IMAGE_URL = '/images/contact-us.png';

export default function ContactPage() {
  return (
    <Box
      component="main"
      sx={{
        position: 'relative',
        minHeight: '100vh',
        color: 'white',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 50% 12%, rgba(140, 82, 255, 0.22), transparent 34%), linear-gradient(180deg, #050716 0%, #070A16 42%, #03040C 100%)',
      }}
    >
      <Header {...headerProps} pages={[...(headerProps.pages ?? [])]} />

      <Box
        component="section"
        sx={{
          pt: { xs: 8, sm: 10, md: 12, lg: 14 },
          pb: { xs: 8, md: 12 },
          minHeight: '100vh',
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              textAlign: 'center',
              mb: { xs: 4, md: 5 },
              px: { xs: 1, md: 4 },
            }}
          >
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: '2.5rem', sm: '3.25rem', md: '4.5rem' },
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: '#ffffff',
                textShadow: '0 0 28px rgba(140, 82, 255, 0.48)',
                mb: 2,
              }}
            >
              Contact Us
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
              Reach Helix AI through the channels below for community, support,
              updates, and project backing.
            </Typography>
          </Box>

          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: 1100,
              mx: 'auto',
              mb: { xs: 4, md: 6 },
              borderRadius: { xs: 3, md: 4 },
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              boxShadow: '0 30px 90px rgba(0, 0, 0, 0.45)',
              backgroundColor: 'rgba(5, 7, 22, 0.62)',
              backdropFilter: 'blur(18px) saturate(145%)',
              WebkitBackdropFilter: 'blur(18px) saturate(145%)',
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                aspectRatio: { xs: '16 / 11', sm: '16 / 9', md: '21 / 9' },
              }}
            >
              <Image
                src={CONTACT_IMAGE_URL}
                alt="Helix AI contact options showing Discord, email, and Patreon"
                fill
                priority
                sizes="(max-width: 1200px) 100vw, 1100px"
                style={{
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
            </Box>
          </Box>

          <Grid
            container
            spacing={3}
            sx={{
              alignContent: 'center',
              alignItems: 'stretch',
              justifyContent: 'center',
            }}
          >
            {CONTACT_OPTIONS.map((option) => (
              <Grid key={option.title} size={{ xs: 12, sm: 6, md: 4 }}>
                <HelixCard
                  title={option.title}
                  description={option.description}
                  image={option.image}
                  link={option.link}
                  buttonText={option.buttonText}
                  sx={{
                    height: '100%',
                    minHeight: 360,
                    backgroundColor: 'rgba(5, 7, 22, 0.62)',
                    borderColor: option.bgColor ?? 'rgba(255, 255, 255, 0.14)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    boxShadow: '0 24px 70px rgba(0, 0, 0, 0.38)',
                    backdropFilter: 'blur(18px) saturate(145%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(145%)',
                  }}
                />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
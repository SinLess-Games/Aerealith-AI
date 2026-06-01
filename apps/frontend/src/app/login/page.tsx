'use client';

import * as React from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

const DEFAULT_NEXT_PATH = '/app/profile';
const LOGIN_API_PATH = '/api/V1/auth/login';

type ApiErrorResponse = {
  success?: boolean;
  error?:
    | string
    | {
        code?: string;
        message?: string;
      };
};

const getSafeNextPath = (value: string | null): string => {
  if (value && value.startsWith('/')) {
    return value;
  }

  return DEFAULT_NEXT_PATH;
};

const readErrorMessage = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    const error = value as ApiErrorResponse['error'];

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (typeof error === 'object' && error !== null) {
      return error.message ?? 'Unable to sign in.';
    }
  }

  return 'Unable to sign in.';
};

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get('next'));

  const [identifier, setIdentifier] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      setIsSubmitting(true);
      setErrorMessage(null);

      try {
        const response = await fetch(LOGIN_API_PATH, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            identifier,
            password,
          }),
        });

        const contentType = response.headers.get('content-type') ?? '';
        const responseBody = contentType.includes('application/json')
          ? ((await response.json().catch(() => null)) as ApiErrorResponse | null)
          : null;

        if (!response.ok) {
          throw new Error(readErrorMessage(responseBody?.error ?? responseBody));
        }

        router.replace(nextPath);
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to sign in.',
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [identifier, nextPath, password, router],
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(255, 91, 125, 0.24), transparent 28%), radial-gradient(circle at 90% 12%, rgba(86, 162, 255, 0.24), transparent 26%), linear-gradient(160deg, #050816 0%, #0b1022 45%, #050816 100%)',
        color: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        py: { xs: 6, md: 10 },
      }}
    >
      <Container maxWidth="md">
        <Paper
          elevation={0}
          sx={{
            overflow: 'hidden',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            background:
              'linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(9, 12, 24, 0.96))',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
            borderRadius: { xs: 4, md: 6 },
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
            }}
          >
            <Box
              sx={{
                p: { xs: 4, sm: 5, md: 6 },
                borderRight: { md: '1px solid rgba(148, 163, 184, 0.14)' },
              }}
            >
              <Stack spacing={3}>
                <Stack spacing={1.25}>
                  <Typography
                    component="p"
                    sx={{
                      fontSize: 12,
                      letterSpacing: '0.28em',
                      textTransform: 'uppercase',
                      color: 'rgba(125, 211, 252, 0.88)',
                    }}
                  >
                    Aerealith AI
                  </Typography>
                  <Typography
                    component="h1"
                    variant="h3"
                    sx={{
                      fontWeight: 700,
                      lineHeight: 1.05,
                      fontSize: { xs: '2.2rem', md: '3.6rem' },
                    }}
                  >
                    Sign in to continue.
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ color: 'rgba(226, 232, 240, 0.8)', maxWidth: 560 }}
                  >
                    Access your profile, sessions, and private workspace features.
                  </Typography>
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                  }}
                >
                  {[
                    'Protected profile dashboard',
                    'Session persistence',
                    'Private API access',
                  ].map((label) => (
                    <Box
                      key={label}
                      sx={{
                        borderRadius: 3,
                        border: '1px solid rgba(148, 163, 184, 0.14)',
                        backgroundColor: 'rgba(15, 23, 42, 0.65)',
                        px: 2,
                        py: 2.25,
                        color: 'rgba(226, 232, 240, 0.84)',
                        fontSize: 14,
                        lineHeight: 1.5,
                      }}
                    >
                      {label}
                    </Box>
                  ))}
                </Box>
              </Stack>
            </Box>

            <Box sx={{ p: { xs: 4, sm: 5, md: 6 } }}>
              <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
                <Stack spacing={0.5}>
                  <Typography
                    component="h2"
                    variant="h5"
                    sx={{ fontWeight: 700 }}
                  >
                    Welcome back
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(226, 232, 240, 0.7)' }}>
                    Use your username or email address to sign in.
                  </Typography>
                </Stack>

                {errorMessage ? (
                  <Alert severity="error" variant="filled">
                    {errorMessage}
                  </Alert>
                ) : null}

                <TextField
                  label="Username or email"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoComplete="username"
                  fullWidth
                  required
                />

                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  fullWidth
                  required
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={isSubmitting}
                  sx={{
                    py: 1.4,
                    fontWeight: 700,
                    background:
                      'linear-gradient(135deg, #f6066f 0%, #5c00ff 100%)',
                  }}
                >
                  {isSubmitting ? 'Signing in...' : 'Sign in'}
                </Button>

                <Typography variant="body2" sx={{ color: 'rgba(226, 232, 240, 0.72)' }}>
                  If you were sent here from a protected page, you will be returned there after sign in.
                </Typography>
              </Stack>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
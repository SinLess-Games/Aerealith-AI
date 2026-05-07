'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Image, { type StaticImageData } from 'next/image';

export type WaitlistStatus = 'idle' | 'sending' | 'success' | 'error';

export type HeroWaitlistProps = {
  /**
   * API endpoint used to submit the waitlist form.
   */
  endpoint?: string;

  /**
   * Heading shown above the waitlist form.
   */
  title?: string;

  /**
   * Email input label.
   */
  emailLabel?: string;

  /**
   * Submit button text.
   */
  submitLabel?: string;

  /**
   * Submit button text while sending.
   */
  sendingLabel?: string;

  /**
   * Success message shown after a valid submission.
   */
  successMessage?: string;

  /**
   * How long feedback alerts remain visible.
   */
  feedbackDurationMs?: number;
};

export type HeroSectionProps = {
  title: string;
  subtitle: string;
  imageUrl: string | StaticImageData;
  imageAlt?: string;
  waitlist?: HeroWaitlistProps;
};

const DEFAULT_WAITLIST_ENDPOINT = '/api/V1/waitlist';
const DEFAULT_FEEDBACK_DURATION_MS = 5_000;

function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown;

    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getResponseMessage(
  body: Record<string, unknown>,
  fallback: string,
): string {
  return typeof body.message === 'string' && body.message.trim().length > 0
    ? body.message
    : fallback;
}

export function HeroWaitlist({
  endpoint = DEFAULT_WAITLIST_ENDPOINT,
  title = 'Join our waitlist!',
  emailLabel = 'Email',
  submitLabel = 'Submit',
  sendingLabel = 'Sending…',
  successMessage = 'Thanks! You’re on the waitlist. We’ll notify you when we launch.',
  feedbackDurationMs = DEFAULT_FEEDBACK_DURATION_MS,
}: HeroWaitlistProps) {
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<WaitlistStatus>('idle');
  const [errorMessage, setErrorMessage] = React.useState('');

  const trimmedEmail = email.trim();
  const isValidEmail = React.useMemo(
    () => isValidEmailAddress(trimmedEmail),
    [trimmedEmail],
  );

  React.useEffect(() => {
    if (status === 'idle') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setStatus('idle');
      setErrorMessage('');
    }, feedbackDurationMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [feedbackDurationMs, status]);

  const handleSubmit = React.useCallback(async (): Promise<void> => {
    if (!isValidEmail || status === 'sending') {
      return;
    }

    setStatus('sending');
    setErrorMessage('');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
        }),
      });

      const body = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(getResponseMessage(body, `HTTP ${response.status}`));
      }

      if (body.status && body.status !== 'success') {
        throw new Error(getResponseMessage(body, 'Server error'));
      }

      setEmail('');
      setStatus('success');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
      setStatus('error');
    }
  }, [endpoint, isValidEmail, status, trimmedEmail]);

  return (
    <Box
      component="section"
      data-testid="waitlist-section"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        mt: 4,
        gap: 2,
        width: '100%',
      }}
    >
      <Typography
        variant="h2"
        sx={{
          color: 'rgba(255, 255, 255, 0.9)',
          textAlign: 'center',
          fontSize: { xs: '1.5rem', sm: '2rem' },
          fontWeight: 700,
        }}
      >
        {title}
      </Typography>

      <Box
        aria-live="polite"
        sx={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {status === 'success' ? (
          <Alert
            severity="success"
            data-testid="waitlist-success"
            sx={{ mt: 2, width: { xs: '100%', sm: 'auto' } }}
          >
            {successMessage}
          </Alert>
        ) : null}

        {status === 'error' ? (
          <Alert
            severity="error"
            data-testid="waitlist-error"
            sx={{ mt: 2, width: { xs: '100%', sm: 'auto' } }}
          >
            Error: {errorMessage}
          </Alert>
        ) : null}
      </Box>

      <Box
        component="form"
        data-testid="waitlist-form"
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          alignItems: 'flex-start',
          justifyContent: 'center',
          width: '100%',
          maxWidth: 600,
        }}
      >
        <TextField
          fullWidth
          label={emailLabel}
          type="email"
          variant="filled"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          error={email.length > 0 && !isValidEmail}
          helperText={
            email.length > 0 && !isValidEmail
              ? 'Please enter a valid email.'
              : ' '
          }
          disabled={status === 'sending'}
          slotProps={{
            htmlInput: {
              'data-testid': 'waitlist-email-input',
              autoCapitalize: 'none',
              autoCorrect: 'off',
              inputMode: 'email',
            },
          }}
          sx={{
            bgcolor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: 1,

            '& .MuiFilledInput-root': {
              color: '#fff',
              bgcolor: 'rgba(255, 255, 255, 0.08)',

              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.12)',
              },

              '&.Mui-focused': {
                bgcolor: 'rgba(255, 255, 255, 0.12)',
              },
            },

            '& .MuiFilledInput-underline:before': {
              borderBottomColor: 'rgba(255, 255, 255, 0.3)',
            },

            '& .MuiFilledInput-underline:hover:before': {
              borderBottomColor: '#fff',
            },

            '& .MuiFilledInput-underline:after': {
              borderBottomColor: '#f6066f',
            },

            '& .MuiInputLabel-root': {
              color: 'rgba(255, 255, 255, 0.7)',
            },

            '& .MuiInputLabel-root.Mui-focused': {
              color: '#fff',
            },

            '& .MuiFormHelperText-root': {
              color:
                email.length > 0 && !isValidEmail
                  ? 'error.light'
                  : 'rgba(255, 255, 255, 0.55)',
            },
          }}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={!isValidEmail || status === 'sending'}
          data-testid="waitlist-submit"
          sx={{
            backgroundColor: '#022371',
            color: '#fff',
            px: 4,
            py: 1.5,
            minWidth: '180px',
            minHeight: 56,

            '&:hover': {
              backgroundColor: '#f6066f',
            },

            '&.Mui-disabled': {
              color: 'rgba(255, 255, 255, 0.55)',
              backgroundColor: 'rgba(2, 35, 113, 0.45)',
            },
          }}
        >
          {status === 'sending' ? sendingLabel : submitLabel}
        </Button>
      </Box>
    </Box>
  );
}

export function HeroSection({
  title,
  subtitle,
  imageUrl,
  imageAlt = 'Hero Image',
  waitlist,
}: HeroSectionProps) {
  return (
    <Box
      component="section"
      sx={{
        px: { xs: '1.5rem', md: '4rem' },
        py: { xs: '3rem', md: '5rem' },
        mx: { xs: '1rem', md: '2rem' },
        borderRadius: '0.75rem',
        backgroundColor: 'rgba(30, 30, 30, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <Grid container spacing={4} alignItems="center">
        <Grid size={{ xs: 12, md: 6 }} sx={{ textAlign: 'center' }}>
          <Image
            src={imageUrl}
            alt={imageAlt}
            width={400}
            height={400}
            priority
            style={{
              maxWidth: '100%',
              height: 'auto',
              borderRadius: '0.5rem',
            }}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Typography
            component="h1"
            sx={{
              fontWeight: 700,
              color: '#F6066F',
              fontSize: {
                xs: '1.75rem',
                sm: '2.25rem',
                md: '3rem',
                lg: '4rem',
              },
              fontFamily: '"Pinyon Script", cursive, sans-serif',
              textAlign: { xs: 'center', md: 'left' },
            }}
            gutterBottom
          >
            {title}
          </Typography>

          <Typography
            component="p"
            sx={{
              color: '#6a8db0',
              fontSize: { xs: '1rem', sm: '1.125rem', md: '1.25rem' },
              textAlign: { xs: 'center', md: 'left' },
            }}
          >
            {subtitle}
          </Typography>
        </Grid>

        <Grid size={12} sx={{ textAlign: 'center', mt: 4 }}>
          <HeroWaitlist {...waitlist} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default HeroSection;
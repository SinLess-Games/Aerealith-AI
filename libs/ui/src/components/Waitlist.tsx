// libs/ui/src/components/HeroSection.tsx

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

type WaitlistApiResponse = {
  ok?: boolean;
  message?: string;
};

const DEFAULT_WAITLIST_ENDPOINT = '/api/V1/waitlist';
const DEFAULT_FEEDBACK_DURATION_MS = 5_000;

function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function readJsonResponse(response: Response): Promise<WaitlistApiResponse> {
  try {
    const body = (await response.json()) as unknown;

    return typeof body === 'object' && body !== null
      ? (body as WaitlistApiResponse)
      : {};
  } catch {
    return {};
  }
}

function getResponseMessage(
  body: WaitlistApiResponse,
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
  const [feedbackMessage, setFeedbackMessage] = React.useState('');

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
      setFeedbackMessage('');
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
    setFeedbackMessage('');

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

      if (!response.ok || body.ok !== true) {
        throw new Error(
          getResponseMessage(body, 'Unable to join the waitlist right now.'),
        );
      }

      setEmail('');
      setFeedbackMessage(getResponseMessage(body, successMessage));
      setStatus('success');
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
      setStatus('error');
    }
  }, [endpoint, isValidEmail, status, successMessage, trimmedEmail]);

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
            {feedbackMessage || successMessage}
          </Alert>
        ) : null}

        {status === 'error' ? (
          <Alert
            severity="error"
            data-testid="waitlist-error"
            sx={{ mt: 2, width: { xs: '100%', sm: 'auto' } }}
          >
            Error: {feedbackMessage}
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
          alignItems: { xs: 'stretch', sm: 'flex-start' },
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
              : undefined
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
            borderRadius: 1.5,
            minHeight: 56,

            '& .MuiFilledInput-root': {
              color: '#fff',
              bgcolor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 1.5,
              minHeight: 56,
              overflow: 'hidden',

              '&:hover': {
                bgcolor: 'rgba(255, 255, 255, 0.12)',
              },

              '&.Mui-focused': {
                bgcolor: 'rgba(255, 255, 255, 0.12)',
              },
            },

            '& .MuiFilledInput-input': {
              height: 56,
              boxSizing: 'border-box',
              py: 0,
              display: 'flex',
              alignItems: 'center',
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
              top: '-2px',
            },

            '& .MuiInputLabel-root.Mui-focused': {
              color: '#fff',
            },

            '& .MuiFormHelperText-root': {
              m: 0,
              mt: 0.75,
              color: 'error.light',
            },
          }}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={!isValidEmail || status === 'sending'}
          data-testid="waitlist-submit"
          sx={{
            background:
              'linear-gradient(135deg, #f6066f 0%, #7c3aed 55%, #022371 100%)',
            color: '#fff',
            px: 4,
            py: 0,
            minWidth: { xs: '100%', sm: '180px' },
            minHeight: 56,
            height: 56,
            border: '1px solid rgba(255, 255, 255, 0.28)',
            borderRadius: 1.5,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            boxShadow:
              '0 0 18px rgba(246, 6, 111, 0.45), 0 10px 28px rgba(2, 35, 113, 0.45)',

            '&:hover': {
              background:
                'linear-gradient(135deg, #ff2f8a 0%, #8b5cf6 50%, #0636a8 100%)',
              boxShadow:
                '0 0 26px rgba(246, 6, 111, 0.65), 0 14px 34px rgba(2, 35, 113, 0.55)',
              transform: 'translateY(-1px)',
            },

            '&:active': {
              transform: 'translateY(0)',
            },

            '&.Mui-disabled': {
              color: 'rgba(255, 255, 255, 0.72)',
              background:
                'linear-gradient(135deg, rgba(246, 6, 111, 0.45) 0%, rgba(2, 35, 113, 0.7) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              boxShadow: '0 0 14px rgba(246, 6, 111, 0.22)',
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
        px: { xs: '1.25rem', sm: '2rem', md: '4rem' },
        py: { xs: '2.5rem', sm: '3.5rem', md: '5rem' },
        mx: { xs: '1rem', md: '2rem' },
        borderRadius: '1.25rem',
        background:
          'linear-gradient(135deg, rgba(10, 10, 16, 0.52), rgba(26, 16, 42, 0.34))',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow:
          '0 24px 80px rgba(0, 0, 0, 0.34), inset 0 0 48px rgba(246, 6, 111, 0.04)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
        <Grid size={{ xs: 12, md: 6 }} sx={{ textAlign: 'center' }}>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: {
                xs: 400,
                sm: 580,
                md: 740,
                lg: 860,
                xl: 960,
              },
              aspectRatio: '16 / 9',
              mx: 'auto',
              borderRadius: { xs: '1rem', md: '1.35rem' },
              overflow: 'hidden',
              background:
                'linear-gradient(135deg, rgba(2, 35, 113, 0.18), rgba(246, 6, 111, 0.14))',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              boxShadow:
                '0 0 0 1px rgba(246, 6, 111, 0.08), 0 18px 45px rgba(0, 0, 0, 0.42), 0 0 34px rgba(2, 35, 113, 0.25)',
              transform: 'translateZ(0)',
              transition:
                'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease',

              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                borderRadius: 'inherit',
                background:
                  'linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 28%, transparent 72%, rgba(246, 6, 111, 0.12))',
                opacity: 0.7,
              },

              '&:hover': {
                transform: 'translateY(-2px)',
                borderColor: 'rgba(246, 6, 111, 0.28)',
                boxShadow:
                  '0 0 0 1px rgba(246, 6, 111, 0.16), 0 22px 55px rgba(0, 0, 0, 0.48), 0 0 42px rgba(246, 6, 111, 0.18)',
              },
            }}
          >
            <Image
              src={imageUrl}
              alt={imageAlt}
              fill
              priority
              sizes="(max-width: 600px) 95vw, (max-width: 900px) 80vw, (max-width: 1200px) 50vw, 960px"
              style={{
                objectFit: 'cover',
              }}
            />
          </Box>
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
              textAlign: 'center',
            }}
            gutterBottom
          >
            {title}
          </Typography>

          <Typography
            component="p"
            sx={{
              color: '#6a8db0',
              fontSize: {
                xs: '1rem',
                sm: '1.125rem',
                md: '1.25rem',
              },
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
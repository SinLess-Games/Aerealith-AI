// libs/ui/src/components/Waitlist.tsx

'use client';

import * as React from 'react';
import Script from 'next/script';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Image, { type StaticImageData } from 'next/image';

export type WaitlistStatus = 'idle' | 'sending' | 'success' | 'error';

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: 'auto' | 'light' | 'dark';
  size?: 'normal' | 'compact' | 'flexible';
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: TurnstileRenderOptions,
      ) => string | undefined;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

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
   * Optional supporting text shown under the heading.
   */
  description?: string;

  /**
   * Email input label.
   */
  emailLabel?: string;

  /**
   * Email input placeholder.
   */
  emailPlaceholder?: string;

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
   * Error message shown when submission fails without a server-provided message.
   */
  errorMessage?: string;

  /**
   * How long feedback alerts remain visible.
   *
   * Set to 0 to keep alerts visible until the next state change.
   */
  feedbackDurationMs?: number;

  /**
   * Cloudflare Turnstile public site key.
   *
   * Defaults to NEXT_PUBLIC_TURNSTILE_SITE_KEY.
   */
  turnstileSiteKey?: string;

  /**
   * Cloudflare Turnstile theme.
   */
  turnstileTheme?: 'auto' | 'light' | 'dark';

  /**
   * Cloudflare Turnstile widget size.
   */
  turnstileSize?: 'normal' | 'compact' | 'flexible';
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
  success?: boolean;
  message?: string;
  data?: {
    message?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
};

const DEFAULT_WAITLIST_ENDPOINT = '/api/V1/waitlist';
const DEFAULT_FEEDBACK_DURATION_MS = 5_000;
const DEFAULT_TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

const DEFAULT_SUCCESS_MESSAGE =
  "Thanks! You're on the waitlist. We'll notify you when we launch.";

const DEFAULT_ERROR_MESSAGE = 'Unable to join the waitlist right now.';

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function readJsonResponse(
  response: Response,
): Promise<WaitlistApiResponse> {
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
  return (
    getNonEmptyString(body.message) ??
    getNonEmptyString(body.data?.message) ??
    getNonEmptyString(body.error?.message) ??
    fallback
  );
}

function isSuccessfulWaitlistResponse(
  response: Response,
  body: WaitlistApiResponse,
): boolean {
  if (!response.ok) {
    return false;
  }

  if (body.ok === false || body.success === false) {
    return false;
  }

  return true;
}

function getInitialTurnstileReady(): boolean {
  return typeof window !== 'undefined' && Boolean(window.turnstile);
}

export function HeroWaitlist({
  endpoint = DEFAULT_WAITLIST_ENDPOINT,
  title = 'Join our waitlist',
  description = 'Be first in line for launch updates, early access, and product announcements.',
  emailLabel = 'Email address',
  emailPlaceholder = 'you@example.com',
  submitLabel = 'Join waitlist',
  sendingLabel = 'Joining...',
  successMessage = DEFAULT_SUCCESS_MESSAGE,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  feedbackDurationMs = DEFAULT_FEEDBACK_DURATION_MS,
  turnstileSiteKey = DEFAULT_TURNSTILE_SITE_KEY,
  turnstileTheme = 'dark',
  turnstileSize = 'normal',
}: HeroWaitlistProps) {
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<WaitlistStatus>('idle');
  const [feedbackMessage, setFeedbackMessage] = React.useState('');
  const [turnstileToken, setTurnstileToken] = React.useState('');
  const [turnstileReady, setTurnstileReady] = React.useState(
    getInitialTurnstileReady,
  );

  const formId = React.useId();
  const descriptionId = React.useId();
  const feedbackId = React.useId();
  const turnstileHintId = React.useId();

  const isSubmittingRef = React.useRef(false);
  const turnstileContainerRef = React.useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = React.useRef<string | undefined>(undefined);

  const resolvedEndpoint = endpoint.trim() || DEFAULT_WAITLIST_ENDPOINT;
  const trimmedEmail = email.trim();
  const trimmedTurnstileSiteKey = turnstileSiteKey.trim();
  const isTurnstileEnabled = trimmedTurnstileSiteKey.length > 0;
  const isSending = status === 'sending';

  const isValidEmail = React.useMemo(
    () => isValidEmailAddress(trimmedEmail),
    [trimmedEmail],
  );

  const showEmailError = email.length > 0 && !isValidEmail;
  const emailHelperText = showEmailError
    ? 'Please enter a valid email address.'
    : undefined;

  const canSubmit =
    isValidEmail &&
    !isSending &&
    (!isTurnstileEnabled || turnstileToken.length > 0);

  const resetTurnstile = React.useCallback(() => {
    setTurnstileToken('');

    const widgetId = turnstileWidgetIdRef.current;

    if (
      typeof window !== 'undefined' &&
      window.turnstile &&
      widgetId !== undefined
    ) {
      try {
        window.turnstile.reset(widgetId);
      } catch {
        // Ignore reset failures caused by an already-cleared widget.
      }
    }
  }, []);

  React.useEffect(() => {
    if (
      isTurnstileEnabled &&
      typeof window !== 'undefined' &&
      window.turnstile
    ) {
      setTurnstileReady(true);
    }
  }, [isTurnstileEnabled]);

  React.useEffect(() => {
    if (!isTurnstileEnabled) {
      setTurnstileToken('');
      return undefined;
    }

    if (
      !turnstileReady ||
      typeof window === 'undefined' ||
      !window.turnstile ||
      !turnstileContainerRef.current ||
      turnstileWidgetIdRef.current
    ) {
      return undefined;
    }

    setTurnstileToken('');

    const widgetId = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: trimmedTurnstileSiteKey,
      theme: turnstileTheme,
      size: turnstileSize,
      callback: (token: string) => {
        setTurnstileToken(token);
      },
      'expired-callback': () => {
        setTurnstileToken('');
        setFeedbackMessage('Bot verification expired. Please try again.');
        setStatus('error');
      },
      'error-callback': () => {
        setTurnstileToken('');
        setFeedbackMessage('Bot verification failed. Please try again.');
        setStatus('error');
      },
    });

    turnstileWidgetIdRef.current = widgetId;

    if (!widgetId) {
      setFeedbackMessage('Bot verification could not initialize.');
      setStatus('error');
    }

    return () => {
      const currentWidgetId = turnstileWidgetIdRef.current;

      if (
        typeof window !== 'undefined' &&
        window.turnstile &&
        currentWidgetId !== undefined
      ) {
        try {
          window.turnstile.remove(currentWidgetId);
        } catch {
          // Ignore cleanup failures caused by an already-removed widget.
        }
      }

      turnstileWidgetIdRef.current = undefined;
      setTurnstileToken('');
    };
  }, [
    isTurnstileEnabled,
    trimmedTurnstileSiteKey,
    turnstileReady,
    turnstileTheme,
    turnstileSize,
  ]);

  React.useEffect(() => {
    if (
      feedbackDurationMs <= 0 ||
      (status !== 'success' && status !== 'error')
    ) {
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
    if (!isValidEmail || isSubmittingRef.current) {
      return;
    }

    if (isTurnstileEnabled && !turnstileToken) {
      setFeedbackMessage(
        'Please complete the bot verification before submitting.',
      );
      setStatus('error');
      return;
    }

    isSubmittingRef.current = true;
    setStatus('sending');
    setFeedbackMessage('');

    try {
      const response = await fetch(resolvedEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          email: trimmedEmail,
          turnstileToken: isTurnstileEnabled ? turnstileToken : undefined,
        }),
      });

      const body = await readJsonResponse(response);

      if (!isSuccessfulWaitlistResponse(response, body)) {
        throw new Error(getResponseMessage(body, errorMessage));
      }

      setEmail('');
      setFeedbackMessage(getResponseMessage(body, successMessage));
      setStatus('success');
      resetTurnstile();
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : errorMessage);
      setStatus('error');
      resetTurnstile();
    } finally {
      isSubmittingRef.current = false;
    }
  }, [
    errorMessage,
    isTurnstileEnabled,
    isValidEmail,
    resetTurnstile,
    resolvedEndpoint,
    successMessage,
    trimmedEmail,
    turnstileToken,
  ]);

  return (
    <Box
      component="section"
      data-testid="waitlist-section"
      aria-labelledby={`${formId}-title`}
      aria-describedby={description ? descriptionId : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        width: '100%',
        maxWidth: 720,
        mx: 'auto',
        mt: 0,
      }}
    >
      {isTurnstileEnabled ? (
        <Script
          id="cloudflare-turnstile"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          async
          defer
          strategy="afterInteractive"
          onLoad={() => {
            setTurnstileReady(true);
          }}
          onReady={() => {
            setTurnstileReady(true);
          }}
          onError={() => {
            setTurnstileReady(false);
            setTurnstileToken('');
            setFeedbackMessage(
              'Bot verification could not load. Please refresh and try again.',
            );
            setStatus('error');
          }}
        />
      ) : null}

      <Box sx={{ textAlign: 'center' }}>
        <Typography
          id={`${formId}-title`}
          component="h2"
          sx={{
            color: 'rgba(255, 255, 255, 0.94)',
            fontSize: { xs: '1.5rem', sm: '1.9rem', md: '2.15rem' },
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </Typography>

        {description ? (
          <Typography
            id={descriptionId}
            component="p"
            sx={{
              maxWidth: 560,
              mx: 'auto',
              mt: 1,
              color: 'rgba(255, 255, 255, 0.68)',
              fontSize: { xs: '0.95rem', sm: '1rem' },
              lineHeight: 1.65,
            }}
          >
            {description}
          </Typography>
        ) : null}
      </Box>

      <Box
        id={feedbackId}
        aria-live="polite"
        aria-atomic="true"
        sx={{
          width: '100%',
          minHeight: status === 'success' || status === 'error' ? 'auto' : 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {status === 'success' ? (
          <Alert
            severity="success"
            data-testid="waitlist-success"
            sx={{
              width: '100%',
              borderRadius: 2,
              bgcolor: 'rgba(46, 125, 50, 0.14)',
              color: 'rgba(255, 255, 255, 0.92)',
              border: '1px solid rgba(129, 199, 132, 0.35)',
              '& .MuiAlert-icon': {
                color: 'success.light',
              },
            }}
          >
            {feedbackMessage || successMessage}
          </Alert>
        ) : null}

        {status === 'error' ? (
          <Alert
            severity="error"
            data-testid="waitlist-error"
            sx={{
              width: '100%',
              borderRadius: 2,
              bgcolor: 'rgba(211, 47, 47, 0.14)',
              color: 'rgba(255, 255, 255, 0.92)',
              border: '1px solid rgba(239, 154, 154, 0.35)',
              '& .MuiAlert-icon': {
                color: 'error.light',
              },
            }}
          >
            {feedbackMessage || errorMessage}
          </Alert>
        ) : null}
      </Box>

      <Box
        component="form"
        data-testid="waitlist-form"
        noValidate
        autoComplete="on"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        sx={{
          width: '100%',
          p: { xs: 1.5, sm: 2 },
          borderRadius: 3,
          background:
            'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.035))',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow:
            '0 18px 55px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 1.5,
            alignItems: { xs: 'stretch', sm: 'flex-start' },
            width: '100%',
          }}
        >
          <TextField
            fullWidth
            required
            id={`${formId}-email`}
            label={emailLabel}
            placeholder={emailPlaceholder}
            type="email"
            variant="filled"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            error={showEmailError}
            helperText={emailHelperText}
            disabled={isSending}
            slotProps={{
              htmlInput: {
                'aria-describedby': isTurnstileEnabled
                  ? turnstileHintId
                  : feedbackId,
                'data-testid': 'waitlist-email-input',
                autoCapitalize: 'none',
                autoComplete: 'email',
                autoCorrect: 'off',
                inputMode: 'email',
                name: 'email',
                spellCheck: false,
              },
            }}
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 2,
              minHeight: 56,

              '& .MuiFilledInput-root': {
                color: '#fff',
                bgcolor: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 2,
                minHeight: 56,
                overflow: 'hidden',
                transition:
                  'background-color 180ms ease, box-shadow 180ms ease',

                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.12)',
                },

                '&.Mui-focused': {
                  bgcolor: 'rgba(255, 255, 255, 0.13)',
                  boxShadow: '0 0 0 3px rgba(246, 6, 111, 0.18)',
                },

                '&.Mui-disabled': {
                  bgcolor: 'rgba(255, 255, 255, 0.055)',
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
                borderBottomColor: 'rgba(255, 255, 255, 0.28)',
              },

              '& .MuiFilledInput-underline:hover:before': {
                borderBottomColor: 'rgba(255, 255, 255, 0.76)',
              },

              '& .MuiFilledInput-underline:after': {
                borderBottomColor: '#f6066f',
              },

              '& .MuiInputLabel-root': {
                color: 'rgba(255, 255, 255, 0.72)',
                top: '-2px',
              },

              '& .MuiInputLabel-root.Mui-focused': {
                color: '#fff',
              },

              '& .MuiInputBase-input::placeholder': {
                color: 'rgba(255, 255, 255, 0.42)',
                opacity: 1,
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
            disabled={!canSubmit}
            data-testid="waitlist-submit"
            aria-busy={isSending}
            sx={{
              position: 'relative',
              overflow: 'hidden',
              color: '#fff',
              px: 4,
              py: 0,
              minWidth: { xs: '100%', sm: '190px' },
              minHeight: 56,
              height: 56,
              border: '1px solid rgba(255, 255, 255, 0.28)',
              borderRadius: 2,
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background:
                'linear-gradient(135deg, #f6066f 0%, #7c3aed 55%, #022371 100%)',
              boxShadow:
                '0 0 18px rgba(246, 6, 111, 0.45), 0 10px 28px rgba(2, 35, 113, 0.45)',
              transition:
                'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',

              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent)',
                transform: 'translateX(-120%)',
                transition: 'transform 500ms ease',
              },

              '&:hover': {
                background:
                  'linear-gradient(135deg, #ff2f8a 0%, #8b5cf6 50%, #0636a8 100%)',
                boxShadow:
                  '0 0 26px rgba(246, 6, 111, 0.65), 0 14px 34px rgba(2, 35, 113, 0.55)',
                transform: 'translateY(-1px)',

                '&::before': {
                  transform: 'translateX(120%)',
                },
              },

              '&:active': {
                transform: 'translateY(0)',
              },

              '&.Mui-disabled': {
                color: 'rgba(255, 255, 255, 0.68)',
                background:
                  'linear-gradient(135deg, rgba(246, 6, 111, 0.4) 0%, rgba(2, 35, 113, 0.62) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                boxShadow: '0 0 14px rgba(246, 6, 111, 0.2)',
              },
            }}
          >
            {isSending ? (
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                }}
              >
                <CircularProgress size={18} color="inherit" />
                {sendingLabel}
              </Box>
            ) : (
              submitLabel
            )}
          </Button>
        </Box>

        {isTurnstileEnabled ? (
          <Box
            id={turnstileHintId}
            sx={{
              mt: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              width: '100%',
            }}
          >
            <Box
              ref={turnstileContainerRef}
              data-testid="waitlist-turnstile"
              sx={{
                display: 'flex',
                justifyContent: 'center',
                width: '100%',
                minHeight: 65,
              }}
            />

            {!turnstileToken ? (
              <Typography
                component="p"
                sx={{
                  color: 'rgba(255, 255, 255, 0.52)',
                  fontSize: '0.78rem',
                  textAlign: 'center',
                }}
              >
                Complete verification to enable waitlist submission.
              </Typography>
            ) : null}
          </Box>
        ) : null}
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
        position: 'relative',
        isolation: 'isolate',
        overflow: 'hidden',
        px: { xs: '1.25rem', sm: '2rem', md: '4rem' },
        py: { xs: '2.75rem', sm: '3.75rem', md: '5.25rem' },
        mx: { xs: '1rem', md: '2rem' },
        borderRadius: { xs: '1.25rem', md: '1.75rem' },
        background:
          'linear-gradient(135deg, rgba(10, 10, 16, 0.62), rgba(26, 16, 42, 0.38))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow:
          '0 24px 80px rgba(0, 0, 0, 0.34), inset 0 0 48px rgba(246, 6, 111, 0.05)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',

        '&::before': {
          content: '""',
          position: 'absolute',
          zIndex: -1,
          width: { xs: 260, md: 420 },
          height: { xs: 260, md: 420 },
          right: { xs: '-120px', md: '-160px' },
          top: { xs: '-120px', md: '-160px' },
          borderRadius: '999px',
          background:
            'radial-gradient(circle, rgba(246, 6, 111, 0.22), transparent 68%)',
          filter: 'blur(4px)',
        },

        '&::after': {
          content: '""',
          position: 'absolute',
          zIndex: -1,
          width: { xs: 240, md: 380 },
          height: { xs: 240, md: 380 },
          left: { xs: '-120px', md: '-140px' },
          bottom: { xs: '-140px', md: '-170px' },
          borderRadius: '999px',
          background:
            'radial-gradient(circle, rgba(2, 35, 113, 0.34), transparent 68%)',
          filter: 'blur(4px)',
        },
      }}
    >
      <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center">
        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{
            textAlign: 'center',
            order: { xs: 2, md: 1 },
          }}
        >
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: {
                xs: 420,
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
                opacity: 0.74,
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

        <Grid
          size={{ xs: 12, md: 6 }}
          sx={{
            order: { xs: 1, md: 2 },
          }}
        >
          <Typography
            component="h1"
            sx={{
              fontWeight: 700,
              color: '#F6066F',
              fontSize: {
                xs: '2.35rem',
                sm: '3rem',
                md: '3.65rem',
                lg: '4.45rem',
              },
              lineHeight: 0.95,
              fontFamily: '"Pinyon Script", cursive, sans-serif',
              textAlign: { xs: 'center', md: 'left' },
              textShadow: '0 0 24px rgba(246, 6, 111, 0.2)',
            }}
            gutterBottom
          >
            {title}
          </Typography>

          <Typography
            component="p"
            sx={{
              maxWidth: 620,
              mx: { xs: 'auto', md: 0 },
              color: '#8fb0d0',
              fontSize: {
                xs: '1rem',
                sm: '1.125rem',
                md: '1.25rem',
              },
              lineHeight: 1.75,
              textAlign: { xs: 'center', md: 'left' },
            }}
          >
            {subtitle}
          </Typography>
        </Grid>

        <Grid
          size={12}
          sx={{
            order: { xs: 3, md: 3 },
            textAlign: 'center',
            mt: { xs: 0, md: 1 },
          }}
        >
          <HeroWaitlist {...waitlist} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default HeroSection;
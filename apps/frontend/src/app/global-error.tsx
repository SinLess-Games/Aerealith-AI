// apps/frontend/src/app/global-error.tsx

'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

type ErrorWithOptionalDetails = Error & {
  digest?: string;
  cause?: unknown;
};

type GlobalErrorProps = {
  error: ErrorWithOptionalDetails;

  /**
   * Next.js 16 file-convention docs use `unstable_retry`.
   * Older App Router examples use `reset`.
   * Supporting both keeps this compatible while Next settles the API shape.
   */
  reset?: () => void;
  unstable_retry?: () => void
};

type ClientDiagnostics = {
  timestamp: string;
  href: string;
  origin: string;
  pathname: string;
  search: string;
  hash: string;
  userAgent: string;
  language: string;
  languages: string[];
  viewport: string;
  screen: string;
  colorScheme: string;
  online: boolean;
  cookiesEnabled: boolean;
  referrer: string;
};

type ErrorSummary = {
  name: string;
  message: string;
  digest?: string;
  cause?: string;
  stack?: string;
};

const SHOW_PRIVATE_ERROR_DETAILS =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_SHOW_ERROR_DETAILS === 'true';

const SECONDARY_BUTTON_BORDER =
  '1px solid var(--hx-border, rgba(174, 183, 200, 0.2))';

const COPIED_BUTTON_BORDER = '1px solid rgba(34, 197, 94, 0.42)';

const pageShellStyle: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  color: 'var(--hx-text, rgba(247, 244, 255, 0.94))',
  background:
    'radial-gradient(circle at 88% 8%, rgba(var(--hx-primary-rgb, 246, 6, 111), 0.2), transparent 34rem), radial-gradient(circle at 12% 92%, rgba(var(--hx-secondary-rgb, 0, 219, 201), 0.16), transparent 36rem), radial-gradient(circle at 50% 48%, rgba(var(--hx-accent-rgb, 140, 82, 255), 0.14), transparent 42rem), linear-gradient(135deg, var(--hx-bg, #050a1e), var(--helix-color-bg-soft, #08071b))',
  fontFamily:
    'var(--helix-font-body, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
  overflowX: 'hidden',
};

const mainStyle: CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 'clamp(1rem, 4vw, 3rem)',
  isolation: 'isolate',
};

const ambientStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: -2,
  pointerEvents: 'none',
  backgroundImage:
    'radial-gradient(circle at 12% 20%, rgba(247, 244, 255, 0.24) 0 1px, transparent 1.5px), radial-gradient(circle at 72% 18%, rgba(var(--hx-secondary-rgb, 0, 219, 201), 0.22) 0 1px, transparent 1.5px), radial-gradient(circle at 42% 72%, rgba(var(--hx-primary-rgb, 246, 6, 111), 0.2) 0 1px, transparent 1.5px), radial-gradient(circle at 88% 78%, rgba(247, 244, 255, 0.2) 0 1px, transparent 1.5px)',
  backgroundSize: '220px 220px, 280px 280px, 340px 340px, 420px 420px',
  opacity: 0.5,
};

const cardStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: '64rem',
  overflow: 'hidden',
  padding: 'clamp(1.25rem, 4vw, 2.35rem)',
  borderRadius: 'var(--helix-radius-xl, 2rem)',
  border: '1px solid var(--hx-glass-brd, rgba(174, 183, 200, 0.18))',
  color: 'var(--hx-text, rgba(247, 244, 255, 0.94))',
  background:
    'radial-gradient(circle at 12% 0%, rgba(var(--hx-secondary-rgb, 0, 219, 201), 0.12), transparent 32%), radial-gradient(circle at 90% 12%, rgba(var(--hx-primary-rgb, 246, 6, 111), 0.16), transparent 34%), linear-gradient(145deg, var(--hx-surface-transparent, rgba(8, 7, 27, 0.78)), rgba(5, 10, 30, 0.92))',
  boxShadow:
    'var(--hx-shadow, 0 18px 60px rgba(0, 0, 0, 0.34), 0 0 32px rgba(246, 6, 111, 0.16), 0 0 42px rgba(0, 219, 201, 0.1))',
  backdropFilter: 'saturate(170%) blur(18px)',
  WebkitBackdropFilter: 'saturate(170%) blur(18px)',
};

const eyebrowStyle: CSSProperties = {
  margin: '0 0 0.75rem',
  color: 'var(--hx-secondary, #00dbc9)',
  fontSize: '0.78rem',
  fontWeight: 900,
  letterSpacing: '0.14em',
  lineHeight: 1.35,
  textTransform: 'uppercase',
  textAlign: 'center',
};

const headingStyle: CSSProperties = {
  margin: '0 auto 1rem',
  maxWidth: '52rem',
  color: 'transparent',
  background:
    'linear-gradient(135deg, var(--hx-primary, #f6066f), var(--hx-secondary, #00dbc9) 52%, var(--hx-accent, #8c52ff))',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  fontFamily:
    'var(--helix-font-heading, Lora, Georgia, "Times New Roman", serif)',
  fontSize: 'clamp(2.25rem, 7vw, 4.75rem)',
  fontWeight: 900,
  letterSpacing: '-0.055em',
  lineHeight: 0.96,
  textAlign: 'center',
};

const descriptionStyle: CSSProperties = {
  margin: '0 auto 1.35rem',
  maxWidth: '44rem',
  color: 'var(--hx-text-2, rgba(174, 183, 200, 0.78))',
  fontSize: '1rem',
  lineHeight: 1.75,
  textAlign: 'center',
};

const panelStyle: CSSProperties = {
  margin: '0 auto 1rem',
  padding: '1rem',
  borderRadius: '1.25rem',
  border: '1px solid var(--hx-border, rgba(174, 183, 200, 0.2))',
  background: 'rgba(255, 255, 255, 0.055)',
  textAlign: 'left',
};

const detailsStyle: CSSProperties = {
  margin: '0 auto 1.5rem',
  textAlign: 'left',
  borderRadius: '1.25rem',
  border: '1px solid var(--hx-border, rgba(174, 183, 200, 0.2))',
  background: 'rgba(255, 255, 255, 0.045)',
  overflow: 'hidden',
};

const summaryStyle: CSSProperties = {
  cursor: 'pointer',
  listStyle: 'none',
  padding: '1rem',
  color: 'var(--hx-text, rgba(247, 244, 255, 0.94))',
  fontSize: '0.92rem',
  fontWeight: 900,
  letterSpacing: '0.06em',
  lineHeight: 1.3,
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--hx-border, rgba(174, 183, 200, 0.2))',
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: '0.85rem',
};

const primaryButtonStyle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid rgba(255, 255, 255, 0.22)',
  borderRadius: '999px',
  padding: '0.78rem 1.35rem',
  color: 'var(--hx-primary-foreground, #ffffff)',
  fontWeight: 900,
  lineHeight: 1.2,
  background:
    'linear-gradient(135deg, var(--hx-primary, #f6066f), var(--hx-secondary, #00dbc9), var(--hx-accent, #8c52ff))',
  boxShadow:
    '0 0 24px rgba(var(--hx-primary-rgb, 246, 6, 111), 0.28), 0 14px 34px rgba(0, 0, 0, 0.24)',
};

const secondaryButtonStyle: CSSProperties = {
  cursor: 'pointer',
  border: SECONDARY_BUTTON_BORDER,
  borderRadius: '999px',
  padding: '0.78rem 1.35rem',
  color: 'var(--hx-text, rgba(247, 244, 255, 0.94))',
  fontWeight: 900,
  lineHeight: 1.2,
  textDecoration: 'none',
  background: 'rgba(255, 255, 255, 0.08)',
};

function stringifyUnknown(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Error) {
    return [
      value.name ? `Name: ${value.name}` : undefined,
      value.message ? `Message: ${value.message}` : undefined,
      value.stack ? `Stack:\n${value.stack}` : undefined,
      value.cause ? `Cause:\n${stringifyUnknown(value.cause)}` : undefined,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  try {
    const seen = new WeakSet<object>();

    return JSON.stringify(
      value,
      (_key, nestedValue: unknown) => {
        if (typeof nestedValue === 'bigint') {
          return nestedValue.toString();
        }

        if (typeof nestedValue === 'function') {
          const namedFunction = nestedValue as { name?: string };

          return `[Function ${namedFunction.name || 'anonymous'}]`;
        }

        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack,
            cause: stringifyUnknown(nestedValue.cause),
          };
        }

        if (typeof nestedValue === 'object' && nestedValue !== null) {
          if (seen.has(nestedValue)) {
            return '[Circular]';
          }

          seen.add(nestedValue);
        }

        return nestedValue;
      },
      2,
    );
  } catch {
    return String(value);
  }
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | number | boolean | null;
}): React.ReactElement | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(6.5rem, 9rem) minmax(0, 1fr)',
        gap: '0.75rem',
        alignItems: 'start',
        padding: '0.65rem 0',
        borderBottom: '1px solid var(--hx-border, rgba(174, 183, 200, 0.14))',
      }}
    >
      <dt
        style={{
          color: 'var(--hx-text-2, rgba(174, 183, 200, 0.78))',
          fontSize: '0.78rem',
          fontWeight: 900,
          letterSpacing: '0.05em',
          lineHeight: 1.35,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </dt>

      <dd
        style={{
          margin: 0,
          color: 'var(--hx-text, rgba(247, 244, 255, 0.94))',
          fontSize: '0.9rem',
          lineHeight: 1.55,
          overflowWrap: 'anywhere',
        }}
      >
        {String(value)}
      </dd>
    </div>
  );
}

function CodeBlock({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}): React.ReactElement | null {
  if (!value) {
    return null;
  }

  return (
    <section style={{ marginTop: '1.25rem' }}>
      <h3
        style={{
          margin: '0 0 0.6rem',
          color: 'var(--hx-text, rgba(247, 244, 255, 0.94))',
          fontSize: '0.86rem',
          fontWeight: 900,
          letterSpacing: '0.06em',
          lineHeight: 1.3,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </h3>

      <pre
        style={{
          margin: 0,
          maxHeight: '24rem',
          overflow: 'auto',
          padding: '1rem',
          borderRadius: '1rem',
          border: '1px solid var(--hx-border, rgba(174, 183, 200, 0.2))',
          background: 'rgba(0, 0, 0, 0.34)',
          color: 'var(--hx-text, rgba(247, 244, 255, 0.9))',
          fontSize: '0.8rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </pre>
    </section>
  );
}

function SmallPill({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: '1px solid var(--hx-border, rgba(174, 183, 200, 0.2))',
        background: 'rgba(255, 255, 255, 0.07)',
        color: 'var(--hx-text-2, rgba(174, 183, 200, 0.78))',
        fontSize: '0.75rem',
        fontWeight: 900,
        lineHeight: 1.25,
        padding: '0.38rem 0.7rem',
      }}
    >
      {children}
    </span>
  );
}

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: GlobalErrorProps): React.ReactElement {
  const retry = unstable_retry ?? reset;
  const digest = typeof error?.digest === 'string' ? error.digest : undefined;

  const [clientDiagnostics, setClientDiagnostics] =
    useState<ClientDiagnostics | null>(null);
  const [copied, setCopied] = useState(false);

  const privateCause = SHOW_PRIVATE_ERROR_DETAILS
    ? stringifyUnknown(error?.cause)
    : undefined;

  const privateStack = SHOW_PRIVATE_ERROR_DETAILS ? error?.stack : undefined;

  const errorSummary: ErrorSummary = useMemo(() => {
    return {
      name: error?.name || 'Error',
      message:
        error?.message ||
        'An unknown application error was caught by the global error boundary.',
      digest,
      cause: privateCause,
      stack: privateStack,
    };
  }, [digest, error?.message, error?.name, privateCause, privateStack]);

  const reportText = useMemo(() => {
    return [
      'Helix AI Global Error Report',
      '',
      'Application',
      '-----------',
      `Name: ${errorSummary.name}`,
      `Message: ${errorSummary.message}`,
      errorSummary.digest ? `Digest: ${errorSummary.digest}` : undefined,
      `Diagnostics Mode: ${
        SHOW_PRIVATE_ERROR_DETAILS
          ? 'Detailed diagnostics enabled'
          : 'Production-safe diagnostics'
      }`,
      '',
      clientDiagnostics
        ? [
            'Client',
            '------',
            `Timestamp: ${clientDiagnostics.timestamp}`,
            `URL: ${clientDiagnostics.href}`,
            `Origin: ${clientDiagnostics.origin}`,
            `Pathname: ${clientDiagnostics.pathname}`,
            `Search: ${clientDiagnostics.search || '(none)'}`,
            `Hash: ${clientDiagnostics.hash || '(none)'}`,
            `Viewport: ${clientDiagnostics.viewport}`,
            `Screen: ${clientDiagnostics.screen}`,
            `Language: ${clientDiagnostics.language}`,
            `Languages: ${clientDiagnostics.languages.join(', ')}`,
            `Color Scheme: ${clientDiagnostics.colorScheme}`,
            `Online: ${clientDiagnostics.online}`,
            `Cookies Enabled: ${clientDiagnostics.cookiesEnabled}`,
            `Referrer: ${clientDiagnostics.referrer || '(none)'}`,
            `User Agent: ${clientDiagnostics.userAgent}`,
          ].join('\n')
        : undefined,
      '',
      errorSummary.cause
        ? ['Cause', '-----', errorSummary.cause].join('\n')
        : undefined,
      '',
      errorSummary.stack
        ? ['Stack Trace', '-----------', errorSummary.stack].join('\n')
        : undefined,
    ]
      .filter(Boolean)
      .join('\n');
  }, [clientDiagnostics, errorSummary]);

  useEffect(() => {
    console.error('Helix AI global application error:', error);

    const prefersDark =
      window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;

    setClientDiagnostics({
      timestamp: new Date().toISOString(),
      href: window.location.href,
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      userAgent: window.navigator.userAgent,
      language: window.navigator.language,
      languages: Array.from(window.navigator.languages ?? []),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screen: `${window.screen.width}x${window.screen.height}`,
      colorScheme: prefersDark ? 'dark' : 'light',
      online: window.navigator.onLine,
      cookiesEnabled: window.navigator.cookieEnabled,
      referrer: document.referrer,
    });
  }, [error]);

  const copyReport = useCallback(async (): Promise<void> => {
    try {
      if (!window.navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is not available.');
      }

      await window.navigator.clipboard.writeText(reportText);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1600);
    } catch {
      setCopied(false);
    }
  }, [reportText]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body style={pageShellStyle} suppressHydrationWarning>
        <main style={mainStyle}>
          <div aria-hidden="true" style={ambientStyle} />

          <section
            role="alert"
            aria-labelledby="global-error-title"
            aria-describedby="global-error-description"
            style={cardStyle}
          >
            <p style={eyebrowStyle}>Helix AI Error Boundary</p>

            <h1 id="global-error-title" style={headingStyle}>
              We&apos;re sorry, but something went wrong
            </h1>

            <p id="global-error-description" style={descriptionStyle}>
              Helix AI hit an unexpected application error. You can retry the
              page, return home, or open the technical report below for more
              diagnostic information.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '0.55rem',
                marginBottom: '1.25rem',
              }}
            >
              <SmallPill>{errorSummary.name}</SmallPill>

              {digest ? <SmallPill>Digest: {digest}</SmallPill> : null}

              <SmallPill>
                {SHOW_PRIVATE_ERROR_DETAILS
                  ? 'Detailed diagnostics'
                  : 'Production-safe diagnostics'}
              </SmallPill>
            </div>

            <section aria-label="Error summary" style={panelStyle}>
              <dl style={{ margin: 0 }}>
                <DetailRow label="Name" value={errorSummary.name} />
                <DetailRow label="Message" value={errorSummary.message} />
                <DetailRow label="Digest" value={digest} />
                <DetailRow
                  label="Timestamp"
                  value={clientDiagnostics?.timestamp}
                />
                <DetailRow label="Pathname" value={clientDiagnostics?.pathname} />
              </dl>
            </section>

            <details style={detailsStyle}>
              <summary style={summaryStyle}>Technical error report</summary>

              <div style={{ padding: '1rem' }}>
                {!SHOW_PRIVATE_ERROR_DETAILS ? (
                  <p
                    style={{
                      margin: '0 0 1rem',
                      color: 'var(--hx-text-2, rgba(174, 183, 200, 0.78))',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                    }}
                  >
                    Stack traces and error causes are hidden in production
                    unless{' '}
                    <code
                      style={{
                        padding: '0.12rem 0.38rem',
                        borderRadius: '0.35rem',
                        color: 'var(--hx-secondary, #00dbc9)',
                        background: 'rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      NEXT_PUBLIC_SHOW_ERROR_DETAILS=true
                    </code>{' '}
                    is set.
                  </p>
                ) : null}

                <dl style={{ margin: 0 }}>
                  <DetailRow label="Name" value={errorSummary.name} />
                  <DetailRow label="Message" value={errorSummary.message} />
                  <DetailRow label="Digest" value={digest} />
                  <DetailRow
                    label="Timestamp"
                    value={clientDiagnostics?.timestamp}
                  />
                  <DetailRow label="URL" value={clientDiagnostics?.href} />
                  <DetailRow label="Origin" value={clientDiagnostics?.origin} />
                  <DetailRow
                    label="Pathname"
                    value={clientDiagnostics?.pathname}
                  />
                  <DetailRow label="Search" value={clientDiagnostics?.search} />
                  <DetailRow label="Hash" value={clientDiagnostics?.hash} />
                  <DetailRow
                    label="Viewport"
                    value={clientDiagnostics?.viewport}
                  />
                  <DetailRow label="Screen" value={clientDiagnostics?.screen} />
                  <DetailRow
                    label="Language"
                    value={clientDiagnostics?.language}
                  />
                  <DetailRow
                    label="Color Scheme"
                    value={clientDiagnostics?.colorScheme}
                  />
                  <DetailRow
                    label="Online"
                    value={
                      clientDiagnostics
                        ? clientDiagnostics.online
                          ? 'true'
                          : 'false'
                        : undefined
                    }
                  />
                  <DetailRow
                    label="Cookies"
                    value={
                      clientDiagnostics
                        ? clientDiagnostics.cookiesEnabled
                          ? 'enabled'
                          : 'disabled'
                        : undefined
                    }
                  />
                  <DetailRow
                    label="Referrer"
                    value={clientDiagnostics?.referrer}
                  />
                  <DetailRow
                    label="Mode"
                    value={
                      SHOW_PRIVATE_ERROR_DETAILS
                        ? 'Detailed diagnostics enabled'
                        : 'Production-safe diagnostics'
                    }
                  />
                </dl>

                <CodeBlock label="Cause" value={errorSummary.cause} />
                <CodeBlock label="Stack trace" value={errorSummary.stack} />

                {clientDiagnostics ? (
                  <CodeBlock
                    label="Client environment"
                    value={JSON.stringify(clientDiagnostics, null, 2)}
                  />
                ) : null}

                <CodeBlock label="Copyable report" value={reportText} />
              </div>
            </details>

            <div style={actionRowStyle}>
              {retry ? (
                <button type="button" onClick={retry} style={primaryButtonStyle}>
                  Try again
                </button>
              ) : null}

              <button
                type="button"
                onClick={copyReport}
                style={{
                  ...secondaryButtonStyle,
                  border: copied ? COPIED_BUTTON_BORDER : SECONDARY_BUTTON_BORDER,
                  background: copied
                    ? 'rgba(34, 197, 94, 0.2)'
                    : secondaryButtonStyle.background,
                }}
              >
                {copied ? 'Copied report' : 'Copy report'}
              </button>

              <Link href="/" style={secondaryButtonStyle}>
                Go home
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

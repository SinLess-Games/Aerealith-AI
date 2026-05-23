'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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
  unstable_retry?: () => void;
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
          return `[Function ${(nestedValue as Function).name || 'anonymous'}]`;
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
}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '9rem minmax(0, 1fr)',
        gap: '0.75rem',
        alignItems: 'start',
        padding: '0.65rem 0',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <dt
        style={{
          color: 'rgba(255, 255, 255, 0.58)',
          fontSize: '0.8rem',
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </dt>

      <dd
        style={{
          margin: 0,
          color: 'rgba(255, 255, 255, 0.9)',
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
}) {
  if (!value) {
    return null;
  }

  return (
    <section style={{ marginTop: '1.25rem' }}>
      <h3
        style={{
          margin: '0 0 0.6rem',
          color: 'rgba(255, 255, 255, 0.88)',
          fontSize: '0.9rem',
          fontWeight: 900,
          letterSpacing: '0.04em',
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
          border: '1px solid rgba(255, 255, 255, 0.12)',
          background: 'rgba(0, 0, 0, 0.38)',
          color: 'rgba(255, 255, 255, 0.86)',
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

function SmallPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        background: 'rgba(255, 255, 255, 0.07)',
        color: 'rgba(255, 255, 255, 0.72)',
        fontSize: '0.75rem',
        fontWeight: 800,
        padding: '0.35rem 0.65rem',
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
}: GlobalErrorProps) {
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

  const copyReport = async () => {
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
  };

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#050716',
          color: '#ffffff',
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '2rem',
          }}
        >
          <section
            style={{
              width: '100%',
              maxWidth: '58rem',
              padding: '2rem',
              borderRadius: '1.5rem',
              border: '1px solid rgba(246, 6, 111, 0.35)',
              background:
                'linear-gradient(135deg, rgba(5, 7, 22, 0.94), rgba(35, 12, 50, 0.76))',
              boxShadow:
                '0 24px 70px rgba(0, 0, 0, 0.5), 0 0 42px rgba(246, 6, 111, 0.22)',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: '0 0 0.75rem',
                color: 'rgba(255, 255, 255, 0.58)',
                fontSize: '0.8rem',
                fontWeight: 900,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Helix AI Error Boundary
            </p>

            <h1
              style={{
                margin: '0 0 1rem',
                color: '#F6066F',
                fontSize: 'clamp(2rem, 7vw, 4rem)',
                lineHeight: 1,
              }}
            >
              We&apos;re sorry, but something went wrong
            </h1>

            <p
              style={{
                margin: '0 auto 1.25rem',
                maxWidth: '42rem',
                color: 'rgba(255, 255, 255, 0.82)',
                fontSize: '1rem',
                lineHeight: 1.7,
              }}
            >
              Helix AI hit an unexpected application error. You can retry the
              page, return home, or open the technical report below for more
              diagnostic information.
            </p>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '0.5rem',
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

            <section
              aria-label="Error summary"
              style={{
                margin: '0 auto 1rem',
                padding: '1rem',
                borderRadius: '1.25rem',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.055)',
                textAlign: 'left',
              }}
            >
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

            <details
              style={{
                margin: '0 auto 1.5rem',
                textAlign: 'left',
                borderRadius: '1.25rem',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.045)',
                overflow: 'hidden',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  padding: '1rem',
                  color: 'rgba(255, 255, 255, 0.92)',
                  fontSize: '0.95rem',
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                Technical error report
              </summary>

              <div style={{ padding: '1rem' }}>
                {!SHOW_PRIVATE_ERROR_DETAILS ? (
                  <p
                    style={{
                      margin: '0 0 1rem',
                      color: 'rgba(255, 255, 255, 0.66)',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                    }}
                  >
                    Stack traces and error causes are hidden in production
                    unless{' '}
                    <code
                      style={{
                        padding: '0.1rem 0.35rem',
                        borderRadius: '0.35rem',
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

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '0.85rem',
              }}
            >
              {retry ? (
                <button
                  type="button"
                  onClick={retry}
                  style={{
                    cursor: 'pointer',
                    border: '1px solid rgba(255, 255, 255, 0.22)',
                    borderRadius: '999px',
                    padding: '0.75rem 1.25rem',
                    color: '#ffffff',
                    fontWeight: 800,
                    background:
                      'linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)',
                    boxShadow: '0 0 22px rgba(246, 6, 111, 0.34)',
                  }}
                >
                  Try again
                </button>
              ) : null}

              <button
                type="button"
                onClick={copyReport}
                style={{
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: '999px',
                  padding: '0.75rem 1.25rem',
                  color: '#ffffff',
                  fontWeight: 800,
                  background: copied
                    ? 'rgba(34, 197, 94, 0.22)'
                    : 'rgba(255, 255, 255, 0.08)',
                }}
              >
                {copied ? 'Copied report' : 'Copy report'}
              </button>

              <Link
                href="/"
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: '999px',
                  padding: '0.75rem 1.25rem',
                  color: '#ffffff',
                  fontWeight: 800,
                  textDecoration: 'none',
                  background: 'rgba(255, 255, 255, 0.08)',
                }}
              >
                Go home
              </Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
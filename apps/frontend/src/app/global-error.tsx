'use client';

import Link from 'next/link';

type GlobalErrorProps = {
  error: Error & {
    digest?: string;
  };

  /**
   * Next.js 16 file-convention docs use `unstable_retry`.
   * Older App Router examples use `reset`.
   * Supporting both keeps this compatible while Next settles the API shape.
   */
  reset?: () => void;
  unstable_retry?: () => void;
};

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: GlobalErrorProps) {
  const retry = unstable_retry ?? reset;
  const digest = typeof error?.digest === 'string' ? error.digest : undefined;

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
              maxWidth: '42rem',
              padding: '2rem',
              borderRadius: '1.5rem',
              border: '1px solid rgba(246, 6, 111, 0.35)',
              background:
                'linear-gradient(135deg, rgba(5, 7, 22, 0.92), rgba(35, 12, 50, 0.72))',
              boxShadow:
                '0 24px 70px rgba(0, 0, 0, 0.5), 0 0 42px rgba(246, 6, 111, 0.22)',
              textAlign: 'center',
            }}
          >
            <h1
              style={{
                margin: '0 0 1rem',
                color: '#F6066F',
                fontSize: 'clamp(2rem, 7vw, 4rem)',
                lineHeight: 1,
              }}
            >
              Something went wrong
            </h1>

            <p
              style={{
                margin: '0 auto 1.5rem',
                maxWidth: '34rem',
                color: 'rgba(255, 255, 255, 0.82)',
                fontSize: '1rem',
                lineHeight: 1.7,
              }}
            >
              Helix AI hit an unexpected application error. You can retry the
              page, or return home and continue from there.
            </p>

            {digest ? (
              <p
                style={{
                  margin: '0 0 1.5rem',
                  color: 'rgba(255, 255, 255, 0.58)',
                  fontSize: '0.85rem',
                  overflowWrap: 'anywhere',
                }}
              >
                Error digest: {digest}
              </p>
            ) : null}

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
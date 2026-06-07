"use client";

import * as React from "react";
import Script from "next/script";
import dynamic from "next/dynamic";
import { Box, Button, Container, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";

import { headerProps } from "../../content/header";
import * as Constants from "../../content/technology";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

type TechnologyListItem = {
  text: string;
  href?: string;
};

type TechnologyCard = {
  title: string;
  description: string;
  image?: string;
  link?: string;
  buttonText?: string;
  listItems: TechnologyListItem[];
};

type LooseTechnologyCard = {
  title?: unknown;
  description?: unknown;
  image?: unknown;
  link?: unknown;
  buttonText?: unknown;
  listItems?: unknown;
};

const Header = dynamic(
  () => import("@helix-ai/ui").then((module) => module.Header),
  { ssr: false },
);

const TECHNOLOGY_IMAGE_URL = "/images/technology.png";

function text(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : fallback;
}

function optionalText(value: unknown): string | undefined {
  const rendered = text(value);

  return rendered.length > 0 ? rendered : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeListItems(value: unknown): TechnologyListItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): TechnologyListItem | null => {
      if (typeof item === "string") {
        const itemText = text(item);

        return itemText ? { text: itemText } : null;
      }

      if (!isPlainObject(item)) {
        return null;
      }

      const itemText = text(item.text);
      const href = optionalText(item.href);

      if (!itemText) {
        return null;
      }

      return href ? { text: itemText, href } : { text: itemText };
    })
    .filter((item): item is TechnologyListItem => item !== null);
}

function normalizeTechnologyCard(value: unknown): TechnologyCard | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const card = value as LooseTechnologyCard;
  const title = text(card.title);
  const description = text(card.description);

  if (!title || !description) {
    return null;
  }

  return {
    title,
    description,
    image: optionalText(card.image),
    link: optionalText(card.link),
    buttonText: optionalText(card.buttonText),
    listItems: normalizeListItems(card.listItems),
  };
}

function normalizeTechnologyCards(value: unknown): TechnologyCard[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeTechnologyCard(item))
      .filter((item): item is TechnologyCard => item !== null);
  }

  const card = normalizeTechnologyCard(value);

  return card ? [card] : [];
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("//");
}

function getLinkTargetProps(href: string): {
  target?: "_blank";
  rel?: string;
} {
  return isExternalHref(href)
    ? {
        target: "_blank",
        rel: "noopener noreferrer",
      }
    : {};
}

const allCards: TechnologyCard[] = Object.values(Constants)
  .flatMap(normalizeTechnologyCards)
  .sort((a, b) => a.title.localeCompare(b.title));

const safeHeaderPages = Array.isArray(headerProps.pages)
  ? [...headerProps.pages]
  : [];

export default function Technology() {
  React.useEffect(() => {
    if (!process.env.NEXT_PUBLIC_ADSENSE_CLIENT) {
      return;
    }

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ignore locally.
    }
  }, []);

  return (
    <Box
      id="main-content"
      component="main"
      sx={{
        position: "relative",
        minHeight: "100vh",
        color: "white",
        overflow: "hidden",
      }}
    >
      {process.env.NEXT_PUBLIC_ADSENSE_CLIENT ? (
        <Script
          id="adsbygoogle-lib"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT}`}
          async
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      ) : null}

      {process.env.NEXT_PUBLIC_ADSENSE_CLIENT
        ? (["left", "right"] as const).map((side) => (
            <Box
              key={side}
              component="ins"
              className="adsbygoogle"
              sx={{
                display: { xs: "none", lg: "block" },
                position: "fixed",
                top: "50%",
                [side]: 0,
                transform: "translateY(-50%)",
                width: 120,
                height: 600,
                zIndex: 40,
              }}
              data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT}
              data-ad-slot={process.env.NEXT_PUBLIC_ADSENSE_TECH_SIDEBAR_SLOT}
              data-ad-format="vertical"
              data-full-width-responsive="false"
              aria-hidden="true"
            />
          ))
        : null}

      <Box sx={{ position: "relative", zIndex: 2 }}>
        <Header {...headerProps} pages={safeHeaderPages} />

        <Container
          component="section"
          maxWidth={false}
          sx={{
            mx: "auto",
            maxWidth: 1560,
            px: { xs: 2, sm: 3, lg: 4 },
            pt: { xs: 7, md: 9 },
            pb: { xs: 10, md: 14 },
          }}
        >
          <Box
            sx={{
              mb: { xs: 5, md: 7 },
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: { xs: 3, md: 4 },
            }}
          >
            <Typography
              component="h1"
              sx={{
                textAlign: "center",
                fontSize: {
                  xs: "3rem",
                  sm: "4rem",
                  md: "5.25rem",
                  lg: "6rem",
                },
                lineHeight: 0.95,
                fontWeight: 700,
                fontFamily: '"Pinyon Script", cursive, sans-serif',
                letterSpacing: "0.01em",
                color: "#F6066F",
                textShadow:
                  "0 0 18px rgba(246, 6, 111, 0.42), 0 0 36px rgba(140, 82, 255, 0.28)",
              }}
            >
              Technology
            </Typography>

            <Box
              sx={{
                position: "relative",
                width: "100%",
                maxWidth: { xs: 560, sm: 760, md: 1050, lg: 1200, xl: 1320 },
                aspectRatio: "16 / 9",
                borderRadius: { xs: "1rem", md: "1.35rem" },
                overflow: "hidden",
                background:
                  "linear-gradient(135deg, rgba(2, 35, 113, 0.22), rgba(246, 6, 111, 0.16))",
                border: "3px solid rgba(246, 6, 111, 0.42)",
                boxShadow:
                  "0 0 0 1px rgba(255, 255, 255, 0.1), 0 22px 60px rgba(0, 0, 0, 0.42), 0 0 52px rgba(246, 6, 111, 0.24), 0 0 68px rgba(2, 35, 113, 0.34)",
                transform: "translateZ(0)",

                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  borderRadius: "inherit",
                  background:
                    "linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 26%, transparent 76%, rgba(246, 6, 111, 0.1))",
                  opacity: 0.5,
                },
              }}
            >
              <Box
                component="img"
                src={TECHNOLOGY_IMAGE_URL}
                alt="Aerealith AI technology artwork showing modern systems, cloud infrastructure, security, and performance"
                loading="eager"
                decoding="async"
                sx={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "center center",
                }}
              />
            </Box>

            <Typography
              component="p"
              sx={{
                mx: "auto",
                maxWidth: { xs: "100%", sm: 760, md: 1120, lg: 1240 },
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: { xs: "1rem", md: "1.2rem", lg: "1.28rem" },
                lineHeight: 1.8,
                textAlign: "center",
                textShadow: "0 0 16px rgba(0, 0, 0, 0.65)",
              }}
            >
              Aerealith AI is built on modern, battle-tested technologies
              selected for performance, reliability, scalability, security, and
              long-term flexibility. Every part of the stack is chosen to
              support a connected assistant platform that can evolve across
              cloud, self-hosted, and air-gapped environments while staying
              fast, observable, resilient, and secure.
            </Typography>
          </Box>

          <Grid
            container
            spacing={{ xs: 3, md: 4 }}
            sx={{
              alignItems: "stretch",
              justifyContent: "center",
            }}
          >
            {allCards.map((card, idx) => (
              <Grid
                key={`${card.title}-${card.link ?? idx}`}
                size={{ xs: 12, md: 6, lg: 4 }}
                sx={{
                  display: "flex",
                }}
              >
                <Box
                  component="article"
                  data-testid="aerealith-card"
                  data-card-title={card.title}
                  sx={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "100%",
                    minHeight: { xs: "auto", md: 520 },
                    px: { xs: 2.5, sm: 3, md: 3.5 },
                    py: { xs: 3, md: 3.5 },
                    borderRadius: { xs: "1.25rem", md: "1.5rem" },
                    overflow: "hidden",
                    background:
                      "linear-gradient(135deg, rgba(5, 7, 22, 0.86), rgba(13, 10, 34, 0.74), rgba(35, 12, 50, 0.62))",
                    border: "1px solid rgba(246, 6, 111, 0.24)",
                    boxShadow:
                      "0 22px 60px rgba(0, 0, 0, 0.36), 0 0 30px rgba(2, 35, 113, 0.16), inset 0 0 38px rgba(246, 6, 111, 0.045)",
                    backdropFilter: "blur(18px) saturate(145%)",
                    WebkitBackdropFilter: "blur(18px) saturate(145%)",
                    transition:
                      "transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, background 220ms ease",

                    "&::before": {
                      content: '""',
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      background:
                        "radial-gradient(circle at 50% 0%, rgba(246, 6, 111, 0.14), transparent 34%), radial-gradient(circle at 80% 100%, rgba(2, 35, 113, 0.2), transparent 40%)",
                      opacity: 0.9,
                      transition: "opacity 220ms ease",
                    },

                    "&::after": {
                      content: '""',
                      position: "absolute",
                      inset: -2,
                      pointerEvents: "none",
                      borderRadius: "inherit",
                      background:
                        "linear-gradient(135deg, rgba(246, 6, 111, 0.18), transparent 32%, rgba(124, 58, 237, 0.16), transparent 72%, rgba(2, 35, 113, 0.22))",
                      opacity: 0,
                      transition: "opacity 220ms ease",
                    },

                    "&:hover": {
                      transform: "translateY(-5px)",
                      borderColor: "rgba(246, 6, 111, 0.72)",
                      background:
                        "linear-gradient(135deg, rgba(8, 8, 28, 0.92), rgba(29, 14, 54, 0.82), rgba(55, 13, 70, 0.7))",
                      boxShadow:
                        "0 30px 80px rgba(0, 0, 0, 0.5), 0 0 18px rgba(255, 255, 255, 0.08), 0 0 42px rgba(246, 6, 111, 0.38), 0 0 78px rgba(124, 58, 237, 0.26), 0 0 96px rgba(2, 35, 113, 0.28), inset 0 0 52px rgba(246, 6, 111, 0.09)",
                    },

                    "&:hover::before": {
                      opacity: 1,
                    },

                    "&:hover::after": {
                      opacity: 1,
                    },

                    "&:hover img": {
                      transform: "scale(1.04)",
                      filter:
                        "drop-shadow(0 0 24px rgba(246, 6, 111, 0.42)) drop-shadow(0 0 34px rgba(124, 58, 237, 0.32))",
                    },
                  }}
                >
                  <Box
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: "100%",
                      height: "100%",
                      gap: 2.25,
                    }}
                  >
                    <Typography
                      component="h2"
                      sx={{
                        color: "#F6066F",
                        fontSize: { xs: "1.35rem", md: "1.55rem" },
                        lineHeight: 1.2,
                        fontWeight: 800,
                        textAlign: "center",
                        letterSpacing: "0.01em",
                        textShadow:
                          "0 0 14px rgba(246, 6, 111, 0.44), 0 0 24px rgba(140, 82, 255, 0.22)",
                      }}
                    >
                      {card.title}
                    </Typography>

                    {card.image ? (
                      <Box
                        sx={{
                          position: "relative",
                          width: "100%",
                          maxWidth: { xs: 300, sm: 330, md: 350 },
                          aspectRatio: "1 / 1",
                          mx: "auto",
                          flexShrink: 0,
                          overflow: "visible",
                          filter:
                            "drop-shadow(0 0 18px rgba(2, 35, 113, 0.36)) drop-shadow(0 0 26px rgba(246, 6, 111, 0.24))",
                        }}
                      >
                        <Box
                          component="img"
                          src={card.image}
                          alt={`${card.title} artwork`}
                          loading="lazy"
                          decoding="async"
                          sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            objectPosition: "center center",
                            transition:
                              "transform 220ms ease, filter 220ms ease",
                          }}
                        />
                      </Box>
                    ) : null}

                    <Box
                      sx={{
                        width: "100%",
                        flex: 1,
                        px: { xs: 2, md: 2.5 },
                        py: { xs: 2.25, md: 2.5 },
                        borderRadius: { xs: "1.25rem", md: "1.75rem" },
                        backgroundColor: "rgba(255, 255, 255, 0.035)",
                        border: "1px solid rgba(246, 6, 111, 0.14)",
                        boxShadow: "inset 0 0 28px rgba(255, 255, 255, 0.025)",
                      }}
                    >
                      <Typography
                        component="p"
                        sx={{
                          color: "rgba(255, 255, 255, 0.78)",
                          fontSize: {
                            xs: "0.95rem",
                            md: "0.98rem",
                            lg: "0.95rem",
                            xl: "1rem",
                          },
                          lineHeight: 1.65,
                          textAlign: "center",
                          textWrap: "pretty",
                        }}
                      >
                        {card.description}
                      </Typography>

                      {card.listItems.length > 0 ? (
                        <Box
                          component="ul"
                          sx={{
                            mt: 2.25,
                            mb: 0,
                            pl: 0,
                            display: "grid",
                            gap: 1,
                            listStyle: "none",
                          }}
                        >
                          {card.listItems.map((item) => (
                            <Box
                              key={`${card.title}-${item.text}-${item.href ?? "text"}`}
                              component="li"
                              sx={{
                                display: "flex",
                                justifyContent: "center",
                                textAlign: "center",
                              }}
                            >
                              {item.href ? (
                                <Box
                                  component="a"
                                  href={item.href}
                                  {...getLinkTargetProps(item.href)}
                                  sx={{
                                    color: "#ffffff",
                                    textDecoration: "none",
                                    fontSize: {
                                      xs: "0.92rem",
                                      md: "0.95rem",
                                    },
                                    fontWeight: 700,
                                    lineHeight: 1.5,
                                    textShadow:
                                      "0 0 12px rgba(246, 6, 111, 0.32)",

                                    "&:hover": {
                                      color: "#F6066F",
                                      textDecoration: "underline",
                                    },
                                  }}
                                >
                                  {item.text}
                                </Box>
                              ) : (
                                <Typography
                                  component="span"
                                  sx={{
                                    color: "rgba(255, 255, 255, 0.84)",
                                    fontSize: {
                                      xs: "0.92rem",
                                      md: "0.95rem",
                                    },
                                    fontWeight: 700,
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {item.text}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      ) : null}
                    </Box>

                    {card.link && card.buttonText ? (
                      <Button
                        component="a"
                        href={card.link}
                        {...getLinkTargetProps(card.link)}
                        sx={{
                          mt: "auto",
                          px: 3,
                          py: 1,
                          minWidth: 150,
                          borderRadius: 999,
                          color: "#ffffff",
                          background:
                            "linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)",
                          border: "1px solid rgba(255, 255, 255, 0.22)",
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          textTransform: "none",
                          boxShadow:
                            "0 0 18px rgba(246, 6, 111, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)",
                          transition:
                            "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",

                          "&:hover": {
                            color: "#ffffff",
                            background:
                              "linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)",
                            borderColor: "rgba(255, 255, 255, 0.45)",
                            boxShadow:
                              "0 0 18px rgba(255, 255, 255, 0.16), 0 0 34px rgba(246, 6, 111, 0.76), 0 0 54px rgba(124, 58, 237, 0.52), 0 0 72px rgba(2, 35, 113, 0.42), 0 16px 36px rgba(0, 0, 0, 0.42)",
                            transform: "translateY(-2px) scale(1.04)",
                          },

                          "&:active": {
                            transform: "translateY(0) scale(0.99)",
                            boxShadow:
                              "0 0 18px rgba(246, 6, 111, 0.52), 0 10px 24px rgba(0, 0, 0, 0.35)",
                          },
                        }}
                      >
                        {card.buttonText}
                      </Button>
                    ) : null}
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}

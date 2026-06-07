"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Box, Button, Container, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";

import { headerProps } from "../../../content/header";
import * as technology from "../../../content/technology";

const Header = dynamic(
  () => import("@helix-ai/ui").then((module) => module.Header),
  { ssr: false },
);

const HEADER_HEIGHT = 92;

type RouteParams = {
  link?: string | string[];
};

type TechnologyListItem = {
  text: string;
  href?: string;
  detailedDescription: string;
};

type TechnologyCard = {
  title: string;
  description: string;
  image?: string;
  link?: string;
  buttonText?: string;
  listItems: TechnologyListItem[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return fallback;
}

function optionalText(value: unknown): string | undefined {
  const rendered = text(value);

  return rendered.length > 0 ? rendered : undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePath(value: unknown): string {
  const raw = text(value);
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  return path.replace(/\/+/g, "/").toLowerCase();
}

function routeParamToSlug(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return safeDecode(value.filter(Boolean).join("/"));
  }

  return safeDecode(text(value));
}

function normalizeListItems(value: unknown): TechnologyListItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): TechnologyListItem | null => {
      if (typeof item === "string") {
        const itemText = text(item);

        return itemText
          ? {
              text: itemText,
              detailedDescription: itemText,
            }
          : null;
      }

      if (!isPlainObject(item)) {
        return null;
      }

      const itemText = text(item.text);
      const detailedDescription =
        text(item.detailedDescription) ||
        text(item.description) ||
        text(item.details) ||
        itemText;
      const href = optionalText(item.href);

      if (!itemText) {
        return null;
      }

      return {
        text: itemText,
        detailedDescription,
        ...(href ? { href } : {}),
      };
    })
    .filter((item): item is TechnologyListItem => item !== null);
}

function normalizeTechnologyCard(value: unknown): TechnologyCard | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const title = text(value.title);
  const description = text(value.description);

  if (!title || !description) {
    return null;
  }

  return {
    title,
    description,
    image: optionalText(value.image),
    link: optionalText(value.link),
    buttonText: optionalText(value.buttonText),
    listItems: normalizeListItems(value.listItems),
  };
}

function normalizeTechnologyCards(value: unknown): TechnologyCard[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeTechnologyCards(item))
      .filter(Boolean);
  }

  const card = normalizeTechnologyCard(value);

  return card ? [card] : [];
}

function getAllCards(): TechnologyCard[] {
  return Object.values(technology)
    .flatMap(normalizeTechnologyCards)
    .sort((a, b) => a.title.localeCompare(b.title));
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

const safeHeaderPages = Array.isArray(headerProps.pages)
  ? [...headerProps.pages]
  : [];

function TechnologyListCard({ item }: { item: TechnologyListItem }) {
  return (
    <Box
      component="article"
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        minHeight: { xs: "auto", md: 320 },
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
          {item.text}
        </Typography>

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
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
            {item.detailedDescription}
          </Typography>
        </Box>

        {item.href ? (
          <Button
            component="a"
            href={item.href}
            {...getLinkTargetProps(item.href)}
            sx={{
              mt: "auto",
              px: 3,
              py: 1,
              minWidth: 150,
              borderRadius: 999,
              color: "#ffffff",
              background:
                "linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)",
              border: "1px solid rgba(255, 255, 255, 0.22)",
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "none",
              boxShadow:
                "0 0 18px rgba(2, 35, 113, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)",
              transition:
                "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",

              "&:hover": {
                color: "#ffffff",
                background:
                  "linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)",
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
            Learn more
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}

function NotFoundPage({ slug }: { slug: string }) {
  return (
    <Box
      component="main"
      sx={{
        position: "relative",
        minHeight: "100vh",
        pt: `${HEADER_HEIGHT}px`,
        color: "#fff",
        overflow: "hidden",
        background:
          "radial-gradient(circle at top center, rgba(246, 6, 111, 0.18), transparent 34%), linear-gradient(180deg, #060014 0%, #050018 45%, #02000b 100%)",
      }}
    >
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          height: HEADER_HEIGHT,
          background:
            "linear-gradient(90deg, rgba(210, 0, 110, 0.92), rgba(20, 32, 130, 0.92))",
          borderBottom: "1px solid rgba(255,255,255,0.14)",
          backdropFilter: "blur(14px)",
        }}
      >
        <Header {...headerProps} pages={safeHeaderPages} />
      </Box>

      <Container
        maxWidth="md"
        sx={{
          position: "relative",
          zIndex: 1,
          py: { xs: 8, md: 12 },
          textAlign: "center",
        }}
      >
        <Typography
          component="h1"
          sx={{
            mb: 2,
            fontSize: { xs: "2rem", md: "3rem" },
            fontWeight: 900,
            textShadow: "0 0 28px rgba(246, 6, 111, 0.34)",
          }}
        >
          Page not found
        </Typography>

        <Typography
          sx={{
            mb: 4,
            color: "rgba(255,255,255,0.76)",
            fontSize: "1.1rem",
            lineHeight: 1.7,
          }}
        >
          We couldn&apos;t find a technology matching{" "}
          <Box component="strong" sx={{ color: "#F6066F" }}>
            {slug || "unknown"}
          </Box>
          .
        </Typography>

        <Button
          component="a"
          href="/technology"
          sx={{
            px: 4,
            py: 1.25,
            borderRadius: 999,
            color: "#ffffff",
            background:
              "linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            fontWeight: 800,
            textTransform: "none",
            boxShadow:
              "0 0 18px rgba(2, 35, 113, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)",

            "&:hover": {
              color: "#ffffff",
              background:
                "linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)",
              borderColor: "rgba(255, 255, 255, 0.45)",
              boxShadow:
                "0 0 34px rgba(246, 6, 111, 0.76), 0 0 54px rgba(124, 58, 237, 0.52), 0 0 72px rgba(2, 35, 113, 0.42)",
            },
          }}
        >
          Back to Technologies
        </Button>
      </Container>
    </Box>
  );
}

export default function Page() {
  const params = useParams<RouteParams>();
  const slug = routeParamToSlug(params?.link);
  const target = normalizePath(`/technology/${slug}`);

  const allCards = React.useMemo(() => getAllCards(), []);
  const matchedCard = allCards.find(
    (card) => normalizePath(card.link) === target,
  );

  if (!matchedCard) {
    return <NotFoundPage slug={slug} />;
  }

  return (
    <Box
      component="main"
      sx={{
        position: "relative",
        minHeight: "100vh",
        pt: `${HEADER_HEIGHT}px`,
        color: "#fff",
        overflow: "hidden",
        background:
          "radial-gradient(circle at top center, rgba(246, 6, 111, 0.18), transparent 34%), linear-gradient(180deg, #060014 0%, #050018 45%, #02000b 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <Box
        sx={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          backgroundImage: 'url("/images/backgrounds/technology-bg.png")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.34,
          zIndex: 0,
        }}
      />

      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          height: HEADER_HEIGHT,
          background:
            "linear-gradient(90deg, rgba(210, 0, 110, 0.92), rgba(20, 32, 130, 0.92))",
          borderBottom: "1px solid rgba(255,255,255,0.14)",
          backdropFilter: "blur(14px)",
        }}
      >
        <Header {...headerProps} pages={safeHeaderPages} />
      </Box>

      <Container
        component="section"
        maxWidth={false}
        sx={{
          position: "relative",
          zIndex: 1,
          mx: "auto",
          maxWidth: 1560,
          px: { xs: 2, sm: 3, lg: 4 },
          py: { xs: 6, md: 8 },
        }}
      >
        <Box
          sx={{
            mb: { xs: 5, md: 7 },
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: { xs: 2, md: 3 },
            textAlign: "center",
          }}
        >
          <Typography
            component="h1"
            sx={{
              color: "#F6066F",
              fontSize: {
                xs: "2.75rem",
                sm: "3.5rem",
                md: "4.75rem",
                lg: "5.5rem",
              },
              lineHeight: 0.98,
              fontWeight: 700,
              fontFamily: '"Pinyon Script", cursive, sans-serif',
              letterSpacing: "0.01em",
              textShadow:
                "0 0 18px rgba(246, 6, 111, 0.42), 0 0 36px rgba(140, 82, 255, 0.28)",
            }}
          >
            {matchedCard.title}
          </Typography>

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
            {matchedCard.description}
          </Typography>
        </Box>

        {matchedCard.listItems.length > 0 ? (
          <Grid
            container
            spacing={{ xs: 3, md: 4 }}
            sx={{
              alignItems: "stretch",
              justifyContent: "center",
            }}
          >
            {matchedCard.listItems.map((item, idx) => (
              <Grid
                key={`${item.href ?? item.text}-${idx}`}
                size={{ xs: 12, md: 6, lg: 4 }}
                sx={{
                  display: "flex",
                }}
              >
                <TechnologyListCard item={item} />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography
            component="p"
            sx={{
              mx: "auto",
              maxWidth: 820,
              color: "rgba(255, 255, 255, 0.76)",
              fontSize: { xs: "1rem", md: "1.12rem" },
              lineHeight: 1.7,
              textAlign: "center",
            }}
          >
            No detailed entries are available for this technology yet.
          </Typography>
        )}

        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            mt: { xs: 5, md: 7 },
          }}
        >
          <Button
            component="a"
            href="/technology"
            sx={{
              px: 4,
              py: 1.25,
              minWidth: 190,
              borderRadius: 999,
              color: "#ffffff",
              background:
                "linear-gradient(135deg, #022371 0%, #7c3aed 48%, #f6066f 100%)",
              border: "1px solid rgba(255, 255, 255, 0.22)",
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "none",
              boxShadow:
                "0 0 18px rgba(2, 35, 113, 0.34), 0 12px 28px rgba(0, 0, 0, 0.28)",
              transition:
                "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",

              "&:hover": {
                color: "#ffffff",
                background:
                  "linear-gradient(135deg, #f6066f 0%, #7c3aed 52%, #022371 100%)",
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
            Back to Technologies
          </Button>
        </Box>
      </Container>
    </Box>
  );
}

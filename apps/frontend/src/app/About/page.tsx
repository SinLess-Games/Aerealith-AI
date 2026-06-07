"use client";

import { Box, Typography } from "@mui/material";
import Grid from "@mui/material/Grid";
import dynamic from "next/dynamic";
import React from "react";

import { AboutContent } from "../../content/about";
import { headerProps } from "../../content/header";

const Header = dynamic(
  () => import("@helix-ai/ui").then((module) => module.Header),
  { ssr: false },
);

type AboutSectionCard = {
  title: string;
  description: string;
};

type LooseAboutSection = {
  title?: unknown;
  paragraphs?: unknown;
};

const ABOUT_IMAGE_URL = "/images/about-us.png";

const ORDER_MAP: Record<string, number> = {
  "Who We Are": 1,
  "Our Mission": 2,
  "Our Story": 3,
  "Meet the Team": 4,
};

function text(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : fallback;
}

function nodeToPlainText(node: React.ReactNode): string {
  if (typeof node === "string") {
    return node.trim();
  }

  if (typeof node === "number" || typeof node === "bigint") {
    return String(node).trim();
  }

  if (Array.isArray(node)) {
    return node
      .map((child) => nodeToPlainText(child))
      .filter((value) => value.length > 0)
      .join(" ")
      .trim();
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return nodeToPlainText(node.props.children);
  }

  return "";
}

function paragraphsToDescription(value: unknown): string {
  const paragraphs = Array.isArray(value) ? value : [value];

  return paragraphs
    .map((paragraph) => nodeToPlainText(paragraph as React.ReactNode))
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n")
    .trim();
}

const aboutSections: AboutSectionCard[] = (
  Array.isArray(AboutContent) ? AboutContent : []
).map((section, index) => {
  const aboutSection = section as LooseAboutSection;
  const title = text(aboutSection.title, `About Section ${index + 1}`);
  const description = paragraphsToDescription(aboutSection.paragraphs);

  return {
    title,
    description:
      description ||
      "Aerealith AI is being designed to make connected digital systems easier to understand, manage, and automate.",
  };
});

const safeHeaderPages = Array.isArray(headerProps.pages)
  ? [...headerProps.pages]
  : [];

export default function AboutPage() {
  return (
    <Box
      component="div"
      sx={{
        position: "relative",
        minHeight: "100vh",
        color: "white",
        overflow: "hidden",
      }}
    >
      <Box sx={{ position: "relative", zIndex: 2 }}>
        <Header {...headerProps} pages={safeHeaderPages} />

        <Box
          component="main"
          sx={{
            mx: "auto",
            maxWidth: 1560,
            px: { xs: 2, sm: 3, lg: 4 },
            pt: { xs: 5, md: 8 },
            pb: { xs: 10, md: 14 },
          }}
        >
          <Box
            component="section"
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
              About Aerealith AI
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
                src={ABOUT_IMAGE_URL}
                alt="Aerealith AI about artwork"
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
              Aerealith AI is being built to help people bring order,
              intelligence, and automation into the digital systems they use
              every day. Our goal is to simplify complexity by connecting apps,
              organizing information, monitoring important systems, and turning
              scattered data into clear, useful action. Whether you are managing
              personal workflows, building software, operating infrastructure,
              creating content, or running a business, Aerealith AI is designed
              to give you one secure place to ask questions, understand what is
              happening, automate repetitive work, and make better decisions
              with confidence.
            </Typography>
          </Box>

          <Grid
            container
            spacing={{ xs: 3, md: 4 }}
            sx={{
              alignItems: "stretch",
            }}
          >
            {aboutSections.map((section) => (
              <Grid
                key={section.title}
                size={{ xs: 12, lg: 6 }}
                sx={{
                  order: {
                    xs: 0,
                    lg: ORDER_MAP[section.title] ?? 0,
                  },
                  display: "flex",
                }}
              >
                <Box
                  component="article"
                  sx={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    minHeight: { xs: "auto", lg: 300 },
                    px: { xs: 2.5, sm: 3.5, md: 4 },
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
                      gap: 2,
                      height: "100%",
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
                      {section.title}
                    </Typography>

                    <Box
                      sx={{
                        width: "100%",
                        flex: 1,
                        px: { xs: 2, md: 3 },
                        py: { xs: 2.25, md: 2.75 },
                        borderRadius: { xs: "1.25rem", md: "1.75rem" },
                        backgroundColor: "rgba(255, 255, 255, 0.035)",
                        border: "1px solid rgba(246, 6, 111, 0.14)",
                        boxShadow: "inset 0 0 28px rgba(255, 255, 255, 0.025)",
                        transition:
                          "border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease",
                      }}
                    >
                      <Typography
                        component="p"
                        sx={{
                          color: "rgba(255, 255, 255, 0.78)",
                          fontSize: {
                            xs: "0.92rem",
                            sm: "0.95rem",
                            md: "0.98rem",
                            lg: "0.95rem",
                            xl: "1rem",
                          },
                          lineHeight: { xs: 1.55, md: 1.6 },
                          textAlign: "center",
                          textWrap: "pretty",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {section.description}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>
    </Box>
  );
}

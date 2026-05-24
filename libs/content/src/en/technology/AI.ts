// libs/content/src/en/technology/AI.ts

import type { ReadonlyCardArray } from '../../types';
import { Image_Paths } from '../constants/images';

/**
 * Primary AI tools technology image.
 *
 * Image source:
 *
 * apps/frontend/public/images/pages/technology/ai-tools.png
 *
 * @public
 * @constant
 * @readonly
 * @decorator image
 */
export const AIToolsImage = `${Image_Paths.pages.technology}/ai-tools.png` as const;

/**
 * AI and developer-assistance technology cards.
 *
 * This list intentionally includes only the AI platforms and assistants
 * currently used by Aerealith AI:
 *
 * - Cloudflare AI
 * - OpenAI
 * - GitHub Copilot
 * - OpenAI Codex
 *
 * @public
 * @constant
 * @readonly
 * @decorator cards
 */
export const aiToolsCards = [
  {
    title: 'AI & Developer Assistance',
    description:
      'Cloud AI infrastructure, frontier model APIs, coding assistants, and agentic developer tools currently used to build, improve, and operate Aerealith AI.',
    listItems: [
      {
        text: 'Cloudflare AI',
        href: 'https://developers.cloudflare.com/workers-ai/',
        role: 'Edge AI Inference',
        detailedDescription:
          'Cloudflare AI, through Workers AI, provides serverless AI inference on Cloudflare’s global network. It allows applications to run AI models from Workers, Pages, or the Cloudflare API without managing dedicated inference infrastructure. Aerealith AI can use Cloudflare AI for edge-first AI tasks, lightweight inference, embeddings, summarization, classification, automation support, and fast globally distributed AI workflows.',
      },
      {
        text: 'OpenAI',
        href: 'https://openai.com/api/',
        role: 'Frontier Models & APIs',
        detailedDescription:
          'OpenAI provides an API platform for building AI-powered applications, agents, assistants, automation workflows, structured generation, reasoning features, multimodal experiences, and production AI systems. Aerealith AI can use OpenAI as a core hosted model provider when workflows need strong reasoning, natural language understanding, coding support, tool calling, structured output, and general-purpose assistant intelligence.',
      },
      {
        text: 'GitHub Copilot',
        href: 'https://github.com/features/copilot',
        role: 'AI Pair Programmer',
        detailedDescription:
          'GitHub Copilot is an AI coding assistant that works inside developer tools and GitHub workflows to help write, explain, refactor, review, and understand code. It can provide contextual suggestions, chat-based coding help, and project-aware development assistance. Aerealith AI can use GitHub Copilot as part of the development workflow for faster implementation, code review support, documentation assistance, and day-to-day engineering productivity.',
      },
      {
        text: 'OpenAI Codex',
        href: 'https://developers.openai.com/codex/cloud',
        role: 'Coding Agent',
        detailedDescription:
          'OpenAI Codex is a coding agent designed to read, edit, run, explain, and help improve code. Codex can support bug fixing, feature implementation, repository exploration, refactoring, and unfamiliar codebase analysis. Aerealith AI can use Codex as an agentic development tool for implementation support, codebase maintenance, issue resolution, test-driven changes, and structured software engineering workflows.',
      },
    ],
    image: AIToolsImage,
    link: '/technology/ai-tools',
    buttonText: 'Explore tools',
  },
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `aiToolsCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const AIToolsCards = aiToolsCards;
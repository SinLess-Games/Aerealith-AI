// libs/content/src/en/technology/index.ts

import type { ReadonlyCardArray } from '../../types';

import { aiToolsCards } from './AI';
import { cloudPlatformCards } from './cloud-platforms';
import { dataStorageCards } from './data-storage';
import { developmentCards } from './development';
import { frameworksCards } from './frameworks';
import { infrastructureCards } from './infrastructure';
import { metricsExportersCards } from './metrics-exporters';
import { networkingCards } from './networking';
import { observabilityCards } from './observability';
import { programmingLanguagesCards } from './programming-languages';
import { securityCards } from './security';
import { toolsCards } from './tools';

/**
 * Technology content barrel exports.
 *
 * This file provides a single import surface for all technology-page content.
 *
 * @example
 * import { technologyCards, cloudPlatformCards } from '@aerealith-ai/content';
 *
 * @public
 * @module
 * @decorator barrel
 */
export * from './AI';
export * from './cloud-platforms';
export * from './data-storage';
export * from './development';
export * from './frameworks';
export * from './infrastructure';
export * from './metrics-exporters';
export * from './networking';
export * from './observability';
export * from './programming-languages';
export * from './security';
export * from './tools';

/**
 * Combined technology card registry.
 *
 * This array aggregates every technology card group into one ordered list.
 * Use this when rendering the full Technology page.
 *
 * @public
 * @constant
 * @readonly
 * @decorator registry
 */
export const technologyCards = [
  ...aiToolsCards,
  ...cloudPlatformCards,
  ...dataStorageCards,
  ...developmentCards,
  ...frameworksCards,
  ...infrastructureCards,
  ...metricsExportersCards,
  ...networkingCards,
  ...observabilityCards,
  ...programmingLanguagesCards,
  ...securityCards,
  ...toolsCards,
] as const satisfies ReadonlyCardArray;

/**
 * Backwards-compatible PascalCase export.
 *
 * Prefer `technologyCards` for new imports.
 *
 * @public
 * @constant
 * @readonly
 * @decorator alias
 */
export const TechnologyCards = technologyCards;

export const technologyCardGroups = {
  ai: aiToolsCards,
  cloudPlatforms: cloudPlatformCards,
  dataStorage: dataStorageCards,
  development: developmentCards,
  frameworks: frameworksCards,
  infrastructure: infrastructureCards,
  metricsExporters: metricsExportersCards,
  networking: networkingCards,
  observability: observabilityCards,
  programmingLanguages: programmingLanguagesCards,
  security: securityCards,
  tools: toolsCards,
} as const satisfies Record<string, ReadonlyCardArray>;
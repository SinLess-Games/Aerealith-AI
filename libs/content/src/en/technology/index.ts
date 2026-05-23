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

/**
 * Backwards-compatible PascalCase exports.
 *
 * Prefer camelCase exports for new imports.
 */
export { AIToolsCards, aiToolsCards } from './AI';
export { CloudPlatformCards, cloudPlatformCards } from './cloud-platforms';
export { DataStorageCards, dataStorageCards } from './data-storage';
export { DevelopmentCards, developmentCards } from './development';
export { FrameworksCards, frameworksCards } from './frameworks';
export { InfrastructureCards, infrastructureCards } from './infrastructure';
export {
  MetricsExportersCards,
  metricsExportersCards,
} from './metrics-exporters';
export { NetworkingCards, networkingCards } from './networking';
export { ObservabilityCards, observabilityCards } from './observability';
export {
  ProgrammingLanguagesCards,
  programmingLanguagesCards,
} from './programming-languages';
export { SecurityCards, securityCards } from './security';
export { ToolsCards, toolsCards } from './tools';
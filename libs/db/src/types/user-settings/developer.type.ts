// libs/db/src/types/user-settings/developer.type.ts

export type DeveloperPreferenceMode = 'system' | 'enabled' | 'disabled';

export type DeveloperExperienceLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'expert'
  | 'professional';

export type DeveloperPrimaryRole =
  | 'frontend'
  | 'backend'
  | 'full_stack'
  | 'mobile'
  | 'desktop'
  | 'game'
  | 'devops'
  | 'platform'
  | 'data'
  | 'security'
  | 'ai_ml'
  | 'designer'
  | 'product'
  | 'custom';

export type DeveloperPackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'deno'
  | 'pip'
  | 'uv'
  | 'poetry'
  | 'cargo'
  | 'go'
  | 'maven'
  | 'gradle'
  | 'composer'
  | 'nuget'
  | 'custom';

export type DeveloperRuntime =
  | 'node'
  | 'bun'
  | 'deno'
  | 'browser'
  | 'cloudflare_workers'
  | 'edge'
  | 'docker'
  | 'kubernetes'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'dotnet'
  | 'php'
  | 'custom';

export type DeveloperFramework =
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'nuxt'
  | 'svelte'
  | 'sveltekit'
  | 'angular'
  | 'solid'
  | 'astro'
  | 'remix'
  | 'hono'
  | 'express'
  | 'fastify'
  | 'nestjs'
  | 'elysia'
  | 'django'
  | 'flask'
  | 'fastapi'
  | 'laravel'
  | 'rails'
  | 'spring'
  | 'aspnet'
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'custom';

export type DeveloperDatabase =
  | 'postgres'
  | 'cockroachdb'
  | 'mysql'
  | 'mariadb'
  | 'sqlite'
  | 'mongodb'
  | 'redis'
  | 'valkey'
  | 'dragonfly'
  | 'dynamodb'
  | 'firestore'
  | 'cloudflare_d1'
  | 'cloudflare_kv'
  | 'cloudflare_durable_objects'
  | 'qdrant'
  | 'weaviate'
  | 'milvus'
  | 'custom';

export type DeveloperOrm =
  | 'mikroorm'
  | 'prisma'
  | 'drizzle'
  | 'typeorm'
  | 'sequelize'
  | 'mongoose'
  | 'sqlalchemy'
  | 'entity_framework'
  | 'hibernate'
  | 'none'
  | 'custom';

export type DeveloperIndentStyle = 'tabs' | 'spaces' | 'project_default';

export type DeveloperIndentSize =
  | 'project_default'
  | 'tab'
  | 2
  | 4
  | 8
  | number;

export type DeveloperEndOfLine = 'lf' | 'crlf' | 'cr' | 'auto' | 'project_default';

export type DeveloperQuoteStyle = 'single' | 'double' | 'backtick' | 'project_default';

export type DeveloperSemicolonStyle = 'always' | 'never' | 'project_default';

export type DeveloperTrailingCommaStyle =
  | 'none'
  | 'es5'
  | 'all'
  | 'project_default';

export type DeveloperBracketSpacingStyle =
  | 'enabled'
  | 'disabled'
  | 'project_default';

export type DeveloperArrowParensStyle =
  | 'always'
  | 'avoid'
  | 'project_default';

export type DeveloperModuleSystem =
  | 'esm'
  | 'commonjs'
  | 'umd'
  | 'amd'
  | 'system'
  | 'auto'
  | 'project_default';

export type DeveloperTypeScriptModuleResolution =
  | 'classic'
  | 'node'
  | 'node10'
  | 'node16'
  | 'nodenext'
  | 'bundler'
  | 'project_default';

export type DeveloperImportExtensionStyle =
  | 'always_js'
  | 'always_ts'
  | 'never'
  | 'auto'
  | 'project_default';

export type DeveloperCodeOutputStyle =
  | 'full_file'
  | 'patch_diff'
  | 'minimal_snippet'
  | 'focused_block'
  | 'explanation_only'
  | 'custom';

export type DeveloperTestingFramework =
  | 'vitest'
  | 'jest'
  | 'node_test_runner'
  | 'mocha'
  | 'cypress'
  | 'playwright'
  | 'storybook'
  | 'pytest'
  | 'unittest'
  | 'go_test'
  | 'cargo_test'
  | 'junit'
  | 'xunit'
  | 'none'
  | 'custom';

export type DeveloperLintTool =
  | 'eslint'
  | 'biome'
  | 'oxlint'
  | 'standardjs'
  | 'ruff'
  | 'pylint'
  | 'flake8'
  | 'golangci_lint'
  | 'clippy'
  | 'checkstyle'
  | 'none'
  | 'custom';

export type DeveloperFormatterTool =
  | 'prettier'
  | 'biome'
  | 'dprint'
  | 'black'
  | 'ruff_format'
  | 'gofmt'
  | 'rustfmt'
  | 'clang_format'
  | 'dotnet_format'
  | 'none'
  | 'custom';

export type DeveloperCiProvider =
  | 'github_actions'
  | 'gitlab_ci'
  | 'circleci'
  | 'buildkite'
  | 'jenkins'
  | 'azure_pipelines'
  | 'cloudflare_pages'
  | 'vercel'
  | 'netlify'
  | 'argocd'
  | 'tekton'
  | 'custom';

export type DeveloperDeploymentTarget =
  | 'cloudflare'
  | 'vercel'
  | 'netlify'
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'docker'
  | 'kubernetes'
  | 'proxmox'
  | 'bare_metal'
  | 'local'
  | 'air_gapped'
  | 'custom';

export type DeveloperGitBranchStrategy =
  | 'trunk_based'
  | 'github_flow'
  | 'git_flow'
  | 'release_branches'
  | 'environment_branches'
  | 'custom';

export type DeveloperCommitStyle =
  | 'freeform'
  | 'conventional_commits'
  | 'gitmoji'
  | 'semantic'
  | 'custom';

export type DeveloperDocumentationFormat =
  | 'markdown'
  | 'mdx'
  | 'asciidoc'
  | 'jsdoc'
  | 'typedoc'
  | 'openapi'
  | 'mkdocs'
  | 'docusaurus'
  | 'custom';

export type DeveloperArchitecturePreference =
  | 'monolith'
  | 'modular_monolith'
  | 'microservices'
  | 'serverless'
  | 'edge_first'
  | 'event_driven'
  | 'hexagonal'
  | 'clean_architecture'
  | 'domain_driven_design'
  | 'custom';

export type DeveloperFormattingSettings = {
  formatter?: DeveloperFormatterTool;
  lintTool?: DeveloperLintTool;
  indentStyle?: DeveloperIndentStyle;
  indentSize?: DeveloperIndentSize;
  tabWidth?: number;
  endOfLine?: DeveloperEndOfLine;
  charset?: 'utf-8' | 'utf-8-bom' | 'latin1' | 'project_default';
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  printWidth?: number;
  quoteStyle?: DeveloperQuoteStyle;
  semicolons?: DeveloperSemicolonStyle;
  trailingComma?: DeveloperTrailingCommaStyle;
  bracketSpacing?: DeveloperBracketSpacingStyle;
  arrowParens?: DeveloperArrowParensStyle;
  organizeImports?: boolean;
  sortImports?: boolean;
};

export type DeveloperTypeScriptSettings = {
  enabled?: boolean;
  strict?: boolean;
  moduleSystem?: DeveloperModuleSystem;
  moduleResolution?: DeveloperTypeScriptModuleResolution;
  importExtensionStyle?: DeveloperImportExtensionStyle;
  useTypeOnlyImports?: boolean;
  preferInterfaces?: boolean;
  preferTypes?: boolean;
  noExplicitAny?: boolean;
  noUncheckedIndexedAccess?: boolean;
  exactOptionalPropertyTypes?: boolean;
  emitDeclarations?: boolean;
  useProjectReferences?: boolean;
};

export type DeveloperStackSettings = {
  primaryRole?: DeveloperPrimaryRole;
  experienceLevel?: DeveloperExperienceLevel;
  primaryLanguages?: string[];
  preferredRuntimes?: DeveloperRuntime[];
  preferredFrameworks?: DeveloperFramework[];
  preferredDatabases?: DeveloperDatabase[];
  preferredOrm?: DeveloperOrm;
  preferredPackageManager?: DeveloperPackageManager;
  architecturePreference?: DeveloperArchitecturePreference;
};

export type DeveloperCodeOutputSettings = {
  defaultOutputStyle?: DeveloperCodeOutputStyle;
  returnFullFiles?: boolean;
  includeFilePathHeader?: boolean;
  includeComments?: boolean;
  includeExplanations?: boolean;
  includeTests?: boolean;
  includeTypes?: boolean;
  includeErrorHandling?: boolean;
  preferCopyPasteReadyCode?: boolean;
  preferMinimalDependencies?: boolean;
  preferSecurityFirstCode?: boolean;
  preferPerformanceOptimizedCode?: boolean;
};

export type DeveloperTestingSettings = {
  preferredUnitTestFramework?: DeveloperTestingFramework;
  preferredE2eFramework?: DeveloperTestingFramework;
  preferredComponentTestFramework?: DeveloperTestingFramework;
  writeTestsByDefault?: boolean;
  includeTestCommands?: boolean;
  preferMockedTests?: boolean;
  preferIntegrationTests?: boolean;
  preferE2eTests?: boolean;
  minimumCoveragePercent?: number;
};

export type DeveloperGitSettings = {
  branchStrategy?: DeveloperGitBranchStrategy;
  commitStyle?: DeveloperCommitStyle;
  defaultBranch?: string;
  featureBranchPrefix?: string;
  bugfixBranchPrefix?: string;
  releaseBranchPrefix?: string;
  preferRebase?: boolean;
  preferSquashMerge?: boolean;
  signCommits?: boolean;
  requirePullRequests?: boolean;
  includePrDescription?: boolean;
};

export type DeveloperCiCdSettings = {
  providers?: DeveloperCiProvider[];
  deploymentTargets?: DeveloperDeploymentTarget[];
  runChecksBeforeCommit?: boolean;
  runChecksBeforePush?: boolean;
  runTestsInCi?: boolean;
  runLintInCi?: boolean;
  runTypecheckInCi?: boolean;
  runSecurityScansInCi?: boolean;
  preferPreviewDeployments?: boolean;
  preferBlueGreenDeployments?: boolean;
  preferCanaryDeployments?: boolean;
  preferRollbackPlan?: boolean;
};

export type DeveloperDocumentationSettings = {
  preferredFormats?: DeveloperDocumentationFormat[];
  writeDocsByDefault?: boolean;
  includeExamples?: boolean;
  includeApiDocs?: boolean;
  includeArchitectureNotes?: boolean;
  includeAdrs?: boolean;
  includeMermaidDiagrams?: boolean;
  includeChangelogEntries?: boolean;
};

export type DeveloperEditorSettings = {
  preferredEditor?: 'vscode' | 'webstorm' | 'vim' | 'neovim' | 'emacs' | 'zed' | 'helix' | 'custom';
  formatOnSave?: boolean;
  lintOnSave?: boolean;
  typecheckOnSave?: boolean;
  autoFixOnSave?: boolean;
  useEditorConfig?: boolean;
  useWorkspaceSettings?: boolean;
  preferredTerminal?: 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'nushell' | 'custom';
};

export type DeveloperInfrastructureSettings = {
  preferDocker?: boolean;
  preferCompose?: boolean;
  preferKubernetes?: boolean;
  preferHelm?: boolean;
  preferKustomize?: boolean;
  preferTerraform?: boolean;
  preferAnsible?: boolean;
  preferGitOps?: boolean;
  preferObservability?: boolean;
  preferOpenTelemetry?: boolean;
};

export type DeveloperUserSettings = {
  mode?: DeveloperPreferenceMode;
  stack?: DeveloperStackSettings;
  formatting?: DeveloperFormattingSettings;
  typescript?: DeveloperTypeScriptSettings;
  codeOutput?: DeveloperCodeOutputSettings;
  testing?: DeveloperTestingSettings;
  git?: DeveloperGitSettings;
  ciCd?: DeveloperCiCdSettings;
  documentation?: DeveloperDocumentationSettings;
  editor?: DeveloperEditorSettings;
  infrastructure?: DeveloperInfrastructureSettings;
};

export type DeveloperUserSettingsPatch = {
  mode?: DeveloperPreferenceMode;
  stack?: Partial<DeveloperStackSettings>;
  formatting?: Partial<DeveloperFormattingSettings>;
  typescript?: Partial<DeveloperTypeScriptSettings>;
  codeOutput?: Partial<DeveloperCodeOutputSettings>;
  testing?: Partial<DeveloperTestingSettings>;
  git?: Partial<DeveloperGitSettings>;
  ciCd?: Partial<DeveloperCiCdSettings>;
  documentation?: Partial<DeveloperDocumentationSettings>;
  editor?: Partial<DeveloperEditorSettings>;
  infrastructure?: Partial<DeveloperInfrastructureSettings>;
};
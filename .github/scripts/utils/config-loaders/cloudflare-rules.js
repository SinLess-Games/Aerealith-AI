// .github/scripts/utils/config-loaders/cloudflare-rules.js
// =============================================================================
// Aerealith AI Cloudflare Rules Config Loader
// -----------------------------------------------------------------------------
// Purpose:
//   Load, normalize, validate, and query
//   `.github/repo-management/cloudflare-rules.yaml`.
//
// Used by:
//   - .github/scripts/cloudflare/discover-deployments.js
//   - .github/scripts/cloudflare/deploy-preview.js
//   - .github/scripts/cloudflare/deploy-staging.js
//   - .github/scripts/cloudflare/deploy-production.js
//   - .github/scripts/cloudflare/run-d1-migrations.js
//   - .github/scripts/cloudflare/sync-kv.js
//   - .github/scripts/cloudflare/sync-r2.js
//   - .github/scripts/cloudflare/sync-queues.js
//   - .github/scripts/cloudflare/sync-secrets.js
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/security/run-policy-gate.js
//
// Notes:
//   - This loader does not mutate Cloudflare or GitHub state.
//   - It is safe for dry-run and read-only workflows.
//   - It centralizes Cloudflare deployment policy, target discovery,
//     environment policy, required secrets, bindings, smoke tests,
//     and production safety checks.
// =============================================================================

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const minimatchModule = require("minimatch");
const logger = require("../logger");

const minimatch = minimatchModule.minimatch || minimatchModule;

const DEFAULT_CONFIG_PATH = ".github/repo-management/cloudflare-rules.yaml";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeNumber(value, fallback = 0, fieldPath = "value") {
  if (value === undefined || value === null || value === "") return fallback;

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${fieldPath} must be a finite number.`);
  }

  return number;
}

function normalizeString(value, fieldPath, options = {}) {
  const { fallback = "", allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (!allowEmpty && !fallback) {
      throw new TypeError(`${fieldPath} is required.`);
    }

    return fallback;
  }

  if (typeof value !== "string") {
    throw new TypeError(`${fieldPath} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return trimmed || fallback;
}

function normalizeNullableString(value, fieldPath) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value !== "string") {
    throw new TypeError(`${fieldPath} must be a string when provided.`);
  }

  return value.trim() || null;
}

function normalizeStringList(value, fieldPath, options = {}) {
  const { allowEmpty = true } = options;

  if (value === undefined || value === null) {
    if (allowEmpty) return [];
    throw new TypeError(`${fieldPath} is required.`);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed && !allowEmpty) {
      throw new TypeError(`${fieldPath} cannot be empty.`);
    }

    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(
      `${fieldPath} must be a string or an array of strings.`,
    );
  }

  const normalized = value
    .map((item, index) => {
      if (typeof item !== "string") {
        throw new TypeError(`${fieldPath}[${index}] must be a string.`);
      }

      return item.trim();
    })
    .filter(Boolean);

  if (!normalized.length && !allowEmpty) {
    throw new TypeError(`${fieldPath} cannot be empty.`);
  }

  return unique(normalized);
}

function normalizeObject(value, fieldPath) {
  if (value === undefined || value === null) return {};

  if (!isPlainObject(value)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  return value;
}

function compileRegex(pattern, fieldPath) {
  if (!pattern || typeof pattern !== "string") {
    throw new TypeError(`${fieldPath} must be a non-empty regex string.`);
  }

  try {
    return new RegExp(pattern);
  } catch (err) {
    throw new TypeError(`${fieldPath} is not a valid regex: ${err.message}`);
  }
}

function validateRegexList(patterns, fieldPath) {
  for (const [index, pattern] of patterns.entries()) {
    compileRegex(pattern, `${fieldPath}[${index}]`);
  }
}

function matchesRegex(pattern, value) {
  if (!pattern || typeof pattern !== "string") return false;
  if (!value || typeof value !== "string") return false;

  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

function matchesAnyRegex(patterns, value) {
  return normalizeStringList(patterns, "patterns").some((pattern) =>
    matchesRegex(pattern, value),
  );
}

function normalizeRepository(repository) {
  repository = normalizeObject(repository, "repository");

  return {
    ...repository,
    owner: normalizeString(repository.owner, "repository.owner", {
      fallback: "SinLess-Games",
    }),
    name: normalizeString(repository.name, "repository.name", {
      fallback: "Aerealith-AI",
    }),
    default_branch: normalizeString(
      repository.default_branch,
      "repository.default_branch",
      {
        fallback: "main",
      },
    ),
  };
}

function normalizeCloudflare(cloudflare) {
  cloudflare = normalizeObject(cloudflare, "cloudflare");

  const services = normalizeObject(cloudflare.services, "cloudflare.services");
  const tooling = normalizeObject(cloudflare.tooling, "cloudflare.tooling");

  return {
    ...cloudflare,

    account_id_variable: normalizeString(
      cloudflare.account_id_variable,
      "cloudflare.account_id_variable",
      { fallback: "CLOUDFLARE_ACCOUNT_ID" },
    ),

    api_token_secret: normalizeString(
      cloudflare.api_token_secret,
      "cloudflare.api_token_secret",
      { fallback: "CLOUDFLARE_API_TOKEN" },
    ),

    primary_platform: normalizeBoolean(cloudflare.primary_platform, true),

    services: {
      ...services,
      workers: normalizeBoolean(services.workers, true),
      queues: normalizeBoolean(services.queues, true),
      r2: normalizeBoolean(services.r2, true),
      d1: normalizeBoolean(services.d1, true),
      kv: normalizeBoolean(services.kv, true),
      secrets_store: normalizeBoolean(services.secrets_store, true),
      pages: normalizeBoolean(services.pages, false),
    },

    tooling: {
      ...tooling,
      package_manager: normalizeString(
        tooling.package_manager,
        "cloudflare.tooling.package_manager",
        {
          fallback: "pnpm",
        },
      ),
      pnpm_version: normalizeString(
        tooling.pnpm_version,
        "cloudflare.tooling.pnpm_version",
        {
          fallback: "10.23.0",
        },
      ),
      node_version: normalizeString(
        tooling.node_version,
        "cloudflare.tooling.node_version",
        {
          fallback: "24.15.0",
        },
      ),
      wrangler_package: normalizeString(
        tooling.wrangler_package,
        "cloudflare.tooling.wrangler_package",
        { fallback: "wrangler" },
      ),
    },
  };
}

function normalizePolicy(policy) {
  policy = normalizeObject(policy, "policy");

  return {
    ...policy,

    dry_run_supported: normalizeBoolean(policy.dry_run_supported, true),
    debug_supported: normalizeBoolean(policy.debug_supported, true),

    require_ci_before_deploy: normalizeBoolean(
      policy.require_ci_before_deploy,
      true,
    ),
    require_security_before_deploy: normalizeBoolean(
      policy.require_security_before_deploy,
      true,
    ),
    require_build_before_deploy: normalizeBoolean(
      policy.require_build_before_deploy,
      true,
    ),

    production_requires_release_tag: normalizeBoolean(
      policy.production_requires_release_tag,
      true,
    ),
    production_requires_environment_approval: normalizeBoolean(
      policy.production_requires_environment_approval,
      true,
    ),
    production_requires_smoke_tests: normalizeBoolean(
      policy.production_requires_smoke_tests,
      true,
    ),

    allow_preview_from_pull_request: normalizeBoolean(
      policy.allow_preview_from_pull_request,
      true,
    ),
    allow_staging_from_main: normalizeBoolean(
      policy.allow_staging_from_main,
      true,
    ),
    allow_production_from_release_tag: normalizeBoolean(
      policy.allow_production_from_release_tag,
      true,
    ),

    block_production_from_pull_request: normalizeBoolean(
      policy.block_production_from_pull_request,
      true,
    ),
    block_production_from_feature_branch: normalizeBoolean(
      policy.block_production_from_feature_branch,
      true,
    ),
    block_production_from_dependency_branch: normalizeBoolean(
      policy.block_production_from_dependency_branch,
      true,
    ),
    block_production_from_openai_branch: normalizeBoolean(
      policy.block_production_from_openai_branch,
      true,
    ),

    dependency_prs_can_deploy_preview: normalizeBoolean(
      policy.dependency_prs_can_deploy_preview,
      true,
    ),
    dependency_prs_can_deploy_staging: normalizeBoolean(
      policy.dependency_prs_can_deploy_staging,
      false,
    ),
    dependency_prs_can_deploy_production: normalizeBoolean(
      policy.dependency_prs_can_deploy_production,
      false,
    ),

    openai_prs_can_deploy_preview: normalizeBoolean(
      policy.openai_prs_can_deploy_preview,
      false,
    ),
    openai_prs_can_deploy_staging: normalizeBoolean(
      policy.openai_prs_can_deploy_staging,
      false,
    ),
    openai_prs_can_deploy_production: normalizeBoolean(
      policy.openai_prs_can_deploy_production,
      false,
    ),

    require_least_privilege_permissions: normalizeBoolean(
      policy.require_least_privilege_permissions,
      true,
    ),
    redact_secrets_in_logs: normalizeBoolean(
      policy.redact_secrets_in_logs,
      true,
    ),
    fail_on_missing_required_bindings: normalizeBoolean(
      policy.fail_on_missing_required_bindings,
      true,
    ),
    fail_on_missing_required_secrets: normalizeBoolean(
      policy.fail_on_missing_required_secrets,
      true,
    ),
    fail_on_invalid_wrangler_config: normalizeBoolean(
      policy.fail_on_invalid_wrangler_config,
      true,
    ),
  };
}

function normalizeGithubEnvironments(githubEnvironments) {
  githubEnvironments = normalizeObject(
    githubEnvironments,
    "github_environments",
  );

  return Object.fromEntries(
    Object.entries(githubEnvironments).map(
      ([environmentName, environmentConfig]) => {
        if (!isPlainObject(environmentConfig)) {
          throw new TypeError(
            `github_environments.${environmentName} must be an object.`,
          );
        }

        const branchPolicy = normalizeObject(
          environmentConfig.deployment_branch_policy,
          `github_environments.${environmentName}.deployment_branch_policy`,
        );

        return [
          environmentName,
          {
            ...environmentConfig,
            name: normalizeString(
              environmentConfig.name,
              `github_environments.${environmentName}.name`,
              {
                fallback: environmentName,
              },
            ),
            approval_required: normalizeBoolean(
              environmentConfig.approval_required,
              false,
            ),
            deployment_branch_policy: {
              ...branchPolicy,
              protected_branches: normalizeBoolean(
                branchPolicy.protected_branches,
                false,
              ),
              custom_branch_policies: normalizeBoolean(
                branchPolicy.custom_branch_policies,
                true,
              ),
            },
            allowed_events: normalizeStringList(
              environmentConfig.allowed_events,
              `github_environments.${environmentName}.allowed_events`,
            ),
            allowed_branches: normalizeStringList(
              environmentConfig.allowed_branches,
              `github_environments.${environmentName}.allowed_branches`,
            ),
            allowed_refs: normalizeStringList(
              environmentConfig.allowed_refs,
              `github_environments.${environmentName}.allowed_refs`,
            ),
          },
        ];
      },
    ),
  );
}

function normalizeEnvironmentTrigger(trigger, fieldPath) {
  trigger = normalizeObject(trigger, fieldPath);

  const branches = normalizeObject(trigger.branches, `${fieldPath}.branches`);
  const tags = normalizeObject(trigger.tags, `${fieldPath}.tags`);

  const normalized = {
    ...trigger,
    events: normalizeStringList(trigger.events, `${fieldPath}.events`),
    branches: {
      ...branches,
      include: normalizeStringList(
        branches.include,
        `${fieldPath}.branches.include`,
      ),
      exclude: normalizeStringList(
        branches.exclude,
        `${fieldPath}.branches.exclude`,
      ),
    },
    tags: {
      ...tags,
      include: normalizeStringList(tags.include, `${fieldPath}.tags.include`),
    },
    allow_forks: normalizeBoolean(trigger.allow_forks, false),
  };

  validateRegexList(normalized.tags.include, `${fieldPath}.tags.include`);

  return normalized;
}

function normalizeEnvironmentLabels(labels, fieldPath) {
  labels = normalizeObject(labels, fieldPath);

  return {
    ...labels,
    add: normalizeStringList(labels.add, `${fieldPath}.add`),
    block_if_present: normalizeStringList(
      labels.block_if_present,
      `${fieldPath}.block_if_present`,
    ),
  };
}

function normalizeEnvironmentRelease(release, fieldPath) {
  release = normalizeObject(release, fieldPath);

  const requiredTagPattern = normalizeNullableString(
    release.required_tag_pattern,
    `${fieldPath}.required_tag_pattern`,
  );

  if (requiredTagPattern) {
    compileRegex(requiredTagPattern, `${fieldPath}.required_tag_pattern`);
  }

  return {
    ...release,
    allowed: normalizeBoolean(release.allowed, false),
    required: normalizeBoolean(release.required, false),
    required_tag_pattern: requiredTagPattern,
    allowed_channels: normalizeStringList(
      release.allowed_channels,
      `${fieldPath}.allowed_channels`,
    ),
  };
}

function normalizeEnvironmentDeployment(deployment, fieldPath) {
  deployment = normalizeObject(deployment, fieldPath);

  return {
    ...deployment,
    command: normalizeString(deployment.command, `${fieldPath}.command`, {
      fallback: "deploy",
    }),
    dry_run_command: normalizeString(
      deployment.dry_run_command,
      `${fieldPath}.dry_run_command`,
      {
        fallback: "deploy --dry-run",
      },
    ),
    require_approval: normalizeBoolean(deployment.require_approval, false),
    require_release_tag: normalizeBoolean(
      deployment.require_release_tag,
      false,
    ),
    upload_source_maps: normalizeBoolean(deployment.upload_source_maps, false),
    keep_artifacts_days: normalizeNumber(
      deployment.keep_artifacts_days,
      7,
      `${fieldPath}.keep_artifacts_days`,
    ),
  };
}

function normalizeEnvironmentBindings(bindings, fieldPath) {
  bindings = normalizeObject(bindings, fieldPath);

  return {
    ...bindings,
    strict: normalizeBoolean(bindings.strict, true),
    allow_preview_overrides: normalizeBoolean(
      bindings.allow_preview_overrides,
      false,
    ),
  };
}

function normalizeEnvironmentSmokeTests(smokeTests, fieldPath) {
  smokeTests = normalizeObject(smokeTests, fieldPath);

  return {
    ...smokeTests,
    required: normalizeBoolean(smokeTests.required, true),
    allow_failure: normalizeBoolean(smokeTests.allow_failure, false),
  };
}

function normalizeEnvironments(environments) {
  environments = normalizeObject(environments, "environments");

  return Object.fromEntries(
    Object.entries(environments).map(([environmentName, environmentConfig]) => {
      if (!isPlainObject(environmentConfig)) {
        throw new TypeError(
          `environments.${environmentName} must be an object.`,
        );
      }

      return [
        environmentName,
        {
          ...environmentConfig,
          description: normalizeNullableString(
            environmentConfig.description,
            `environments.${environmentName}.description`,
          ),
          enabled: normalizeBoolean(environmentConfig.enabled, true),
          github_environment: normalizeString(
            environmentConfig.github_environment,
            `environments.${environmentName}.github_environment`,
            { fallback: environmentName },
          ),
          trigger: normalizeEnvironmentTrigger(
            environmentConfig.trigger,
            `environments.${environmentName}.trigger`,
          ),
          labels: normalizeEnvironmentLabels(
            environmentConfig.labels,
            `environments.${environmentName}.labels`,
          ),
          release: normalizeEnvironmentRelease(
            environmentConfig.release,
            `environments.${environmentName}.release`,
          ),
          deployment: normalizeEnvironmentDeployment(
            environmentConfig.deployment,
            `environments.${environmentName}.deployment`,
          ),
          bindings: normalizeEnvironmentBindings(
            environmentConfig.bindings,
            `environments.${environmentName}.bindings`,
          ),
          smoke_tests: normalizeEnvironmentSmokeTests(
            environmentConfig.smoke_tests,
            `environments.${environmentName}.smoke_tests`,
          ),
        },
      ];
    }),
  );
}

function normalizeDiscovery(discovery) {
  discovery = normalizeObject(discovery, "discovery");

  const configFiles = normalizeObject(
    discovery.config_files,
    "discovery.config_files",
  );
  const deploymentTypes = normalizeObject(
    discovery.deployment_types,
    "discovery.deployment_types",
  );

  const normalizedConfigFiles = Object.fromEntries(
    Object.entries(configFiles).map(([key, value]) => [
      key,
      normalizeStringList(value, `discovery.config_files.${key}`),
    ]),
  );

  const normalizedDeploymentTypes = Object.fromEntries(
    Object.entries(deploymentTypes).map(([typeName, typeConfig]) => {
      if (!isPlainObject(typeConfig)) {
        throw new TypeError(
          `discovery.deployment_types.${typeName} must be an object.`,
        );
      }

      return [
        typeName,
        {
          ...typeConfig,
          path_patterns: normalizeStringList(
            typeConfig.path_patterns,
            `discovery.deployment_types.${typeName}.path_patterns`,
          ),
          labels: normalizeStringList(
            typeConfig.labels,
            `discovery.deployment_types.${typeName}.labels`,
          ),
        },
      ];
    }),
  );

  return {
    ...discovery,
    enabled: normalizeBoolean(discovery.enabled, true),
    app_roots: normalizeStringList(discovery.app_roots, "discovery.app_roots"),
    config_files: normalizedConfigFiles,
    ignore_paths: normalizeStringList(
      discovery.ignore_paths,
      "discovery.ignore_paths",
    ),
    deployment_types: normalizedDeploymentTypes,
  };
}

function normalizeBindingEntry(binding, fieldPath) {
  if (!isPlainObject(binding)) {
    throw new TypeError(`${fieldPath} must be an object.`);
  }

  return {
    ...binding,
    name: normalizeString(binding.name, `${fieldPath}.name`, {
      allowEmpty: false,
    }),
    type: normalizeString(binding.type, `${fieldPath}.type`, {
      fallback: "plain_text",
    }),
    description: normalizeNullableString(
      binding.description,
      `${fieldPath}.description`,
    ),
    required_in: normalizeStringList(
      binding.required_in,
      `${fieldPath}.required_in`,
    ),
  };
}

function normalizeBindingList(value, fieldPath) {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new TypeError(`${fieldPath} must be an array.`);
  }

  return value.map((binding, index) =>
    normalizeBindingEntry(binding, `${fieldPath}[${index}]`),
  );
}

function normalizeTargetNx(nx, fieldPath) {
  nx = normalizeObject(nx, fieldPath);

  return {
    ...nx,
    project_name: normalizeNullableString(
      nx.project_name,
      `${fieldPath}.project_name`,
    ),
    build_target: normalizeString(
      nx.build_target,
      `${fieldPath}.build_target`,
      {
        fallback: "build",
      },
    ),
    deploy_target: normalizeString(
      nx.deploy_target,
      `${fieldPath}.deploy_target`,
      {
        fallback: "deploy",
      },
    ),
    preview_target: normalizeNullableString(
      nx.preview_target,
      `${fieldPath}.preview_target`,
    ),
    staging_target: normalizeNullableString(
      nx.staging_target,
      `${fieldPath}.staging_target`,
    ),
    production_target: normalizeNullableString(
      nx.production_target,
      `${fieldPath}.production_target`,
    ),
  };
}

function normalizeTargetWranglerConfig(wranglerConfig, fieldPath) {
  wranglerConfig = normalizeObject(wranglerConfig, fieldPath);

  return {
    ...wranglerConfig,
    preferred: normalizeStringList(
      wranglerConfig.preferred,
      `${fieldPath}.preferred`,
    ),
    required: normalizeBoolean(wranglerConfig.required, true),
  };
}

function normalizeTargetEnvironments(environments, fieldPath) {
  environments = normalizeObject(environments, fieldPath);

  return Object.fromEntries(
    Object.entries(environments).map(([environmentName, environmentConfig]) => {
      if (!isPlainObject(environmentConfig)) {
        throw new TypeError(
          `${fieldPath}.${environmentName} must be an object.`,
        );
      }

      return [
        environmentName,
        {
          ...environmentConfig,
          enabled: normalizeBoolean(environmentConfig.enabled, true),
        },
      ];
    }),
  );
}

function normalizeTargetRoutes(routes, fieldPath) {
  routes = normalizeObject(routes, fieldPath);

  return Object.fromEntries(
    Object.entries(routes).map(([environmentName, routeConfig]) => {
      if (!isPlainObject(routeConfig)) {
        throw new TypeError(
          `${fieldPath}.${environmentName} must be an object.`,
        );
      }

      return [
        environmentName,
        {
          ...routeConfig,
          required: normalizeBoolean(routeConfig.required, false),
        },
      ];
    }),
  );
}

function normalizeTargetBindings(bindings, fieldPath) {
  bindings = normalizeObject(bindings, fieldPath);

  return {
    ...bindings,
    required: normalizeBindingList(bindings.required, `${fieldPath}.required`),
    optional: normalizeBindingList(bindings.optional, `${fieldPath}.optional`),
  };
}

function normalizeTargetSmokeTests(smokeTests, fieldPath) {
  smokeTests = normalizeObject(smokeTests, fieldPath);

  return {
    ...smokeTests,
    enabled: normalizeBoolean(smokeTests.enabled, true),
    paths: normalizeStringList(smokeTests.paths, `${fieldPath}.paths`),
  };
}

function normalizeTargets(targets) {
  targets = normalizeObject(targets, "targets");

  return Object.fromEntries(
    Object.entries(targets).map(([targetName, targetConfig]) => {
      if (!isPlainObject(targetConfig)) {
        throw new TypeError(`targets.${targetName} must be an object.`);
      }

      return [
        targetName,
        {
          ...targetConfig,
          enabled: normalizeBoolean(targetConfig.enabled, true),
          project_root: normalizeString(
            targetConfig.project_root,
            `targets.${targetName}.project_root`,
            {
              fallback: targetName,
            },
          ),
          type: normalizeString(
            targetConfig.type,
            `targets.${targetName}.type`,
            {
              fallback: targetName,
            },
          ),
          runtime: normalizeString(
            targetConfig.runtime,
            `targets.${targetName}.runtime`,
            {
              fallback: "cloudflare-workers",
            },
          ),
          discover_children: normalizeBoolean(
            targetConfig.discover_children,
            false,
          ),
          wrangler_config: normalizeTargetWranglerConfig(
            targetConfig.wrangler_config,
            `targets.${targetName}.wrangler_config`,
          ),
          nx: normalizeTargetNx(targetConfig.nx, `targets.${targetName}.nx`),
          environments: normalizeTargetEnvironments(
            targetConfig.environments,
            `targets.${targetName}.environments`,
          ),
          routes: normalizeTargetRoutes(
            targetConfig.routes,
            `targets.${targetName}.routes`,
          ),
          bindings: normalizeTargetBindings(
            targetConfig.bindings,
            `targets.${targetName}.bindings`,
          ),
          smoke_tests: normalizeTargetSmokeTests(
            targetConfig.smoke_tests,
            `targets.${targetName}.smoke_tests`,
          ),
        },
      ];
    }),
  );
}

function normalizeRepositoryConfiguration(repositoryConfiguration) {
  repositoryConfiguration = normalizeObject(
    repositoryConfiguration,
    "repository_configuration",
  );

  const requiredSecrets = normalizeObject(
    repositoryConfiguration.required_secrets,
    "repository_configuration.required_secrets",
  );

  const requiredVariables = normalizeObject(
    repositoryConfiguration.required_variables,
    "repository_configuration.required_variables",
  );

  return {
    ...repositoryConfiguration,

    required_secrets: Object.fromEntries(
      Object.entries(requiredSecrets).map(([key, value]) => [
        key,
        normalizeStringList(
          value,
          `repository_configuration.required_secrets.${key}`,
        ),
      ]),
    ),

    required_variables: Object.fromEntries(
      Object.entries(requiredVariables).map(([key, value]) => [
        key,
        normalizeStringList(
          value,
          `repository_configuration.required_variables.${key}`,
        ),
      ]),
    ),

    recommended_values: normalizeObject(
      repositoryConfiguration.recommended_values,
      "repository_configuration.recommended_values",
    ),
  };
}

function normalizeBindings(bindings) {
  bindings = normalizeObject(bindings, "bindings");

  const validation = normalizeObject(
    bindings.validation,
    "bindings.validation",
  );

  return {
    ...bindings,

    validation: {
      ...validation,
      enabled: normalizeBoolean(validation.enabled, true),
      fail_on_missing_required: normalizeBoolean(
        validation.fail_on_missing_required,
        true,
      ),
      fail_on_unknown_production_binding: normalizeBoolean(
        validation.fail_on_unknown_production_binding,
        false,
      ),
      warn_on_unknown_preview_binding: normalizeBoolean(
        validation.warn_on_unknown_preview_binding,
        true,
      ),
      require_environment_specific_bindings: normalizeBoolean(
        validation.require_environment_specific_bindings,
        true,
      ),
    },

    supported_types: normalizeStringList(
      bindings.supported_types,
      "bindings.supported_types",
    ),

    common_required: normalizeBindingList(
      bindings.common_required,
      "bindings.common_required",
    ),
    common_optional: normalizeBindingList(
      bindings.common_optional,
      "bindings.common_optional",
    ),

    environment_suffixes: normalizeObject(
      bindings.environment_suffixes,
      "bindings.environment_suffixes",
    ),
  };
}

function normalizeMutationService(serviceConfig, fieldPath) {
  serviceConfig = normalizeObject(serviceConfig, fieldPath);

  const sync = normalizeObject(serviceConfig.sync, `${fieldPath}.sync`);
  const safety = normalizeObject(serviceConfig.safety, `${fieldPath}.safety`);
  const naming = normalizeObject(serviceConfig.naming, `${fieldPath}.naming`);

  return {
    ...serviceConfig,
    enabled: normalizeBoolean(serviceConfig.enabled, true),
    sync: {
      ...sync,
      enabled: normalizeBoolean(sync.enabled, false),
      allow_preview_sync: normalizeBoolean(sync.allow_preview_sync, true),
      allow_staging_sync: normalizeBoolean(sync.allow_staging_sync, true),
      allow_production_sync: normalizeBoolean(
        sync.allow_production_sync,
        false,
      ),
    },
    safety: {
      ...safety,
      block_bulk_delete_in_production: normalizeBoolean(
        safety.block_bulk_delete_in_production,
        true,
      ),
      block_bucket_delete: normalizeBoolean(safety.block_bucket_delete, true),
      block_public_bucket_without_review: normalizeBoolean(
        safety.block_public_bucket_without_review,
        true,
      ),
      block_namespace_creation_from_untrusted_pr: normalizeBoolean(
        safety.block_namespace_creation_from_untrusted_pr,
        true,
      ),
      require_summary_for_mutations: normalizeBoolean(
        safety.require_summary_for_mutations,
        true,
      ),
    },
    naming: {
      ...naming,
      recommended_pattern: normalizeNullableString(
        naming.recommended_pattern,
        `${fieldPath}.naming.recommended_pattern`,
      ),
      environments: normalizeStringList(
        naming.environments,
        `${fieldPath}.naming.environments`,
      ),
    },
  };
}

function normalizeD1(d1) {
  d1 = normalizeObject(d1, "d1");

  const migrations = normalizeObject(d1.migrations, "d1.migrations");
  const production = normalizeObject(
    migrations.production,
    "d1.migrations.production",
  );
  const commands = normalizeObject(
    migrations.commands,
    "d1.migrations.commands",
  );
  const safety = normalizeObject(d1.safety, "d1.safety");

  return {
    ...d1,
    enabled: normalizeBoolean(d1.enabled, true),

    migrations: {
      ...migrations,
      enabled: normalizeBoolean(migrations.enabled, true),
      directory_patterns: normalizeStringList(
        migrations.directory_patterns,
        "d1.migrations.directory_patterns",
      ),
      require_migration_check_before_deploy: normalizeBoolean(
        migrations.require_migration_check_before_deploy,
        true,
      ),
      require_backup_before_production_migration: normalizeBoolean(
        migrations.require_backup_before_production_migration,
        true,
      ),
      allow_preview_migrations: normalizeBoolean(
        migrations.allow_preview_migrations,
        true,
      ),
      allow_staging_migrations: normalizeBoolean(
        migrations.allow_staging_migrations,
        true,
      ),
      allow_production_migrations: normalizeBoolean(
        migrations.allow_production_migrations,
        true,
      ),
      production: {
        ...production,
        require_release_tag: normalizeBoolean(
          production.require_release_tag,
          true,
        ),
        require_environment_approval: normalizeBoolean(
          production.require_environment_approval,
          true,
        ),
        require_migration_summary: normalizeBoolean(
          production.require_migration_summary,
          true,
        ),
        require_rollback_notes: normalizeBoolean(
          production.require_rollback_notes,
          true,
        ),
      },
      commands: Object.fromEntries(
        Object.entries(commands).map(([key, value]) => [
          key,
          normalizeString(value, `d1.migrations.commands.${key}`),
        ]),
      ),
    },

    safety: {
      ...safety,
      block_destructive_migrations_without_approval: normalizeBoolean(
        safety.block_destructive_migrations_without_approval,
        true,
      ),
      destructive_keywords: normalizeStringList(
        safety.destructive_keywords,
        "d1.safety.destructive_keywords",
      ),
      require_manual_review_for_destructive_keywords: normalizeBoolean(
        safety.require_manual_review_for_destructive_keywords,
        true,
      ),
    },
  };
}

function normalizeQueues(queues) {
  queues = normalizeObject(queues, "queues");

  const validation = normalizeObject(queues.validation, "queues.validation");
  const safety = normalizeObject(queues.safety, "queues.safety");
  const naming = normalizeObject(queues.naming, "queues.naming");

  return {
    ...queues,
    enabled: normalizeBoolean(queues.enabled, true),
    validation: {
      ...validation,
      require_producer_consumer_mapping: normalizeBoolean(
        validation.require_producer_consumer_mapping,
        true,
      ),
      warn_if_queue_has_no_consumer: normalizeBoolean(
        validation.warn_if_queue_has_no_consumer,
        true,
      ),
      warn_if_consumer_has_no_dead_letter_queue: normalizeBoolean(
        validation.warn_if_consumer_has_no_dead_letter_queue,
        true,
      ),
    },
    safety: {
      ...safety,
      allow_preview_test_messages: normalizeBoolean(
        safety.allow_preview_test_messages,
        true,
      ),
      allow_staging_test_messages: normalizeBoolean(
        safety.allow_staging_test_messages,
        true,
      ),
      allow_production_test_messages: normalizeBoolean(
        safety.allow_production_test_messages,
        false,
      ),
      block_queue_delete: normalizeBoolean(safety.block_queue_delete, true),
    },
    naming: {
      ...naming,
      recommended_pattern: normalizeNullableString(
        naming.recommended_pattern,
        "queues.naming.recommended_pattern",
      ),
      environments: normalizeStringList(
        naming.environments,
        "queues.naming.environments",
      ),
    },
  };
}

function normalizeSecrets(secrets) {
  secrets = normalizeObject(secrets, "secrets");

  const validation = normalizeObject(secrets.validation, "secrets.validation");
  const production = normalizeObject(secrets.production, "secrets.production");
  const redaction = normalizeObject(secrets.redaction, "secrets.redaction");

  return {
    ...secrets,
    enabled: normalizeBoolean(secrets.enabled, true),
    validation: {
      ...validation,
      require_secret_names_only: normalizeBoolean(
        validation.require_secret_names_only,
        true,
      ),
      fail_if_secret_values_detected: normalizeBoolean(
        validation.fail_if_secret_values_detected,
        true,
      ),
      require_environment_specific_secrets: normalizeBoolean(
        validation.require_environment_specific_secrets,
        true,
      ),
    },
    allowed_secret_name_patterns: normalizeStringList(
      secrets.allowed_secret_name_patterns,
      "secrets.allowed_secret_name_patterns",
    ),
    common_secret_names: normalizeStringList(
      secrets.common_secret_names,
      "secrets.common_secret_names",
    ),
    production: {
      ...production,
      require_environment_secret_scope: normalizeBoolean(
        production.require_environment_secret_scope,
        true,
      ),
      require_manual_review_for_new_secret_names: normalizeBoolean(
        production.require_manual_review_for_new_secret_names,
        true,
      ),
      block_secret_printing: normalizeBoolean(
        production.block_secret_printing,
        true,
      ),
    },
    redaction: {
      ...redaction,
      enabled: normalizeBoolean(redaction.enabled, true),
      redact_patterns: normalizeStringList(
        redaction.redact_patterns,
        "secrets.redaction.redact_patterns",
      ),
    },
  };
}

function normalizeWrangler(wrangler) {
  wrangler = normalizeObject(wrangler, "wrangler");

  const validation = normalizeObject(
    wrangler.validation,
    "wrangler.validation",
  );
  const compatibility = normalizeObject(
    wrangler.compatibility,
    "wrangler.compatibility",
  );

  return {
    ...wrangler,
    validation: {
      ...validation,
      enabled: normalizeBoolean(validation.enabled, true),
      require_name: normalizeBoolean(validation.require_name, true),
      require_compatibility_date: normalizeBoolean(
        validation.require_compatibility_date,
        true,
      ),
      require_environment_sections: normalizeBoolean(
        validation.require_environment_sections,
        true,
      ),
      require_preview_environment: normalizeBoolean(
        validation.require_preview_environment,
        false,
      ),
      require_staging_environment: normalizeBoolean(
        validation.require_staging_environment,
        true,
      ),
      require_production_environment: normalizeBoolean(
        validation.require_production_environment,
        true,
      ),
    },
    allowed_config_files: normalizeStringList(
      wrangler.allowed_config_files,
      "wrangler.allowed_config_files",
    ),
    required_fields: normalizeStringList(
      wrangler.required_fields,
      "wrangler.required_fields",
    ),
    recommended_fields: normalizeStringList(
      wrangler.recommended_fields,
      "wrangler.recommended_fields",
    ),
    forbidden_in_repository: normalizeStringList(
      wrangler.forbidden_in_repository,
      "wrangler.forbidden_in_repository",
    ),
    compatibility: {
      ...compatibility,
      minimum_compatibility_date: normalizeString(
        compatibility.minimum_compatibility_date,
        "wrangler.compatibility.minimum_compatibility_date",
        { fallback: "2025-01-01" },
      ),
      warn_if_older_than_days: normalizeNumber(
        compatibility.warn_if_older_than_days,
        180,
        "wrangler.compatibility.warn_if_older_than_days",
      ),
    },
  };
}

function normalizeBuild(build) {
  build = normalizeObject(build, "build");

  const nxTargets = normalizeObject(build.nx_targets, "build.nx_targets");
  const preferred = normalizeObject(
    nxTargets.preferred,
    "build.nx_targets.preferred",
  );
  const optional = normalizeObject(
    nxTargets.optional,
    "build.nx_targets.optional",
  );
  const cache = normalizeObject(build.cache, "build.cache");
  const keys = normalizeObject(cache.keys, "build.cache.keys");

  return {
    ...build,
    require_nx_build: normalizeBoolean(build.require_nx_build, true),
    require_pnpm_install: normalizeBoolean(build.require_pnpm_install, true),
    setup_order: normalizeStringList(build.setup_order, "build.setup_order"),
    nx_targets: {
      ...nxTargets,
      preferred: Object.fromEntries(
        Object.entries(preferred).map(([key, value]) => [
          key,
          normalizeString(value, `build.nx_targets.preferred.${key}`),
        ]),
      ),
      optional: Object.fromEntries(
        Object.entries(optional).map(([key, value]) => [
          key,
          normalizeString(value, `build.nx_targets.optional.${key}`),
        ]),
      ),
    },
    cache: {
      ...cache,
      enabled: normalizeBoolean(cache.enabled, true),
      readable_names: normalizeBoolean(cache.readable_names, true),
      keys: Object.fromEntries(
        Object.entries(keys).map(([key, value]) => [
          key,
          normalizeString(value, `build.cache.keys.${key}`),
        ]),
      ),
    },
  };
}

function normalizeCommands(commands) {
  commands = normalizeObject(commands, "commands");

  return Object.fromEntries(
    Object.entries(commands).map(([groupName, groupConfig]) => {
      if (Array.isArray(groupConfig)) {
        return [
          groupName,
          normalizeStringList(groupConfig, `commands.${groupName}`),
        ];
      }

      if (typeof groupConfig === "string") {
        return [groupName, groupConfig.trim()];
      }

      if (!isPlainObject(groupConfig)) {
        throw new TypeError(
          `commands.${groupName} must be a string, array, or object.`,
        );
      }

      return [
        groupName,
        Object.fromEntries(
          Object.entries(groupConfig).map(([key, value]) => [
            key,
            normalizeString(value, `commands.${groupName}.${key}`),
          ]),
        ),
      ];
    }),
  );
}

function normalizeSmokeTests(smokeTests) {
  smokeTests = normalizeObject(smokeTests, "smoke_tests");

  const environments = normalizeObject(
    smokeTests.environments,
    "smoke_tests.environments",
  );
  const checks = normalizeObject(smokeTests.checks, "smoke_tests.checks");

  const normalizedChecks = Object.fromEntries(
    Object.entries(checks).map(([checkName, checkConfig]) => {
      if (!isPlainObject(checkConfig)) {
        throw new TypeError(
          `smoke_tests.checks.${checkName} must be an object.`,
        );
      }

      return [
        checkName,
        {
          ...checkConfig,
          enabled: normalizeBoolean(checkConfig.enabled, true),
          recommended: normalizeStringList(
            checkConfig.recommended,
            `smoke_tests.checks.${checkName}.recommended`,
          ),
          verify_status_code: normalizeBoolean(
            checkConfig.verify_status_code,
            true,
          ),
          verify_response_time: normalizeBoolean(
            checkConfig.verify_response_time,
            true,
          ),
          max_response_time_ms: normalizeNumber(
            checkConfig.max_response_time_ms,
            5000,
            `smoke_tests.checks.${checkName}.max_response_time_ms`,
          ),
          fail_on_error_logs: normalizeBoolean(
            checkConfig.fail_on_error_logs,
            false,
          ),
          warn_on_error_logs: normalizeBoolean(
            checkConfig.warn_on_error_logs,
            true,
          ),
        },
      ];
    }),
  );

  return {
    ...smokeTests,
    enabled: normalizeBoolean(smokeTests.enabled, true),
    fail_deployment_on_failure: normalizeBoolean(
      smokeTests.fail_deployment_on_failure,
      true,
    ),
    timeout_seconds: normalizeNumber(
      smokeTests.timeout_seconds,
      60,
      "smoke_tests.timeout_seconds",
    ),
    retry_count: normalizeNumber(
      smokeTests.retry_count,
      3,
      "smoke_tests.retry_count",
    ),
    retry_delay_seconds: normalizeNumber(
      smokeTests.retry_delay_seconds,
      5,
      "smoke_tests.retry_delay_seconds",
    ),
    required_status_codes: normalizeStringList(
      smokeTests.required_status_codes,
      "smoke_tests.required_status_codes",
    ),
    common_paths: normalizeStringList(
      smokeTests.common_paths,
      "smoke_tests.common_paths",
    ),
    environments: Object.fromEntries(
      Object.entries(environments).map(
        ([environmentName, environmentConfig]) => {
          if (!isPlainObject(environmentConfig)) {
            throw new TypeError(
              `smoke_tests.environments.${environmentName} must be an object.`,
            );
          }

          return [
            environmentName,
            {
              ...environmentConfig,
              required: normalizeBoolean(environmentConfig.required, true),
              allow_failure: normalizeBoolean(
                environmentConfig.allow_failure,
                false,
              ),
            },
          ];
        },
      ),
    ),
    checks: normalizedChecks,
  };
}

function normalizeSecurity(security) {
  security = normalizeObject(security, "security");

  const blockDeployOn = normalizeObject(
    security.block_deploy_on,
    "security.block_deploy_on",
  );
  const workflowPermissions = normalizeObject(
    security.workflow_permissions,
    "security.workflow_permissions",
  );
  const untrustedPullRequests = normalizeObject(
    security.untrusted_pull_requests,
    "security.untrusted_pull_requests",
  );
  const production = normalizeObject(
    security.production,
    "security.production",
  );

  return {
    ...security,
    require_security_workflow_before_staging: normalizeBoolean(
      security.require_security_workflow_before_staging,
      true,
    ),
    require_security_workflow_before_production: normalizeBoolean(
      security.require_security_workflow_before_production,
      true,
    ),
    block_deploy_on: {
      ...blockDeployOn,
      labels: normalizeStringList(
        blockDeployOn.labels,
        "security.block_deploy_on.labels",
      ),
      findings: normalizeStringList(
        blockDeployOn.findings,
        "security.block_deploy_on.findings",
      ),
    },
    workflow_permissions: Object.fromEntries(
      Object.entries(workflowPermissions).map(
        ([environmentName, permissions]) => {
          if (!isPlainObject(permissions)) {
            throw new TypeError(
              `security.workflow_permissions.${environmentName} must be an object.`,
            );
          }

          return [environmentName, { ...permissions }];
        },
      ),
    ),
    untrusted_pull_requests: {
      ...untrustedPullRequests,
      expose_secrets: normalizeBoolean(
        untrustedPullRequests.expose_secrets,
        false,
      ),
      allow_deploy: normalizeBoolean(untrustedPullRequests.allow_deploy, false),
      allow_dry_run: normalizeBoolean(
        untrustedPullRequests.allow_dry_run,
        true,
      ),
    },
    production: {
      ...production,
      require_approval: normalizeBoolean(production.require_approval, true),
      require_release_tag: normalizeBoolean(
        production.require_release_tag,
        true,
      ),
      require_audit_summary: normalizeBoolean(
        production.require_audit_summary,
        true,
      ),
      require_artifact_manifest: normalizeBoolean(
        production.require_artifact_manifest,
        true,
      ),
    },
  };
}

function normalizeArtifacts(artifacts) {
  artifacts = normalizeObject(artifacts, "artifacts");

  const retentionDays = normalizeObject(
    artifacts.retention_days,
    "artifacts.retention_days",
  );
  const files = normalizeObject(artifacts.files, "artifacts.files");

  return {
    ...artifacts,
    enabled: normalizeBoolean(artifacts.enabled, true),
    upload_deployment_summary: normalizeBoolean(
      artifacts.upload_deployment_summary,
      true,
    ),
    upload_wrangler_logs: normalizeBoolean(
      artifacts.upload_wrangler_logs,
      true,
    ),
    upload_smoke_test_results: normalizeBoolean(
      artifacts.upload_smoke_test_results,
      true,
    ),
    upload_binding_summary: normalizeBoolean(
      artifacts.upload_binding_summary,
      true,
    ),
    retention_days: Object.fromEntries(
      Object.entries(retentionDays).map(([key, value]) => [
        key,
        normalizeNumber(value, 7, `artifacts.retention_days.${key}`),
      ]),
    ),
    files: Object.fromEntries(
      Object.entries(files).map(([key, value]) => [
        key,
        normalizeString(value, `artifacts.files.${key}`),
      ]),
    ),
  };
}

function normalizeRollback(rollback) {
  rollback = normalizeObject(rollback, "rollback");

  const production = normalizeObject(
    rollback.production,
    "rollback.production",
  );

  return {
    ...rollback,
    required_for_production: normalizeBoolean(
      rollback.required_for_production,
      true,
    ),
    recommended_for_staging: normalizeBoolean(
      rollback.recommended_for_staging,
      true,
    ),
    production: {
      ...production,
      require_previous_deployment_reference: normalizeBoolean(
        production.require_previous_deployment_reference,
        true,
      ),
      require_rollback_notes: normalizeBoolean(
        production.require_rollback_notes,
        true,
      ),
      require_manual_approval: normalizeBoolean(
        production.require_manual_approval,
        true,
      ),
    },
    rollback_methods: normalizeStringList(
      rollback.rollback_methods,
      "rollback.rollback_methods",
    ),
  };
}

function normalizeRouting(routing) {
  routing = normalizeObject(routing, "routing");

  const labels = normalizeObject(routing.labels, "routing.labels");
  const milestones = normalizeObject(routing.milestones, "routing.milestones");

  return {
    ...routing,
    labels: Object.fromEntries(
      Object.entries(labels).map(([key, value]) => [
        key,
        normalizeStringList(value, `routing.labels.${key}`),
      ]),
    ),
    milestones: Object.fromEntries(
      Object.entries(milestones).map(([key, value]) => [
        key,
        normalizeString(value, `routing.milestones.${key}`),
      ]),
    ),
  };
}

function normalizeReporting(reporting) {
  reporting = normalizeObject(reporting, "reporting");

  const commentFooter = normalizeObject(
    reporting.comment_footer,
    "reporting.comment_footer",
  );
  const summary = normalizeObject(reporting.summary, "reporting.summary");

  return {
    ...reporting,
    add_pr_comment: normalizeBoolean(reporting.add_pr_comment, true),
    add_workflow_summary: normalizeBoolean(
      reporting.add_workflow_summary,
      true,
    ),
    add_deployment_summary: normalizeBoolean(
      reporting.add_deployment_summary,
      true,
    ),
    comment_footer: {
      ...commentFooter,
      start: normalizeNullableString(
        commentFooter.start,
        "reporting.comment_footer.start",
      ),
      end: normalizeNullableString(
        commentFooter.end,
        "reporting.comment_footer.end",
      ),
    },
    summary: Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [
        key,
        normalizeBoolean(value, true),
      ]),
    ),
  };
}

function normalizeEnforcement(enforcement) {
  enforcement = normalizeObject(enforcement, "enforcement");

  return Object.fromEntries(
    Object.entries(enforcement).map(([ruleName, ruleConfig]) => {
      if (!isPlainObject(ruleConfig)) {
        throw new TypeError(`enforcement.${ruleName} must be an object.`);
      }

      return [
        ruleName,
        {
          ...ruleConfig,
          action: normalizeString(
            ruleConfig.action,
            `enforcement.${ruleName}.action`,
            {
              fallback: "fail",
            },
          ),
          message: normalizeNullableString(
            ruleConfig.message,
            `enforcement.${ruleName}.message`,
          ),
        },
      ];
    }),
  );
}

function normalizeCloudflareRulesConfig(rawConfig, options = {}) {
  const { configPath = DEFAULT_CONFIG_PATH, repoRoot = null } = options;

  if (!isPlainObject(rawConfig)) {
    throw new TypeError("Cloudflare rules config must be a YAML object.");
  }

  const tagPatterns = [];
  for (const environmentConfig of Object.values(rawConfig.environments || {})) {
    const pattern = environmentConfig?.release?.required_tag_pattern;
    if (pattern) tagPatterns.push(pattern);
  }
  validateRegexList(tagPatterns, "environments.*.release.required_tag_pattern");

  return {
    ...rawConfig,

    __meta: {
      config_path: configPath,
      repo_root: repoRoot,
      loaded_at: new Date().toISOString(),
    },

    version: normalizeNumber(rawConfig.version, 1, "version"),
    repository: normalizeRepository(rawConfig.repository),
    cloudflare: normalizeCloudflare(rawConfig.cloudflare),
    policy: normalizePolicy(rawConfig.policy),
    github_environments: normalizeGithubEnvironments(
      rawConfig.github_environments,
    ),
    environments: normalizeEnvironments(rawConfig.environments),
    discovery: normalizeDiscovery(rawConfig.discovery),
    targets: normalizeTargets(rawConfig.targets),
    repository_configuration: normalizeRepositoryConfiguration(
      rawConfig.repository_configuration,
    ),
    bindings: normalizeBindings(rawConfig.bindings),
    d1: normalizeD1(rawConfig.d1),
    kv: normalizeMutationService(rawConfig.kv, "kv"),
    r2: normalizeMutationService(rawConfig.r2, "r2"),
    queues: normalizeQueues(rawConfig.queues),
    secrets: normalizeSecrets(rawConfig.secrets),
    wrangler: normalizeWrangler(rawConfig.wrangler),
    build: normalizeBuild(rawConfig.build),
    commands: normalizeCommands(rawConfig.commands),
    smoke_tests: normalizeSmokeTests(rawConfig.smoke_tests),
    security: normalizeSecurity(rawConfig.security),
    artifacts: normalizeArtifacts(rawConfig.artifacts),
    rollback: normalizeRollback(rawConfig.rollback),
    routing: normalizeRouting(rawConfig.routing),
    reporting: normalizeReporting(rawConfig.reporting),
    enforcement: normalizeEnforcement(rawConfig.enforcement),
  };
}

function validateCloudflareRulesConfig(config) {
  if (!isPlainObject(config)) {
    throw new TypeError("Cloudflare rules config must be an object.");
  }

  if (!config.repository?.default_branch) {
    throw new TypeError("repository.default_branch is required.");
  }

  if (!config.cloudflare?.account_id_variable) {
    throw new TypeError("cloudflare.account_id_variable is required.");
  }

  if (!config.cloudflare?.api_token_secret) {
    throw new TypeError("cloudflare.api_token_secret is required.");
  }

  if (!Object.keys(config.environments || {}).length) {
    throw new TypeError("At least one Cloudflare environment is required.");
  }

  if (!Object.keys(config.targets || {}).length) {
    logger.warn("No Cloudflare deployment targets were configured.");
  }

  for (const [environmentName, environmentConfig] of Object.entries(
    config.environments || {},
  )) {
    if (!config.github_environments?.[environmentConfig.github_environment]) {
      logger.warn(
        `Environment "${environmentName}" references GitHub Environment "${environmentConfig.github_environment}", but it is not defined in github_environments.`,
      );
    }
  }

  for (const [targetName, targetConfig] of Object.entries(
    config.targets || {},
  )) {
    if (!targetConfig.project_root) {
      throw new TypeError(`targets.${targetName}.project_root is required.`);
    }

    for (const binding of [
      ...(targetConfig.bindings?.required || []),
      ...(targetConfig.bindings?.optional || []),
    ]) {
      if (
        config.bindings?.supported_types?.length &&
        !config.bindings.supported_types.includes(binding.type)
      ) {
        logger.warn(
          `targets.${targetName} uses unsupported binding type "${binding.type}" for binding "${binding.name}".`,
        );
      }
    }
  }

  return true;
}

function findRepoRoot(
  startDir = process.env.GITHUB_WORKSPACE || process.cwd(),
) {
  const candidates = [
    startDir,
    process.cwd(),
    path.resolve(__dirname, "../../../.."),
  ];

  for (const candidate of candidates) {
    let current = path.resolve(candidate);

    while (current && current !== path.dirname(current)) {
      const githubDir = path.join(current, ".github");

      if (fs.existsSync(githubDir) && fs.statSync(githubDir).isDirectory()) {
        return current;
      }

      current = path.dirname(current);
    }
  }

  return path.resolve(startDir);
}

function resolveConfigPath(
  configPath = DEFAULT_CONFIG_PATH,
  repoRoot = findRepoRoot(),
) {
  if (path.isAbsolute(configPath)) {
    return configPath;
  }

  return path.join(repoRoot, configPath);
}

function readYamlFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = yaml.load(raw, {
    filename: filePath,
    schema: yaml.DEFAULT_SCHEMA,
  });

  return parsed || {};
}

function loadCloudflareRulesConfig(options = {}) {
  const {
    configPath = DEFAULT_CONFIG_PATH,
    repoRoot = findRepoRoot(),
    required = true,
    validate = true,
    log = true,
  } = options;

  const absolutePath = resolveConfigPath(configPath, repoRoot);
  const displayPath = path.relative(repoRoot, absolutePath) || absolutePath;

  if (!fs.existsSync(absolutePath)) {
    if (!required) {
      logger.warn(
        `Cloudflare rules config not found at ${displayPath}. Returning empty config.`,
      );

      return normalizeCloudflareRulesConfig(
        {
          version: 1,
          repository: {
            owner: "SinLess-Games",
            name: "Aerealith-AI",
            default_branch: "main",
          },
          cloudflare: {},
          policy: {},
          github_environments: {},
          environments: {},
          discovery: {},
          targets: {},
          repository_configuration: {},
          bindings: {},
          d1: {},
          kv: {},
          r2: {},
          queues: {},
          secrets: {},
          wrangler: {},
          build: {},
          commands: {},
          smoke_tests: {},
          security: {},
          artifacts: {},
          rollback: {},
          routing: {},
          reporting: {},
          enforcement: {},
        },
        { configPath: absolutePath, repoRoot },
      );
    }

    throw new Error(`Cloudflare rules config not found: ${displayPath}`);
  }

  try {
    const rawConfig = readYamlFile(absolutePath);
    const normalizedConfig = normalizeCloudflareRulesConfig(rawConfig, {
      configPath: absolutePath,
      repoRoot,
    });

    if (validate) {
      validateCloudflareRulesConfig(normalizedConfig);
    }

    if (log) {
      logger.info(`Loaded Cloudflare rules config from ${displayPath}.`);
      logger.debug(
        `Cloudflare rules config contains ${
          Object.keys(normalizedConfig.targets || {}).length
        } deployment targets.`,
      );
      logger.dump("cloudflare rules config", normalizedConfig);
    }

    return normalizedConfig;
  } catch (err) {
    throw new Error(
      `Failed to load Cloudflare rules config from ${displayPath}: ${logger.formatError(err)}`,
    );
  }
}

function normalizeRef(ref) {
  if (!ref || typeof ref !== "string") return "";

  return ref.trim();
}

function normalizeBranchName(branchNameOrRef) {
  if (!branchNameOrRef || typeof branchNameOrRef !== "string") return "";

  return branchNameOrRef
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "")
    .trim();
}

function normalizeTagName(refOrTag) {
  if (!refOrTag || typeof refOrTag !== "string") return "";

  return refOrTag.replace(/^refs\/tags\//, "").trim();
}

function getDefaultBranch(config) {
  return config.repository?.default_branch || "main";
}

function isDefaultBranch(config, branchNameOrRef) {
  return normalizeBranchName(branchNameOrRef) === getDefaultBranch(config);
}

function getEnvironment(config, environmentName) {
  if (!environmentName || typeof environmentName !== "string") return null;
  return config.environments?.[environmentName] || null;
}

function getGithubEnvironment(config, environmentName) {
  const environmentConfig = getEnvironment(config, environmentName);
  if (!environmentConfig) return null;

  return (
    config.github_environments?.[environmentConfig.github_environment] || null
  );
}

function listEnabledEnvironments(config) {
  return Object.entries(config.environments || {})
    .filter(([, environmentConfig]) => environmentConfig.enabled)
    .map(([environmentName, environmentConfig]) => ({
      name: environmentName,
      ...environmentConfig,
    }));
}

function getTarget(config, targetName) {
  if (!targetName || typeof targetName !== "string") return null;
  return config.targets?.[targetName] || null;
}

function listEnabledTargets(config) {
  return Object.entries(config.targets || {})
    .filter(([, targetConfig]) => targetConfig.enabled)
    .map(([targetName, targetConfig]) => ({
      name: targetName,
      ...targetConfig,
    }));
}

function isTargetEnabledInEnvironment(config, targetName, environmentName) {
  const target = getTarget(config, targetName);
  if (!target || !target.enabled) return false;

  const environmentConfig = target.environments?.[environmentName];
  if (!environmentConfig) return false;

  return environmentConfig.enabled;
}

function getNxTargetForEnvironment(config, targetName, environmentName) {
  const target = getTarget(config, targetName);
  if (!target) return null;

  if (environmentName === "preview" && target.nx?.preview_target) {
    return target.nx.preview_target;
  }

  if (environmentName === "staging" && target.nx?.staging_target) {
    return target.nx.staging_target;
  }

  if (environmentName === "production" && target.nx?.production_target) {
    return target.nx.production_target;
  }

  return target.nx?.deploy_target || "deploy";
}

function getRequiredSecrets(config, environmentName = "all_environments") {
  const requiredSecrets =
    config.repository_configuration?.required_secrets || {};
  const secrets = [
    ...(requiredSecrets.all_environments || []),
    ...(requiredSecrets[environmentName] || []),
  ];

  return unique(secrets);
}

function getRequiredVariables(config, environmentName = "all_environments") {
  const requiredVariables =
    config.repository_configuration?.required_variables || {};
  const variables = [
    ...(requiredVariables.all_environments || []),
    ...(requiredVariables[environmentName] || []),
  ];

  return unique(variables);
}

function getTargetRequiredBindings(config, targetName, environmentName = null) {
  const target = getTarget(config, targetName);
  if (!target) return [];

  const required = target.bindings?.required || [];

  if (!environmentName) {
    return required;
  }

  return required.filter((binding) => {
    if (!binding.required_in?.length) return true;
    return binding.required_in.includes(environmentName);
  });
}

function getCommonRequiredBindings(config, environmentName = null) {
  const required = config.bindings?.common_required || [];

  if (!environmentName) {
    return required;
  }

  return required.filter((binding) => {
    if (!binding.required_in?.length) return true;
    return binding.required_in.includes(environmentName);
  });
}

function getAllRequiredBindings(config, targetName, environmentName = null) {
  const commonBindings = getCommonRequiredBindings(config, environmentName);
  const targetBindings = getTargetRequiredBindings(
    config,
    targetName,
    environmentName,
  );

  const bindingMap = new Map();

  for (const binding of [...commonBindings, ...targetBindings]) {
    bindingMap.set(binding.name, binding);
  }

  return [...bindingMap.values()];
}

function getSmokeTestPaths(config, targetName) {
  const commonPaths = config.smoke_tests?.common_paths || [];
  const target = getTarget(config, targetName);
  const targetPaths = target?.smoke_tests?.paths || [];

  return unique([...commonPaths, ...targetPaths]);
}

function isReleaseTagForEnvironment(config, environmentName, refOrTag) {
  const environmentConfig = getEnvironment(config, environmentName);
  if (!environmentConfig) return false;

  const tag = normalizeTagName(refOrTag);
  const ref = normalizeRef(refOrTag);

  const releasePattern =
    environmentConfig.release?.required_tag_pattern ||
    environmentConfig.trigger?.tags?.include?.[0];

  if (releasePattern && matchesRegex(releasePattern, tag)) {
    return true;
  }

  return matchesAnyRegex(environmentConfig.trigger?.tags?.include || [], ref);
}

function matchDeploymentTypes(config, changedFiles = []) {
  const files = normalizeStringList(changedFiles, "changedFiles");

  const matches = [];

  for (const [typeName, typeConfig] of Object.entries(
    config.discovery?.deployment_types || {},
  )) {
    const matchedFiles = [];

    for (const file of files) {
      const ignored = (config.discovery?.ignore_paths || []).some(
        (ignorePattern) => minimatch(file, ignorePattern, { dot: true }),
      );

      if (ignored) continue;

      const matched = (typeConfig.path_patterns || []).some((pattern) =>
        minimatch(file, pattern, { dot: true }),
      );

      if (matched) {
        matchedFiles.push(file);
      }
    }

    if (!matchedFiles.length) continue;

    matches.push({
      type: typeName,
      files: unique(matchedFiles),
      labels: typeConfig.labels || [],
    });
  }

  return matches;
}

function collectLabelsFromDeploymentTypes(config, changedFiles = []) {
  return unique(
    matchDeploymentTypes(config, changedFiles).flatMap((match) => match.labels),
  );
}

function matchTargetsByChangedFiles(config, changedFiles = []) {
  const files = normalizeStringList(changedFiles, "changedFiles");
  const matches = [];

  for (const [targetName, targetConfig] of Object.entries(
    config.targets || {},
  )) {
    if (!targetConfig.enabled) continue;

    const rootPattern = `${targetConfig.project_root.replace(/\/$/, "")}/**`;

    const matchedFiles = files.filter((file) => {
      const ignored = (config.discovery?.ignore_paths || []).some(
        (ignorePattern) => minimatch(file, ignorePattern, { dot: true }),
      );

      if (ignored) return false;

      return minimatch(file, rootPattern, { dot: true });
    });

    if (!matchedFiles.length) continue;

    matches.push({
      name: targetName,
      target: targetConfig,
      files: unique(matchedFiles),
    });
  }

  return matches;
}

function hasAnyLabel(labels, candidates) {
  const labelSet = new Set(normalizeStringList(labels, "labels"));
  return normalizeStringList(candidates, "candidates").some((label) =>
    labelSet.has(label),
  );
}

function getBlockedLabelsForEnvironment(config, environmentName, labels = []) {
  const environmentConfig = getEnvironment(config, environmentName);
  const normalizedLabels = normalizeStringList(labels, "labels");

  if (!environmentConfig) return [];

  const blockedLabels = [
    ...(environmentConfig.labels?.block_if_present || []),
    ...(config.security?.block_deploy_on?.labels || []),
  ];

  return normalizedLabels.filter((label) => blockedLabels.includes(label));
}

function isDependencyBranch(branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  return [/^renovate\/.+$/, /^dependabot\/.+$/, /^mend\/.+$/].some((pattern) =>
    pattern.test(branchName),
  );
}

function isOpenAiBranch(branchNameOrRef) {
  const branchName = normalizeBranchName(branchNameOrRef);

  return [/^openai\/.+$/, /^ai\/.+$/, /^automation\/openai-.+$/].some(
    (pattern) => pattern.test(branchName),
  );
}

function evaluateDeploymentEligibility(config, input = {}) {
  validateCloudflareRulesConfig(config);

  const environmentName = normalizeString(
    input.environment,
    "input.environment",
    {
      fallback: "preview",
    },
  );
  const eventName = normalizeNullableString(input.event, "input.event");
  const branchName = normalizeBranchName(
    input.branch || input.head_branch || input.ref || "",
  );
  const ref = normalizeRef(input.ref || "");
  const author = normalizeNullableString(input.author, "input.author");
  const labels = normalizeStringList(input.labels, "input.labels");
  const isFork = normalizeBoolean(input.is_fork || input.fork, false);
  const dryRun = normalizeBoolean(input.dry_run || input.dryRun, false);

  const environmentConfig = getEnvironment(config, environmentName);

  const result = {
    eligible: true,
    environment: environmentName,
    event: eventName,
    branch: branchName,
    ref,
    author,
    dry_run: dryRun,
    blocked_labels: [],
    errors: [],
    warnings: [],
  };

  if (!environmentConfig) {
    result.errors.push(`Unknown Cloudflare environment: ${environmentName}`);
    result.eligible = false;
    return result;
  }

  if (!environmentConfig.enabled) {
    result.errors.push(
      `Cloudflare environment is disabled: ${environmentName}`,
    );
  }

  if (eventName && !environmentConfig.trigger.events.includes(eventName)) {
    result.errors.push(
      `Event "${eventName}" is not allowed for Cloudflare environment "${environmentName}".`,
    );
  }

  if (isFork && !environmentConfig.trigger.allow_forks) {
    result.errors.push(
      "Fork pull requests are not allowed to deploy this environment.",
    );
  }

  if (environmentName === "preview") {
    if (
      eventName === "pull_request" &&
      !config.policy.allow_preview_from_pull_request
    ) {
      result.errors.push(
        "Preview deployments from pull requests are disabled.",
      );
    }
  }

  if (environmentName === "staging") {
    if (!config.policy.allow_staging_from_main) {
      result.errors.push("Staging deployments from main are disabled.");
    }

    if (branchName && !isDefaultBranch(config, branchName)) {
      result.errors.push("Staging deployments must run from main.");
    }
  }

  if (environmentName === "production") {
    if (!config.policy.allow_production_from_release_tag) {
      result.errors.push(
        "Production deployments from release tags are disabled.",
      );
    }

    if (
      config.policy.production_requires_release_tag &&
      !isReleaseTagForEnvironment(config, environmentName, ref)
    ) {
      result.errors.push(
        "Production deployment requires a valid V-prefixed release tag.",
      );
    }

    if (
      eventName === "pull_request" &&
      config.policy.block_production_from_pull_request
    ) {
      result.errors.push(
        "Production deployment from pull requests is blocked.",
      );
    }

    if (
      branchName &&
      !isDefaultBranch(config, branchName) &&
      config.policy.block_production_from_feature_branch
    ) {
      result.errors.push(
        "Production deployment from feature branches is blocked.",
      );
    }

    if (
      isDependencyBranch(branchName) &&
      config.policy.block_production_from_dependency_branch
    ) {
      result.errors.push(
        "Production deployment from dependency branches is blocked.",
      );
    }

    if (
      isOpenAiBranch(branchName) &&
      config.policy.block_production_from_openai_branch
    ) {
      result.errors.push(
        "Production deployment from OpenAI automation branches is blocked.",
      );
    }
  }

  if (isDependencyBranch(branchName)) {
    if (
      environmentName === "preview" &&
      !config.policy.dependency_prs_can_deploy_preview
    ) {
      result.errors.push("Dependency branches cannot deploy preview.");
    }

    if (
      environmentName === "staging" &&
      !config.policy.dependency_prs_can_deploy_staging
    ) {
      result.errors.push("Dependency branches cannot deploy staging.");
    }

    if (
      environmentName === "production" &&
      !config.policy.dependency_prs_can_deploy_production
    ) {
      result.errors.push("Dependency branches cannot deploy production.");
    }
  }

  if (isOpenAiBranch(branchName)) {
    if (
      environmentName === "preview" &&
      !config.policy.openai_prs_can_deploy_preview
    ) {
      result.errors.push("OpenAI automation branches cannot deploy preview.");
    }

    if (
      environmentName === "staging" &&
      !config.policy.openai_prs_can_deploy_staging
    ) {
      result.errors.push("OpenAI automation branches cannot deploy staging.");
    }

    if (
      environmentName === "production" &&
      !config.policy.openai_prs_can_deploy_production
    ) {
      result.errors.push(
        "OpenAI automation branches cannot deploy production.",
      );
    }
  }

  result.blocked_labels = getBlockedLabelsForEnvironment(
    config,
    environmentName,
    labels,
  );

  if (result.blocked_labels.length) {
    result.errors.push(
      `Deployment-blocking labels are present: ${result.blocked_labels.join(", ")}`,
    );
  }

  if (dryRun) {
    result.warnings.push(
      "Dry-run mode is enabled. No Cloudflare state should be changed.",
    );
  }

  result.eligible = result.errors.length === 0;

  return result;
}

function validateRequiredRuntimeConfiguration(config, environmentName) {
  const missing = {
    secrets: [],
    variables: [],
  };

  const requiredSecrets = getRequiredSecrets(config, environmentName);
  const requiredVariables = getRequiredVariables(config, environmentName);

  for (const secretName of requiredSecrets) {
    if (!process.env[secretName]) {
      missing.secrets.push(secretName);
    }
  }

  for (const variableName of requiredVariables) {
    if (!process.env[variableName]) {
      missing.variables.push(variableName);
    }
  }

  return {
    valid: missing.secrets.length === 0 && missing.variables.length === 0,
    missing,
  };
}

function findPotentialSecrets(config, text) {
  if (!text || typeof text !== "string") return [];

  const patterns = [
    ...(config.secrets?.redaction?.redact_patterns || []),
    ...(config.secrets?.allowed_secret_name_patterns || []),
  ];

  const findings = [];

  for (const pattern of patterns) {
    if (matchesRegex(pattern, text)) {
      findings.push(pattern);
    }
  }

  return unique(findings);
}

if (require.main === module) {
  try {
    const config = loadCloudflareRulesConfig();
    logger.info(
      `Cloudflare rules config validation passed with ${
        Object.keys(config.targets || {}).length
      } targets and ${Object.keys(config.environments || {}).length} environments.`,
    );
  } catch (err) {
    logger.error(logger.formatError(err));
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_CONFIG_PATH,

  findRepoRoot,
  resolveConfigPath,
  readYamlFile,

  loadCloudflareRulesConfig,
  normalizeCloudflareRulesConfig,
  validateCloudflareRulesConfig,

  normalizeBranchName,
  normalizeTagName,
  getDefaultBranch,
  isDefaultBranch,

  getEnvironment,
  getGithubEnvironment,
  listEnabledEnvironments,

  getTarget,
  listEnabledTargets,
  isTargetEnabledInEnvironment,
  getNxTargetForEnvironment,

  getRequiredSecrets,
  getRequiredVariables,
  getTargetRequiredBindings,
  getCommonRequiredBindings,
  getAllRequiredBindings,
  getSmokeTestPaths,

  isReleaseTagForEnvironment,

  matchDeploymentTypes,
  collectLabelsFromDeploymentTypes,
  matchTargetsByChangedFiles,

  hasAnyLabel,
  getBlockedLabelsForEnvironment,
  isDependencyBranch,
  isOpenAiBranch,
  evaluateDeploymentEligibility,

  validateRequiredRuntimeConfiguration,
  findPotentialSecrets,
};

// .github/scripts/utils/validators/cloudflare-rules.schema.js
// =============================================================================
// Aerealith AI Cloudflare Rules JSON Schema
// -----------------------------------------------------------------------------
// Purpose:
//   JSON Schema definition for `.github/repo-management/cloudflare-rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/validate-configs.js
//   - .github/scripts/cloudflare/discover-deployments.js
//   - .github/scripts/cloudflare/deploy-preview.js
//   - .github/scripts/cloudflare/deploy-staging.js
//   - .github/scripts/cloudflare/deploy-production.js
//   - .github/scripts/cloudflare/validate-cloudflare-config.js
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/repo/run-repo-management.js
//
// Notes:
//   - This schema validates policy shape only.
//   - Deployment scripts should still perform runtime validation.
//   - Secrets must be referenced by name only, never stored in this YAML file.
//   - Production deployment must be release/tag gated and approval protected.
// =============================================================================

const REGEX_STRING = {
  type: "string",
  minLength: 1,
  description: "A JavaScript-compatible regular expression string.",
};

const STRING_ARRAY = {
  type: "array",
  items: {
    type: "string",
    minLength: 1,
  },
  uniqueItems: true,
  default: [],
};

const LABEL_NAME = {
  type: "string",
  minLength: 1,
  maxLength: 100,
};

const LABEL_ARRAY = {
  type: "array",
  items: LABEL_NAME,
  uniqueItems: true,
  default: [],
};

const SECRET_NAME = {
  type: "string",
  minLength: 1,
  pattern: "^[A-Z][A-Z0-9_]*$",
};

const SECRET_ARRAY = {
  type: "array",
  items: SECRET_NAME,
  uniqueItems: true,
  default: [],
};

const ENVIRONMENT_NAME = {
  type: "string",
  enum: ["preview", "staging", "production"],
};

const SERVICE_FLAGS = {
  type: "object",
  additionalProperties: false,
  properties: {
    workers: {
      type: "boolean",
      default: true,
    },
    queues: {
      type: "boolean",
      default: true,
    },
    r2: {
      type: "boolean",
      default: true,
    },
    d1: {
      type: "boolean",
      default: true,
    },
    kv: {
      type: "boolean",
      default: true,
    },
    secrets_store: {
      type: "boolean",
      default: true,
    },
    flagship: {
      type: "boolean",
      default: true,
    },
  },
  default: {},
};

const PATH_RULE = {
  type: "object",
  additionalProperties: false,
  properties: {
    patterns: STRING_ARRAY,
    ignore_paths: STRING_ARRAY,
    required: {
      type: "boolean",
      default: false,
    },
    labels: LABEL_ARRAY,
  },
  default: {},
};

const WRANGLER_PROJECT = {
  type: "object",
  additionalProperties: false,
  required: ["name", "path"],
  properties: {
    name: {
      type: "string",
      minLength: 1,
    },
    path: {
      type: "string",
      minLength: 1,
    },
    wrangler_config: {
      type: "string",
      minLength: 1,
      default: "wrangler.jsonc",
    },
    project_name: {
      type: ["string", "null"],
      default: null,
    },
    service: {
      type: "string",
      enum: [
        "worker",
        "frontend",
        "api",
        "service",
        "integration",
        "connector",
        "engine",
      ],
      default: "worker",
    },
    deploy: {
      type: "boolean",
      default: true,
    },
    environments: {
      type: "array",
      items: ENVIRONMENT_NAME,
      uniqueItems: true,
      default: ["preview", "staging", "production"],
    },
    depends_on: STRING_ARRAY,
    labels: LABEL_ARRAY,
  },
};

const BINDING_RULE = {
  type: "object",
  additionalProperties: false,
  required: ["binding"],
  properties: {
    binding: {
      type: "string",
      minLength: 1,
      pattern: "^[A-Z][A-Z0-9_]*$",
    },
    name: {
      type: "string",
      minLength: 1,
    },
    id_variable: {
      type: ["string", "null"],
      pattern: "^[A-Z][A-Z0-9_]*$",
      default: null,
    },
    preview_id_variable: {
      type: ["string", "null"],
      pattern: "^[A-Z][A-Z0-9_]*$",
      default: null,
    },
    required: {
      type: "boolean",
      default: true,
    },
    environments: {
      type: "array",
      items: ENVIRONMENT_NAME,
      uniqueItems: true,
      default: ["preview", "staging", "production"],
    },
  },
};

const COMMAND_BLOCK = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      default: true,
    },
    command: {
      type: "string",
      minLength: 1,
    },
    working_directory: {
      type: "string",
      minLength: 1,
      default: ".",
    },
    timeout_minutes: {
      type: "integer",
      minimum: 1,
      default: 15,
    },
    required: {
      type: "boolean",
      default: true,
    },
    continue_on_error: {
      type: "boolean",
      default: false,
    },
    artifacts: STRING_ARRAY,
  },
  default: {},
};

const ENVIRONMENT_RULE = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      default: true,
    },

    github_environment: {
      type: "string",
      minLength: 1,
    },

    cloudflare_environment: {
      type: "string",
      minLength: 1,
    },

    automatic_on_pull_request: {
      type: "boolean",
      default: false,
    },

    automatic_on_main: {
      type: "boolean",
      default: false,
    },

    release_tag_only: {
      type: "boolean",
      default: false,
    },

    approval_required: {
      type: "boolean",
      default: false,
    },

    protected: {
      type: "boolean",
      default: false,
    },

    branch: {
      type: ["string", "null"],
      default: null,
    },

    allowed_branches: STRING_ARRAY,

    allowed_tag_pattern: {
      type: ["string", "null"],
      default: null,
    },

    url_format: {
      type: ["string", "null"],
      default: null,
    },

    required_labels_absent: LABEL_ARRAY,
    required_labels_any: LABEL_ARRAY,
    required_labels_all: LABEL_ARRAY,

    required_checks: STRING_ARRAY,
    required_secrets: SECRET_ARRAY,
    required_variables: SECRET_ARRAY,

    services: SERVICE_FLAGS,

    build: COMMAND_BLOCK,
    deploy: COMMAND_BLOCK,
    smoke_tests: COMMAND_BLOCK,
  },
  default: {},
};

const RULE_ACTION = {
  type: "string",
  enum: ["off", "warn", "fail", "label", "comment", "block"],
  default: "fail",
};

const CLOUDFLARE_RULES_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/SinLess-Games/Aerealith-AI/schemas/cloudflare-rules.schema.json",
  title: "Aerealith AI Cloudflare Rules",
  description: "Schema for .github/repo-management/cloudflare-rules.yaml.",
  type: "object",
  additionalProperties: false,

  required: [
    "version",
    "repository",
    "policy",
    "account",
    "services",
    "environments",
    "discovery",
    "wrangler",
    "deployment",
    "preview",
    "staging",
    "production",
    "security",
    "artifacts",
    "runtime",
    "enforcement",
    "safety",
  ],

  properties: {
    version: {
      type: "integer",
      minimum: 1,
      default: 1,
    },

    repository: {
      type: "object",
      additionalProperties: false,
      required: ["owner", "name", "default_branch"],
      properties: {
        owner: {
          type: "string",
          minLength: 1,
          default: "SinLess-Games",
        },
        name: {
          type: "string",
          minLength: 1,
          default: "Aerealith-AI",
        },
        full_name: {
          type: "string",
          minLength: 1,
          default: "SinLess-Games/Aerealith-AI",
        },
        default_branch: {
          type: "string",
          const: "main",
          default: "main",
        },
      },
    },

    tooling: {
      type: "object",
      additionalProperties: false,
      properties: {
        package_manager: {
          type: "string",
          const: "pnpm",
          default: "pnpm",
        },
        pnpm_version: {
          type: "string",
          default: "10.23.0",
        },
        node_version: {
          type: "string",
          default: "24.15.0",
        },
        monorepo_tool: {
          type: "string",
          const: "nx",
          default: "nx",
        },
        wrangler_package: {
          type: "string",
          default: "wrangler",
        },
      },
      default: {},
    },

    policy: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        dry_run_supported: {
          type: "boolean",
          default: true,
        },
        debug_supported: {
          type: "boolean",
          default: true,
        },

        preview_on_pull_request: {
          type: "boolean",
          default: true,
        },
        staging_on_main: {
          type: "boolean",
          default: true,
        },
        production_on_release_tag_only: {
          type: "boolean",
          default: true,
        },
        production_requires_approval: {
          type: "boolean",
          default: true,
        },
        production_requires_release_evidence: {
          type: "boolean",
          default: true,
        },

        deploy_changed_projects_only: {
          type: "boolean",
          default: true,
        },
        deploy_all_on_release: {
          type: "boolean",
          default: true,
        },
        deploy_all_on_manual_dispatch: {
          type: "boolean",
          default: false,
        },

        require_ci_success: {
          type: "boolean",
          default: true,
        },
        require_security_success: {
          type: "boolean",
          default: true,
        },
        require_smoke_tests: {
          type: "boolean",
          default: true,
        },
        require_wrangler_validation: {
          type: "boolean",
          default: true,
        },

        block_dependency_prs_from_deploying_production: {
          type: "boolean",
          default: true,
        },
        block_openai_prs_from_deploying_production: {
          type: "boolean",
          default: true,
        },
        block_fork_prs_from_using_cloudflare_secrets: {
          type: "boolean",
          default: true,
        },

        allow_manual_preview_deploy: {
          type: "boolean",
          default: true,
        },
        allow_manual_staging_deploy: {
          type: "boolean",
          default: true,
        },
        allow_manual_production_deploy: {
          type: "boolean",
          default: true,
        },
        manual_production_requires_confirmation: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    account: {
      type: "object",
      additionalProperties: false,
      properties: {
        account_id_variable: {
          type: "string",
          default: "CLOUDFLARE_ACCOUNT_ID",
        },
        api_token_secret: {
          type: "string",
          default: "CLOUDFLARE_API_TOKEN",
        },
        api_token_preview_secret: {
          type: ["string", "null"],
          default: "CLOUDFLARE_API_TOKEN_PREVIEW",
        },
        api_token_staging_secret: {
          type: ["string", "null"],
          default: "CLOUDFLARE_API_TOKEN_STAGING",
        },
        api_token_production_secret: {
          type: ["string", "null"],
          default: "CLOUDFLARE_API_TOKEN_PRODUCTION",
        },
        zone_id_variable: {
          type: ["string", "null"],
          default: "CLOUDFLARE_ZONE_ID",
        },
        project_name_variable: {
          type: ["string", "null"],
          default: "CLOUDFLARE_PROJECT_NAME",
        },
      },
      default: {},
    },

    services: SERVICE_FLAGS,

    environments: {
      type: "object",
      additionalProperties: false,
      required: ["preview", "staging", "production"],
      properties: {
        preview: {
          ...ENVIRONMENT_RULE,
          properties: {
            ...ENVIRONMENT_RULE.properties,
            github_environment: {
              type: "string",
              default: "preview",
            },
            cloudflare_environment: {
              type: "string",
              default: "preview",
            },
            automatic_on_pull_request: {
              type: "boolean",
              default: true,
            },
            automatic_on_main: {
              type: "boolean",
              default: false,
            },
            release_tag_only: {
              type: "boolean",
              default: false,
            },
            approval_required: {
              type: "boolean",
              default: false,
            },
          },
        },

        staging: {
          ...ENVIRONMENT_RULE,
          properties: {
            ...ENVIRONMENT_RULE.properties,
            github_environment: {
              type: "string",
              default: "staging",
            },
            cloudflare_environment: {
              type: "string",
              default: "staging",
            },
            automatic_on_pull_request: {
              type: "boolean",
              default: false,
            },
            automatic_on_main: {
              type: "boolean",
              default: true,
            },
            release_tag_only: {
              type: "boolean",
              default: false,
            },
            approval_required: {
              type: "boolean",
              default: false,
            },
            branch: {
              type: "string",
              const: "main",
              default: "main",
            },
          },
        },

        production: {
          ...ENVIRONMENT_RULE,
          properties: {
            ...ENVIRONMENT_RULE.properties,
            github_environment: {
              type: "string",
              default: "production",
            },
            cloudflare_environment: {
              type: "string",
              default: "production",
            },
            automatic_on_pull_request: {
              type: "boolean",
              default: false,
            },
            automatic_on_main: {
              type: "boolean",
              default: false,
            },
            release_tag_only: {
              type: "boolean",
              default: true,
            },
            approval_required: {
              type: "boolean",
              default: true,
            },
            protected: {
              type: "boolean",
              default: true,
            },
            allowed_tag_pattern: {
              type: "string",
              default: "^V[0-9]+\\.[0-9]+\\.[0-9]+$",
            },
          },
        },
      },
    },

    discovery: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        use_nx_project_graph: {
          type: "boolean",
          default: true,
        },
        use_wrangler_config_detection: {
          type: "boolean",
          default: true,
        },
        use_package_json_scripts: {
          type: "boolean",
          default: true,
        },
        apps_patterns: STRING_ARRAY,
        wrangler_config_patterns: STRING_ARRAY,
        package_json_patterns: STRING_ARRAY,
        ignore_paths: STRING_ARRAY,
        project_type_labels: {
          type: "object",
          additionalProperties: {
            type: "string",
            minLength: 1,
          },
          default: {},
        },
      },
      default: {},
    },

    projects: {
      type: "array",
      items: WRANGLER_PROJECT,
      default: [],
    },

    wrangler: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        version_command: {
          type: "string",
          default: "pnpm exec wrangler --version",
        },
        config_names: STRING_ARRAY,
        validate_command: {
          type: "string",
          default: "pnpm exec wrangler deploy --dry-run",
        },
        deploy_command: {
          type: "string",
          default: "pnpm exec wrangler deploy",
        },
        pages_deploy_command: {
          type: "string",
          default: "pnpm exec wrangler pages deploy",
        },
        use_env_flag: {
          type: "boolean",
          default: true,
        },
        env_flag_format: {
          type: "string",
          default: "--env {environment}",
        },
        dry_run_flag: {
          type: "string",
          default: "--dry-run",
        },
        compatibility_date_required: {
          type: "boolean",
          default: true,
        },
        fail_on_missing_wrangler_config: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    deployment: {
      type: "object",
      additionalProperties: false,
      properties: {
        strategy: {
          type: "string",
          enum: ["changed", "all", "matrix"],
          default: "changed",
        },
        concurrency_group_format: {
          type: "string",
          default: "cloudflare-{environment}-{ref}",
        },
        cancel_in_progress_preview: {
          type: "boolean",
          default: true,
        },
        cancel_in_progress_staging: {
          type: "boolean",
          default: false,
        },
        cancel_in_progress_production: {
          type: "boolean",
          default: false,
        },
        max_parallel: {
          type: "integer",
          minimum: 1,
          default: 4,
        },
        retry_attempts: {
          type: "integer",
          minimum: 0,
          default: 2,
        },
        timeout_minutes: {
          type: "integer",
          minimum: 1,
          default: 30,
        },
        upload_source_maps: {
          type: "boolean",
          default: true,
        },
        create_deployment_summary: {
          type: "boolean",
          default: true,
        },
        create_github_deployment: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    preview: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        trigger_events: STRING_ARRAY,
        environment: {
          type: "string",
          default: "preview",
        },
        github_environment: {
          type: "string",
          default: "preview",
        },
        branch_alias_format: {
          type: "string",
          default: "pr-{number}",
        },
        url_comment_enabled: {
          type: "boolean",
          default: true,
        },
        required_checks: STRING_ARRAY,
        required_labels_absent: LABEL_ARRAY,
        skip_labels: LABEL_ARRAY,
        secrets_allowed_on_forks: {
          type: "boolean",
          default: false,
        },
        cleanup_on_pr_close: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    staging: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        trigger_events: STRING_ARRAY,
        branch: {
          type: "string",
          const: "main",
          default: "main",
        },
        environment: {
          type: "string",
          default: "staging",
        },
        github_environment: {
          type: "string",
          default: "staging",
        },
        required_checks: STRING_ARRAY,
        required_labels_absent: LABEL_ARRAY,
        smoke_tests_required: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    production: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        trigger_events: STRING_ARRAY,
        environment: {
          type: "string",
          default: "production",
        },
        github_environment: {
          type: "string",
          default: "production",
        },
        release_tag_only: {
          type: "boolean",
          default: true,
        },
        allowed_tag_pattern: {
          type: "string",
          default: "^V[0-9]+\\.[0-9]+\\.[0-9]+$",
        },
        approval_required: {
          type: "boolean",
          default: true,
        },
        required_checks: STRING_ARRAY,
        required_labels_absent: LABEL_ARRAY,
        required_artifacts: STRING_ARRAY,
        require_sbom: {
          type: "boolean",
          default: true,
        },
        require_attestations: {
          type: "boolean",
          default: true,
        },
        smoke_tests_required: {
          type: "boolean",
          default: true,
        },
        rollback_enabled: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    workers: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        required_for_projects: {
          type: "boolean",
          default: true,
        },
        service_patterns: STRING_ARRAY,
        routes_required_for_production: {
          type: "boolean",
          default: true,
        },
        custom_domains_allowed: {
          type: "boolean",
          default: true,
        },
        worker_name_format: {
          type: "string",
          default: "aerealith-{project}-{environment}",
        },
      },
      default: {},
    },

    queues: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        bindings: {
          type: "array",
          items: BINDING_RULE,
          default: [],
        },
        require_dlq_for_production: {
          type: "boolean",
          default: true,
        },
        require_consumer_config: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    r2: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        bindings: {
          type: "array",
          items: BINDING_RULE,
          default: [],
        },
        require_bucket_per_environment: {
          type: "boolean",
          default: true,
        },
        public_buckets_allowed: {
          type: "boolean",
          default: false,
        },
        lifecycle_rules_required: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    d1: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        bindings: {
          type: "array",
          items: BINDING_RULE,
          default: [],
        },
        migrations_required: {
          type: "boolean",
          default: true,
        },
        migrations_directory_patterns: STRING_ARRAY,
        run_migrations_before_deploy: {
          type: "boolean",
          default: true,
        },
        backup_before_production_migration: {
          type: "boolean",
          default: true,
        },
        production_migration_requires_approval: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    kv: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        bindings: {
          type: "array",
          items: BINDING_RULE,
          default: [],
        },
        require_namespace_per_environment: {
          type: "boolean",
          default: true,
        },
        preview_namespace_required: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    secrets_store: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        use_cloudflare_secrets_store: {
          type: "boolean",
          default: true,
        },
        use_worker_secrets: {
          type: "boolean",
          default: true,
        },
        required_secrets: SECRET_ARRAY,
        environment_required_secrets: {
          type: "object",
          additionalProperties: SECRET_ARRAY,
          properties: {
            preview: SECRET_ARRAY,
            staging: SECRET_ARRAY,
            production: SECRET_ARRAY,
          },
          default: {},
        },
        fail_on_plaintext_secret_values: {
          type: "boolean",
          default: true,
        },
        secret_value_patterns_forbidden: STRING_ARRAY,
      },
      default: {},
    },

    flagship: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        project_name: {
          type: "string",
          default: "frontend",
        },
        path: {
          type: "string",
          default: "apps/frontend",
        },
        production_domain: {
          type: ["string", "null"],
          default: "aerealith.app",
        },
        staging_domain: {
          type: ["string", "null"],
          default: null,
        },
        preview_domain_format: {
          type: ["string", "null"],
          default: "pr-{number}.aerealith.app",
        },
        required: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    build: {
      type: "object",
      additionalProperties: false,
      properties: {
        install_command: {
          type: "string",
          default: "pnpm install --frozen-lockfile",
        },
        affected_command: {
          type: "string",
          default: "pnpm nx affected --target=build",
        },
        build_command: {
          type: "string",
          default: "pnpm nx run {project}:build",
        },
        output_directory_patterns: STRING_ARRAY,
        cache_enabled: {
          type: "boolean",
          default: true,
        },
        cache_key_format: {
          type: "string",
          default: "cloudflare-{environment}-{project}-{hash}",
        },
        artifact_build_outputs: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    validation: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        validate_wrangler_config: {
          type: "boolean",
          default: true,
        },
        validate_bindings: {
          type: "boolean",
          default: true,
        },
        validate_environment_variables: {
          type: "boolean",
          default: true,
        },
        validate_secrets_exist: {
          type: "boolean",
          default: true,
        },
        validate_d1_migrations: {
          type: "boolean",
          default: true,
        },
        validate_routes: {
          type: "boolean",
          default: true,
        },
        validate_custom_domains: {
          type: "boolean",
          default: true,
        },
        validate_runtime_configuration: {
          type: "boolean",
          default: true,
        },
        fail_on_unknown_binding: {
          type: "boolean",
          default: true,
        },
        fail_on_missing_binding: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    smoke_tests: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        required_for_preview: {
          type: "boolean",
          default: false,
        },
        required_for_staging: {
          type: "boolean",
          default: true,
        },
        required_for_production: {
          type: "boolean",
          default: true,
        },
        commands: {
          type: "object",
          additionalProperties: COMMAND_BLOCK,
          default: {},
        },
        healthcheck_paths: STRING_ARRAY,
        timeout_minutes: {
          type: "integer",
          minimum: 1,
          default: 10,
        },
      },
      default: {},
    },

    rollback: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        production_enabled: {
          type: "boolean",
          default: true,
        },
        automatic_on_failed_smoke_test: {
          type: "boolean",
          default: false,
        },
        manual_workflow_enabled: {
          type: "boolean",
          default: true,
        },
        require_approval: {
          type: "boolean",
          default: true,
        },
        keep_previous_deployment_count: {
          type: "integer",
          minimum: 1,
          default: 5,
        },
      },
      default: {},
    },

    security: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        require_security_gate: {
          type: "boolean",
          default: true,
        },
        block_on_security_labels: LABEL_ARRAY,
        block_on_failed_checks: STRING_ARRAY,
        block_on_secret_findings: {
          type: "boolean",
          default: true,
        },
        block_on_dependency_vulnerabilities: {
          type: "boolean",
          default: true,
        },
        block_on_codeql_alerts: {
          type: "boolean",
          default: true,
        },
        block_on_sonarqube_failure: {
          type: "boolean",
          default: true,
        },
        block_on_unapproved_cloudflare_config_change: {
          type: "boolean",
          default: true,
        },
        require_cloudflare_config_review: {
          type: "boolean",
          default: true,
        },
        sensitive_paths: STRING_ARRAY,
      },
      default: {},
    },

    permissions: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          contents: {
            type: "string",
            enum: ["none", "read", "write"],
          },
          deployments: {
            type: "string",
            enum: ["none", "read", "write"],
          },
          pull_requests: {
            type: "string",
            enum: ["none", "read", "write"],
          },
          issues: {
            type: "string",
            enum: ["none", "read", "write"],
          },
          id_token: {
            type: "string",
            enum: ["none", "read", "write"],
          },
          actions: {
            type: "string",
            enum: ["none", "read", "write"],
          },
        },
      },
      default: {},
    },

    artifacts: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        upload_deployment_manifest: {
          type: "boolean",
          default: true,
        },
        upload_wrangler_logs: {
          type: "boolean",
          default: true,
        },
        upload_build_outputs: {
          type: "boolean",
          default: true,
        },
        upload_smoke_test_results: {
          type: "boolean",
          default: true,
        },
        manifest_file: {
          type: "string",
          default: "cloudflare-deployment-manifest.json",
        },
        retention_days: {
          type: "object",
          additionalProperties: {
            type: "integer",
            minimum: 1,
          },
          properties: {
            preview: {
              type: "integer",
              minimum: 1,
              default: 7,
            },
            staging: {
              type: "integer",
              minimum: 1,
              default: 30,
            },
            production: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
            logs: {
              type: "integer",
              minimum: 1,
              default: 30,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    caching: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        human_readable_names: {
          type: "boolean",
          default: true,
        },
        cache_node_modules: {
          type: "boolean",
          default: false,
        },
        cache_pnpm_store: {
          type: "boolean",
          default: true,
        },
        cache_nx: {
          type: "boolean",
          default: true,
        },
        cache_wrangler: {
          type: "boolean",
          default: true,
        },
        cache_build_outputs: {
          type: "boolean",
          default: true,
        },
        key_format: {
          type: "string",
          default: "cloudflare-{environment}-{project}-{hash}",
        },
        restore_keys: STRING_ARRAY,
      },
      default: {},
    },

    runtime: {
      type: "object",
      additionalProperties: false,
      properties: {
        required_secrets: {
          type: "object",
          additionalProperties: SECRET_ARRAY,
          properties: {
            preview: SECRET_ARRAY,
            staging: SECRET_ARRAY,
            production: SECRET_ARRAY,
          },
          default: {},
        },
        required_variables: {
          type: "object",
          additionalProperties: SECRET_ARRAY,
          properties: {
            preview: SECRET_ARRAY,
            staging: SECRET_ARRAY,
            production: SECRET_ARRAY,
          },
          default: {},
        },
        optional_variables: SECRET_ARRAY,
        recommended_variables: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
          default: {},
        },
      },
      default: {},
    },

    reporting: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        add_workflow_summary: {
          type: "boolean",
          default: true,
        },
        add_pr_comment_for_preview_url: {
          type: "boolean",
          default: true,
        },
        add_pr_comment_on_deploy_failure: {
          type: "boolean",
          default: true,
        },
        add_release_summary: {
          type: "boolean",
          default: true,
        },
        include_changed_projects: {
          type: "boolean",
          default: true,
        },
        include_bindings: {
          type: "boolean",
          default: true,
        },
        include_urls: {
          type: "boolean",
          default: true,
        },
        comment_footer: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: {
              type: ["string", "null"],
              default: "<!-- aerealith-cloudflare:start -->",
            },
            end: {
              type: ["string", "null"],
              default: "<!-- aerealith-cloudflare:end -->",
            },
          },
          default: {},
        },
      },
      default: {},
    },

    enforcement: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: RULE_ACTION,
          label: {
            type: ["string", "null"],
            default: null,
          },
          labels: LABEL_ARRAY,
          message: {
            type: ["string", "null"],
            default: null,
          },
        },
      },
      properties: {
        missing_cloudflare_secret: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "blocked-by-deployment",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Required Cloudflare secret is missing.",
            },
          },
          default: {},
        },
        production_without_release_tag: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "do-not-deploy",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Production deployment requires a release tag.",
            },
          },
          default: {},
        },
        production_without_approval: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "needs-deployment-approval",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Production deployment requires environment approval.",
            },
          },
          default: {},
        },
        failed_smoke_tests: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "blocked-by-deployment",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Cloudflare smoke tests failed.",
            },
          },
          default: {},
        },
      },
      default: {},
    },

    safety: {
      type: "object",
      additionalProperties: false,
      properties: {
        dry_run_supported: {
          type: "boolean",
          default: true,
        },
        debug_supported: {
          type: "boolean",
          default: true,
        },

        do_not_deploy_from_forks_with_secrets: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_from_pull_request: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_from_main_without_tag: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_without_approval: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_without_release_evidence: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_dependency_prs_to_production: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_openai_prs_to_production: {
          type: "boolean",
          default: true,
        },
        do_not_print_cloudflare_secrets: {
          type: "boolean",
          default: true,
        },
        do_not_store_secret_values_in_artifacts: {
          type: "boolean",
          default: true,
        },
        do_not_delete_cloudflare_resources: {
          type: "boolean",
          default: true,
        },
        do_not_delete_production_preview_without_confirmation: {
          type: "boolean",
          default: true,
        },
        redact_patterns: STRING_ARRAY,
        protected_labels: LABEL_ARRAY,
      },
      default: {},
    },
  },
};

function getCloudflareRulesSchema() {
  return CLOUDFLARE_RULES_SCHEMA;
}

module.exports = {
  CLOUDFLARE_RULES_SCHEMA,
  schema: CLOUDFLARE_RULES_SCHEMA,
  getCloudflareRulesSchema,

  REGEX_STRING,
  STRING_ARRAY,
  LABEL_NAME,
  LABEL_ARRAY,
  SECRET_NAME,
  SECRET_ARRAY,
  ENVIRONMENT_NAME,
  SERVICE_FLAGS,
  PATH_RULE,
  WRANGLER_PROJECT,
  BINDING_RULE,
  COMMAND_BLOCK,
  ENVIRONMENT_RULE,
  RULE_ACTION,
};

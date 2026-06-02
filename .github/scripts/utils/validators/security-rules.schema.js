// .github/scripts/utils/validators/security-rules.schema.js
// =============================================================================
// Aerealith AI Security Rules JSON Schema
// -----------------------------------------------------------------------------
// Purpose:
//   JSON Schema definition for `.github/repo-management/security-rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/validate-configs.js
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/security/summarize-security.js
//   - .github/scripts/security/create-security-issues.js
//   - .github/scripts/security/summarize-dependencies.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/cloudflare/deploy-preview.js
//   - .github/scripts/cloudflare/deploy-staging.js
//   - .github/scripts/cloudflare/deploy-production.js
//   - .github/scripts/utils/config-loaders/security-rules.js
//
// Notes:
//   - Security is intentionally strict by default.
//   - Main should be scanned regularly.
//   - Pull requests must pass security gates before merge.
//   - Releases and production deploys must pass security gates.
//   - Dependency and security patch PRs may auto-merge only after all required
//     checks pass.
//   - Dependency automation must never trigger releases.
//   - Attestations are only release/publish evidence and are not produced here.
//   - Secrets must be referenced by name only; never store secret values here.
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

const GITHUB_LOGIN = {
  type: "string",
  minLength: 1,
  pattern: "^[A-Za-z0-9-]+(\\[bot\\])?$",
};

const LOGIN_ARRAY = {
  type: "array",
  items: GITHUB_LOGIN,
  uniqueItems: true,
  default: [],
};

const GLOB_ARRAY = {
  type: "array",
  items: {
    type: "string",
    minLength: 1,
  },
  uniqueItems: true,
  default: [],
};

const CHECK_ARRAY = {
  type: "array",
  items: {
    type: "string",
    minLength: 1,
  },
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

const VARIABLE_NAME = {
  type: "string",
  minLength: 1,
  pattern: "^[A-Z][A-Z0-9_]*$",
};

const VARIABLE_ARRAY = {
  type: "array",
  items: VARIABLE_NAME,
  uniqueItems: true,
  default: [],
};

const SEVERITY = {
  type: "string",
  enum: [
    "critical",
    "high",
    "medium",
    "moderate",
    "low",
    "warning",
    "note",
    "unknown",
  ],
};

const SEVERITY_ARRAY = {
  type: "array",
  items: SEVERITY,
  uniqueItems: true,
  default: [],
};

const LICENSE_ARRAY = {
  type: "array",
  items: {
    type: "string",
    minLength: 1,
  },
  uniqueItems: true,
  default: [],
};

const BOOLEAN_MAP = {
  type: "object",
  additionalProperties: {
    type: "boolean",
  },
  default: {},
};

const STRING_MAP = {
  type: "object",
  additionalProperties: {
    type: "string",
  },
  default: {},
};

const STRING_ARRAY_MAP = {
  type: "object",
  additionalProperties: STRING_ARRAY,
  default: {},
};

const LABEL_ARRAY_MAP = {
  type: "object",
  additionalProperties: LABEL_ARRAY,
  default: {},
};

const RULE_ACTION = {
  type: "string",
  enum: ["off", "warn", "fail", "label", "comment", "block"],
  default: "fail",
};

const ENFORCEMENT_RULE = {
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
  default: {},
};

const COMMENT_FOOTER = {
  type: "object",
  additionalProperties: false,
  properties: {
    start: {
      type: ["string", "null"],
      default: null,
    },
    end: {
      type: ["string", "null"],
      default: null,
    },
  },
  default: {},
};

const TOOL_CONFIG = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      default: true,
    },
    required: {
      type: "boolean",
      default: false,
    },
    check_names: CHECK_ARRAY,
    labels: LABEL_ARRAY,
    report_artifacts: STRING_ARRAY,
  },
  default: {},
};

const GATE_SEVERITY_RULE = {
  type: "object",
  additionalProperties: false,
  properties: {
    block: SEVERITY_ARRAY,
    warn: SEVERITY_ARRAY,
    allow: SEVERITY_ARRAY,
  },
  default: {},
};

const SCHEDULE_ENTRY = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      default: true,
    },
    cron: {
      type: ["string", "null"],
      default: null,
    },
    timezone: {
      type: "string",
      default: "America/Boise",
    },
    description: {
      type: ["string", "null"],
      default: null,
    },
  },
  default: {},
};

const ISSUE_TEMPLATE_RULE = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      default: "[Security]: {summary}",
    },
    labels: LABEL_ARRAY,
    milestone: {
      type: ["string", "null"],
      default: null,
    },
  },
  default: {},
};

const SECURITY_RULES_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/SinLess-Games/Aerealith-AI/schemas/security-rules.schema.json",
  title: "Aerealith AI Security Rules",
  description: "Schema for .github/repo-management/security-rules.yaml.",
  type: "object",
  additionalProperties: false,

  required: [
    "version",
    "repository",
    "tooling",
    "policy",
    "tools",
    "codeql",
    "dependabot",
    "dependency_review",
    "sonarqube",
    "secret_scanning",
    "pnpm_audit",
    "license_review",
    "container_scanning",
    "sbom",
    "supply_chain",
    "required_checks",
    "gates",
    "dependency_automation",
    "issue_creation",
    "labels",
    "schedules",
    "artifacts",
    "reporting",
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
        primary_language: {
          type: "string",
          default: "TypeScript",
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
        strict: {
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

        security_required_on_pull_requests: {
          type: "boolean",
          default: true,
        },
        security_required_on_main: {
          type: "boolean",
          default: true,
        },
        security_required_before_release: {
          type: "boolean",
          default: true,
        },
        security_required_before_staging_deploy: {
          type: "boolean",
          default: true,
        },
        security_required_before_production_deploy: {
          type: "boolean",
          default: true,
        },

        block_merge_on_security_failure: {
          type: "boolean",
          default: true,
        },
        block_release_on_security_failure: {
          type: "boolean",
          default: true,
        },
        block_deploy_on_security_failure: {
          type: "boolean",
          default: true,
        },

        dependency_prs_must_be_no_release: {
          type: "boolean",
          default: true,
        },
        security_dependency_prs_must_be_no_release: {
          type: "boolean",
          default: true,
        },

        allow_dependency_auto_merge_after_green_security: {
          type: "boolean",
          default: true,
        },
        allow_security_patch_auto_merge_after_green_security: {
          type: "boolean",
          default: true,
        },

        require_codeql: {
          type: "boolean",
          default: true,
        },
        require_dependabot: {
          type: "boolean",
          default: true,
        },
        require_dependency_review: {
          type: "boolean",
          default: true,
        },
        require_sonarqube: {
          type: "boolean",
          default: true,
        },
        require_secret_scanning: {
          type: "boolean",
          default: true,
        },
        require_license_review: {
          type: "boolean",
          default: true,
        },
        require_pnpm_audit: {
          type: "boolean",
          default: true,
        },
        require_container_scanning_for_dockerfiles: {
          type: "boolean",
          default: true,
        },
        require_sbom_for_release: {
          type: "boolean",
          default: true,
        },

        fail_on_missing_security_report: {
          type: "boolean",
          default: true,
        },
        fail_on_unknown_security_state: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    tools: {
      type: "object",
      additionalProperties: {
        anyOf: [
          {
            type: "boolean",
          },
          TOOL_CONFIG,
        ],
      },
      properties: {
        codeql: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        dependabot: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        dependency_review: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        sonarqube: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        secret_scanning: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        pnpm_audit: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        license_review: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        container_scanning: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        sbom: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        scorecard: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        gitleaks: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        trivy: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        grype: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        semgrep: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
        osv_scanner: {
          anyOf: [{ type: "boolean" }, TOOL_CONFIG],
        },
      },
      default: {},
    },

    codeql: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        config_file: {
          type: "string",
          default: ".github/codeql.yaml",
        },
        languages: {
          type: "array",
          items: {
            type: "string",
            enum: ["javascript-typescript", "javascript", "typescript"],
          },
          uniqueItems: true,
          default: ["javascript-typescript"],
        },
        required_queries: STRING_ARRAY,
        block_on_severities: SEVERITY_ARRAY,
        warn_on_severities: SEVERITY_ARRAY,
        required_check_names: CHECK_ARRAY,
      },
      default: {},
    },

    dependabot: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        config_file: {
          type: "string",
          default: ".github/dependabot.yaml",
        },
        alerts_enabled: {
          type: "boolean",
          default: true,
        },
        security_updates_enabled: {
          type: "boolean",
          default: true,
        },
        block_on_alert_severities: SEVERITY_ARRAY,
        warn_on_alert_severities: SEVERITY_ARRAY,
        labels: LABEL_ARRAY,
      },
      default: {},
    },

    dependency_review: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        required_check_names: CHECK_ARRAY,
        fail_on_severity: SEVERITY,
        warn_on_severity: SEVERITY,
        allow_ghsas: STRING_ARRAY,
        deny_ghsas: STRING_ARRAY,
        fail_on_scopes: STRING_ARRAY,

        licenses: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            allow: LICENSE_ARRAY,
            deny: LICENSE_ARRAY,
            fail_on_unknown: {
              type: "boolean",
              default: false,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    sonarqube: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        cloud: {
          type: "boolean",
          default: true,
        },
        project_key_variable: {
          type: "string",
          default: "SONAR_PROJECT_KEY",
        },
        organization_variable: {
          type: "string",
          default: "SONAR_ORGANIZATION",
        },
        token_secret: {
          type: "string",
          default: "SONAR_TOKEN",
        },
        quality_gate_required: {
          type: "boolean",
          default: true,
        },
        block_on_quality_gate_failure: {
          type: "boolean",
          default: true,
        },
        required_check_names: CHECK_ARRAY,
      },
      default: {},
    },

    secret_scanning: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        push_protection_required: {
          type: "boolean",
          default: true,
        },
        block_on_verified_secret: {
          type: "boolean",
          default: true,
        },
        block_on_any_secret: {
          type: "boolean",
          default: true,
        },
        allowlist_paths: GLOB_ARRAY,
        allowlist_patterns: STRING_ARRAY,
        required_check_names: CHECK_ARRAY,
      },
      default: {},
    },

    pnpm_audit: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        command: {
          type: "string",
          default: "pnpm audit --audit-level high",
        },
        fail_on_severities: SEVERITY_ARRAY,
        warn_on_severities: SEVERITY_ARRAY,
        ignore_advisories: STRING_ARRAY,
        required_check_names: CHECK_ARRAY,
      },
      default: {},
    },

    license_review: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        allowed: LICENSE_ARRAY,
        forbidden: LICENSE_ARRAY,
        warn: LICENSE_ARRAY,
        fail_on_unknown: {
          type: "boolean",
          default: false,
        },
        allow_private_packages: {
          type: "boolean",
          default: true,
        },
        required_check_names: CHECK_ARRAY,
      },
      default: {},
    },

    container_scanning: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        required_when_dockerfile_changed: {
          type: "boolean",
          default: true,
        },
        dockerfile_patterns: GLOB_ARRAY,
        ignore_paths: GLOB_ARRAY,
        scanners: {
          type: "array",
          items: {
            type: "string",
            enum: ["trivy", "grype", "docker-scout", "osv-scanner"],
          },
          uniqueItems: true,
          default: ["trivy"],
        },
        fail_on_severities: SEVERITY_ARRAY,
        warn_on_severities: SEVERITY_ARRAY,
        required_check_names: CHECK_ARRAY,
      },
      default: {},
    },

    sbom: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        required_on_release: {
          type: "boolean",
          default: true,
        },
        required_for_containers: {
          type: "boolean",
          default: true,
        },
        format: {
          type: "string",
          enum: ["spdx-json", "cyclonedx-json"],
          default: "spdx-json",
        },
        artifact_name: {
          type: "string",
          default: "sbom.spdx.json",
        },
        accepted_formats: {
          type: "array",
          items: {
            type: "string",
            enum: ["spdx-json", "cyclonedx-json"],
          },
          uniqueItems: true,
          default: ["spdx-json"],
        },
        required_check_names: CHECK_ARRAY,
      },
      default: {},
    },

    supply_chain: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        scorecard: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            required_on_main: {
              type: "boolean",
              default: true,
            },
            required_on_release: {
              type: "boolean",
              default: true,
            },
            min_score: {
              type: "number",
              minimum: 0,
              maximum: 10,
              default: 7,
            },
            block_on_dangerous_workflow: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        provenance: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            required_on_release: {
              type: "boolean",
              default: true,
            },
            required_for_npm: {
              type: "boolean",
              default: true,
            },
            required_for_containers: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        signatures: {
          type: "object",
          additionalProperties: false,
          properties: {
            require_signed_commits: {
              type: "boolean",
              default: false,
            },
            require_signed_tags: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    required_checks: {
      type: "object",
      additionalProperties: CHECK_ARRAY,
      properties: {
        pull_request: CHECK_ARRAY,
        main: CHECK_ARRAY,
        release: CHECK_ARRAY,
        staging_deploy: CHECK_ARRAY,
        production_deploy: CHECK_ARRAY,
        dependency_auto_merge: CHECK_ARRAY,
        security_patch_auto_merge: CHECK_ARRAY,
        container_scanning: CHECK_ARRAY,
        codeql: CHECK_ARRAY,
        dependabot: CHECK_ARRAY,
        dependency_review: CHECK_ARRAY,
        sonarqube: CHECK_ARRAY,
        secret_scanning: CHECK_ARRAY,
        pnpm_audit: CHECK_ARRAY,
        license_review: CHECK_ARRAY,
        sbom: CHECK_ARRAY,
        supply_chain: CHECK_ARRAY,
      },
      default: {},
    },

    gates: {
      type: "object",
      additionalProperties: false,
      properties: {
        pull_request: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            block_on_failed_required_checks: {
              type: "boolean",
              default: true,
            },
            block_on_findings: GATE_SEVERITY_RULE,
          },
          default: {},
        },

        main: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            scheduled_scan_required: {
              type: "boolean",
              default: true,
            },
            block_on_findings: GATE_SEVERITY_RULE,
          },
          default: {},
        },

        release: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            block_on_failed_required_checks: {
              type: "boolean",
              default: true,
            },
            require_sbom: {
              type: "boolean",
              default: true,
            },
            require_attestations: {
              type: "boolean",
              default: true,
            },
            block_on_findings: GATE_SEVERITY_RULE,
          },
          default: {},
        },

        staging_deploy: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            block_on_failed_required_checks: {
              type: "boolean",
              default: true,
            },
            block_on_findings: GATE_SEVERITY_RULE,
          },
          default: {},
        },

        production_deploy: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            require_release_tag: {
              type: "boolean",
              default: true,
            },
            require_environment_approval: {
              type: "boolean",
              default: true,
            },
            require_sbom: {
              type: "boolean",
              default: true,
            },
            require_attestations: {
              type: "boolean",
              default: true,
            },
            block_on_failed_required_checks: {
              type: "boolean",
              default: true,
            },
            block_on_findings: GATE_SEVERITY_RULE,
          },
          default: {},
        },
      },
      default: {},
    },

    dependency_automation: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        authors: LOGIN_ARRAY,

        branch_patterns: {
          type: "array",
          items: REGEX_STRING,
          uniqueItems: true,
          default: ["^renovate/.+$", "^dependabot/.+$", "^mend/.+$"],
        },

        required_labels: LABEL_ARRAY,

        security_required_labels: LABEL_ARRAY,

        release_blocking_labels: LABEL_ARRAY,

        auto_merge: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            allow_patch: {
              type: "boolean",
              default: true,
            },
            allow_minor: {
              type: "boolean",
              default: true,
            },
            allow_major: {
              type: "boolean",
              default: false,
            },
            require_all_security_checks: {
              type: "boolean",
              default: true,
            },
            required_checks: CHECK_ARRAY,
            required_absent_labels: LABEL_ARRAY,
          },
          default: {},
        },

        security_patch_auto_merge: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            require_all_security_checks: {
              type: "boolean",
              default: true,
            },
            required_checks: CHECK_ARRAY,
            required_absent_labels: LABEL_ARRAY,
          },
          default: {},
        },
      },
      default: {},
    },

    issue_creation: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        use_openai_summary: {
          type: "boolean",
          default: true,
        },
        create_for_unpatchable_vulnerabilities: {
          type: "boolean",
          default: true,
        },
        create_for_failed_security_updates: {
          type: "boolean",
          default: true,
        },
        create_for_repeated_failures: {
          type: "boolean",
          default: true,
        },
        repeated_failure_threshold: {
          type: "integer",
          minimum: 1,
          default: 3,
        },

        default_assignees: LOGIN_ARRAY,
        default_labels: LABEL_ARRAY,
        default_milestone: {
          type: ["string", "null"],
          default: null,
        },

        severity_labels: {
          type: "object",
          additionalProperties: LABEL_NAME,
          properties: {
            critical: LABEL_NAME,
            high: LABEL_NAME,
            medium: LABEL_NAME,
            moderate: LABEL_NAME,
            low: LABEL_NAME,
            warning: LABEL_NAME,
            unknown: LABEL_NAME,
          },
          default: {},
        },

        priority_labels: {
          type: "object",
          additionalProperties: LABEL_NAME,
          properties: {
            critical: LABEL_NAME,
            high: LABEL_NAME,
            medium: LABEL_NAME,
            moderate: LABEL_NAME,
            low: LABEL_NAME,
            warning: LABEL_NAME,
            unknown: LABEL_NAME,
          },
          default: {},
        },

        templates: {
          type: "object",
          additionalProperties: ISSUE_TEMPLATE_RULE,
          properties: {
            default: ISSUE_TEMPLATE_RULE,
            vulnerability: ISSUE_TEMPLATE_RULE,
            dependency_vulnerability: ISSUE_TEMPLATE_RULE,
            failed_security_update: ISSUE_TEMPLATE_RULE,
            repeated_failure: ISSUE_TEMPLATE_RULE,
            secret_leak: ISSUE_TEMPLATE_RULE,
            license_violation: ISSUE_TEMPLATE_RULE,
            container_vulnerability: ISSUE_TEMPLATE_RULE,
            supply_chain: ISSUE_TEMPLATE_RULE,
          },
          default: {},
        },
      },
      default: {},
    },

    labels: {
      type: "object",
      additionalProperties: false,
      properties: {
        blocking: LABEL_ARRAY,
        review_required: LABEL_ARRAY,
        dependency_security: LABEL_ARRAY,
        release_blocking: LABEL_ARRAY,
        auto_apply_by_finding_type: LABEL_ARRAY_MAP,
        auto_apply_by_tool: LABEL_ARRAY_MAP,
        auto_apply_by_severity: LABEL_ARRAY_MAP,
      },
      default: {},
    },

    schedules: {
      type: "object",
      additionalProperties: SCHEDULE_ENTRY,
      properties: {
        main_security_scan: SCHEDULE_ENTRY,
        dependency_security_scan: SCHEDULE_ENTRY,
        codeql_scan: SCHEDULE_ENTRY,
        sonarqube_scan: SCHEDULE_ENTRY,
        scorecard_scan: SCHEDULE_ENTRY,
        container_scan: SCHEDULE_ENTRY,
        license_review: SCHEDULE_ENTRY,
        secret_scan: SCHEDULE_ENTRY,
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

        upload_security_reports: {
          type: "boolean",
          default: true,
        },
        upload_sarif: {
          type: "boolean",
          default: true,
        },
        upload_dependency_reports: {
          type: "boolean",
          default: true,
        },
        upload_container_reports: {
          type: "boolean",
          default: true,
        },
        upload_license_reports: {
          type: "boolean",
          default: true,
        },
        upload_policy_gate_summary: {
          type: "boolean",
          default: true,
        },

        retention_days: {
          type: "object",
          additionalProperties: {
            type: "integer",
            minimum: 1,
          },
          properties: {
            pull_request: {
              type: "integer",
              minimum: 1,
              default: 30,
            },
            main: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
            release: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
            security: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
            sarif: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
            dependency: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
            container: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
            license: {
              type: "integer",
              minimum: 1,
              default: 90,
            },
          },
          default: {},
        },

        required_release_artifacts: STRING_ARRAY,
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
        add_pr_comment_on_failure: {
          type: "boolean",
          default: true,
        },
        add_pr_comment_on_warning: {
          type: "boolean",
          default: false,
        },
        add_issue_comment_for_security_issue: {
          type: "boolean",
          default: true,
        },

        comment_footer: COMMENT_FOOTER,

        summary: {
          type: "object",
          additionalProperties: {
            type: "boolean",
          },
          properties: {
            include_tools: {
              type: "boolean",
              default: true,
            },
            include_required_checks: {
              type: "boolean",
              default: true,
            },
            include_findings: {
              type: "boolean",
              default: true,
            },
            include_blockers: {
              type: "boolean",
              default: true,
            },
            include_warnings: {
              type: "boolean",
              default: true,
            },
            include_suggested_labels: {
              type: "boolean",
              default: true,
            },
            include_dependency_status: {
              type: "boolean",
              default: true,
            },
            include_release_gate: {
              type: "boolean",
              default: true,
            },
            include_deployment_gate: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
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
            security: SECRET_ARRAY,
            codeql: SECRET_ARRAY,
            dependabot: SECRET_ARRAY,
            dependency_review: SECRET_ARRAY,
            sonarqube: SECRET_ARRAY,
            secret_scanning: SECRET_ARRAY,
            pnpm_audit: SECRET_ARRAY,
            license_review: SECRET_ARRAY,
            container_scanning: SECRET_ARRAY,
            sbom: SECRET_ARRAY,
            supply_chain: SECRET_ARRAY,
            openai: SECRET_ARRAY,
          },
          default: {},
        },

        required_variables: {
          type: "object",
          additionalProperties: VARIABLE_ARRAY,
          properties: {
            security: VARIABLE_ARRAY,
            codeql: VARIABLE_ARRAY,
            dependabot: VARIABLE_ARRAY,
            dependency_review: VARIABLE_ARRAY,
            sonarqube: VARIABLE_ARRAY,
            secret_scanning: VARIABLE_ARRAY,
            pnpm_audit: VARIABLE_ARRAY,
            license_review: VARIABLE_ARRAY,
            container_scanning: VARIABLE_ARRAY,
            sbom: VARIABLE_ARRAY,
            supply_chain: VARIABLE_ARRAY,
            openai: VARIABLE_ARRAY,
          },
          default: {},
        },

        recommended_variables: STRING_MAP,
      },
      default: {},
    },

    enforcement: {
      type: "object",
      additionalProperties: ENFORCEMENT_RULE,
      properties: {
        failed_security_gate: ENFORCEMENT_RULE,
        failed_required_checks: ENFORCEMENT_RULE,
        blocking_vulnerability: ENFORCEMENT_RULE,
        blocking_codeql_alert: ENFORCEMENT_RULE,
        sonarqube_quality_gate_failed: ENFORCEMENT_RULE,
        dependency_review_failed: ENFORCEMENT_RULE,
        secret_finding: ENFORCEMENT_RULE,
        license_violation: ENFORCEMENT_RULE,
        malicious_package: ENFORCEMENT_RULE,
        missing_security_report: ENFORCEMENT_RULE,
        missing_sbom: ENFORCEMENT_RULE,
        missing_attestation: ENFORCEMENT_RULE,
        dependency_missing_labels: ENFORCEMENT_RULE,
        dependency_auto_merge_blocked: ENFORCEMENT_RULE,
        release_blocked_by_security: ENFORCEMENT_RULE,
        deployment_blocked_by_security: ENFORCEMENT_RULE,
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

        do_not_expose_secrets_to_pull_request_from_fork: {
          type: "boolean",
          default: true,
        },
        do_not_run_write_security_actions_on_untrusted_pr: {
          type: "boolean",
          default: true,
        },
        do_not_auto_close_security_issues: {
          type: "boolean",
          default: true,
        },
        do_not_dismiss_security_findings: {
          type: "boolean",
          default: true,
        },
        do_not_override_security_blockers: {
          type: "boolean",
          default: true,
        },
        do_not_release_with_security_blockers: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_with_security_blockers: {
          type: "boolean",
          default: true,
        },
        do_not_publish_sensitive_vulnerability_details: {
          type: "boolean",
          default: true,
        },
        redact_secrets_in_logs: {
          type: "boolean",
          default: true,
        },

        protected_labels: LABEL_ARRAY,

        secret_redaction_patterns: {
          type: "array",
          items: REGEX_STRING,
          uniqueItems: true,
          default: [],
        },
      },
      default: {},
    },
  },
};

function getSecurityRulesSchema() {
  return SECURITY_RULES_SCHEMA;
}

module.exports = {
  SECURITY_RULES_SCHEMA,
  schema: SECURITY_RULES_SCHEMA,
  getSecurityRulesSchema,

  REGEX_STRING,
  STRING_ARRAY,
  LABEL_NAME,
  LABEL_ARRAY,
  GITHUB_LOGIN,
  LOGIN_ARRAY,
  GLOB_ARRAY,
  CHECK_ARRAY,
  SECRET_NAME,
  SECRET_ARRAY,
  VARIABLE_NAME,
  VARIABLE_ARRAY,
  SEVERITY,
  SEVERITY_ARRAY,
  LICENSE_ARRAY,
  BOOLEAN_MAP,
  STRING_MAP,
  STRING_ARRAY_MAP,
  LABEL_ARRAY_MAP,
  RULE_ACTION,
  ENFORCEMENT_RULE,
  COMMENT_FOOTER,
  TOOL_CONFIG,
  GATE_SEVERITY_RULE,
  SCHEDULE_ENTRY,
  ISSUE_TEMPLATE_RULE,
};

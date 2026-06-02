// .github/scripts/utils/validators/release-rules.schema.js
// =============================================================================
// Aerealith AI Release Rules JSON Schema
// -----------------------------------------------------------------------------
// Purpose:
//   JSON Schema definition for `.github/repo-management/release-rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/validate-configs.js
//   - .github/scripts/release/determine-release-version.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/release/build-changelog.js
//   - .github/scripts/release/create-github-release.js
//   - .github/scripts/release/post-discussion-announcement.js
//   - .github/scripts/npm/discover-publishable-packages.js
//   - .github/scripts/docker/discover-images.js
//   - .github/scripts/artifacts/create-checksums.js
//   - .github/scripts/artifacts/create-sbom.js
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/utils/config-loaders/release-rules.js
//
// Notes:
//   - Releases are allowed only from merged PRs targeting main.
//   - Dependency automation must never trigger releases.
//   - Release labels are explicit: release:major, release:minor, release:patch.
//   - `no-release`, dependency, and security dependency PRs block release.
//   - Attestations are only allowed on release or publish jobs.
//   - Production deploys are release/tag gated and approval protected.
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

const VERSION_PATTERN = "^V[0-9]+\\.[0-9]+\\.[0-9]+$";

const RELEASE_LABEL = {
  type: "string",
  enum: ["release:major", "release:minor", "release:patch"],
};

const RELEASE_LABEL_ARRAY = {
  type: "array",
  items: RELEASE_LABEL,
  uniqueItems: true,
  default: ["release:major", "release:minor", "release:patch"],
};

const RELEASE_BUMP = {
  type: "string",
  enum: ["major", "minor", "patch"],
};

const RELEASE_CHANNEL = {
  type: "string",
  enum: ["alpha", "beta", "test", "release"],
};

const RELEASE_CHANNEL_ARRAY = {
  type: "array",
  items: RELEASE_CHANNEL,
  uniqueItems: true,
  default: ["alpha", "beta", "test", "release"],
};

const SEMVER_VERSION = {
  type: "string",
  pattern: VERSION_PATTERN,
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

const PERMISSION_VALUE = {
  type: "string",
  enum: ["none", "read", "write"],
};

const PERMISSION_BLOCK = {
  type: "object",
  additionalProperties: false,
  properties: {
    contents: PERMISSION_VALUE,
    packages: PERMISSION_VALUE,
    actions: PERMISSION_VALUE,
    checks: PERMISSION_VALUE,
    deployments: PERMISSION_VALUE,
    discussions: PERMISSION_VALUE,
    issues: PERMISSION_VALUE,
    pull_requests: PERMISSION_VALUE,
    security_events: PERMISSION_VALUE,
    statuses: PERMISSION_VALUE,
    id_token: PERMISSION_VALUE,
    attestations: PERMISSION_VALUE,
  },
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

const OPENAI_SAFETY_BLOCK = {
  type: "object",
  additionalProperties: false,
  properties: {
    do_not_invent_changes: {
      type: "boolean",
      default: true,
    },
    require_pr_links: {
      type: "boolean",
      default: true,
    },
    require_release_links: {
      type: "boolean",
      default: true,
    },
    require_uncertainty_notes: {
      type: "boolean",
      default: true,
    },
    exclude_dependency_only_changes: {
      type: "boolean",
      default: true,
    },
    exclude_no_release_changes: {
      type: "boolean",
      default: true,
    },
    redact_secrets: {
      type: "boolean",
      default: true,
    },
    do_not_publish_unfixed_security_details: {
      type: "boolean",
      default: true,
    },
  },
  default: {},
};

const OPENAI_BLOCK = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      default: true,
    },
    mode: {
      type: "string",
      enum: ["draft", "review", "publish"],
      default: "draft",
    },
    model_variable: {
      type: "string",
      default: "OPENAI_MODEL",
    },
    default_model: {
      type: "string",
      default: "gpt-5.5",
    },
    prompt_file: {
      type: ["string", "null"],
      default: null,
    },
    safety: OPENAI_SAFETY_BLOCK,
  },
  default: {},
};

const ARTIFACT_RETENTION_DAYS = {
  type: "object",
  additionalProperties: {
    type: "integer",
    minimum: 1,
  },
  properties: {
    pull_request: {
      type: "integer",
      minimum: 1,
      default: 7,
    },
    main: {
      type: "integer",
      minimum: 1,
      default: 30,
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
    npm: {
      type: "integer",
      minimum: 1,
      default: 90,
    },
    ghcr: {
      type: "integer",
      minimum: 1,
      default: 90,
    },
  },
  default: {},
};

const RELEASE_RULES_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/SinLess-Games/Aerealith-AI/schemas/release-rules.schema.json",
  title: "Aerealith AI Release Rules",
  description: "Schema for .github/repo-management/release-rules.yaml.",
  type: "object",
  additionalProperties: false,

  required: [
    "version",
    "repository",
    "tooling",
    "policy",
    "release_labels",
    "blockers",
    "versioning",
    "release_source",
    "required_checks",
    "changelog",
    "github_release",
    "npm",
    "ghcr",
    "release_evidence",
    "cloudflare_production",
    "discussion_announcement",
    "permissions",
    "configuration",
    "validation",
    "reporting",
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

        release_only_from_default_branch: {
          type: "boolean",
          default: true,
        },
        release_only_from_branch: {
          type: "string",
          const: "main",
          default: "main",
        },
        release_only_after_pr_merge: {
          type: "boolean",
          default: true,
        },
        release_only_from_merged_pull_request: {
          type: "boolean",
          default: true,
        },
        release_only_when_checks_pass: {
          type: "boolean",
          default: true,
        },

        require_release_label: {
          type: "boolean",
          default: true,
        },
        require_exactly_one_release_label: {
          type: "boolean",
          default: true,
        },
        infer_release_from_branch_name: {
          type: "boolean",
          default: false,
        },
        infer_release_from_commit_message: {
          type: "boolean",
          default: false,
        },
        infer_release_from_milestone: {
          type: "boolean",
          default: false,
        },

        dependency_prs_never_release: {
          type: "boolean",
          default: true,
        },
        security_dependency_prs_never_release: {
          type: "boolean",
          default: true,
        },
        lockfile_only_prs_never_release: {
          type: "boolean",
          default: true,
        },
        github_actions_dependency_prs_never_release: {
          type: "boolean",
          default: true,
        },

        require_clean_release_source: {
          type: "boolean",
          default: true,
        },
        require_ci_success: {
          type: "boolean",
          default: true,
        },
        require_security_success: {
          type: "boolean",
          default: true,
        },
        require_codeql_success: {
          type: "boolean",
          default: true,
        },
        require_sonarqube_success: {
          type: "boolean",
          default: true,
        },
        require_dependency_review_success: {
          type: "boolean",
          default: true,
        },

        allow_manual_workflow_dispatch: {
          type: "boolean",
          default: true,
        },
        manual_dispatch_requires_dry_run_by_default: {
          type: "boolean",
          default: true,
        },
        manual_dispatch_write_mode_requires_confirmation: {
          type: "boolean",
          default: true,
        },

        create_github_release: {
          type: "boolean",
          default: true,
        },
        create_git_tag: {
          type: "boolean",
          default: true,
        },
        create_changelog: {
          type: "boolean",
          default: true,
        },
        publish_npm_packages: {
          type: "boolean",
          default: true,
        },
        publish_ghcr_containers: {
          type: "boolean",
          default: true,
        },
        deploy_cloudflare_production: {
          type: "boolean",
          default: true,
        },
        post_discussion_announcement: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    release_labels: {
      type: "object",
      additionalProperties: false,
      properties: {
        valid: RELEASE_LABEL_ARRAY,

        major: {
          type: "object",
          additionalProperties: true,
          properties: {
            label: {
              type: "string",
              const: "release:major",
              default: "release:major",
            },
            bump: {
              type: "string",
              const: "major",
              default: "major",
            },
            description: {
              type: "string",
              default: "Breaking change or major release.",
            },
          },
          default: {},
        },

        minor: {
          type: "object",
          additionalProperties: true,
          properties: {
            label: {
              type: "string",
              const: "release:minor",
              default: "release:minor",
            },
            bump: {
              type: "string",
              const: "minor",
              default: "minor",
            },
            description: {
              type: "string",
              default: "Feature release.",
            },
          },
          default: {},
        },

        patch: {
          type: "object",
          additionalProperties: true,
          properties: {
            label: {
              type: "string",
              const: "release:patch",
              default: "release:patch",
            },
            bump: {
              type: "string",
              const: "patch",
              default: "patch",
            },
            description: {
              type: "string",
              default: "Bug fix or maintenance release.",
            },
          },
          default: {},
        },

        forbidden_on_dependency_prs: RELEASE_LABEL_ARRAY,

        remove_from_dependency_prs: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    blockers: {
      type: "object",
      additionalProperties: false,
      properties: {
        labels: LABEL_ARRAY,
        authors: LOGIN_ARRAY,
        branch_patterns: {
          type: "array",
          items: REGEX_STRING,
          uniqueItems: true,
          default: ["^renovate/.+$", "^dependabot/.+$", "^mend/.+$"],
        },
        failed_checks: CHECK_ARRAY,

        changed_files: {
          type: "object",
          additionalProperties: false,
          properties: {
            lockfile_only: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                patterns: GLOB_ARRAY,
              },
              default: {},
            },
          },
          default: {},
        },

        security_findings: {
          type: "object",
          additionalProperties: false,
          properties: {
            block_on: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "critical",
                  "high",
                  "medium",
                  "moderate",
                  "low",
                  "warning",
                  "unknown",
                ],
              },
              uniqueItems: true,
              default: ["critical", "high"],
            },
          },
          default: {},
        },

        release_label_conflicts: {
          type: "object",
          additionalProperties: false,
          properties: {
            block_if_multiple_release_labels: {
              type: "boolean",
              default: true,
            },
            block_if_release_label_with_no_release: {
              type: "boolean",
              default: true,
            },
            block_if_release_label_with_dependencies: {
              type: "boolean",
              default: true,
            },
            block_if_release_label_with_security_dependency: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    versioning: {
      type: "object",
      additionalProperties: false,
      properties: {
        scheme: {
          type: "string",
          const: "semver",
          default: "semver",
        },
        prefix: {
          type: "string",
          default: "V",
        },
        tag_format: {
          type: "string",
          default: "V{major}.{minor}.{patch}",
        },
        tag_pattern: {
          type: "string",
          default: VERSION_PATTERN,
        },
        initial_version: SEMVER_VERSION,
        default_bump: RELEASE_BUMP,

        source: {
          type: "object",
          additionalProperties: false,
          properties: {
            latest_tag: {
              type: "string",
              enum: ["git", "github_release", "manual"],
              default: "git",
            },
            fallback_version: SEMVER_VERSION,
          },
          default: {},
        },

        bump_rules: {
          type: "object",
          additionalProperties: RELEASE_BUMP,
          properties: {
            "release:major": {
              type: "string",
              const: "major",
              default: "major",
            },
            "release:minor": {
              type: "string",
              const: "minor",
              default: "minor",
            },
            "release:patch": {
              type: "string",
              const: "patch",
              default: "patch",
            },
          },
          default: {},
        },

        validation: BOOLEAN_MAP,

        prerelease: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            channels: RELEASE_CHANNEL_ARRAY,
            default_channel: RELEASE_CHANNEL,
            tag_suffix_format: {
              type: "string",
              default: "{version}-{channel}",
            },
            examples: STRING_ARRAY,
          },
          default: {},
        },
      },
      default: {},
    },

    release_source: {
      type: "object",
      additionalProperties: false,
      properties: {
        event_sources: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            properties: {
              enabled: {
                type: "boolean",
                default: true,
              },
              event: {
                type: ["string", "null"],
                default: null,
              },
              branch: {
                type: ["string", "null"],
                default: null,
              },
              default_dry_run: {
                type: "boolean",
                default: false,
              },
              description: {
                type: ["string", "null"],
                default: null,
              },
            },
          },
          properties: {
            pull_request_closed: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                event: {
                  type: "string",
                  default: "pull_request",
                },
                branch: {
                  type: "string",
                  default: "main",
                },
                default_dry_run: {
                  type: "boolean",
                  default: false,
                },
                description: {
                  type: ["string", "null"],
                  default:
                    "Release evaluation after a pull request is merged into main.",
                },
              },
              default: {},
            },
            workflow_dispatch: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                event: {
                  type: "string",
                  default: "workflow_dispatch",
                },
                branch: {
                  type: "string",
                  default: "main",
                },
                default_dry_run: {
                  type: "boolean",
                  default: true,
                },
                description: {
                  type: ["string", "null"],
                  default: "Manual dry-run or confirmed release evaluation.",
                },
              },
              default: {},
            },
          },
          default: {},
        },

        pull_request_resolution: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            strategy: {
              type: "string",
              enum: ["merge_commit", "event_payload", "associated_prs"],
              default: "merge_commit",
            },
            fallback_strategy: {
              type: "string",
              enum: ["associated_prs", "commit_search", "none"],
              default: "associated_prs",
            },
            require_pull_request_number: {
              type: "boolean",
              default: true,
            },
            require_merged: {
              type: "boolean",
              default: true,
            },
            require_base_branch: {
              type: "string",
              const: "main",
              default: "main",
            },
            require_head_branch_not_main: {
              type: "boolean",
              default: false,
            },
          },
          default: {},
        },

        accepted_merge_methods: {
          type: "array",
          items: {
            type: "string",
            enum: ["merge", "squash", "rebase"],
          },
          uniqueItems: true,
          default: ["merge", "squash", "rebase"],
        },

        ignored_sources: {
          type: "object",
          additionalProperties: false,
          properties: {
            authors: LOGIN_ARRAY,
            branch_patterns: {
              type: "array",
              items: REGEX_STRING,
              uniqueItems: true,
              default: [],
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
        release_eligibility: CHECK_ARRAY,
        ci: CHECK_ARRAY,
        security: CHECK_ARRAY,
        codeql: CHECK_ARRAY,
        sonarqube: CHECK_ARRAY,
        dependency_review: CHECK_ARRAY,
        npm_publish: CHECK_ARRAY,
        ghcr_publish: CHECK_ARRAY,
        cloudflare_production: CHECK_ARRAY,
      },
      default: {},
    },

    changelog: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        output_file: {
          type: "string",
          default: "CHANGELOG.md",
        },
        update_changelog_file: {
          type: "boolean",
          default: true,
        },

        source: {
          type: "object",
          additionalProperties: false,
          properties: {
            include_merged_pull_requests_since_last_release: {
              type: "boolean",
              default: true,
            },
            include_linked_issues: {
              type: "boolean",
              default: true,
            },
            include_pr_labels: {
              type: "boolean",
              default: true,
            },
            include_pr_authors: {
              type: "boolean",
              default: true,
            },
            include_commit_links: {
              type: "boolean",
              default: true,
            },
            include_full_changelog_link: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        exclude: {
          type: "object",
          additionalProperties: false,
          properties: {
            labels: LABEL_ARRAY,
            authors: LOGIN_ARRAY,
          },
          default: {},
        },

        grouping: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            order: STRING_ARRAY,
          },
          default: {},
        },

        label_mapping: STRING_MAP,

        required_sections: STRING_ARRAY,

        optional_sections: STRING_ARRAY,

        openai: OPENAI_BLOCK,
      },
      default: {},
    },

    github_release: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        title_format: {
          type: "string",
          default: "Aerealith AI {version}",
        },
        tag_name_format: {
          type: "string",
          default: "{version}",
        },
        target_commitish: {
          type: "string",
          const: "main",
          default: "main",
        },
        draft: {
          type: "boolean",
          default: false,
        },
        prerelease: {
          type: "object",
          additionalProperties: true,
          default: {},
        },
        generate_release_notes: {
          type: "boolean",
          default: false,
        },
        use_generated_changelog: {
          type: "boolean",
          default: true,
        },
        body_template: {
          type: "string",
          default: "",
        },
        assets: {
          type: "object",
          additionalProperties: false,
          properties: {
            upload: {
              type: "boolean",
              default: true,
            },
            required: STRING_ARRAY,
            optional: STRING_ARRAY,
          },
          default: {},
        },
      },
      default: {},
    },

    npm: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        publish_only_on_release: {
          type: "boolean",
          default: true,
        },
        publish_only_from_tag: {
          type: "boolean",
          default: true,
        },
        publish_only_when_package_private_false: {
          type: "boolean",
          default: true,
        },
        registry: {
          type: "string",
          default: "https://registry.npmjs.org",
        },
        access: {
          type: "string",
          enum: ["public", "restricted"],
          default: "public",
        },
        token_secret: {
          type: "string",
          default: "NPM_ACCESS_TOKEN",
        },

        package_discovery: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            package_json_patterns: GLOB_ARRAY,
            ignore_paths: GLOB_ARRAY,
            publishable_when: {
              type: "object",
              additionalProperties: false,
              properties: {
                private: {
                  type: "boolean",
                  const: false,
                  default: false,
                },
              },
              default: {},
            },
          },
          default: {},
        },

        validation: {
          type: "object",
          additionalProperties: false,
          properties: {
            require_package_json: {
              type: "boolean",
              default: true,
            },
            require_name: {
              type: "boolean",
              default: true,
            },
            require_version: {
              type: "boolean",
              default: true,
            },
            require_private_false: {
              type: "boolean",
              default: true,
            },
            fail_if_private_missing: {
              type: "boolean",
              default: false,
            },
            fail_if_package_version_mismatch: {
              type: "boolean",
              default: true,
            },
            pack_before_publish: {
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
            npm_provenance: {
              type: "boolean",
              default: true,
            },
            require_id_token: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        artifacts: {
          type: "object",
          additionalProperties: false,
          properties: {
            create_package_manifest: {
              type: "boolean",
              default: true,
            },
            manifest_file: {
              type: "string",
              default: "npm-package-manifest.json",
            },
          },
          default: {},
        },

        commands: STRING_MAP,
      },
      default: {},
    },

    ghcr: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        publish_only_on_release: {
          type: "boolean",
          default: true,
        },
        publish_only_from_tag: {
          type: "boolean",
          default: true,
        },
        registry: {
          type: "string",
          default: "ghcr.io",
        },
        owner: {
          type: "string",
          default: "sinless-games",
        },
        namespace: {
          type: "string",
          default: "aerealith-ai",
        },
        image_repository_format: {
          type: "string",
          default: "ghcr.io/sinless-games/aerealith-ai/{name}",
        },
        image_tag_format: {
          type: "string",
          default: "{version}-{channel}",
        },
        examples: STRING_ARRAY,

        dockerfile_discovery: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            build_every_dockerfile: {
              type: "boolean",
              default: true,
            },
            dockerfile_patterns: GLOB_ARRAY,
            ignore_paths: GLOB_ARRAY,
          },
          default: {},
        },

        naming: {
          type: "object",
          additionalProperties: false,
          properties: {
            derive_name_from_parent_directory: {
              type: "boolean",
              default: true,
            },
            normalize_to_lowercase: {
              type: "boolean",
              default: true,
            },
            replace_invalid_characters_with: {
              type: "string",
              default: "-",
            },
            collapse_duplicate_separators: {
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
            builder: {
              type: "string",
              enum: ["docker-buildx", "docker"],
              default: "docker-buildx",
            },
            push: {
              type: "boolean",
              default: true,
            },
            platforms: STRING_ARRAY,
            cache: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                type: {
                  type: "string",
                  enum: ["gha", "registry", "local"],
                  default: "gha",
                },
                readable_names: {
                  type: "boolean",
                  default: true,
                },
              },
              default: {},
            },
            labels: STRING_MAP,
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
            format: {
              type: "string",
              enum: ["spdx-json", "cyclonedx-json"],
              default: "spdx-json",
            },
            attach_to_release: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        artifacts: {
          type: "object",
          additionalProperties: false,
          properties: {
            create_image_manifest: {
              type: "boolean",
              default: true,
            },
            manifest_file: {
              type: "string",
              default: "ghcr-image-manifest.json",
            },
          },
          default: {},
        },
      },
      default: {},
    },

    release_evidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        artifacts: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            output_directory: {
              type: "string",
              default: "artifacts/release",
            },

            manifest: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                file: {
                  type: "string",
                  default: "artifact-manifest.json",
                },
              },
              default: {},
            },

            checksums: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                algorithms: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["sha256", "sha512"],
                  },
                  uniqueItems: true,
                  default: ["sha256", "sha512"],
                },
                files: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    sha256: {
                      type: "string",
                      default: "SHA256SUMS",
                    },
                    sha512: {
                      type: "string",
                      default: "SHA512SUMS",
                    },
                  },
                  default: {},
                },
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
                format: {
                  type: "string",
                  enum: ["spdx-json", "cyclonedx-json"],
                  default: "spdx-json",
                },
                file: {
                  type: "string",
                  default: "sbom.spdx.json",
                },
              },
              default: {},
            },
          },
          default: {},
        },

        attestations: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            only_on_release_or_publish_jobs: {
              type: "boolean",
              default: true,
            },
            build_provenance: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                predicate_type: {
                  type: "string",
                  default: "slsa",
                },
              },
              default: {},
            },
            sbom_attestation: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
              },
              default: {},
            },
            required_permissions: PERMISSION_BLOCK,
          },
          default: {},
        },

        retention_days: ARTIFACT_RETENTION_DAYS,
      },
      default: {},
    },

    cloudflare_production: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        deploy_only_on_release_tag: {
          type: "boolean",
          default: true,
        },
        require_github_environment_approval: {
          type: "boolean",
          default: true,
        },
        github_environment: {
          type: "string",
          const: "production",
          default: "production",
        },
        allowed_tag_pattern: {
          type: "string",
          default: VERSION_PATTERN,
        },
        block_if_labels_present: LABEL_ARRAY,
        require_release_evidence: {
          type: "boolean",
          default: true,
        },
        require_artifact_manifest: {
          type: "boolean",
          default: true,
        },
        require_smoke_tests: {
          type: "boolean",
          default: true,
        },
        workflow: {
          type: "string",
          default: ".github/workflows/cloudflare-production.yaml",
        },
      },
      default: {},
    },

    discussion_announcement: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        category: {
          type: "string",
          const: "Announcements",
          default: "Announcements",
        },
        create_discussion: {
          type: "boolean",
          default: true,
        },
        update_existing_discussion: {
          type: "boolean",
          default: false,
        },
        title_format: {
          type: "string",
          default: "Aerealith AI {version}",
        },
        require_release_success: {
          type: "boolean",
          default: true,
        },
        require_github_release_url: {
          type: "boolean",
          default: true,
        },
        skip_if: {
          type: "object",
          additionalProperties: false,
          properties: {
            labels: LABEL_ARRAY,
            authors: LOGIN_ARRAY,
          },
          default: {},
        },
        openai: OPENAI_BLOCK,
        failure_behavior: {
          type: "object",
          additionalProperties: false,
          properties: {
            fail_release_if_post_fails: {
              type: "boolean",
              default: false,
            },
            warn_on_post_failure: {
              type: "boolean",
              default: true,
            },
            add_workflow_summary_on_failure: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    permissions: {
      type: "object",
      additionalProperties: PERMISSION_BLOCK,
      properties: {
        release: PERMISSION_BLOCK,
        publish_npm: PERMISSION_BLOCK,
        publish_containers: PERMISSION_BLOCK,
        cloudflare_production: PERMISSION_BLOCK,
        discussion_announcement: PERMISSION_BLOCK,
      },
      default: {},
    },

    configuration: {
      type: "object",
      additionalProperties: false,
      properties: {
        required_secrets: {
          type: "object",
          additionalProperties: SECRET_ARRAY,
          properties: {
            release: SECRET_ARRAY,
            npm: SECRET_ARRAY,
            ghcr: SECRET_ARRAY,
            cloudflare: SECRET_ARRAY,
            openai: SECRET_ARRAY,
            sonarqube: SECRET_ARRAY,
          },
          default: {},
        },

        required_variables: {
          type: "object",
          additionalProperties: STRING_ARRAY,
          properties: {
            release: STRING_ARRAY,
            npm: STRING_ARRAY,
            ghcr: STRING_ARRAY,
            cloudflare: STRING_ARRAY,
            openai: STRING_ARRAY,
            sonarqube: STRING_ARRAY,
          },
          default: {},
        },

        optional_variables: STRING_ARRAY,

        recommended_values: STRING_MAP,
      },
      default: {},
    },

    validation: {
      type: "object",
      additionalProperties: false,
      properties: {
        dry_run: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            default_for_manual_dispatch: {
              type: "boolean",
              default: true,
            },
            print_planned_version: {
              type: "boolean",
              default: true,
            },
            print_release_source: {
              type: "boolean",
              default: true,
            },
            print_changelog_preview: {
              type: "boolean",
              default: true,
            },
            print_publishable_packages: {
              type: "boolean",
              default: true,
            },
            print_discovered_dockerfiles: {
              type: "boolean",
              default: true,
            },
            print_artifact_plan: {
              type: "boolean",
              default: true,
            },
            print_discussion_preview: {
              type: "boolean",
              default: true,
            },
            create_tag: {
              type: "boolean",
              default: false,
            },
            create_github_release: {
              type: "boolean",
              default: false,
            },
            publish_npm: {
              type: "boolean",
              default: false,
            },
            publish_ghcr: {
              type: "boolean",
              default: false,
            },
            deploy_cloudflare: {
              type: "boolean",
              default: false,
            },
            post_discussion: {
              type: "boolean",
              default: false,
            },
          },
          default: {},
        },

        release_label_tests: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: {
                type: "string",
                minLength: 1,
              },
              labels: LABEL_ARRAY,
              expected_bump: {
                type: ["string", "null"],
                enum: ["major", "minor", "patch", null],
                default: null,
              },
              expected_release: {
                type: "boolean",
                default: false,
              },
              expected_failure: {
                type: "boolean",
                default: false,
              },
            },
          },
          default: [],
        },
      },
      default: {},
    },

    reporting: {
      type: "object",
      additionalProperties: false,
      properties: {
        add_workflow_summary: {
          type: "boolean",
          default: true,
        },
        add_pr_comment_on_release_skip: {
          type: "boolean",
          default: false,
        },
        add_pr_comment_on_release_failure: {
          type: "boolean",
          default: true,
        },
        comment_footer: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: {
              type: ["string", "null"],
              default: "<!-- aerealith-release-rules:start -->",
            },
            end: {
              type: ["string", "null"],
              default: "<!-- aerealith-release-rules:end -->",
            },
          },
          default: {},
        },
        summary: {
          type: "object",
          additionalProperties: {
            type: "boolean",
          },
          default: {},
        },
      },
      default: {},
    },

    enforcement: {
      type: "object",
      additionalProperties: ENFORCEMENT_RULE,
      properties: {
        missing_release_label: ENFORCEMENT_RULE,
        multiple_release_labels: ENFORCEMENT_RULE,
        dependency_release_attempt: ENFORCEMENT_RULE,
        release_blocking_label: ENFORCEMENT_RULE,
        failed_required_checks: ENFORCEMENT_RULE,
        failed_security_gate: ENFORCEMENT_RULE,
        missing_release_evidence: ENFORCEMENT_RULE,
        attestation_outside_release: ENFORCEMENT_RULE,
        production_without_release_tag: ENFORCEMENT_RULE,
        production_without_approval: ENFORCEMENT_RULE,
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

        do_not_release_from_feature_branch: {
          type: "boolean",
          default: true,
        },
        do_not_release_from_pull_request_event: {
          type: "boolean",
          default: true,
        },
        do_not_release_from_dependency_pr: {
          type: "boolean",
          default: true,
        },
        do_not_release_from_security_dependency_pr: {
          type: "boolean",
          default: true,
        },
        do_not_release_when_no_release_label_present: {
          type: "boolean",
          default: true,
        },
        do_not_release_when_blocked_by_security: {
          type: "boolean",
          default: true,
        },

        do_not_generate_attestations_outside_release_or_publish_jobs: {
          type: "boolean",
          default: true,
        },
        do_not_publish_npm_outside_release: {
          type: "boolean",
          default: true,
        },
        do_not_publish_containers_outside_release: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_without_approval: {
          type: "boolean",
          default: true,
        },
        do_not_post_announcement_for_skipped_release: {
          type: "boolean",
          default: true,
        },
        do_not_include_secrets_in_changelog: {
          type: "boolean",
          default: true,
        },
        do_not_include_private_data_in_announcements: {
          type: "boolean",
          default: true,
        },

        protected_labels: LABEL_ARRAY,
      },
      default: {},
    },
  },
};

function getReleaseRulesSchema() {
  return RELEASE_RULES_SCHEMA;
}

module.exports = {
  RELEASE_RULES_SCHEMA,
  schema: RELEASE_RULES_SCHEMA,
  getReleaseRulesSchema,

  REGEX_STRING,
  STRING_ARRAY,
  LABEL_NAME,
  LABEL_ARRAY,
  GITHUB_LOGIN,
  LOGIN_ARRAY,
  GLOB_ARRAY,
  SECRET_NAME,
  SECRET_ARRAY,
  VERSION_PATTERN,
  RELEASE_LABEL,
  RELEASE_LABEL_ARRAY,
  RELEASE_BUMP,
  RELEASE_CHANNEL,
  RELEASE_CHANNEL_ARRAY,
  SEMVER_VERSION,
  CHECK_ARRAY,
  BOOLEAN_MAP,
  STRING_MAP,
  STRING_ARRAY_MAP,
  PERMISSION_VALUE,
  PERMISSION_BLOCK,
  RULE_ACTION,
  ENFORCEMENT_RULE,
  OPENAI_SAFETY_BLOCK,
  OPENAI_BLOCK,
  ARTIFACT_RETENTION_DAYS,
};

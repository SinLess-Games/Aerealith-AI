// .github/scripts/utils/validators/repo-management.schema.js
// =============================================================================
// Aerealith AI Repository Management Rules JSON Schema
// -----------------------------------------------------------------------------
// Purpose:
//   JSON Schema definition for `.github/repo-management/rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/validate-configs.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/assign-assignees.js
//   - .github/scripts/repo/assign-reviewers.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/link-issues-prs.js
//   - .github/scripts/security/run-policy-gate.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/utils/config-loaders/repo-management.js
//
// Notes:
//   - This schema validates the top-level repository management policy shape.
//   - Specialized files still have their own schemas and loaders.
//   - This file should describe orchestration, source-of-truth policy, safety,
//     workflow routing, release blocking, OpenAI limits, and automation rules.
//   - Automation should create/update only unless a specialized policy explicitly
//     allows otherwise.
//   - Dependency automation must never trigger releases.
//   - OpenAI automation must not push to main, approve PRs, merge PRs, publish,
//     or deploy production.
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

const TEAM_ARRAY = {
  type: "array",
  items: {
    type: "string",
    minLength: 1,
  },
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

const VARIABLE_ARRAY = {
  type: "array",
  items: {
    type: "string",
    minLength: 1,
    pattern: "^[A-Z][A-Z0-9_]*$",
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

const PERMISSION_VALUE = {
  type: "string",
  enum: ["none", "read", "write"],
};

const WORKFLOW_PERMISSIONS = {
  type: "object",
  additionalProperties: false,
  properties: {
    actions: PERMISSION_VALUE,
    attestations: PERMISSION_VALUE,
    checks: PERMISSION_VALUE,
    contents: PERMISSION_VALUE,
    deployments: PERMISSION_VALUE,
    discussions: PERMISSION_VALUE,
    id_token: PERMISSION_VALUE,
    issues: PERMISSION_VALUE,
    packages: PERMISSION_VALUE,
    pull_requests: PERMISSION_VALUE,
    security_events: PERMISSION_VALUE,
    statuses: PERMISSION_VALUE,
  },
  default: {},
};

const ROUTING_BLOCK = {
  type: "object",
  additionalProperties: false,
  properties: {
    assignees: LOGIN_ARRAY,
    reviewers: LOGIN_ARRAY,
    team_reviewers: TEAM_ARRAY,
    labels: LABEL_ARRAY,
    milestone: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
    },
    request_reviewers: {
      type: "boolean",
      default: true,
    },
    required: {
      type: "boolean",
      default: false,
    },
  },
  default: {},
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

const WORKFLOW_ENTRY = {
  type: "object",
  additionalProperties: false,
  required: ["file"],
  properties: {
    file: {
      type: "string",
      minLength: 1,
    },
    required: {
      type: "boolean",
      default: false,
    },
    description: {
      type: ["string", "null"],
      default: null,
    },
    permissions: WORKFLOW_PERMISSIONS,
    environment: {
      type: ["string", "null"],
      default: null,
    },
  },
};

const SOURCE_OF_TRUTH_ENTRY = {
  type: "object",
  additionalProperties: false,
  properties: {
    file: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
    },
    directory: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
    },
    create_missing: {
      type: "boolean",
      default: false,
    },
    update_existing: {
      type: "boolean",
      default: false,
    },
    delete_unmanaged: {
      type: "boolean",
      default: false,
    },
    close_unmanaged: {
      type: "boolean",
      default: false,
    },
    report_unmanaged: {
      type: "boolean",
      default: true,
    },
    dry_run_supported: {
      type: "boolean",
      default: true,
    },
    managed_manually: {
      type: "boolean",
      default: false,
    },
    automation_reads_only: {
      type: "boolean",
      default: false,
    },
  },
};

const REPO_MANAGEMENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/SinLess-Games/Aerealith-AI/schemas/repo-management.schema.json",
  title: "Aerealith AI Repository Management Rules",
  description: "Schema for .github/repo-management/rules.yaml.",
  type: "object",
  additionalProperties: false,

  required: [
    "version",
    "repository",
    "organization",
    "tooling",
    "project",
    "config_files",
    "automation",
    "source_of_truth",
    "sync",
    "branch_policy",
    "labels",
    "issues",
    "pull_requests",
    "ownership",
    "milestones",
    "project_board",
    "relationships",
    "dependencies",
    "security",
    "release",
    "publishing",
    "cloudflare",
    "discussions",
    "openai",
    "caching",
    "artifacts",
    "workflows",
    "configuration",
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
        visibility: {
          type: "string",
          enum: ["public", "private", "internal"],
          default: "public",
        },
      },
    },

    organization: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 1,
          default: "SinLess-Games",
        },
        maintainer: {
          type: "string",
          minLength: 1,
          default: "Sinless777",
        },
      },
      default: {},
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

    project: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 1,
          default: "Aerealith AI",
        },
        board: {
          type: "string",
          minLength: 1,
          default: "Aerealith AI Task Board",
        },
        announcement_discussion_category: {
          type: "string",
          default: "Announcements",
        },
      },
      default: {},
    },

    config_files: {
      type: "object",
      additionalProperties: false,
      properties: {
        labels: {
          type: "string",
          default: ".github/labels.yaml",
        },
        milestones: {
          type: "string",
          default: ".github/milestones.yaml",
        },
        labeler: {
          type: "string",
          default: ".github/labeler.yaml",
        },
        assignees: {
          type: "string",
          default: ".github/assignees.yaml",
        },
        codeowners: {
          type: "string",
          default: ".github/CODEOWNERS",
        },
        dependabot: {
          type: "string",
          default: ".github/dependabot.yaml",
        },
        renovate: {
          type: "string",
          default: ".github/renovate.json5",
        },
        codeql: {
          type: "string",
          default: ".github/codeql.yaml",
        },
        project_board: {
          type: "string",
          default: ".github/projects/kanban-board.yaml",
        },
        repo_management: {
          type: "object",
          additionalProperties: false,
          properties: {
            root: {
              type: "string",
              default: ".github/repo-management/rules.yaml",
            },
            branch_rules: {
              type: "string",
              default: ".github/repo-management/branch-rules.yaml",
            },
            cloudflare_rules: {
              type: "string",
              default: ".github/repo-management/cloudflare-rules.yaml",
            },
            dependency_rules: {
              type: "string",
              default: ".github/repo-management/dependency-rules.yaml",
            },
            discussion_rules: {
              type: "string",
              default: ".github/repo-management/discussion-rules.yaml",
            },
            milestone_rules: {
              type: "string",
              default: ".github/repo-management/milestone-rules.yaml",
            },
            release_rules: {
              type: "string",
              default: ".github/repo-management/release-rules.yaml",
            },
            reviewer_rules: {
              type: "string",
              default: ".github/repo-management/reviewer-rules.yaml",
            },
            security_rules: {
              type: "string",
              default: ".github/repo-management/security-rules.yaml",
            },
          },
          default: {},
        },
      },
      default: {},
    },

    automation: {
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
        default_dry_run: {
          type: "boolean",
          default: false,
        },
        default_debug: {
          type: "boolean",
          default: false,
        },

        environment_variables: {
          type: "object",
          additionalProperties: false,
          properties: {
            dry_run: VARIABLE_ARRAY,
            debug: VARIABLE_ARRAY,
          },
          default: {},
        },

        write_mode: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            require_explicit_confirmation_for_manual_dispatch: {
              type: "boolean",
              default: true,
            },
            require_trusted_event: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        trusted_events: STRING_ARRAY,

        untrusted_events: STRING_ARRAY,

        safety_defaults: {
          type: "object",
          additionalProperties: false,
          properties: {
            no_mutation_on_untrusted_pull_requests: {
              type: "boolean",
              default: true,
            },
            no_secrets_on_untrusted_pull_requests: {
              type: "boolean",
              default: true,
            },
            no_release_on_untrusted_pull_requests: {
              type: "boolean",
              default: true,
            },
            no_production_deploy_on_untrusted_pull_requests: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    source_of_truth: {
      type: "object",
      additionalProperties: SOURCE_OF_TRUTH_ENTRY,
      properties: {
        labels: SOURCE_OF_TRUTH_ENTRY,
        milestones: SOURCE_OF_TRUTH_ENTRY,
        project_board: SOURCE_OF_TRUTH_ENTRY,
        branch_rules: SOURCE_OF_TRUTH_ENTRY,
        cloudflare_rules: SOURCE_OF_TRUTH_ENTRY,
        dependency_rules: SOURCE_OF_TRUTH_ENTRY,
        discussion_rules: SOURCE_OF_TRUTH_ENTRY,
        milestone_rules: SOURCE_OF_TRUTH_ENTRY,
        release_rules: SOURCE_OF_TRUTH_ENTRY,
        reviewer_rules: SOURCE_OF_TRUTH_ENTRY,
        security_rules: SOURCE_OF_TRUTH_ENTRY,
        codeowners: SOURCE_OF_TRUTH_ENTRY,
        issue_templates: SOURCE_OF_TRUTH_ENTRY,
        workflows: SOURCE_OF_TRUTH_ENTRY,
      },
      default: {},
    },

    sync: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        order: STRING_ARRAY,

        labels: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            create_or_update_only: {
              type: "boolean",
              default: false,
            },
            delete_unmanaged: {
              type: "boolean",
              default: true,
            },
            preserve_protected_labels: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        milestones: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            create_or_update_only: {
              type: "boolean",
              default: true,
            },
            delete_unmanaged: {
              type: "boolean",
              default: false,
            },
            report_unmanaged: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        project_board: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            create_or_update_only: {
              type: "boolean",
              default: true,
            },
            delete_unmanaged: {
              type: "boolean",
              default: false,
            },
          },
          default: {},
        },

        repository_settings: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: false,
            },
            reason: {
              type: ["string", "null"],
              default: null,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    branch_policy: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        rules_file: {
          type: "string",
          default: ".github/repo-management/branch-rules.yaml",
        },
        default_branch: {
          type: "string",
          const: "main",
          default: "main",
        },

        direct_push: {
          type: "object",
          additionalProperties: false,
          properties: {
            main_allowed: {
              type: "boolean",
              default: false,
            },
            automation_allowed: {
              type: "boolean",
              default: false,
            },
            openai_allowed: {
              type: "boolean",
              default: false,
            },
          },
          default: {},
        },

        pull_requests: {
          type: "object",
          additionalProperties: false,
          properties: {
            required_for_main: {
              type: "boolean",
              default: true,
            },
            required_base_branch: {
              type: "string",
              const: "main",
              default: "main",
            },
          },
          default: {},
        },

        human_branches: {
          type: "object",
          additionalProperties: false,
          properties: {
            require_issue_number: {
              type: "boolean",
              default: true,
            },
            required_pattern: REGEX_STRING,
          },
          default: {},
        },

        automation_branches: {
          type: "object",
          additionalProperties: false,
          properties: {
            require_issue_number: {
              type: "boolean",
              default: false,
            },
            allowed_patterns: {
              type: "array",
              items: REGEX_STRING,
              uniqueItems: true,
              default: [],
            },
          },
          default: {},
        },

        release_branches: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            pattern: REGEX_STRING,
            do_not_trigger_release_by_branch_name: {
              type: "boolean",
              default: true,
            },
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
        enabled: {
          type: "boolean",
          default: true,
        },
        source_file: {
          type: "string",
          default: ".github/labels.yaml",
        },

        unmanaged_labels: {
          type: "object",
          additionalProperties: false,
          properties: {
            delete: {
              type: "boolean",
              default: true,
            },
            report_before_delete: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        protected_labels: LABEL_ARRAY,

        mutually_exclusive_groups: LABEL_ARRAY_MAP,

        required_for_pull_requests: {
          type: "object",
          additionalProperties: false,
          properties: {
            any_kind_label: {
              type: "boolean",
              default: true,
            },
            any_status_label: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        required_for_issues: {
          type: "object",
          additionalProperties: false,
          properties: {
            any_kind_label: {
              type: "boolean",
              default: false,
            },
            any_status_label: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    issues: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        default: ROUTING_BLOCK,

        template_routing: {
          type: "object",
          additionalProperties: ROUTING_BLOCK,
          default: {},
        },

        automation: {
          type: "object",
          additionalProperties: false,
          properties: {
            assign_labels: {
              type: "boolean",
              default: true,
            },
            assign_assignees: {
              type: "boolean",
              default: true,
            },
            assign_milestones: {
              type: "boolean",
              default: true,
            },
            add_to_project: {
              type: "boolean",
              default: true,
            },
            link_related_pull_requests: {
              type: "boolean",
              default: true,
            },
            do_not_close_issues: {
              type: "boolean",
              default: true,
            },
            do_not_delete_issues: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    pull_requests: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        default: ROUTING_BLOCK,
        draft: ROUTING_BLOCK,
        ready_for_review: ROUTING_BLOCK,
        merged: ROUTING_BLOCK,
        closed_unmerged: ROUTING_BLOCK,

        automation: {
          type: "object",
          additionalProperties: false,
          properties: {
            assign_labels: {
              type: "boolean",
              default: true,
            },
            assign_assignees: {
              type: "boolean",
              default: true,
            },
            assign_reviewers: {
              type: "boolean",
              default: true,
            },
            assign_milestones: {
              type: "boolean",
              default: true,
            },
            add_to_project: {
              type: "boolean",
              default: true,
            },
            link_related_issues: {
              type: "boolean",
              default: true,
            },
            create_missing_issue_with_openai: {
              type: "boolean",
              default: true,
            },
            do_not_merge_pull_requests: {
              type: "boolean",
              default: true,
            },
            do_not_approve_pull_requests: {
              type: "boolean",
              default: true,
            },
            do_not_push_to_main: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        required_before_merge: {
          type: "object",
          additionalProperties: false,
          properties: {
            labels_absent: LABEL_ARRAY,
            checks: CHECK_ARRAY,
          },
          default: {},
        },
      },
      default: {},
    },

    ownership: {
      type: "object",
      additionalProperties: false,
      properties: {
        assignees_file: {
          type: "string",
          default: ".github/assignees.yaml",
        },
        reviewer_rules_file: {
          type: "string",
          default: ".github/repo-management/reviewer-rules.yaml",
        },
        codeowners_file: {
          type: "string",
          default: ".github/CODEOWNERS",
        },

        default_assignees: LOGIN_ARRAY,
        default_reviewers: LOGIN_ARRAY,
        default_team_reviewers: TEAM_ARRAY,

        allow_multiple_assignees: {
          type: "boolean",
          default: true,
        },
        allow_multiple_reviewers: {
          type: "boolean",
          default: true,
        },
        allow_team_reviewers: {
          type: "boolean",
          default: true,
        },

        do_not_assign_bots: {
          type: "boolean",
          default: true,
        },
        do_not_request_review_from_pr_author: {
          type: "boolean",
          default: true,
        },
        do_not_request_review_from_bots: {
          type: "boolean",
          default: true,
        },

        review_required_for: BOOLEAN_MAP,
      },
      default: {},
    },

    milestones: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        source_file: {
          type: "string",
          default: ".github/milestones.yaml",
        },
        rules_file: {
          type: "string",
          default: ".github/repo-management/milestone-rules.yaml",
        },
        fallback: {
          type: "string",
          default: "Backlog",
        },

        assignment: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            require_existing_milestone: {
              type: "boolean",
              default: true,
            },
            do_not_create_from_assignment_script: {
              type: "boolean",
              default: true,
            },
            do_not_delete: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        release_milestones: {
          type: "object",
          additionalProperties: false,
          properties: {
            do_not_trigger_release_by_milestone: {
              type: "boolean",
              default: true,
            },
            release_labels_required: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        dependency_milestones: {
          type: "object",
          additionalProperties: false,
          properties: {
            default: {
              type: "string",
              default: "Dependencies — Renovate Weekly Updates",
            },
            security: {
              type: "string",
              default: "Security — Dependency Vulnerability Response",
            },
            major: {
              type: "string",
              default: "Dependencies — Major Upgrade Program",
            },
          },
          default: {},
        },
      },
      default: {},
    },

    project_board: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        config_file: {
          type: "string",
          default: ".github/projects/kanban-board.yaml",
        },

        auto_add: {
          type: "object",
          additionalProperties: false,
          properties: {
            issues: {
              type: "boolean",
              default: true,
            },
            pull_requests: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        update_fields: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            from_labels: {
              type: "boolean",
              default: true,
            },
            from_milestones: {
              type: "boolean",
              default: true,
            },
            from_state: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        archive: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            completed_after_days: {
              type: "integer",
              minimum: 1,
              default: 30,
            },
          },
          default: {},
        },

        safety: {
          type: "object",
          additionalProperties: false,
          properties: {
            do_not_delete_project: {
              type: "boolean",
              default: true,
            },
            do_not_delete_fields: {
              type: "boolean",
              default: true,
            },
            do_not_delete_views: {
              type: "boolean",
              default: true,
            },
            do_not_remove_items: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    relationships: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        link_issues_to_pull_requests: {
          type: "boolean",
          default: true,
        },
        link_pull_requests_to_issues: {
          type: "boolean",
          default: true,
        },

        strong_keywords: STRING_ARRAY,
        weak_keywords: STRING_ARRAY,

        branch_issue_patterns: {
          type: "array",
          items: REGEX_STRING,
          uniqueItems: true,
          default: [],
        },

        require_strong_evidence_for_closing_links: {
          type: "boolean",
          default: true,
        },

        create_issue_when_missing: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            use_openai: {
              type: "boolean",
              default: true,
            },
            require_maintainer_review: {
              type: "boolean",
              default: true,
            },
            labels: LABEL_ARRAY,
          },
          default: {},
        },

        comments: {
          type: "object",
          additionalProperties: false,
          properties: {
            add_relationship_footer: {
              type: "boolean",
              default: true,
            },
            footer: COMMENT_FOOTER,
          },
          default: {},
        },
      },
      default: {},
    },

    dependencies: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        rules_file: {
          type: "string",
          default: ".github/repo-management/dependency-rules.yaml",
        },

        tools: {
          type: "object",
          additionalProperties: false,
          properties: {
            renovate: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                normal_updates: {
                  type: "boolean",
                  default: true,
                },
              },
              default: {},
            },
            mend: {
              type: "object",
              additionalProperties: false,
              properties: {
                enabled: {
                  type: "boolean",
                  default: true,
                },
                security_management: {
                  type: "boolean",
                  default: true,
                },
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
                npm_security_updates: {
                  type: "boolean",
                  default: true,
                },
                github_actions_updates: {
                  type: "boolean",
                  default: true,
                },
              },
              default: {},
            },
          },
          default: {},
        },

        release_policy: {
          type: "object",
          additionalProperties: false,
          properties: {
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
          },
          default: {},
        },

        required_labels: LABEL_ARRAY,

        security_dependency_labels: LABEL_ARRAY,

        auto_merge: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            allowed_update_types: STRING_ARRAY,
            forbidden_update_types: STRING_ARRAY,
            allowed_authors: LOGIN_ARRAY,
            allowed_branch_patterns: {
              type: "array",
              items: REGEX_STRING,
              uniqueItems: true,
              default: [],
            },
            required_labels: LABEL_ARRAY,
            required_absent_labels: LABEL_ARRAY,
            required_checks: CHECK_ARRAY,
          },
          default: {},
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
        strict: {
          type: "boolean",
          default: true,
        },
        rules_file: {
          type: "string",
          default: ".github/repo-management/security-rules.yaml",
        },

        tools: BOOLEAN_MAP,

        required_on_pull_requests: {
          type: "boolean",
          default: true,
        },
        required_on_main: {
          type: "boolean",
          default: true,
        },
        scheduled_main_scan: {
          type: "boolean",
          default: true,
        },

        block_merge_on: {
          type: "object",
          additionalProperties: false,
          properties: {
            vulnerabilities: STRING_ARRAY,
            codeql: STRING_ARRAY,
            sonarqube_quality_gate_failed: {
              type: "boolean",
              default: true,
            },
            dependency_review_failed: {
              type: "boolean",
              default: true,
            },
            secret_findings: {
              type: "boolean",
              default: true,
            },
            malicious_packages: {
              type: "boolean",
              default: true,
            },
            disallowed_licenses: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        create_security_issues: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            for_unpatchable_vulnerabilities: {
              type: "boolean",
              default: true,
            },
            for_failed_security_updates: {
              type: "boolean",
              default: true,
            },
            for_repeated_security_failures: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },

        labels: {
          type: "object",
          additionalProperties: false,
          properties: {
            security_blockers: LABEL_ARRAY,
            security_review: LABEL_ARRAY,
          },
          default: {},
        },
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
        rules_file: {
          type: "string",
          default: ".github/repo-management/release-rules.yaml",
        },

        release_only_from_main: {
          type: "boolean",
          default: true,
        },
        release_only_after_pr_merge: {
          type: "boolean",
          default: true,
        },
        release_only_with_release_label: {
          type: "boolean",
          default: true,
        },
        require_exactly_one_release_label: {
          type: "boolean",
          default: true,
        },

        valid_release_labels: {
          type: "array",
          items: {
            type: "string",
            enum: ["release:major", "release:minor", "release:patch"],
          },
          uniqueItems: true,
          default: ["release:major", "release:minor", "release:patch"],
        },

        release_blocking_labels: LABEL_ARRAY,

        release_blocking_authors: LOGIN_ARRAY,

        versioning: {
          type: "object",
          additionalProperties: false,
          properties: {
            tag_format: {
              type: "string",
              default: "V{major}.{minor}.{patch}",
            },
            tag_pattern: {
              type: "string",
              default: "^V[0-9]+\\.[0-9]+\\.[0-9]+$",
            },
            initial_version: {
              type: "string",
              default: "V0.1.0",
            },
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
            use_openai_draft: {
              type: "boolean",
              default: true,
            },
            update_changelog_file: {
              type: "boolean",
              default: true,
            },
            exclude_dependency_prs: {
              type: "boolean",
              default: true,
            },
            exclude_no_release_prs: {
              type: "boolean",
              default: true,
            },
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
            required: STRING_ARRAY,
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
          },
          default: {},
        },

        announcements: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            discussion_category: {
              type: "string",
              default: "Announcements",
            },
            use_openai_draft: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    publishing: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
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
            publish_only_private_false: {
              type: "boolean",
              default: true,
            },
            token_secret: {
              type: "string",
              default: "NPM_ACCESS_TOKEN",
            },
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
            build_every_dockerfile: {
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
            generate_hashes: {
              type: "boolean",
              default: true,
            },
            generate_manifest: {
              type: "boolean",
              default: true,
            },
            generate_sbom: {
              type: "boolean",
              default: true,
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
            release_only: {
              type: "boolean",
              default: true,
            },
            publish_only: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    cloudflare: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        rules_file: {
          type: "string",
          default: ".github/repo-management/cloudflare-rules.yaml",
        },

        services: {
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
          },
          default: {},
        },

        environments: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            properties: {
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
            },
          },
          properties: {
            preview: {
              type: "object",
              additionalProperties: false,
              properties: {
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
              default: {},
            },
            staging: {
              type: "object",
              additionalProperties: false,
              properties: {
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
              },
              default: {},
            },
            production: {
              type: "object",
              additionalProperties: false,
              properties: {
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
              },
              default: {},
            },
          },
          default: {},
        },

        production: {
          type: "object",
          additionalProperties: false,
          properties: {
            requires_release_tag: {
              type: "boolean",
              default: true,
            },
            requires_environment_approval: {
              type: "boolean",
              default: true,
            },
            requires_smoke_tests: {
              type: "boolean",
              default: true,
            },
            blocked_for_dependency_prs: {
              type: "boolean",
              default: true,
            },
            blocked_for_openai_prs: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    discussions: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        rules_file: {
          type: "string",
          default: ".github/repo-management/discussion-rules.yaml",
        },

        categories: STRING_MAP,

        release_announcements: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            category: {
              type: "string",
              default: "Announcements",
            },
            use_openai_draft: {
              type: "boolean",
              default: true,
            },
            skip_dependency_prs: {
              type: "boolean",
              default: true,
            },
            skip_no_release_prs: {
              type: "boolean",
              default: true,
            },
            skip_security_dependency_prs: {
              type: "boolean",
              default: true,
            },
          },
          default: {},
        },
      },
      default: {},
    },

    openai: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },

        model: {
          type: "object",
          additionalProperties: false,
          properties: {
            variable: {
              type: "string",
              default: "OPENAI_MODEL",
            },
            default: {
              type: "string",
              default: "gpt-5.5",
            },
          },
          default: {},
        },

        secret: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              default: "OPENAI_API_KEY",
            },
          },
          default: {},
        },

        allowed_use_cases: STRING_ARRAY,

        write_policy: {
          type: "object",
          additionalProperties: false,
          properties: {
            may_create_issues: {
              type: "boolean",
              default: true,
            },
            may_create_pull_requests: {
              type: "boolean",
              default: true,
            },
            may_comment: {
              type: "boolean",
              default: true,
            },
            may_post_discussions: {
              type: "boolean",
              default: true,
            },
            may_push_to_main: {
              type: "boolean",
              const: false,
              default: false,
            },
            may_merge_pull_requests: {
              type: "boolean",
              const: false,
              default: false,
            },
            may_approve_pull_requests: {
              type: "boolean",
              const: false,
              default: false,
            },
            may_publish_packages: {
              type: "boolean",
              const: false,
              default: false,
            },
            may_deploy_production: {
              type: "boolean",
              const: false,
              default: false,
            },
          },
          default: {},
        },

        required_labels_for_ai_created_work: LABEL_ARRAY,

        safety: {
          type: "object",
          additionalProperties: false,
          properties: {
            redact_secrets: {
              type: "boolean",
              default: true,
            },
            redact_private_data: {
              type: "boolean",
              default: true,
            },
            do_not_invent_changes: {
              type: "boolean",
              default: true,
            },
            require_review_for_ai_created_prs: {
              type: "boolean",
              default: true,
            },
            dry_run_supported: {
              type: "boolean",
              default: true,
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
        cache_types: STRING_ARRAY,

        cleanup: {
          type: "object",
          additionalProperties: false,
          properties: {
            enabled: {
              type: "boolean",
              default: true,
            },
            schedule: {
              type: "string",
              default: "weekly",
            },
            workflow: {
              type: "string",
              default: ".github/workflows/cache-maintenance.yaml",
            },
          },
          default: {},
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
          },
          default: {},
        },

        required_release_artifacts: STRING_ARRAY,

        hashes: {
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
          },
          default: {},
        },
      },
      default: {},
    },

    workflows: {
      type: "object",
      additionalProperties: WORKFLOW_ENTRY,
      properties: {
        ci: WORKFLOW_ENTRY,
        security: WORKFLOW_ENTRY,
        codeql: WORKFLOW_ENTRY,
        dependency_review: WORKFLOW_ENTRY,
        dependency_management: WORKFLOW_ENTRY,
        dependency_auto_merge: WORKFLOW_ENTRY,
        repo_management: WORKFLOW_ENTRY,
        branch_policy: WORKFLOW_ENTRY,
        release: WORKFLOW_ENTRY,
        publish_npm: WORKFLOW_ENTRY,
        publish_containers: WORKFLOW_ENTRY,
        cloudflare_preview: WORKFLOW_ENTRY,
        cloudflare_staging: WORKFLOW_ENTRY,
        cloudflare_production: WORKFLOW_ENTRY,
        ai_repo_assistant: WORKFLOW_ENTRY,
        cache_maintenance: WORKFLOW_ENTRY,
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
            github: SECRET_ARRAY,
            openai: SECRET_ARRAY,
            sonarqube: SECRET_ARRAY,
            npm: SECRET_ARRAY,
            ghcr: SECRET_ARRAY,
            cloudflare: SECRET_ARRAY,
            security: SECRET_ARRAY,
          },
          default: {},
        },

        required_variables: VARIABLE_ARRAY,

        recommended_variables: STRING_MAP,
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
        add_pr_comments_for_failures: {
          type: "boolean",
          default: true,
        },
        add_pr_comments_for_warnings: {
          type: "boolean",
          default: false,
        },
        add_issue_comments_for_relationships: {
          type: "boolean",
          default: false,
        },

        summary: BOOLEAN_MAP,

        comment_footers: {
          type: "object",
          additionalProperties: COMMENT_FOOTER,
          properties: {
            repo_management: COMMENT_FOOTER,
            labels: COMMENT_FOOTER,
            milestones: COMMENT_FOOTER,
            relationships: COMMENT_FOOTER,
            release: COMMENT_FOOTER,
            security: COMMENT_FOOTER,
            cloudflare: COMMENT_FOOTER,
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
        invalid_branch_name: ENFORCEMENT_RULE,
        missing_issue_number: ENFORCEMENT_RULE,
        missing_required_label: ENFORCEMENT_RULE,
        missing_required_milestone: ENFORCEMENT_RULE,
        missing_required_review: ENFORCEMENT_RULE,
        forbidden_release_attempt: ENFORCEMENT_RULE,
        dependency_release_attempt: ENFORCEMENT_RULE,
        openai_policy_violation: ENFORCEMENT_RULE,
        failed_security_gate: ENFORCEMENT_RULE,
        failed_required_checks: ENFORCEMENT_RULE,
        production_deploy_blocked: ENFORCEMENT_RULE,
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

        do_not_push_to_main: {
          type: "boolean",
          default: true,
        },
        do_not_merge_pull_requests: {
          type: "boolean",
          default: true,
        },
        do_not_approve_pull_requests: {
          type: "boolean",
          default: true,
        },
        do_not_delete_issues: {
          type: "boolean",
          default: true,
        },
        do_not_delete_pull_requests: {
          type: "boolean",
          default: true,
        },
        do_not_delete_milestones: {
          type: "boolean",
          default: true,
        },
        do_not_delete_project_board: {
          type: "boolean",
          default: true,
        },
        do_not_delete_project_fields: {
          type: "boolean",
          default: true,
        },
        do_not_delete_project_views: {
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
        do_not_generate_attestations_outside_release_or_publish: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_without_release_tag: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_without_approval: {
          type: "boolean",
          default: true,
        },
        do_not_post_release_announcement_for_skipped_release: {
          type: "boolean",
          default: true,
        },

        never_remove_labels: LABEL_ARRAY,

        never_auto_apply_release_labels: {
          type: "array",
          items: {
            type: "string",
            enum: ["release:major", "release:minor", "release:patch"],
          },
          uniqueItems: true,
          default: ["release:major", "release:minor", "release:patch"],
        },

        release_blocking_labels: LABEL_ARRAY,
      },
      default: {},
    },
  },
};

function getRepoManagementSchema() {
  return REPO_MANAGEMENT_SCHEMA;
}

module.exports = {
  REPO_MANAGEMENT_SCHEMA,
  schema: REPO_MANAGEMENT_SCHEMA,
  getRepoManagementSchema,

  REGEX_STRING,
  STRING_ARRAY,
  LABEL_NAME,
  LABEL_ARRAY,
  GITHUB_LOGIN,
  LOGIN_ARRAY,
  TEAM_ARRAY,
  GLOB_ARRAY,
  CHECK_ARRAY,
  SECRET_NAME,
  SECRET_ARRAY,
  VARIABLE_ARRAY,
  BOOLEAN_MAP,
  STRING_MAP,
  STRING_ARRAY_MAP,
  LABEL_ARRAY_MAP,
  RULE_ACTION,
  PERMISSION_VALUE,
  WORKFLOW_PERMISSIONS,
  ROUTING_BLOCK,
  ENFORCEMENT_RULE,
  COMMENT_FOOTER,
  WORKFLOW_ENTRY,
  SOURCE_OF_TRUTH_ENTRY,
};

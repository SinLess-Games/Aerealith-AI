// .github/scripts/utils/validators/branch-rules.schema.js
// =============================================================================
// Aerealith AI Branch Rules JSON Schema
// -----------------------------------------------------------------------------
// Purpose:
//   JSON Schema definition for `.github/repo-management/branch-rules.yaml`.
//
// Used by:
//   - .github/scripts/repo/validate-configs.js
//   - .github/scripts/repo/enforce-branch-rules.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/utils/config-loaders/branch-rules.js
//
// Notes:
//   - This file defines the expected shape of branch policy configuration.
//   - It does not mutate repository state.
//   - It is safe for dry-run validation workflows.
//   - Regex strings are validated structurally by the loader because JSON Schema
//     cannot safely compile all regex values across runtimes.
// =============================================================================

const BRANCH_NAME_PATTERN = "^[A-Za-z0-9._/-]+$";

const REGEX_STRING = {
  type: "string",
  minLength: 1,
  description: "A JavaScript-compatible regular expression string.",
};

const LABEL_NAME = {
  type: "string",
  minLength: 1,
  maxLength: 100,
};

const GITHUB_LOGIN = {
  type: "string",
  minLength: 1,
  pattern: "^[A-Za-z0-9-]+(\\[bot\\])?$",
};

const BRANCH_PATTERN_ARRAY = {
  type: "array",
  items: REGEX_STRING,
  uniqueItems: true,
  default: [],
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

const LABEL_ARRAY = {
  type: "array",
  items: LABEL_NAME,
  uniqueItems: true,
  default: [],
};

const LOGIN_ARRAY = {
  type: "array",
  items: GITHUB_LOGIN,
  uniqueItems: true,
  default: [],
};

const ROUTING_BLOCK = {
  type: "object",
  additionalProperties: false,
  properties: {
    labels: LABEL_ARRAY,
    assignees: LOGIN_ARRAY,
    reviewers: LOGIN_ARRAY,
    team_reviewers: STRING_ARRAY,
    milestone: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
    },
    required: {
      type: "boolean",
      default: false,
    },
  },
  default: {},
};

const BRANCH_CLASSIFICATION_BLOCK = {
  type: "object",
  additionalProperties: false,
  required: ["patterns"],
  properties: {
    description: {
      type: "string",
      default: "",
    },
    enabled: {
      type: "boolean",
      default: true,
    },
    patterns: BRANCH_PATTERN_ARRAY,
    exclude_patterns: BRANCH_PATTERN_ARRAY,
    require_issue_number: {
      type: "boolean",
      default: false,
    },
    allow_direct_push: {
      type: "boolean",
      default: false,
    },
    allow_pull_request: {
      type: "boolean",
      default: true,
    },
    allow_release: {
      type: "boolean",
      default: false,
    },
    allow_deploy: {
      type: "boolean",
      default: false,
    },
    require_pull_request: {
      type: "boolean",
      default: true,
    },
    require_status_checks: {
      type: "boolean",
      default: true,
    },
    require_review: {
      type: "boolean",
      default: true,
    },
    route: ROUTING_BLOCK,
  },
};

const RULE_ACTION = {
  type: "string",
  enum: ["off", "warn", "fail", "label", "comment", "block"],
  default: "fail",
};

const BRANCH_RULES_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/SinLess-Games/Aerealith-AI/schemas/branch-rules.schema.json",
  title: "Aerealith AI Branch Rules",
  description: "Schema for .github/repo-management/branch-rules.yaml.",
  type: "object",
  additionalProperties: false,

  required: [
    "version",
    "repository",
    "policy",
    "default_branch",
    "protected_branches",
    "branch_types",
    "pull_requests",
    "release_policy",
    "dependency_policy",
    "openai_policy",
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
          minLength: 1,
          default: "main",
        },
      },
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
        default_branch: {
          type: "string",
          minLength: 1,
          default: "main",
        },
        direct_push_to_main_allowed: {
          type: "boolean",
          default: false,
        },
        feature_branches_required: {
          type: "boolean",
          default: true,
        },
        pull_requests_required_for_main: {
          type: "boolean",
          default: true,
        },
        issue_number_required_for_human_branches: {
          type: "boolean",
          default: true,
        },
        issue_number_required_for_automation_branches: {
          type: "boolean",
          default: false,
        },
        dependency_branches_never_release: {
          type: "boolean",
          default: true,
        },
        openai_branches_never_release: {
          type: "boolean",
          default: true,
        },
        release_by_label_only: {
          type: "boolean",
          default: true,
        },
        enforce_lowercase_branch_names: {
          type: "boolean",
          default: true,
        },
        enforce_slug_style_branch_names: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    default_branch: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name: {
          type: "string",
          const: "main",
          default: "main",
        },
        protected: {
          type: "boolean",
          default: true,
        },
        allow_direct_push: {
          type: "boolean",
          default: false,
        },
        allow_force_push: {
          type: "boolean",
          default: false,
        },
        allow_deletion: {
          type: "boolean",
          default: false,
        },
        require_pull_request: {
          type: "boolean",
          default: true,
        },
        require_linear_history: {
          type: "boolean",
          default: true,
        },
        require_conversation_resolution: {
          type: "boolean",
          default: true,
        },
        require_signed_commits: {
          type: "boolean",
          default: false,
        },
        require_status_checks: {
          type: "boolean",
          default: true,
        },
        require_review: {
          type: "boolean",
          default: true,
        },
        required_approving_review_count: {
          type: "integer",
          minimum: 0,
          default: 1,
        },
      },
    },

    protected_branches: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        patterns: BRANCH_PATTERN_ARRAY,
        require_pull_request: {
          type: "boolean",
          default: true,
        },
        require_status_checks: {
          type: "boolean",
          default: true,
        },
        require_review: {
          type: "boolean",
          default: true,
        },
        allow_force_push: {
          type: "boolean",
          default: false,
        },
        allow_deletion: {
          type: "boolean",
          default: false,
        },
      },
      default: {},
    },

    branch_types: {
      type: "object",
      additionalProperties: BRANCH_CLASSIFICATION_BLOCK,
      properties: {
        feature: BRANCH_CLASSIFICATION_BLOCK,
        fix: BRANCH_CLASSIFICATION_BLOCK,
        hotfix: BRANCH_CLASSIFICATION_BLOCK,
        chore: BRANCH_CLASSIFICATION_BLOCK,
        maintenance: BRANCH_CLASSIFICATION_BLOCK,
        docs: BRANCH_CLASSIFICATION_BLOCK,
        refactor: BRANCH_CLASSIFICATION_BLOCK,
        test: BRANCH_CLASSIFICATION_BLOCK,
        security: BRANCH_CLASSIFICATION_BLOCK,
        ci: BRANCH_CLASSIFICATION_BLOCK,
        deploy: BRANCH_CLASSIFICATION_BLOCK,
        release: BRANCH_CLASSIFICATION_BLOCK,
        dependency: BRANCH_CLASSIFICATION_BLOCK,
        openai: BRANCH_CLASSIFICATION_BLOCK,
        automation: BRANCH_CLASSIFICATION_BLOCK,
      },
      default: {},
    },

    naming: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        allow_uppercase: {
          type: "boolean",
          default: false,
        },
        allow_underscores: {
          type: "boolean",
          default: false,
        },
        allow_trailing_slash: {
          type: "boolean",
          default: false,
        },
        max_length: {
          type: "integer",
          minimum: 1,
          default: 120,
        },
        human_branch_pattern: REGEX_STRING,
        automation_branch_patterns: BRANCH_PATTERN_ARRAY,
        reserved_branch_names: STRING_ARRAY,
        reserved_prefixes: STRING_ARRAY,
        allowed_prefixes: STRING_ARRAY,
        examples: STRING_ARRAY,
      },
      default: {},
    },

    issue_linking: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        require_issue_number_for_human_branches: {
          type: "boolean",
          default: true,
        },
        require_issue_number_for_pull_requests: {
          type: "boolean",
          default: true,
        },
        branch_issue_patterns: BRANCH_PATTERN_ARRAY,
        accepted_issue_keywords: STRING_ARRAY,
        closing_keywords: STRING_ARRAY,
        non_closing_keywords: STRING_ARRAY,
        create_missing_issue_with_openai: {
          type: "boolean",
          default: true,
        },
        label_missing_issue: {
          type: "string",
          default: "needs-linked-issue",
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
        required_for_default_branch: {
          type: "boolean",
          default: true,
        },
        required_base_branch: {
          type: "string",
          default: "main",
        },
        allow_draft_pull_requests: {
          type: "boolean",
          default: true,
        },
        allow_pull_requests_from_forks: {
          type: "boolean",
          default: true,
        },
        require_branch_up_to_date: {
          type: "boolean",
          default: true,
        },
        require_no_conflicts: {
          type: "boolean",
          default: true,
        },
        require_labels: {
          type: "boolean",
          default: true,
        },
        require_milestone: {
          type: "boolean",
          default: false,
        },
        require_linked_issue: {
          type: "boolean",
          default: true,
        },
        required_labels_any: LABEL_ARRAY,
        required_labels_all: LABEL_ARRAY,
        forbidden_labels: LABEL_ARRAY,
        required_checks: STRING_ARRAY,
      },
      default: {},
    },

    direct_push: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        main_allowed: {
          type: "boolean",
          default: false,
        },
        protected_branches_allowed: {
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
        allowed_actors: LOGIN_ARRAY,
        blocked_actors: LOGIN_ARRAY,
      },
      default: {},
    },

    dependency_policy: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        authors: LOGIN_ARRAY,
        branch_patterns: BRANCH_PATTERN_ARRAY,
        required_labels: LABEL_ARRAY,
        forbidden_labels: LABEL_ARRAY,
        release_labels_forbidden: LABEL_ARRAY,
        no_release_required: {
          type: "boolean",
          default: true,
        },
        allow_auto_merge: {
          type: "boolean",
          default: true,
        },
        auto_merge_update_types: STRING_ARRAY,
        require_security_gate: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    openai_policy: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        authors: LOGIN_ARRAY,
        branch_patterns: BRANCH_PATTERN_ARRAY,
        required_labels: LABEL_ARRAY,
        forbidden_labels: LABEL_ARRAY,
        may_create_issues: {
          type: "boolean",
          default: true,
        },
        may_create_pull_requests: {
          type: "boolean",
          default: true,
        },
        may_push_to_main: {
          type: "boolean",
          default: false,
        },
        may_merge_pull_requests: {
          type: "boolean",
          default: false,
        },
        may_approve_pull_requests: {
          type: "boolean",
          default: false,
        },
        require_human_review: {
          type: "boolean",
          default: true,
        },
        require_dry_run_support: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    release_policy: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
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
        valid_release_labels: LABEL_ARRAY,
        release_blocking_labels: LABEL_ARRAY,
        release_blocking_authors: LOGIN_ARRAY,
        release_blocking_branch_patterns: BRANCH_PATTERN_ARRAY,
        tag_pattern: REGEX_STRING,
      },
      default: {},
    },

    cloudflare_policy: {
      type: "object",
      additionalProperties: false,
      properties: {
        preview_from_pull_request: {
          type: "boolean",
          default: true,
        },
        staging_from_main: {
          type: "boolean",
          default: true,
        },
        production_from_release_tag_only: {
          type: "boolean",
          default: true,
        },
        production_requires_approval: {
          type: "boolean",
          default: true,
        },
        production_blocked_for_dependency_branches: {
          type: "boolean",
          default: true,
        },
        production_blocked_for_openai_branches: {
          type: "boolean",
          default: true,
        },
      },
      default: {},
    },

    routing: {
      type: "object",
      additionalProperties: ROUTING_BLOCK,
      default: {},
    },

    checks: {
      type: "object",
      additionalProperties: false,
      properties: {
        required_for_pull_request: STRING_ARRAY,
        required_for_main: STRING_ARRAY,
        required_for_release: STRING_ARRAY,
        required_for_production: STRING_ARRAY,
      },
      default: {},
    },

    labels: {
      type: "object",
      additionalProperties: false,
      properties: {
        invalid_branch: {
          type: "string",
          default: "invalid-branch-name",
        },
        missing_issue: {
          type: "string",
          default: "needs-linked-issue",
        },
        blocked: {
          type: "string",
          default: "status:blocked",
        },
        automation: {
          type: "string",
          default: "automation",
        },
        dependency: {
          type: "string",
          default: "dependencies",
        },
        openai: {
          type: "string",
          default: "automation:openai",
        },
        no_release: {
          type: "string",
          default: "no-release",
        },
      },
      default: {},
    },

    comments: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        add_pr_comment_on_branch_failure: {
          type: "boolean",
          default: true,
        },
        add_pr_comment_on_missing_issue: {
          type: "boolean",
          default: true,
        },
        add_workflow_summary: {
          type: "boolean",
          default: true,
        },
        footer: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: {
              type: ["string", "null"],
              default: "<!-- aerealith-branch-rules:start -->",
            },
            end: {
              type: ["string", "null"],
              default: "<!-- aerealith-branch-rules:end -->",
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
        invalid_branch_name: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "invalid-branch-name",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Branch name does not match repository policy.",
            },
          },
          default: {},
        },
        missing_issue_number: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "needs-linked-issue",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Branch or pull request must reference an issue.",
            },
          },
          default: {},
        },
        forbidden_direct_push: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "do-not-merge",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Direct pushes to protected branches are not allowed.",
            },
          },
          default: {},
        },
        dependency_release_attempt: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: RULE_ACTION,
            label: {
              type: ["string", "null"],
              default: "no-release",
            },
            labels: LABEL_ARRAY,
            message: {
              type: ["string", "null"],
              default: "Dependency automation must never trigger releases.",
            },
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
        include_branch_kind: {
          type: "boolean",
          default: true,
        },
        include_matched_rules: {
          type: "boolean",
          default: true,
        },
        include_required_checks: {
          type: "boolean",
          default: true,
        },
        include_release_decision: {
          type: "boolean",
          default: true,
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
        do_not_push_to_main: {
          type: "boolean",
          default: true,
        },
        do_not_force_push: {
          type: "boolean",
          default: true,
        },
        do_not_delete_branches: {
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
        do_not_apply_release_labels: {
          type: "boolean",
          default: true,
        },
        do_not_release_from_dependency_branches: {
          type: "boolean",
          default: true,
        },
        do_not_release_from_openai_branches: {
          type: "boolean",
          default: true,
        },
        do_not_deploy_production_from_feature_branches: {
          type: "boolean",
          default: true,
        },
        protected_labels: LABEL_ARRAY,
      },
      default: {},
    },
  },
};

function getBranchRulesSchema() {
  return BRANCH_RULES_SCHEMA;
}

module.exports = {
  BRANCH_RULES_SCHEMA,
  schema: BRANCH_RULES_SCHEMA,
  getBranchRulesSchema,

  BRANCH_NAME_PATTERN,
  REGEX_STRING,
  LABEL_NAME,
  GITHUB_LOGIN,
  BRANCH_PATTERN_ARRAY,
  STRING_ARRAY,
  LABEL_ARRAY,
  LOGIN_ARRAY,
  ROUTING_BLOCK,
  BRANCH_CLASSIFICATION_BLOCK,
  RULE_ACTION,
};

// .github/scripts/utils/validators/milestones.schema.js
// =============================================================================
// Aerealith AI Milestones JSON Schema
// -----------------------------------------------------------------------------
// Purpose:
//   JSON Schema definition for `.github/milestones.yaml`.
//
// Used by:
//   - .github/scripts/repo/validate-configs.js
//   - .github/scripts/repo/sync-milestones.js
//   - .github/scripts/repo/assign-milestones.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/release/determine-release-version.js
//   - .github/scripts/release/validate-release-source.js
//   - .github/scripts/utils/config-loaders/milestones.js
//
// Supported `.github/milestones.yaml` formats:
//
//   Preferred array format:
//     - title: V0.1.0 — Foundation
//       description: Foundational repository, workspace, and platform setup.
//       state: open
//
//   Extended object format:
//     version: 1
//     policy:
//       create_missing: true
//       update_existing: true
//       delete_unmanaged: false
//     protected_milestones:
//       - Backlog
//     groups:
//       release:
//         - V0.5.0 — Release Automation
//     milestones:
//       - title: V0.5.0 — Release Automation
//         description: Release workflow, changelog, tagging, and publication setup.
//         state: open
//
// Notes:
//   - GitHub milestone states are `open` or `closed`.
//   - Milestone titles must be unique.
//   - Assignment scripts should not create milestones directly.
//   - Sync scripts may create or update milestones from `.github/milestones.yaml`.
//   - Destructive milestone actions are disabled by default.
// =============================================================================

const MILESTONE_STATE = {
  type: "string",
  enum: ["open", "closed"],
  default: "open",
};

const MILESTONE_TITLE = {
  type: "string",
  minLength: 1,
  maxLength: 256,
};

const MILESTONE_DESCRIPTION = {
  type: "string",
  minLength: 1,
  default: "",
};

const MILESTONE_TITLE_ARRAY = {
  type: "array",
  items: MILESTONE_TITLE,
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

const DATE_OR_NULL = {
  type: ["string", "null"],
  format: "date-time",
  default: null,
};

const MILESTONE_ENTRY = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "state"],
  properties: {
    title: MILESTONE_TITLE,

    description: MILESTONE_DESCRIPTION,

    state: MILESTONE_STATE,

    due_on: DATE_OR_NULL,

    aliases: {
      type: "array",
      items: MILESTONE_TITLE,
      uniqueItems: true,
      default: [],
      description:
        "Optional old names or alternate names used by migration scripts.",
    },

    group: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
      description: "Optional logical group for documentation and reporting.",
    },

    labels: LABEL_ARRAY,

    default_assignees: LOGIN_ARRAY,

    release_version: {
      type: ["string", "null"],
      pattern: "^V[0-9]+\\.[0-9]+\\.[0-9]+$",
      default: null,
      description:
        "Optional V-prefixed semantic version linked to this milestone.",
    },

    release_channel: {
      type: ["string", "null"],
      enum: ["alpha", "beta", "test", "release", null],
      default: null,
    },

    protected: {
      type: "boolean",
      default: false,
      description:
        "Whether automation should avoid deleting or closing this milestone.",
    },

    archived: {
      type: "boolean",
      default: false,
      description:
        "Marks a milestone as historical while still keeping it documented.",
    },

    deprecated: {
      type: "boolean",
      default: false,
      description:
        "Marks a milestone as deprecated while still keeping it documented.",
    },

    replacement: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
      description: "Replacement milestone to use when deprecated is true.",
    },
  },
};

const MILESTONE_GROUPS = {
  type: "object",
  additionalProperties: MILESTONE_TITLE_ARRAY,
  properties: {
    backlog: MILESTONE_TITLE_ARRAY,
    foundation: MILESTONE_TITLE_ARRAY,
    ci: MILESTONE_TITLE_ARRAY,
    security: MILESTONE_TITLE_ARRAY,
    dependencies: MILESTONE_TITLE_ARRAY,
    release: MILESTONE_TITLE_ARRAY,
    publishing: MILESTONE_TITLE_ARRAY,
    cloudflare: MILESTONE_TITLE_ARRAY,
    automation: MILESTONE_TITLE_ARRAY,
    documentation: MILESTONE_TITLE_ARRAY,
    self_hosted: MILESTONE_TITLE_ARRAY,
  },
  default: {},
};

const MILESTONE_POLICY = {
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

    create_missing: {
      type: "boolean",
      default: true,
      description:
        "Whether milestone sync should create missing configured milestones.",
    },

    update_existing: {
      type: "boolean",
      default: true,
      description:
        "Whether milestone sync should update existing configured milestones.",
    },

    close_when_state_closed: {
      type: "boolean",
      default: true,
      description:
        "Whether configured `closed` milestones should be closed in GitHub.",
    },

    reopen_when_state_open: {
      type: "boolean",
      default: true,
      description:
        "Whether configured `open` milestones should be reopened in GitHub.",
    },

    delete_unmanaged: {
      type: "boolean",
      default: false,
      description:
        "Whether milestones not managed by this file may be deleted.",
    },

    close_unmanaged: {
      type: "boolean",
      default: false,
      description:
        "Whether unmanaged open milestones may be closed instead of deleted.",
    },

    report_unmanaged: {
      type: "boolean",
      default: true,
    },

    preserve_protected_milestones: {
      type: "boolean",
      default: true,
    },

    fail_on_duplicate_titles: {
      type: "boolean",
      default: true,
    },

    require_description: {
      type: "boolean",
      default: true,
    },

    require_state: {
      type: "boolean",
      default: true,
    },

    require_backlog_milestone: {
      type: "boolean",
      default: true,
    },

    assignment_requires_existing_milestone: {
      type: "boolean",
      default: true,
      description:
        "Assignment scripts should not create milestones implicitly.",
    },
  },
  default: {},
};

const REQUIRED_MILESTONES = {
  type: "object",
  additionalProperties: MILESTONE_TITLE_ARRAY,
  properties: {
    core: {
      type: "array",
      items: {
        type: "string",
      },
      uniqueItems: true,
      default: ["Backlog"],
    },

    security: {
      type: "array",
      items: {
        type: "string",
      },
      uniqueItems: true,
      default: [
        "Security — Strict Pull Request Gate",
        "Security — Main Branch Monitoring",
        "Security — Dependency Vulnerability Response",
        "Security — Supply Chain Integrity",
      ],
    },

    dependencies: {
      type: "array",
      items: {
        type: "string",
      },
      uniqueItems: true,
      default: [
        "Dependencies — Renovate Weekly Updates",
        "Dependencies — Major Upgrade Program",
        "Dependencies — Mend Management",
      ],
    },

    release: {
      type: "array",
      items: {
        type: "string",
      },
      uniqueItems: true,
      default: [
        "V0.5.0 — Release Automation",
        "V0.6.0 — Publishing Pipeline",
        "V1.0.0 — General Availability",
      ],
    },

    cloudflare: {
      type: "array",
      items: {
        type: "string",
      },
      uniqueItems: true,
      default: [
        "Cloudflare — Preview Environments",
        "Cloudflare — Staging Environment",
        "Cloudflare — Production Environment",
      ],
    },
  },
  default: {},
};

const MILESTONE_ASSIGNMENT_RULE = {
  type: "object",
  additionalProperties: false,
  properties: {
    milestone: {
      type: "string",
      minLength: 1,
    },

    labels_any: LABEL_ARRAY,

    labels_all: LABEL_ARRAY,

    labels_absent: LABEL_ARRAY,

    title_patterns: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
      uniqueItems: true,
      default: [],
    },

    branch_patterns: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
      uniqueItems: true,
      default: [],
    },

    path_patterns: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
      uniqueItems: true,
      default: [],
    },

    issue_templates: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
      uniqueItems: true,
      default: [],
    },

    pull_request_types: {
      type: "array",
      items: {
        type: "string",
        minLength: 1,
      },
      uniqueItems: true,
      default: [],
    },

    fallback: {
      type: "boolean",
      default: false,
    },
  },
};

const MILESTONE_ASSIGNMENT_RULES = {
  type: "object",
  additionalProperties: MILESTONE_ASSIGNMENT_RULE,
  default: {},
};

const VERSIONING = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      default: true,
    },

    version_milestone_pattern: {
      type: "string",
      default: "^V[0-9]+\\.[0-9]+\\.[0-9]+",
    },

    release_milestones_require_release_label: {
      type: "boolean",
      default: true,
    },

    milestone_does_not_trigger_release: {
      type: "boolean",
      default: true,
    },

    release_labels_required: {
      type: "array",
      items: {
        type: "string",
        enum: ["release:major", "release:minor", "release:patch"],
      },
      uniqueItems: true,
      default: ["release:major", "release:minor", "release:patch"],
    },

    no_release_label: {
      type: "string",
      default: "no-release",
    },
  },
  default: {},
};

const REPORTING = {
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

    include_created_milestones: {
      type: "boolean",
      default: true,
    },

    include_updated_milestones: {
      type: "boolean",
      default: true,
    },

    include_closed_milestones: {
      type: "boolean",
      default: true,
    },

    include_reopened_milestones: {
      type: "boolean",
      default: true,
    },

    include_unmanaged_milestones: {
      type: "boolean",
      default: true,
    },

    include_protected_unmanaged_milestones: {
      type: "boolean",
      default: true,
    },

    include_group_summary: {
      type: "boolean",
      default: true,
    },

    include_release_milestones: {
      type: "boolean",
      default: true,
    },
  },
  default: {},
};

const SAFETY = {
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

    do_not_delete_milestones: {
      type: "boolean",
      default: true,
    },

    do_not_delete_protected_milestones: {
      type: "boolean",
      default: true,
    },

    do_not_close_protected_milestones: {
      type: "boolean",
      default: true,
    },

    do_not_create_milestones_from_assignment_script: {
      type: "boolean",
      default: true,
    },

    do_not_assign_closed_milestones: {
      type: "boolean",
      default: true,
    },

    do_not_trigger_release_from_milestone: {
      type: "boolean",
      default: true,
    },

    do_not_close_milestone_with_open_issues: {
      type: "boolean",
      default: false,
    },

    never_delete: MILESTONE_TITLE_ARRAY,

    never_close: MILESTONE_TITLE_ARRAY,

    never_rename: MILESTONE_TITLE_ARRAY,
  },
  default: {},
};

const EXTENDED_MILESTONES_CONFIG = {
  type: "object",
  additionalProperties: false,
  required: ["milestones"],
  properties: {
    version: {
      type: "integer",
      minimum: 1,
      default: 1,
    },

    policy: MILESTONE_POLICY,

    protected_milestones: MILESTONE_TITLE_ARRAY,

    required_milestones: REQUIRED_MILESTONES,

    groups: MILESTONE_GROUPS,

    assignment_rules: MILESTONE_ASSIGNMENT_RULES,

    versioning: VERSIONING,

    milestones: {
      type: "array",
      items: MILESTONE_ENTRY,
      minItems: 1,
      default: [],
    },

    reporting: REPORTING,

    safety: SAFETY,
  },
};

const SIMPLE_MILESTONES_CONFIG = {
  type: "array",
  items: MILESTONE_ENTRY,
  minItems: 1,
};

const MILESTONES_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/SinLess-Games/Aerealith-AI/schemas/milestones.schema.json",
  title: "Aerealith AI Milestones",
  description: "Schema for .github/milestones.yaml.",
  oneOf: [SIMPLE_MILESTONES_CONFIG, EXTENDED_MILESTONES_CONFIG],
};

function getMilestonesSchema() {
  return MILESTONES_SCHEMA;
}

module.exports = {
  MILESTONES_SCHEMA,
  schema: MILESTONES_SCHEMA,
  getMilestonesSchema,

  MILESTONE_STATE,
  MILESTONE_TITLE,
  MILESTONE_DESCRIPTION,
  MILESTONE_TITLE_ARRAY,
  LABEL_NAME,
  LABEL_ARRAY,
  GITHUB_LOGIN,
  LOGIN_ARRAY,
  DATE_OR_NULL,
  MILESTONE_ENTRY,
  MILESTONE_GROUPS,
  MILESTONE_POLICY,
  REQUIRED_MILESTONES,
  MILESTONE_ASSIGNMENT_RULE,
  MILESTONE_ASSIGNMENT_RULES,
  VERSIONING,
  REPORTING,
  SAFETY,
  SIMPLE_MILESTONES_CONFIG,
  EXTENDED_MILESTONES_CONFIG,
};

// .github/scripts/utils/validators/labels.schema.js
// =============================================================================
// Aerealith AI Labels JSON Schema
// -----------------------------------------------------------------------------
// Purpose:
//   JSON Schema definition for `.github/labels.yaml`.
//
// Used by:
//   - .github/scripts/repo/validate-configs.js
//   - .github/scripts/repo/sync-labels.js
//   - .github/scripts/repo/assign-labels.js
//   - .github/scripts/repo/enforce-pr-rules.js
//   - .github/scripts/repo/run-repo-management.js
//   - .github/scripts/utils/config-loaders/labels.js
//
// Supported `.github/labels.yaml` formats:
//
//   Preferred array format:
//     - name: kind:feature
//       color: 1d76db
//       description: New feature or enhancement.
//
//   Extended object format:
//     version: 1
//     policy:
//       delete_unmanaged: true
//     protected_labels:
//       - do-not-merge
//     mutually_exclusive_groups:
//       release:
//         - release:major
//         - release:minor
//         - release:patch
//     groups:
//       release:
//         - release:major
//         - release:minor
//         - release:patch
//     labels:
//       - name: kind:feature
//         color: 1d76db
//         description: New feature or enhancement.
//
// Notes:
//   - GitHub label colors must be 6-character hex values.
//   - Colors may be written with or without `#`; the loader normalizes them.
//   - GitHub label descriptions must be 100 characters or fewer.
//   - Label names must be unique.
//   - This schema validates shape only. Duplicate-name enforcement belongs in
//     the loader because JSON Schema cannot reliably enforce object-level
//     uniqueness by label name across all validator versions.
// =============================================================================

const HEX_COLOR_PATTERN = "^#?[0-9A-Fa-f]{6}$";

const LABEL_NAME_PATTERN = "^[^\\n\\r\\t]+$";

const SCOPED_LABEL_PREFIX_PATTERN = "^[a-z][a-z0-9-]*$";

const LABEL_NAME = {
  type: "string",
  minLength: 1,
  maxLength: 100,
  pattern: LABEL_NAME_PATTERN,
};

const LABEL_COLOR = {
  type: "string",
  minLength: 6,
  maxLength: 7,
  pattern: HEX_COLOR_PATTERN,
  description: "A 6-character hex color with or without a leading '#'.",
};

const LABEL_DESCRIPTION = {
  type: "string",
  maxLength: 100,
  default: "",
};

const LABEL_ARRAY = {
  type: "array",
  items: LABEL_NAME,
  uniqueItems: true,
  default: [],
};

const LABEL_ENTRY = {
  type: "object",
  additionalProperties: false,
  required: ["name", "color", "description"],
  properties: {
    name: LABEL_NAME,

    color: LABEL_COLOR,

    description: LABEL_DESCRIPTION,

    aliases: {
      type: "array",
      items: LABEL_NAME,
      uniqueItems: true,
      default: [],
      description:
        "Optional old names or alternate names used by migration scripts.",
    },

    category: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
      description:
        "Optional human-readable category for documentation or summaries.",
    },

    scoped: {
      type: "boolean",
      default: false,
      description:
        "Whether this label is expected to follow prefix:value naming.",
    },

    protected: {
      type: "boolean",
      default: false,
      description:
        "Whether automation should avoid deleting or renaming this label.",
    },

    deprecated: {
      type: "boolean",
      default: false,
      description:
        "Marks a label as deprecated while still keeping it documented.",
    },

    replacement: {
      type: ["string", "null"],
      minLength: 1,
      default: null,
      description: "Replacement label to use when deprecated is true.",
    },
  },
};

const LABEL_GROUPS = {
  type: "object",
  additionalProperties: LABEL_ARRAY,
  default: {},
};

const MUTUALLY_EXCLUSIVE_GROUPS = {
  type: "object",
  additionalProperties: LABEL_ARRAY,
  properties: {
    status: LABEL_ARRAY,
    priority: LABEL_ARRAY,
    severity: LABEL_ARRAY,
    release: LABEL_ARRAY,
    environment: LABEL_ARRAY,
    size: LABEL_ARRAY,
    risk: LABEL_ARRAY,
  },
  default: {},
};

const LABEL_POLICY = {
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
    },

    update_existing: {
      type: "boolean",
      default: true,
    },

    delete_unmanaged: {
      type: "boolean",
      default: true,
      description:
        "Whether labels not managed by .github/labels.yaml should be deleted.",
    },

    report_unmanaged: {
      type: "boolean",
      default: true,
    },

    preserve_protected_labels: {
      type: "boolean",
      default: true,
    },

    fail_on_duplicate_names: {
      type: "boolean",
      default: true,
    },

    fail_on_invalid_color: {
      type: "boolean",
      default: true,
    },

    fail_on_long_description: {
      type: "boolean",
      default: true,
    },

    fail_on_missing_required_labels: {
      type: "boolean",
      default: true,
    },

    fail_on_unknown_group_labels: {
      type: "boolean",
      default: false,
    },

    fail_on_unknown_mutually_exclusive_group_labels: {
      type: "boolean",
      default: false,
    },

    require_scoped_prefixes: {
      type: "boolean",
      default: false,
    },

    allow_unscoped_labels: {
      type: "boolean",
      default: true,
    },

    normalize_colors: {
      type: "boolean",
      default: true,
    },

    normalize_descriptions: {
      type: "boolean",
      default: true,
    },
  },
  default: {},
};

const REQUIRED_LABELS = {
  type: "object",
  additionalProperties: LABEL_ARRAY,
  properties: {
    release: {
      type: "array",
      items: {
        type: "string",
        enum: ["release:major", "release:minor", "release:patch", "no-release"],
      },
      uniqueItems: true,
      default: [
        "release:major",
        "release:minor",
        "release:patch",
        "no-release",
      ],
    },

    security: {
      type: "array",
      items: {
        type: "string",
      },
      uniqueItems: true,
      default: [
        "kind:security",
        "area:security",
        "needs-security-review",
        "blocked-by-security",
      ],
    },

    dependencies: {
      type: "array",
      items: {
        type: "string",
      },
      uniqueItems: true,
      default: ["dependencies", "no-release", "security:dependency"],
    },

    automation: LABEL_ARRAY,
    ci: LABEL_ARRAY,
    cloudflare: LABEL_ARRAY,
  },
  default: {},
};

const LABEL_PREFIX_RULE = {
  type: "object",
  additionalProperties: false,
  required: ["prefix"],
  properties: {
    prefix: {
      type: "string",
      minLength: 1,
      pattern: SCOPED_LABEL_PREFIX_PATTERN,
    },

    description: {
      type: "string",
      default: "",
    },

    required: {
      type: "boolean",
      default: false,
    },

    color_family: {
      type: ["string", "null"],
      default: null,
    },

    examples: LABEL_ARRAY,
  },
};

const LABEL_PREFIX_RULES = {
  type: "object",
  additionalProperties: LABEL_PREFIX_RULE,
  properties: {
    kind: LABEL_PREFIX_RULE,
    area: LABEL_PREFIX_RULE,
    status: LABEL_PREFIX_RULE,
    priority: LABEL_PREFIX_RULE,
    severity: LABEL_PREFIX_RULE,
    release: LABEL_PREFIX_RULE,
    security: LABEL_PREFIX_RULE,
    automation: LABEL_PREFIX_RULE,
    env: LABEL_PREFIX_RULE,
    size: LABEL_PREFIX_RULE,
    risk: LABEL_PREFIX_RULE,
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

    include_created_labels: {
      type: "boolean",
      default: true,
    },

    include_updated_labels: {
      type: "boolean",
      default: true,
    },

    include_deleted_labels: {
      type: "boolean",
      default: true,
    },

    include_unmanaged_labels: {
      type: "boolean",
      default: true,
    },

    include_protected_unmanaged_labels: {
      type: "boolean",
      default: true,
    },

    include_group_summary: {
      type: "boolean",
      default: true,
    },

    include_mutually_exclusive_groups: {
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

    do_not_delete_protected_labels: {
      type: "boolean",
      default: true,
    },

    do_not_delete_release_labels: {
      type: "boolean",
      default: true,
    },

    do_not_delete_security_labels: {
      type: "boolean",
      default: true,
    },

    do_not_delete_dependency_labels: {
      type: "boolean",
      default: true,
    },

    do_not_delete_github_default_labels_unless_managed: {
      type: "boolean",
      default: true,
    },

    do_not_remove_labels_from_issues_or_pull_requests: {
      type: "boolean",
      default: true,
    },

    never_delete: LABEL_ARRAY,

    never_rename: LABEL_ARRAY,

    never_recolor: LABEL_ARRAY,
  },
  default: {},
};

const EXTENDED_LABELS_CONFIG = {
  type: "object",
  additionalProperties: false,
  required: ["labels"],
  properties: {
    version: {
      type: "integer",
      minimum: 1,
      default: 1,
    },

    policy: LABEL_POLICY,

    protected_labels: LABEL_ARRAY,

    required_labels: REQUIRED_LABELS,

    mutually_exclusive_groups: MUTUALLY_EXCLUSIVE_GROUPS,

    groups: LABEL_GROUPS,

    prefix_rules: LABEL_PREFIX_RULES,

    labels: {
      type: "array",
      items: LABEL_ENTRY,
      minItems: 1,
      default: [],
    },

    reporting: REPORTING,

    safety: SAFETY,
  },
};

const SIMPLE_LABELS_CONFIG = {
  type: "array",
  items: LABEL_ENTRY,
  minItems: 1,
};

const LABELS_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/SinLess-Games/Aerealith-AI/schemas/labels.schema.json",
  title: "Aerealith AI Labels",
  description: "Schema for .github/labels.yaml.",
  oneOf: [SIMPLE_LABELS_CONFIG, EXTENDED_LABELS_CONFIG],
};

function getLabelsSchema() {
  return LABELS_SCHEMA;
}

module.exports = {
  LABELS_SCHEMA,
  schema: LABELS_SCHEMA,
  getLabelsSchema,

  HEX_COLOR_PATTERN,
  LABEL_NAME_PATTERN,
  SCOPED_LABEL_PREFIX_PATTERN,

  LABEL_NAME,
  LABEL_COLOR,
  LABEL_DESCRIPTION,
  LABEL_ARRAY,
  LABEL_ENTRY,
  LABEL_GROUPS,
  MUTUALLY_EXCLUSIVE_GROUPS,
  LABEL_POLICY,
  REQUIRED_LABELS,
  LABEL_PREFIX_RULE,
  LABEL_PREFIX_RULES,
  REPORTING,
  SAFETY,
  SIMPLE_LABELS_CONFIG,
  EXTENDED_LABELS_CONFIG,
};

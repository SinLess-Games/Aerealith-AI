import type { UserConfig } from "@commitlint/types";

const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],

  helpUrl:
    "https://github.com/SinLess-Games/Aerealith-AI/blob/main/CONTRIBUTING.md#commit-message-format",

  rules: {
    /**
     * Format:
     *   type(scope): subject
     *
     * Examples:
     *   feat(auth): add session refresh flow
     *   fix(ci): correct affected project detection
     *   docs(readme): update local setup steps
     *   chore(deps): update pnpm lockfile
     */

    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
        "security",
        "release",
      ],
    ],

    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],

    "scope-case": [2, "always", "kebab-case"],
    "scope-empty": [0, "never"],
    "scope-enum": [
      1,
      "always",
      [
        "aerealith",
        "app",
        "api",
        "auth",
        "ui",
        "content",
        "docs",
        "web",
        "desktop",
        "mobile",
        "cli",
        "extension",
        "workers",
        "cloudflare",
        "d1",
        "r2",
        "kv",
        "queues",
        "cockroachdb",
        "database",
        "docker",
        "npm",
        "release",
        "repo",
        "security",
        "codeql",
        "sonarqube",
        "cache",
        "artifacts",
        "attestations",
        "deps",
        "ci",
        "workflows",
        "scripts",
        "config",
        "root",
      ],
    ],

    "subject-empty": [2, "never"],
    "subject-case": [0],
    "subject-full-stop": [2, "never", "."],
    "subject-max-length": [2, "always", 100],

    "header-max-length": [2, "always", 120],
    "body-leading-blank": [1, "always"],
    "body-max-line-length": [1, "always", 120],
    "footer-leading-blank": [1, "always"],
    "footer-max-line-length": [1, "always", 120],

    "references-empty": [0, "never"],
    "signed-off-by": [0, "always", "Signed-off-by:"],
  },

  ignores: [
    (message: string) => message.startsWith("Merge "),
    (message: string) => message.startsWith("Revert "),
    (message: string) => message.startsWith("dependabot/"),
    (message: string) => message.startsWith("renovate/"),
  ],
};

export default Configuration;

// libs/shared/site-content/src/lib/technology/security.ts

import type { CardProps } from '../types/card';

/**
 * ### SecurityCards
 *
 * Encryption, signing, vulnerability scanning, static & dynamic analysis,
 * runtime threat detection, policy-as-code, and supply-chain automation
 * for Helix AI’s cloud-native platform.
 *
 * @example
 * ```ts
 * import { SecurityCards } from '@/lib/constants/frontend/technology/security'
 * ```
 */
export const SecurityCards = [
  {
    title: 'Security & Compliance',
    description:
      'Encryption, signing, vulnerability scanning, SAST, DAST, runtime hardening, policy-as-code, and supply-chain automation for Helix AI’s cloud-native platform.',
    listItems: [
      // Core secrets & crypto
      {
        text: 'Vault 1.16',
        href: 'https://www.vaultproject.io/',
        role: 'Secrets Management',
        detailedDescription:
          'HashiCorp Vault 1.16 (Apr 2024) brings Key Management Secrets Engine GA, OIDC token exchange, and an event-streaming audit backend for centralized secret rotation and encryption.',
      },
      {
        text: 'cert-manager 1.15',
        href: 'https://cert-manager.io/',
        role: 'TLS Certificates',
        detailedDescription:
          'cert-manager 1.15 (Feb 2025) adds Gateway API support and LiteralCertificateSubject, issuing ACME, Vault, or self-signed certs per namespace.',
      },

      // Container & SBOM scanning
      {
        text: 'Trivy 0.52',
        href: 'https://aquasecurity.github.io/trivy/',
        role: 'Vulnerability Scanner',
        detailedDescription:
          'Trivy 0.52 (Mar 2025) scans containers, SBOMs, IaC, and Git repos; `trivy kubernetes --helm` audits Helm releases and outputs CycloneDX SBOMs.',
      },
      {
        text: 'Anchore Grype 0.73',
        href: 'https://github.com/anchore/grype',
        role: 'SBOM CVE Scanner',
        detailedDescription:
          'Grype 0.73 (May 2025) matches CVEs across 12 ecosystems using NVD 2.0 and Chainguard edb, providing a second layer of container vulnerability detection.',
      },
      {
        text: 'Clair 4.8',
        href: 'https://github.com/quay/clair',
        role: 'Container CVE Scanner',
        detailedDescription:
          'Clair 4.8 (Jul 2024) ingests Ubuntu 24.04, Wolfi, and Red Hat feeds, offering alternate database coverage for defense-in-depth.',
      },
      {
        text: 'Dockle 0.5',
        href: 'https://github.com/goodwithtech/dockle',
        role: 'Dockerfile Linter',
        detailedDescription:
          'Dockle 0.5 (Apr 2024) checks Dockerfiles against CIS benchmarks, dangling setuid bits, and outdated base images.',
      },
      {
        text: 'Chainguard Images',
        href: 'https://github.com/chainguard-images',
        role: 'Minimal Secure Images',
        detailedDescription:
          'Wolfi-based images ship zero known CVEs, signed by Sigstore and continuously patched; integrate with Cosign & Rekor.',
      },

      // SBOM generation & signing
      {
        text: 'Syft 1.2',
        href: 'https://anchore.com/opensource/syft/',
        role: 'SBOM Generator',
        detailedDescription:
          'Syft 1.2 (Apr 2025) emits SPDX or CycloneDX SBOMs for images, directories, and Nix derivations, feeding Trivy/Grype.',
      },
      {
        text: 'Cosign 2.2',
        href: 'https://github.com/sigstore/cosign',
        role: 'Image Signing & Verification',
        detailedDescription:
          'Cosign 2.2 (Apr 2024) supports keyless signatures and SBOM attestations; verify via Rekor transparency log.',
      },
      {
        text: 'Rekor 1.4',
        href: 'https://github.com/sigstore/rekor',
        role: 'Transparency Log',
        detailedDescription:
          'Rekor 1.4 (Jan 2025) stores immutable metadata for signatures and attestations using Trillian-v1 and TUF entries.',
      },

      // SAST
      {
        text: 'CodeQL 2.15',
        href: 'https://codeql.github.com/',
        role: 'Semantic Code Analysis',
        detailedDescription:
          'CodeQL 2.15 (Feb 2025) brings Python 3.13 support, GraphQL taint-tracking, and parallel queries in GitHub Actions.',
      },
      {
        text: 'Semgrep CLI 1.45',
        href: 'https://semgrep.dev/',
        role: 'SAST Scanner',
        detailedDescription:
          'Semgrep 1.45 (Apr 2025) adds autofix, Go generics, and rule marketplace for fast multi-language static analysis.',
      },
      {
        text: 'Bandit 1.8',
        href: 'https://bandit.readthedocs.io/',
        role: 'Python Static Analyzer',
        detailedDescription:
          'Bandit 1.8 (Mar 2025) checks for insecure functions, AWS key leaks, and outputs SARIF integrated with GHAS.',
      },
      {
        text: 'gosec 2.18',
        href: 'https://github.com/securego/gosec',
        role: 'Go Static Analyzer',
        detailedDescription:
          'gosec 2.18 (Apr 2025) flags unsafe reflection, hard-coded creds, and SQL injection in Go modules.',
      },

      // DAST
      {
        text: 'OWASP ZAP 2.14',
        href: 'https://www.zaproxy.org/',
        role: 'Dynamic App Scanner',
        detailedDescription:
          'ZAP 2.14 (Jun 2025) performs automated spidering, active scans, and GraphQL fuzzing; integrates with GitHub Actions and Cypress pipelines.',
      },
      {
        text: 'Nikto 3.1',
        href: 'https://cirt.net/Nikto2',
        role: 'Web Vulnerability Scanner',
        detailedDescription:
          'Nikto 3.1 (Jan 2024) scans webservers for 7 000+ dangerous files, outdated software, and misconfigs, complementing ZAP for DAST coverage.',
      },

      // IaC scanning
      {
        text: 'Checkov 3.2',
        href: 'https://www.checkov.io/',
        role: 'IaC Scanner',
        detailedDescription:
          'Checkov 3.2 (Jun 2025) analyses Terraform, CloudFormation, Pulumi, & K8s manifests with graph detection and AI remediation.',
      },
      {
        text: 'tfsec 1.31',
        href: 'https://aquasecurity.github.io/tfsec/',
        role: 'Terraform Scanner',
        detailedDescription:
          'tfsec 1.31 (Jun 2025) outputs SARIF and cross-links to Checkov docs for Terraform misconfigs.',
      },

      // Kubernetes security
      {
        text: 'Kubescape 3.0',
        href: 'https://kubescape.io/',
        role: 'K8s Security Scanner',
        detailedDescription:
          'Kubescape 3.0 (Jul 2025) runs NSA & MITRE benchmarks, RBAC analysis, and risk graphs for clusters.',
      },
      {
        text: 'kube-hunter 0.8',
        href: 'https://github.com/aquasecurity/kube-hunter',
        role: 'K8s Pen-Test Scanner',
        detailedDescription:
          'kube-hunter 0.8 (Jan 2025) discovers exposed dashboards, unauth Kubelets, and permissive RBAC rules.',
      },

      // Runtime & IPS
      {
        text: 'Falco 0.40',
        href: 'https://falco.org/',
        role: 'Runtime Threat Detection',
        detailedDescription:
          'Falco 0.40 (Jan 2025) eBPF syscall inspection for anomalous behavior.',
      },
      {
        text: 'CrowdSec 1.6',
        href: 'https://crowdsec.net/',
        role: 'Collaborative IPS',
        detailedDescription:
          'CrowdSec 1.6 (Feb 2025) bans malicious IPs via agents and shares block-lists.',
      },

      // Policy & Compliance
      {
        text: 'Kyverno 1.12',
        href: 'https://kyverno.io/',
        role: 'Policy Engine (K8s)',
        detailedDescription:
          'Kyverno validates and mutates manifests with JSON policies; verifies Cosign signatures.',
      },
      {
        text: 'Gatekeeper v3.13',
        href: 'https://github.com/open-policy-agent/gatekeeper',
        role: 'Admission Controller',
        detailedDescription: 'Gatekeeper enforces Rego policies and mutation across clusters.',
      },
      {
        text: 'Open Policy Agent 1.0',
        href: 'https://openpolicyagent.org/',
        role: 'Policy Runtime',
        detailedDescription: 'OPA 1.0 GA with faster bundle evaluation and signed bundles.',
      },

      // Supply-chain & dependency automation
      {
        text: 'Renovate 37.x',
        href: 'https://github.com/renovatebot/renovate',
        role: 'Dependency Update Bot',
        detailedDescription: 'Renovate 37 auto-PRs updates with AI changelogs.',
      },
      {
        text: 'Dependabot',
        href: 'https://github.com/dependabot',
        role: 'Dependency PR Bot',
        detailedDescription: 'Dependabot watches manifests and opens version/security PRs.',
      },
      {
        text: 'Snyk CLI 1.30',
        href: 'https://snyk.io/',
        role: 'Vuln & License Scanner',
        detailedDescription: 'Snyk aggregates OSS, SAST, IaC findings into SARIF reports.',
      },
      {
        text: 'Mend CLI 2.16',
        href: 'https://mend.io/',
        role: 'SCA CLI',
        detailedDescription: 'Mend scans repos & images for vulnerable libraries and licenses.',
      },
      {
        text: 'Mend Bolt for GitHub [bot]',
        href: 'https://github.com/marketplace/mend',
        role: 'SCA GitHub App',
        detailedDescription: 'PR comments with vulnerability details and fixes.',
      },
      {
        text: 'GitHub Advanced Security [bot]',
        href: 'https://github.com/features/security',
        role: 'Code Scanning Bot',
        detailedDescription:
          'GHAS bot surfacing secret scans, dependency reviews, and CodeQL findings.',
      },
      {
        text: 'The Update Framework (Notary v2)',
        href: 'https://theupdateframework.io/',
        role: 'Secure Artifact Delivery',
        detailedDescription:
          'TUF/Notary v2 secures OCI artifact pulls with delegations and signed metadata.',
      },
    ],
    image: '/images/technology/security.png',
    link: '/technology/security',
    buttonText: 'Explore security',
  },
] as const satisfies CardProps[];

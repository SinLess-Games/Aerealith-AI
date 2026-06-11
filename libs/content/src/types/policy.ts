import type { Metadata } from 'next';

export type PolicyStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'published'
  | 'archived';

export type PolicyOwner = 'SinLess Games LLC' | string;

export type PolicyHref =
  | `/${string}`
  | `./${string}`
  | `../${string}`
  | `mailto:${string}`
  | `https://${string}`
  | `http://${string}`;

export type PolicyLink = {
  label: string;
  href: PolicyHref;
  description?: string;
};

export type PolicyContact = {
  label: string;
  email: string;
  href?: `mailto:${string}`;
};

export type PolicyMeta = {
  title: string;
  description: string;
  effectiveDate: string;
  lastUpdated: string;
  owner: PolicyOwner;
  status: PolicyStatus;
};

export type PolicySection = {
  id: string;
  title: string;
  body?: string[];
  bullets?: string[];
  orderedItems?: string[];
  links?: PolicyLink[];
  contacts?: PolicyContact[];
  note?: string;
};

export type PolicyDocument = {
  slug: string;
  path: PolicyHref;
  meta: PolicyMeta;
  relatedPolicies?: PolicyLink[];
  sections: PolicySection[];
};

export type PolicyPageProps = {
  policy: PolicyDocument;
};

export function createPolicyMetadata(policy: PolicyDocument): Metadata {
  return {
    title: `${policy.meta.title} | Aerealith AI`,
    description: policy.meta.description,
  };
}

export function createPolicyContact(
  label: string,
  email: string,
): PolicyContact {
  return {
    label,
    email,
    href: `mailto:${email}`,
  };
}

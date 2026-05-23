/**
 * A framework-agnostic anchor target type.
 *
 * Avoid importing `HTMLAttributeAnchorTarget` from React so this content
 * library can be used by Next.js, Node.js, docs tooling, CLIs, and tests
 * without requiring React as a dependency.
 */
export type AnchorTarget = '_self' | '_blank' | '_parent' | '_top' | (string & {});

/**
 * A string literal for common aspect ratios plus a flexible `${w}/${h}` fallback.
 *
 * Examples:
 * - "16/9"
 * - "4/3"
 * - "1/1"
 * - "21/9"
 * - "3/2"
 */
export type AspectRatio =
  | '16/9'
  | '4/3'
  | '1/1'
  | '21/9'
  | '3/2'
  | `${number}/${number}`;

/**
 * Optional visual style overrides.
 *
 * Keep this loose to avoid coupling the core content package to a specific
 * styling system such as React CSSProperties, MUI SxProps, Tailwind, etc.
 */
export type LooseStyleObject = Record<string, unknown>;

/**
 * A single linkable item shown within a technology, feature, or resource card.
 */
export interface ListItemProps {
  /** Display name of the technology or resource. */
  text: string;

  /** Canonical documentation, internal route, or homepage URL. */
  href: string;

  /** Anchor target behavior, such as "_blank". */
  target?: AnchorTarget;

  /** Concise functional label for quick scanning, such as "MLOps Platform". */
  role: string;

  /** Release-quality blurb. Prefer three sentences or fewer. */
  detailedDescription: string;

  /** Optional small emoji, icon name, or icon identifier for UI rendering. */
  icon?: string;

  /** Optional small image path, CDN URL, or data URL for row-level visuals. */
  image?: string;
}

/**
 * Props used by card sections across product, docs, technology, and marketing pages.
 */
export interface CardProps {
  /** Section title shown at the top of the card. */
  title: string;

  /** One-sentence category overview. */
  description: string;

  /** Optional array of list items rendered inside the card. */
  listItems?: ListItemProps[];

  /** Hero or illustration image path, CDN URL, or data URL for the card. */
  image: string;

  /** Internal route or absolute URL for the primary CTA. */
  link: string;

  /** Optional button label for the primary CTA. Defaults may be used by the UI. */
  buttonText?: string;

  /** Optional quote or tagline to highlight within the card. */
  quote?: string;

  /** Desired aspect ratio for the hero image or container. */
  aspectRatio?: AspectRatio;

  /**
   * Optional style overrides.
   *
   * Prefer theme-level styling where possible.
   */
  sx?: LooseStyleObject;
}

/** Readonly variants useful for exported constants. */
export type ReadonlyListItem = Readonly<ListItemProps>;

export type ReadonlyCard = Readonly<
  Omit<CardProps, 'listItems'> & {
    listItems?: ReadonlyArray<ReadonlyListItem>;
  }
>;

export type ReadonlyCardArray = ReadonlyArray<ReadonlyCard>;
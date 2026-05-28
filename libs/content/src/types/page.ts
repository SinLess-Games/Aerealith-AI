export interface Page {
  /** Display name shown in the nav */
  name: string;

  /** Path or URL */
  url: string;

  /** Optional short description for menus, cards, and sitemap-like displays */
  description?: string;

  /** Whether this page points outside the Helix AI app/site */
  external?: boolean;
}

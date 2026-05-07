// libs/ui/src/components/index.tsx

// -----------------------------------------------------------------------------
// Layouts & Sections
// -----------------------------------------------------------------------------
export {
  default as Background,
  BackgroundImage,
} from './Background.js';

export type {
  BackgroundImageProps,
  BackgroundImageSource,
} from './Background.js';

// -----------------------------------------------------------------------------
// Cards & Containers
// -----------------------------------------------------------------------------
export { default as GlassCard } from './GlassCard.js';

export type { GlassCardProps } from './GlassCard.js';

export { default as HelixCard } from './Card.js';

export type {
  CardProps,
  HelixCardImageSource,
  HelixCardListItem,
  ListItemProps,
} from './Card.js';

// -----------------------------------------------------------------------------
// Banners & Alerts
// -----------------------------------------------------------------------------
export { default as DevelopmentBanner } from './development-banner.js';

export type {
  DevelopmentBannerFixedPosition,
  DevelopmentBannerProps,
} from './development-banner.js';

// -----------------------------------------------------------------------------
// Modals
// -----------------------------------------------------------------------------
export { default as PrimitiveModal } from './modal.js';

export type { PrimitiveModalProps } from './modal.js';

// -----------------------------------------------------------------------------
// Header & Navigation
// -----------------------------------------------------------------------------
export { default as Header } from './Header.js';

export type {
  HeaderProps,
  Page,
} from './Header.js';

// -----------------------------------------------------------------------------
// Waitlist / Hero
// -----------------------------------------------------------------------------
export {
  default as HeroSection,
  HeroWaitlist,
} from './Waitlist.js';

export type {
  HeroSectionProps,
  HeroWaitlistProps,
  WaitlistStatus,
} from './Waitlist.js';
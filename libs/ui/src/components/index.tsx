// libs/ui/src/components/index.tsx

// -----------------------------------------------------------------------------
// Layouts & Sections
// -----------------------------------------------------------------------------
export {
  default as Background,
  BackgroundImage,
} from './Background';

export type {
  BackgroundImageProps,
  BackgroundImageSource,
} from './Background';

// -----------------------------------------------------------------------------
// Cards & Containers
// -----------------------------------------------------------------------------
export { default as GlassCard } from './GlassCard';

export type { GlassCardProps } from './GlassCard';

export { default as HelixCard } from './Card';

export type {
  CardProps,
  HelixCardImageSource,
  HelixCardListItem,
  ListItemProps,
} from './Card';

// -----------------------------------------------------------------------------
// Banners & Alerts
// -----------------------------------------------------------------------------
export { default as DevelopmentBanner } from './development-banner';

export type {
  DevelopmentBannerFixedPosition,
  DevelopmentBannerProps,
} from './development-banner';

// -----------------------------------------------------------------------------
// Modals
// -----------------------------------------------------------------------------
export { default as PrimitiveModal } from './modal';

export type { PrimitiveModalProps } from './modal';

// -----------------------------------------------------------------------------
// Header & Navigation
// -----------------------------------------------------------------------------
export { default as Header } from './Header';

export type {
  HeaderProps,
  Page,
} from './Header';

// -----------------------------------------------------------------------------
// Waitlist / Hero
// -----------------------------------------------------------------------------
export {
  default as HeroSection,
  HeroWaitlist,
} from './Waitlist';

export type {
  HeroSectionProps,
  HeroWaitlistProps,
  WaitlistStatus,
} from './Waitlist';
// libs/ui/src/components/marketing/index.ts

export {
  FeatureGrid,
} from './feature-grid';

export {
  MarketingCopy,
} from './marketing-copy';

export {
  MarketingSection,
} from './marketing-section';

/**
 * Marketing carousel uses the shared media carousel.
 * Supports image, video, PowerPoint, and custom slides.
 */
export {
  default as MarketingCarousel,
  MediaCarousel as Carousel,
  MediaCarousel as MarketingMediaCarousel,
} from '../media/carousel';

export type {
  FeatureGridAlign,
  FeatureGridColumns,
  FeatureGridItem,
  FeatureGridProps,
  FeatureGridResponsiveValue,
  FeatureGridSlotProps,
  MarketingCopyAlign,
  MarketingCopyProps,
  MarketingCopySlotProps,
  MarketingCopyTone,
  MarketingCopyVariant,
  MarketingSectionFeatureLayout,
  MarketingSectionMediaPosition,
  MarketingSectionProps,
  MarketingSectionSlotProps,
  MarketingSectionSpacing,
  MarketingSectionVariant,
  CarouselBaseItem,
  CarouselCustomItem,
  CarouselImageItem,
  CarouselItem,
  CarouselPowerPointItem,
  CarouselVideoItem,
  CarouselVideoSource,
  CdnVideoInput,
  MediaCarouselProps,
  MediaCarouselSlotProps,
  PowerPointCarouselInput,
} from '../../types';
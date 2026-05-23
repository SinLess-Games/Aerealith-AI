import type { CSSProperties, ReactNode } from 'react';

import type { CardProps } from '@mui/material/Card';
import type { SxProps, Theme } from '@mui/material/styles';

export type CldVideoPlayerComponent =
  typeof import('next-cloudinary')['CldVideoPlayer'];

export type CldVideoPlayerProps =
  React.ComponentProps<CldVideoPlayerComponent>;

export type PassthroughCldVideoPlayerProps = Omit<
  CldVideoPlayerProps,
  | 'id'
  | 'src'
  | 'width'
  | 'height'
  | 'poster'
  | 'logo'
  | 'autoPlay'
  | 'loop'
  | 'muted'
  | 'controls'
  | 'playsinline'
  | 'transformation'
  | 'sourceTypes'
  | 'colors'
  | 'className'
  | 'quality'
>;

export type VideoPlayerProps = {
  /**
   * Stable HTML/player id.
   *
   * Example:
   * sea-turtle
   */
  id?: CldVideoPlayerProps['id'];

  /**
   * Cloudinary public id.
   *
   * Preferred:
   * Helix_AI_Investor_wvztbl
   *
   * Also supported:
   * https://res.cloudinary.com/helix-ai/video/upload/v1779161862/Helix_AI_Investor_wvztbl.mp4
   */
  src: CldVideoPlayerProps['src'];

  /**
   * Video width passed to Cloudinary.
   *
   * Defaults to 1920.
   */
  width?: CldVideoPlayerProps['width'];

  /**
   * Video height passed to Cloudinary.
   *
   * Defaults to 1080.
   */
  height?: CldVideoPlayerProps['height'];

  /**
   * Optional visible title above the player.
   */
  title?: ReactNode;

  /**
   * Optional visible description below the title.
   */
  description?: ReactNode;

  /**
   * Optional Cloudinary poster image/public id.
   */
  poster?: CldVideoPlayerProps['poster'];

  /**
   * Shows/hides the Cloudinary player logo.
   *
   * Defaults to false.
   */
  logo?: CldVideoPlayerProps['logo'];

  /**
   * Adds a Material UI Card wrapper.
   *
   * Defaults to true.
   */
  card?: boolean;

  /**
   * MUI props passed to the Card wrapper.
   */
  cardProps?: Omit<CardProps, 'children'>;

  /**
   * Styles for the outer wrapper.
   */
  sx?: SxProps<Theme>;

  /**
   * Styles for the video container.
   */
  playerSx?: SxProps<Theme>;

  /**
   * Keeps the player in a responsive frame.
   *
   * Defaults to true.
   */
  responsive?: boolean;

  /**
   * CSS aspect-ratio for the player frame.
   *
   * Defaults to 16 / 9.
   */
  aspectRatio?: CSSProperties['aspectRatio'];

  /**
   * CldVideoPlayer option passthrough.
   */
  autoPlay?: CldVideoPlayerProps['autoPlay'];
  loop?: CldVideoPlayerProps['loop'];
  muted?: CldVideoPlayerProps['muted'];
  controls?: CldVideoPlayerProps['controls'];

  /**
   * next-cloudinary uses lowercase `playsinline`.
   */
  playsinline?: CldVideoPlayerProps['playsinline'];

  /**
   * Friendly React-style alias.
   *
   * This component maps it to next-cloudinary's lowercase `playsinline`.
   */
  playsInline?: CldVideoPlayerProps['playsinline'];

  transformation?: CldVideoPlayerProps['transformation'];

  /**
   * Cloudinary source types.
   *
   * Must be an array of strings.
   *
   * Defaults to ['mp4'].
   */
  sourceTypes?: readonly string[];

  colors?: CldVideoPlayerProps['colors'];
  className?: CldVideoPlayerProps['className'];
  quality?: CldVideoPlayerProps['quality'];

  /**
   * Additional next-cloudinary player props.
   *
   * Use this for less common CldVideoPlayer options without changing this wrapper.
   */
  playerProps?: Partial<PassthroughCldVideoPlayerProps>;
};
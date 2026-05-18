import * as React from 'react';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import RadioOutlinedIcon from '@mui/icons-material/RadioOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';

import type { ProfileIconName } from './types';

const ICONS: Record<ProfileIconName, React.ElementType> = {
  achievement: EmojiEventsOutlinedIcon,
  activity: TimelineOutlinedIcon,
  analytics: AnalyticsOutlinedIcon,
  arrow: ArrowForwardOutlinedIcon,
  calendar: CalendarTodayOutlinedIcon,
  code: CodeOutlinedIcon,
  connections: LinkOutlinedIcon,
  dashboard: DashboardOutlinedIcon,
  filter: FilterListOutlinedIcon,
  folder: FolderOutlinedIcon,
  followers: GroupsOutlinedIcon,
  home: HomeOutlinedIcon,
  integrations: HubOutlinedIcon,
  link: LinkOutlinedIcon,
  location: LocationOnOutlinedIcon,
  logout: LogoutOutlinedIcon,
  models: ViewInArOutlinedIcon,
  overview: InsertChartOutlinedIcon,
  projects: FolderOutlinedIcon,
  search: SearchOutlinedIcon,
  settings: SettingsOutlinedIcon,
  streaming: RadioOutlinedIcon,
};

export type ProfileIconProps = {
  name: ProfileIconName;
  size?: number;
};

export function ProfileIcon({
  name,
  size = 20,
}: ProfileIconProps): React.ReactElement {
  const Icon = ICONS[name] ?? AutoAwesomeOutlinedIcon;

  return <Icon sx={{ display: 'block', fontSize: size }} />;
}

// libs/ui/src/components/profile/index.tsx

'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';

import { ProfileAchievementsCard } from './achievements-card';
import { ProfileConnectionsCard } from './connections-card';
import { ProfileIntegrationsCard } from './integrations-card';
import { ProfileLeftMenu } from './left-menu';
import { ProfileModelsCard } from './models-card';
import { ProfileOverviewCard } from './overview-card';
import { ProfileCard } from './profile-card';
import { ProfileEditDialog } from './profile-edit-dialog';
import { ProfileTopbar } from './profile-topbar';
import { ProfileProjectsCard } from './projects-card';
import { ProfileRecentActivityCard } from './recent-activity-card';
import { SettingsCard } from './settings-card';
import type {
  ProfileEditOptions,
  ProfileIdentityScaffold,
  ProfileScaffoldContent,
  ProfileViewMode,
} from './types';
import type { ProfileCardProfile } from './profile-card';
import type {
  SettingsCardSettings,
  SettingsCardUpdates,
} from './settings-card';

export type ProfilePageProps = {
  content: ProfileScaffoldContent;
  identity?: ProfileIdentityScaffold;
  profile?: ProfileCardProfile;
  settings?: SettingsCardSettings;
  editOptions?: ProfileEditOptions;
  activeTab?: string;
  mode?: ProfileViewMode;
  dashboardHref?: string;
};

function ProfileShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        color: '#f8fbff',
        background:
          'radial-gradient(circle at 85% 18%, rgba(236, 23, 153, 0.32), transparent 28%), radial-gradient(circle at 82% 88%, rgba(58, 216, 255, 0.18), transparent 24%), #030611',
      }}
    >
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          opacity: 0.74,
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.5) 0 1px, transparent 1.4px), radial-gradient(circle at 75% 35%, rgba(0, 229, 255,0.5) 0 1px, transparent 1.3px)',
          backgroundSize: '110px 110px, 160px 160px',
        }}
      />
      <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Box>
  );
}

function ProfileTabs({
  tabs,
  activeTab = 'overview',
  mode,
  onTabChange,
}: {
  tabs: ProfileScaffoldContent['tabs'];
  activeTab?: string;
  mode: ProfileViewMode;
  onTabChange: (value: string) => void;
}): React.ReactElement {
  const visibleTabs = tabs.filter(
    (tab) =>
      mode === 'private' || (!tab.privateOnly && tab.publicHidden !== true),
  );

  return (
    <Paper
      elevation={0}
      sx={{
        mt: 1.5,
        borderRadius: 1,
        overflowX: 'auto',
        border: '1px solid rgba(236, 23, 153, 0.28)',
        background:
          'linear-gradient(180deg, rgba(7, 13, 38, 0.88), rgba(5, 9, 28, 0.82))',
      }}
    >
      <Stack direction="row" sx={{ minWidth: 760 }}>
        {visibleTabs.map((tab) => {
          const active = tab.value === activeTab;

          return (
            <Button
              key={tab.value}
              href={tab.href}
              onClick={() => onTabChange(tab.value)}
              aria-current={active ? 'page' : undefined}
              sx={{
                position: 'relative',
                minHeight: 64,
                px: 3.2,
                color: active ? '#ff1494' : 'rgba(235, 242, 255, 0.78)',
                fontWeight: 900,
                fontSize: 13,
                textTransform: 'uppercase',
                borderRadius: 0,
                '&:after': active
                  ? {
                      content: '""',
                      position: 'absolute',
                      left: 18,
                      right: 18,
                      bottom: 0,
                      height: 4,
                      borderRadius: 999,
                      bgcolor: '#ff1494',
                      boxShadow: '0 0 16px rgba(236, 23, 153, 0.9)',
                    }
                  : undefined,
              }}
            >
              {tab.label}
            </Button>
          );
        })}
      </Stack>
    </Paper>
  );
}

function normalizeActiveTab(
  tab: string | undefined,
  content: ProfileScaffoldContent,
  mode: ProfileViewMode,
): string {
  const visibleTabs = content.tabs.filter(
    (item) =>
      mode === 'private' || (!item.privateOnly && item.publicHidden !== true),
  );
  const fallback =
    mode === 'public'
      ? visibleTabs.find((item) => item.value === 'profile')?.value ??
        visibleTabs[0]?.value ??
        'profile'
      : visibleTabs[0]?.value ?? 'overview';

  return visibleTabs.some((item) => item.value === tab)
    ? tab ?? fallback
    : fallback;
}

function getTabFromHash(content: ProfileScaffoldContent): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, '');

  return (
    content.tabs.find((tab) => tab.value === hash || tab.href === `#${hash}`)
      ?.value ?? null
  );
}

function ActiveProfilePanel({
  activeTab,
  content,
  editOptions,
  mode,
  profile,
  settings,
}: {
  activeTab: string;
  content: ProfileScaffoldContent;
  editOptions?: ProfileEditOptions;
  mode: ProfileViewMode;
  profile?: ProfileCardProfile;
  settings?: SettingsCardSettings;
}): React.ReactElement {
  const [editableProfile, setEditableProfile] = React.useState(profile);
  const [editableSettings, setEditableSettings] = React.useState(settings);
  const [editOpen, setEditOpen] = React.useState(false);
  const [settingsEditOpen, setSettingsEditOpen] = React.useState(false);

  React.useEffect(() => {
    setEditableProfile(profile);
  }, [profile]);

  React.useEffect(() => {
    setEditableSettings(settings);
  }, [settings]);

  const handleSave = React.useCallback(
    async (updates: Partial<ProfileCardProfile>): Promise<void> => {
      if (!editableProfile) {
        return;
      }

      const response = await fetch(
        `/api/V1/users/${encodeURIComponent(
          editableProfile.username ?? editableProfile.handle,
        )}/profile`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        },
      );

      if (!response.ok) {
        throw new Error('Unable to update profile.');
      }

      const body = (await response.json()) as {
        ok: boolean;
        data?: ProfileCardProfile;
      };

      if (!body.ok || !body.data) {
        throw new Error('Invalid profile update response.');
      }

      setEditableProfile(body.data);
    },
    [editableProfile],
  );

  const handleSettingsSave = React.useCallback(
    async (updates: SettingsCardUpdates): Promise<void> => {
      if (!editableSettings) {
        return;
      }

      const response = await fetch(
        `/api/V1/users/${encodeURIComponent(
          editableSettings.username,
        )}/settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        },
      );

      if (!response.ok) {
        throw new Error('Unable to update settings.');
      }

      const body = (await response.json()) as {
        ok: boolean;
        data?: SettingsCardSettings;
      };

      if (!body.ok || !body.data) {
        throw new Error('Invalid settings update response.');
      }

      setEditableSettings(body.data);
      setSettingsEditOpen(false);
    },
    [editableSettings],
  );

  switch (activeTab) {
    case 'profile':
      return editableProfile ? (
        <>
          <ProfileCard
            profile={editableProfile}
            viewerAccess={mode === 'private' ? 'owner' : 'public'}
            showPreferences={mode === 'private'}
            showPrivateFields={mode === 'private'}
            showSensitiveFields={mode === 'private'}
            variant="detailed"
            onEdit={mode === 'private' ? () => setEditOpen(true) : undefined}
            editing={editOpen}
            editor={
              mode === 'private' ? (
                <ProfileEditDialog
                  onClose={() => setEditOpen(false)}
                  onSave={handleSave}
                  open={editOpen}
                  options={editOptions}
                  profile={editableProfile}
                />
              ) : null
            }
          />
        </>
      ) : (
        <ProfileOverviewCard />
      );
    case 'recent-activity':
      return <ProfileRecentActivityCard />;
    case 'projects':
      return <ProfileProjectsCard />;
    case 'models':
      return <ProfileModelsCard />;
    case 'connections':
      return mode === 'private' ? (
        <ProfileConnectionsCard categories={content.connectionCategories} />
      ) : (
        <ProfileOverviewCard />
      );
    case 'integrations':
      return mode === 'private' ? (
        <ProfileIntegrationsCard />
      ) : (
        <ProfileOverviewCard />
      );
    case 'settings':
      return mode === 'private' && editableSettings ? (
        <SettingsCard
          settings={editableSettings}
          editing={settingsEditOpen}
          onEdit={() => setSettingsEditOpen(true)}
          onCancel={() => setSettingsEditOpen(false)}
          onSave={handleSettingsSave}
        />
      ) : (
        <ProfileOverviewCard />
      );
    case 'achievements':
      return <ProfileAchievementsCard />;
    case 'overview':
      return <ProfileOverviewCard />;
    default:
      return mode === 'public' && editableProfile ? (
        <ProfileCard
          profile={editableProfile}
          viewerAccess="public"
          showPreferences={false}
          showPrivateFields={false}
          showSensitiveFields={false}
          variant="detailed"
        />
      ) : (
        <ProfileOverviewCard />
      );
  }
}

export function ProfilePage({
  content,
  editOptions,
  identity,
  profile,
  settings,
  activeTab = 'overview',
  mode = 'public',
  dashboardHref = '/dashboard',
}: ProfilePageProps): React.ReactElement {
  const [currentTab, setCurrentTab] = React.useState(() =>
    normalizeActiveTab(activeTab, content, mode),
  );

  React.useEffect(() => {
    const syncFromHash = (): void => {
      const hashTab = getTabFromHash(content);

      setCurrentTab(normalizeActiveTab(hashTab ?? activeTab, content, mode));
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);

    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [activeTab, content, mode]);

  const handleTabChange = React.useCallback(
    (value: string): void => {
      setCurrentTab(normalizeActiveTab(value, content, mode));
    },
    [content, mode],
  );

  return (
    <ProfileShell>
      <Box sx={{ display: { xs: 'block', lg: 'flex' } }}>
        {mode === 'private' ? (
          <ProfileLeftMenu
            identity={identity}
            items={content.sidebar}
            activeHref={`#${currentTab}`}
            mode={mode}
          />
        ) : null}

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            ml: { lg: mode === 'private' ? '292px' : 0 },
            p: { xs: 2, md: 3 },
            pl: { lg: mode === 'private' ? 4 : 3 },
            pb: 5,
          }}
        >
          <Container
            maxWidth={false}
            sx={{ maxWidth: 1550, px: { xs: 0, md: 1 } }}
          >
            <ProfileTopbar
              identity={identity}
              mode={mode}
              primaryAction={{
                label: 'Go to Dashboard',
                href: dashboardHref,
                icon: 'dashboard',
              }}
            />

            <ProfileTabs
              tabs={content.tabs}
              activeTab={currentTab}
              mode={mode}
              onTabChange={handleTabChange}
            />

            <Stack spacing={2} sx={{ mt: 1.5 }}>
              <ActiveProfilePanel
                activeTab={currentTab}
                content={content}
                editOptions={editOptions}
                mode={mode}
                profile={profile}
                settings={settings}
              />
            </Stack>
          </Container>
        </Box>
      </Box>
    </ProfileShell>
  );
}

export { ProfileAchievementsCard } from './achievements-card';
export { ProfileActivityCard } from './activity-card';
export { ProfileCard } from './profile-card';
export { ProfileConnectionsCard } from './connections-card';
export { ProfileFollowersCard } from './followers-card';
export { ProfileIcon } from './icons';
export { ProfileIntegrationsCard } from './integrations-card';
export { ProfileLeftMenu } from './left-menu';
export { ProfileModelsCard } from './models-card';
export { ProfileOverviewCard } from './overview-card';
export { ProfileTopbar } from './profile-topbar';
export { ProfileProjectsCard } from './projects-card';
export { ProfileRecentActivityCard } from './recent-activity-card';
export { SettingsCard } from './settings-card';
export { UserProfileMenu } from './user-profile-menu';

export type {
  ProfileCardFieldVisibility,
  ProfileCardLanguage,
  ProfileCardLinks,
  ProfileCardProfile,
  ProfileCardProps,
  ProfileCardVariant,
  ProfileCardViewerAccess,
} from './profile-card';
export type {
  SettingsCardProps,
  SettingsCardSettings,
  SettingsCardUpdates,
  SettingsSectionKey,
  SettingsSectionValue,
} from './settings-card';
export type {
  UserProfileMenuAction,
  UserProfileMenuProps,
  UserProfileMenuUser,
} from './user-profile-menu';

export type * from './types';

export default ProfilePage;
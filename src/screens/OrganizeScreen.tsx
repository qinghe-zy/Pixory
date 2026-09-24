import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { GlobalGroupsScreen } from './GlobalGroupsScreen';
import { TagsOverviewScreen } from './TagsOverviewScreen';

import { type OrganizeMode } from '../components/OrganizeShared';

interface OrganizeScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  footer?: ReactNode;
  onCreateFirstIp?: () => void;
  onCreateGroup?: (ipId: number) => void;
  onOpenCoverPicker: (ipId: number, groupId: number) => void;
  onEditGroup: (ipId: number, groupId: number) => void;
  onOpenGroup: (ipId: number, groupId: number) => void;
  onImportImagesToGroup?: (ipId: number, groupId: number) => void;
  onImportVideosToGroup?: (ipId: number, groupId: number) => void;
  onOpenTag: (tagId: number) => void;
}

export function OrganizeScreen({
  space = 'normal',
  refreshToken,
  footer,
  onCreateFirstIp,
  onCreateGroup,
  onOpenCoverPicker,
  onEditGroup,
  onOpenGroup,
  onImportImagesToGroup,
  onImportVideosToGroup,
  onOpenTag,
}: OrganizeScreenProps) {
  const [mode, setMode] = useState<OrganizeMode>('groups');

  if (mode === 'tags') {
    return (
      <TagsOverviewScreen
        footer={footer}
        onOpenTag={onOpenTag}
        refreshToken={refreshToken}
        space={space}
        mode={mode}
        onSelectMode={setMode}
      />
    );
  }

  return (
    <GlobalGroupsScreen
      footer={footer}
      onCreateFirstIp={onCreateFirstIp}
      onCreateGroup={onCreateGroup}
      onEditGroup={onEditGroup}
      onImportImagesToGroup={onImportImagesToGroup}
      onImportVideosToGroup={onImportVideosToGroup}
      onOpenCoverPicker={onOpenCoverPicker}
      onOpenGroup={onOpenGroup}
      refreshToken={refreshToken}
      space={space}
      mode={mode}
      onSelectMode={setMode}
    />
  );
}









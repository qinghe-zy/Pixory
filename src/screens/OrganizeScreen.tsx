import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PixorySpace } from '../database';
import { colors, radius, shadows, spacing, typography } from '../design/tokens';
import { GlobalGroupsScreen } from './GlobalGroupsScreen';
import { TagsOverviewScreen } from './TagsOverviewScreen';

type OrganizeMode = 'groups' | 'tags';

interface OrganizeScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  footer?: ReactNode;
  onCreateFirstIp?: () => void;
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
  onOpenCoverPicker,
  onEditGroup,
  onOpenGroup,
  onImportImagesToGroup,
  onImportVideosToGroup,
  onOpenTag,
}: OrganizeScreenProps) {
  const [mode, setMode] = useState<OrganizeMode>('groups');
  const [modeMenuVisible, setModeMenuVisible] = useState(false);
  const titleSlot = useMemo(
    () => (
      <OrganizeTitleDropdown
        mode={mode}
        onSelect={(nextMode) => {
          setMode(nextMode);
          setModeMenuVisible(false);
        }}
        onToggle={() => setModeMenuVisible((current) => !current)}
        visible={modeMenuVisible}
      />
    ),
    [mode, modeMenuVisible]
  );

  if (mode === 'tags') {
    return (
      <TagsOverviewScreen
        footer={footer}
        onOpenTag={onOpenTag}
        refreshToken={refreshToken}
        space={space}
        titleSlot={titleSlot}
      />
    );
  }

  return (
    <GlobalGroupsScreen
      footer={footer}
      onCreateFirstIp={onCreateFirstIp}
      onEditGroup={onEditGroup}
      onImportImagesToGroup={onImportImagesToGroup}
      onImportVideosToGroup={onImportVideosToGroup}
      onOpenCoverPicker={onOpenCoverPicker}
      onOpenGroup={onOpenGroup}
      refreshToken={refreshToken}
      space={space}
      titleSlot={titleSlot}
    />
  );
}

function OrganizeTitleDropdown({
  mode,
  visible,
  onToggle,
  onSelect,
}: {
  mode: OrganizeMode;
  visible: boolean;
  onToggle: () => void;
  onSelect: (mode: OrganizeMode) => void;
}) {
  const label = mode === 'groups' ? '分组' : '标签';

  return (
    <View style={styles.titleMenuRoot}>
      <Pressable
        accessibilityLabel="切换整理页面"
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={styles.titleText}>
          {label}
        </Text>
        <View style={styles.chevronWrap}>
          <Ionicons color={colors.text.secondary} name={visible ? 'chevron-up' : 'chevron-down'} size={13} />
        </View>
      </Pressable>
      {visible ? (
        <View style={styles.dropdown}>
          <DropdownButton active={mode === 'groups'} label="分组" onPress={() => onSelect('groups')} />
          <DropdownButton active={mode === 'tags'} label="标签" onPress={() => onSelect('tags')} />
        </View>
      ) : null}
    </View>
  );
}

function DropdownButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.dropdownButton, active ? styles.dropdownButtonActive : null, pressed && styles.pressed]}
    >
      <Text style={[styles.dropdownText, active ? styles.dropdownTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleMenuRoot: {
    alignSelf: 'flex-start',
    zIndex: 20,
  },
  titleButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing[1.5],
  },
  titleText: {
    ...typography.textStyles.navTitle,
  },
  chevronWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderRadius: 999,
    height: 18,
    justifyContent: 'center',
    marginTop: 2,
    width: 18,
  },
  dropdown: {
    ...shadows.floating,
    alignSelf: 'flex-start',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    minWidth: 118,
    marginTop: spacing[2],
    padding: spacing[1],
    zIndex: 30,
  },
  dropdownButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    minHeight: 38,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
  },
  dropdownButtonActive: {
    backgroundColor: colors.primary.weak,
  },
  dropdownText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.body,
  },
  dropdownTextActive: {
    color: colors.primary.active,
  },
  pressed: {
    opacity: 0.8,
  },
});

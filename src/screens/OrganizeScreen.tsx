import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';

import type { PixorySpace } from '../database';
import { colors, radius, shadows, spacing, typography } from '../design/tokens';
import { GlobalGroupsScreen } from './GlobalGroupsScreen';
import { TagsOverviewScreen } from './TagsOverviewScreen';
import { LiquidGlassBezel } from '../components/LiquidGlassBezel';

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
  const titleSlot = useMemo(
    () => <OrganizeSegmentedControl mode={mode} onSelect={setMode} />,
    [mode]
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

import { MagneticLiquidContainer } from '../components/MagneticLiquidContainer';

function OrganizeSegmentedControl({
  mode,
  onSelect,
}: {
  mode: OrganizeMode;
  onSelect: (mode: OrganizeMode) => void;
}) {
  return (
    <MagneticLiquidContainer
      damping={16} 
      magneticStrength={0.15} 
      stiffness={400} 
      stretchFactor={0.001}
      maxScale={1.02}
      maxTranslation={10}
      style={styles.segmentRoot}
    >
      <BlurView intensity={50} style={styles.segmentBlur} tint="light">
        <LiquidGlassBezel radius={16} />
        <View style={styles.segmentInner}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelect('groups')}
            style={styles.segmentBtn}
          >
            {mode === 'groups' && <View style={[StyleSheet.absoluteFill, styles.segmentActiveBg]} />}
            <Text style={[styles.segmentText, mode === 'groups' && styles.segmentTextActive]}>分组</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSelect('tags')}
            style={styles.segmentBtn}
          >
            {mode === 'tags' && <View style={[StyleSheet.absoluteFill, styles.segmentActiveBg]} />}
            <Text style={[styles.segmentText, mode === 'tags' && styles.segmentTextActive]}>标签</Text>
          </Pressable>
        </View>
      </BlurView>
    </MagneticLiquidContainer>
  );
}

const styles = StyleSheet.create({
  segmentRoot: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.1,
    borderRadius: 16,
    height: 32,
    alignSelf: 'flex-start',
  },
  segmentBlur: {
    borderRadius: 16,
    flex: 1,
    overflow: 'hidden',
  },
  segmentInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2,
    flex: 1,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    borderRadius: 14,
    minWidth: 54,
  },
  segmentActiveBg: {
    backgroundColor: colors.background.surface,
    borderRadius: 14,
    ...shadows.sm,
    shadowOpacity: 0.05,
  },
  segmentText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.secondary,
    fontSize: 14,
  },
  segmentTextActive: {
    color: colors.text.title,
  },
});

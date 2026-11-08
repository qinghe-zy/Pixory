import React, { useMemo, useCallback, memo } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { PixorySpace } from '../../database';
import type { AiRoleCardRecord } from '../../ai/types';
import { SecureImage } from '../SecureImage';
import { LiquidGlassBezel } from '../LiquidGlassBezel';
import { aiLightColors } from './aiLightTheme';
import { colors, metrics, radius, rhythm, spacing, typography } from '../../design/tokens';

export interface RoleShortcutItem {
  avatarUri: string;
  name: string;
  roleCardId: string;
}

export type RoleShortcut = RoleShortcutItem;

const roleCardCache: Partial<Record<PixorySpace, AiRoleCardRecord[]>> = {};

export function getCachedRoleCards(space: PixorySpace): AiRoleCardRecord[] {
  return roleCardCache[space] ?? [];
}

export function setCachedRoleCards(space: PixorySpace, cards: AiRoleCardRecord[]): void {
  roleCardCache[space] = cards;
}

export function buildRoleLibraryShortcuts(roleCards: AiRoleCardRecord[]): RoleShortcutItem[] {
  return roleCards
    .filter((roleCard): roleCard is AiRoleCardRecord & { avatarUri: string } => Boolean(roleCard.avatarUri))
    .map((roleCard) => ({
      avatarUri: roleCard.avatarUri,
      name: roleCard.name,
      roleCardId: roleCard.id,
    }));
}

export interface AiRoleCardRailProps {
  space: PixorySpace;
  roleCards?: AiRoleCardRecord[];
  shortcuts?: RoleShortcutItem[];
  onSelectRole: (roleCardId: string) => void;
  onOpenRoleLibrary?: () => void;
  onCreateRole?: () => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  emptyHintText?: string;
  showLibraryButton?: boolean;
  pullProgress?: SharedValue<number>;
}

interface RoleShortcutCardProps {
  index: number;
  totalCount: number;
  pullProgress?: SharedValue<number>;
  role: RoleShortcutItem;
  space: PixorySpace;
  onSelectRole: (roleCardId: string) => void;
}

const RoleShortcutCard = memo(function RoleShortcutCard({
  index,
  totalCount,
  pullProgress,
  role,
  space,
  onSelectRole,
}: RoleShortcutCardProps) {
  // 水滴表面张力正弦权值预先计算，避免每一帧在 UI 线程重复进行三角函数求值
  const normalizedPos = totalCount > 1 ? index / (totalCount - 1) : 0.5;
  const sineFactor = Math.sin(normalizedPos * Math.PI);

  const waveAnimatedStyle = useAnimatedStyle(() => {
    if (!pullProgress) return {};
    const p = pullProgress.value;
    // 水滴表面张力波浪落差：下拉中段 (p 从 0 到 0.65) 中间卡片因重力微沉产生正弦弧线，临界吸附 (p 接近 1.0) 抚平归零
    const intensity = interpolate(p, [0, 0.48, 1], [0, 4.5, 0], Extrapolation.CLAMP);
    const waveDip = sineFactor * intensity;
    return {
      transform: [{ translateY: waveDip }],
    };
  }, [pullProgress, sineFactor]);

  const handlePress = useCallback(() => {
    onSelectRole(role.roleCardId);
  }, [onSelectRole, role.roleCardId]);

  return (
    <Animated.View style={waveAnimatedStyle}>
      <Pressable
        accessibilityLabel={`角色 ${role.name}`}
        accessibilityRole="button"
        onPress={handlePress}
        style={({ pressed }) => [styles.roleShortcut, pressed && styles.pressed]}
      >
        <View style={styles.roleAvatarContainer}>
          <SecureImage
            contentFit="cover"
            space={space}
            style={styles.roleAvatarImage}
            uri={role.avatarUri}
          />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: radius.sm, overflow: 'hidden' }]}
          >
            <LiquidGlassBezel contentIntensity="none" radius={radius.sm} />
          </View>
        </View>
        <Text numberOfLines={1} style={styles.roleName}>
          {role.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

/**
 * 角色卡横向滚动轨道 (可复用于长聊首页、伴聊下拉抽屉等)
 * - 紧凑横滑，支持 48x48 液态玻璃头像边框、微质感阴影与单行角色名
 * - 支持水滴表面张力波浪涟漪形变联动 (pullProgress)
 * - 右侧常驻“角色库”快捷按钮
 */
export const AiRoleCardRail = memo(function AiRoleCardRail({
  space,
  roleCards,
  shortcuts,
  onSelectRole,
  onOpenRoleLibrary,
  onCreateRole,
  style,
  contentContainerStyle,
  emptyHintText = '有头像的角色会显示在这里',
  showLibraryButton = true,
  pullProgress,
}: AiRoleCardRailProps) {
  const roleShortcuts = useMemo(() => {
    if (shortcuts) return shortcuts;
    if (roleCards) return buildRoleLibraryShortcuts(roleCards);
    return [];
  }, [roleCards, shortcuts]);

  return (
    <View style={[styles.roleRailWrap, style]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.roleRailScroll}
        contentContainerStyle={[styles.roleRailContent, contentContainerStyle]}
      >
        {roleShortcuts.length ? (
          roleShortcuts.map((role, idx) => (
            <RoleShortcutCard
              index={idx}
              key={role.roleCardId}
              onSelectRole={onSelectRole}
              pullProgress={pullProgress}
              role={role}
              space={space}
              totalCount={roleShortcuts.length}
            />
          ))
        ) : (
          <View style={styles.emptyRailRow}>
            {/* 左侧：黑白质感头像框同形添加按钮 */}
            <Pressable
              accessibilityLabel="添加伴侣角色"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={onCreateRole || onOpenRoleLibrary}
              style={({ pressed }) => [styles.addShortcutItem, pressed && styles.pressed]}
            >
              <View style={styles.addAvatarBox}>
                <Ionicons color="#111827" name="add" size={20} />
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <LiquidGlassBezel contentIntensity="none" radius={radius.sm} />
                </View>
              </View>
              <Text style={styles.addShortcutLabel}>添加</Text>
            </Pressable>

            {/* 右侧：独立白底专业指引卡片 */}
            <Pressable
              accessibilityLabel="快捷伴聊栏说明"
              accessibilityRole="button"
              onPress={onOpenRoleLibrary}
              style={({ pressed }) => [styles.guideCard, pressed && styles.pressed]}
            >
              <View style={styles.guideTextWrap}>
                <Text style={styles.guideTitle}>快捷伴聊栏</Text>
                <Text style={styles.guideSubtitle}>轻触左侧添加伴侣角色，常驻抽屉一键即聊</Text>
              </View>
              <Ionicons color="#9CA3AF" name="chevron-forward" size={14} style={{ marginLeft: 6 }} />
            </Pressable>
          </View>
        )}
      </ScrollView>
      {showLibraryButton && onOpenRoleLibrary && roleShortcuts.length > 0 ? (
        <Pressable
          accessibilityLabel="打开角色库"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onOpenRoleLibrary}
          style={({ pressed }) => [styles.roleLibraryButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.text.secondary} name="ellipsis-vertical" size={20} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  roleRailWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  roleRailScroll: {
    flex: 1,
  },
  roleRailContent: {
    gap: rhythm.inlineGap,
    paddingRight: spacing[1],
    paddingHorizontal: spacing[2],
  },
  roleShortcut: {
    alignItems: 'center',
    gap: rhythm.microGap,
    width: 54,
  },
  roleAvatarContainer: {
    borderRadius: radius.sm,
    backgroundColor: colors.background.empty,
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.06,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  roleAvatarImage: {
    borderRadius: radius.sm,
    height: 48,
    width: 48,
  },
  roleName: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    maxWidth: 54,
    textAlign: 'center',
  },
  emptyRailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: 2,
  },
  addShortcutItem: {
    alignItems: 'center',
    gap: rhythm.microGap,
    width: 50,
  },
  addAvatarBox: {
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 0, 0, 0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  addShortcutLabel: {
    ...typography.textStyles.micro,
    fontSize: 10,
    color: colors.text.secondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  guideTextWrap: {
    justifyContent: 'center',
  },
  guideTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  guideSubtitle: {
    fontSize: 11,
    color: '#6B7280',
  },
  emptyRoleHint: {
    alignItems: 'center',
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 46,
    paddingHorizontal: spacing[3],
  },
  emptyRoleText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  roleLibraryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    width: 32,
  },
  pressed: {
    opacity: 0.78,
  },
});

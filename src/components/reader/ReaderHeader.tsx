import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DocumentFormat, DocumentLayoutMode, HtmlViewMode } from '../../ai/readers/readerTypes';
import { metrics, radius, spacing, typography } from '../../design/tokens';
import { aiLightColors, aiLightDisplayFont } from '../ai/aiLightTheme';

interface ReaderHeaderProps {
  title: string;
  format?: DocumentFormat;
  progressPercent?: number;
  hasToc?: boolean;
  htmlViewMode?: HtmlViewMode;
  onToggleHtmlViewMode?: (mode: HtmlViewMode) => void;
  layoutMode?: DocumentLayoutMode;
  onToggleLayoutMode?: (mode: DocumentLayoutMode) => void;
  onPlayPresentation?: () => void;
  onBack: () => void;
  onToggleSearch: () => void;
  onToggleToc: () => void;
  onTogglePreferences: () => void;
  onMoreOptions?: () => void;
}

export const ReaderHeader: React.FC<ReaderHeaderProps> = ({
  title,
  format,
  progressPercent: _progressPercent,
  hasToc,
  htmlViewMode,
  onToggleHtmlViewMode,
  layoutMode: _layoutMode,
  onToggleLayoutMode: _onToggleLayoutMode,
  onPlayPresentation,
  onBack,
  onToggleSearch,
  onToggleToc,
  onTogglePreferences,
  onMoreOptions,
}) => {
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;

  return (
    <View style={[styles.header, { paddingTop: statusBarHeight + spacing[2] }]}>
      <Pressable
        accessibilityLabel="返回"
        accessibilityRole="button"
        hitSlop={spacing[1]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onBack();
        }}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Ionicons color={aiLightColors.ink} name="chevron-back" size={22} />
      </Pressable>

      <View style={styles.titleContainer}>
        <Text ellipsizeMode="tail" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>

      <View style={styles.actionsRow}>
        {/* HTML Dual-Mode Micro Segmented Control: [▶ 预览 | </> 源码] */}
        {format === 'html' && onToggleHtmlViewMode ? (
          <View style={styles.segmentedControl}>
            <Pressable
              accessibilityLabel="预览视图"
              accessibilityRole="tab"
              hitSlop={spacing[1]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleHtmlViewMode('preview');
              }}
              style={[styles.segmentTab, htmlViewMode === 'preview' && styles.segmentTabActive]}
            >
              <Ionicons
                color={htmlViewMode === 'preview' ? aiLightColors.ink : aiLightColors.muted}
                name="play-outline"
                size={12}
              />
              <Text
                style={[
                  styles.segmentTabText,
                  htmlViewMode === 'preview' && styles.segmentTabTextActive,
                ]}
              >
                预览
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="源码视图"
              accessibilityRole="tab"
              hitSlop={spacing[1]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleHtmlViewMode('source');
              }}
              style={[styles.segmentTab, htmlViewMode === 'source' && styles.segmentTabActive]}
            >
              <Ionicons
                color={htmlViewMode === 'source' ? aiLightColors.ink : aiLightColors.muted}
                name="code-slash-outline"
                size={12}
              />
              <Text
                style={[
                  styles.segmentTabText,
                  htmlViewMode === 'source' && styles.segmentTabTextActive,
                ]}
              >
                源码
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* PPTX Presentation Play Button: 放映 */}
        {format === 'pptx' && onPlayPresentation ? (
          <Pressable
            accessibilityLabel="全屏放映"
            accessibilityRole="button"
            hitSlop={spacing[1]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onPlayPresentation();
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons color={aiLightColors.ink} name="play-outline" size={20} />
          </Pressable>
        ) : null}

        <Pressable
          accessibilityLabel="全文搜索"
          accessibilityRole="button"
          hitSlop={spacing[1]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onToggleSearch();
          }}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.ink} name="search-outline" size={20} />
        </Pressable>

        {hasToc ? (
          <Pressable
            accessibilityLabel="目录大纲"
            accessibilityRole="button"
            hitSlop={spacing[1]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleToc();
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons color={aiLightColors.ink} name="list-outline" size={21} />
          </Pressable>
        ) : null}

        <Pressable
          accessibilityLabel="阅读偏好"
          accessibilityRole="button"
          hitSlop={spacing[1]}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onTogglePreferences();
          }}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.ink} name="text-outline" size={20} />
        </Pressable>

        {onMoreOptions ? (
          <Pressable
            accessibilityLabel="更多选项"
            accessibilityRole="button"
            hitSlop={spacing[1]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onMoreOptions();
            }}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons color={aiLightColors.ink} name="ellipsis-horizontal" size={20} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    left: 0,
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[3],
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  pressed: {
    backgroundColor: aiLightColors.userBubble,
    opacity: 0.72,
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: spacing[1],
    marginRight: spacing[2],
  },
  title: {
    ...typography.textStyles.navTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'left',
  },
  actionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  segmentedControl: {
    alignItems: 'center',
    backgroundColor: aiLightColors.userBubble,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginRight: spacing[1],
    padding: 2,
  },
  segmentTab: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
  },
  segmentTabText: {
    color: aiLightColors.muted,
    fontSize: 11,
    fontWeight: '500',
  },
  segmentTabTextActive: {
    color: aiLightColors.ink,
    fontWeight: '600',
  },
});

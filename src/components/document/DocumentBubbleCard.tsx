import React, { memo, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export type DocumentCardStatus = 'streaming' | 'compiling' | 'ready';

export interface DocumentBubbleCardProps {
  title: string;
  sizeBytes?: number;
  charCount?: number;
  status?: DocumentCardStatus;
  latestHeading?: string;
  outlineChips?: string[];
  diffSummary?: string;
  hasRevisions?: boolean;
  isDerived?: boolean;
  versionLabel?: string;
  onPress?: () => void;
  onShare?: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
}

interface FormatMeta {
  extLabel: string;
  badgeGradientStart: string;
  badgeGradientEnd: string;
  iconName: keyof typeof Ionicons.glyphMap;
  accentColor: string;
}

function resolveFormatMeta(title: string): FormatMeta {
  const lower = title.toLowerCase();
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    return {
      extLabel: 'DOCX',
      badgeGradientStart: '#2B579A',
      badgeGradientEnd: '#1B365D',
      iconName: 'document-text',
      accentColor: '#1D4ED8',
    };
  }
  if (lower.endsWith('.pdf')) {
    return {
      extLabel: 'PDF',
      badgeGradientStart: '#D9381E',
      badgeGradientEnd: '#A31F0A',
      iconName: 'reader',
      accentColor: '#B91C1C',
    };
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return {
      extLabel: 'MD',
      badgeGradientStart: '#087EA4',
      badgeGradientEnd: '#0E5C77',
      iconName: 'code-slash',
      accentColor: '#087EA4',
    };
  }
  return {
    extLabel: 'TXT',
    badgeGradientStart: '#4A5568',
    badgeGradientEnd: '#2D3748',
    iconName: 'document-outline',
    accentColor: '#475569',
  };
}

/**
 * 智能文件名中间截断（Truncate-Middle）
 * 严格保留头部前 14 个字符与尾部含扩展名的后 8 个字符，杜绝扩展名丢失
 */
export function truncateMiddle(filename: string, maxHead = 14, maxTail = 8): string {
  if (!filename || filename.length <= maxHead + maxTail + 3) {
    return filename;
  }
  const head = filename.slice(0, maxHead);
  const tail = filename.slice(-maxTail);
  return `${head}...${tail}`;
}

function formatByteSize(bytes?: number, chars?: number): string {
  if (typeof bytes === 'number' && !Number.isNaN(bytes) && bytes > 0) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (typeof chars === 'number' && !Number.isNaN(chars) && chars > 0) {
    return `${chars.toLocaleString()} 字`;
  }
  return '轻量文档';
}

function estimateReadingTime(sizeBytes?: number, charCount?: number): string {
  const chars = (typeof charCount === 'number' && !Number.isNaN(charCount) && charCount > 0)
    ? charCount
    : (typeof sizeBytes === 'number' && !Number.isNaN(sizeBytes) && sizeBytes > 0)
    ? Math.round(sizeBytes / 2)
    : 800;
  const minutes = Math.max(1, Math.ceil(chars / 400));
  return `约 ${minutes} 分钟`;
}

export const DocumentBubbleCard = memo(function DocumentBubbleCard({
  title,
  sizeBytes,
  charCount,
  status = 'ready',
  latestHeading,
  outlineChips,
  diffSummary,
  hasRevisions,
  isDerived,
  versionLabel,
  onPress,
  onShare,
  onLongPress,
  accessibilityHint,
}: DocumentBubbleCardProps) {
  const formatMeta = resolveFormatMeta(title);
  const isBusy = status === 'streaming' || status === 'compiling';

  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    if (isBusy) {
      pulseOpacity.value = withRepeat(
        withTiming(0.42, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseOpacity.value = 1;
    }
  }, [isBusy, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const resolvedVersion = versionLabel
    ? versionLabel
    : isDerived
    ? 'v2 派生'
    : hasRevisions
    ? '已修订'
    : 'v1 原件';

  const isDerivedOrRevised = isDerived || hasRevisions || (versionLabel && !versionLabel.includes('v1'));

  // 默认提取的概览标签（若外部未提供，则尝试用文件名与默认词填充）
  const chipsToRender = outlineChips && outlineChips.length > 0
    ? outlineChips.slice(0, 3)
    : [];

  return (
    <Pressable
      accessibilityHint={accessibilityHint || '轻触打开文档预览，点击即开即读'}
      accessibilityLabel={`文档卡片：${title}`}
      accessibilityRole="button"
      disabled={isBusy}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      {/* 顶部：格式主锚点徽标 + 文件名 + 版本状态胶囊 */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.formatBadge, { backgroundColor: formatMeta.badgeGradientStart }]}>
            <Ionicons color="#FFFFFF" name={formatMeta.iconName} size={12} style={styles.badgeIcon} />
            <Text maxFontSizeMultiplier={1.1} style={styles.formatText}>
              {formatMeta.extLabel}
            </Text>
          </View>
          <View style={styles.titleWrap}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
              style={styles.filenameText}
            >
              {truncateMiddle(title, 14, 8)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.versionPill,
            isDerivedOrRevised ? styles.versionPillDerived : styles.versionPillOriginal,
          ]}
        >
          <Text
            maxFontSizeMultiplier={1.1}
            style={[
              styles.versionPillText,
              isDerivedOrRevised ? styles.versionTextDerived : styles.versionTextOriginal,
            ]}
          >
            {resolvedVersion}
          </Text>
        </View>
      </View>

      {/* 底部：排版规格耗时 + 双快捷操作区 (紧凑纯横向排版，去除大片空白) */}
      <View style={styles.bottomRow}>
        {status === 'streaming' ? (
          <Animated.View style={[styles.streamingWrap, pulseStyle]}>
            <View style={styles.statusDotLive} />
            <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={styles.streamingStatusTitle}>
              正在撰写... 已生成 {charCount ? charCount.toLocaleString() : 0} 字
            </Text>
          </Animated.View>
        ) : status === 'compiling' ? (
          <View style={styles.compilingWrap}>
            <Ionicons color="#2563EB" name="sync-outline" size={12} style={styles.spinIcon} />
            <Text maxFontSizeMultiplier={1.1} style={styles.compilingText}>
              正在烘焙排版为 {formatMeta.extLabel}...
            </Text>
          </View>
        ) : (
          <View style={styles.metaBlock}>
            <Text maxFontSizeMultiplier={1.1} style={styles.metaText}>
              {formatByteSize(sizeBytes, charCount)} · {estimateReadingTime(sizeBytes, charCount)}
            </Text>
            {diffSummary ? (
              <View style={styles.inlineDiffBadge}>
                <Ionicons color="#15803D" name="git-commit-outline" size={10} style={{ marginRight: 2 }} />
                <Text numberOfLines={1} style={styles.inlineDiffText}>
                  {diffSummary}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {!isBusy && (
          <View style={styles.actionButtonsRow}>
            {onShare ? (
              <Pressable
                accessibilityLabel="分享文档"
                accessibilityRole="button"
                disabled={isBusy}
                hitSlop={8}
                onPress={onShare}
                style={({ pressed }) => [
                  styles.shareBtn,
                  isBusy && styles.btnDisabled,
                  pressed && !isBusy && styles.btnPressed,
                ]}
              >
                <Ionicons color="#475569" name="share-outline" size={12} style={styles.btnIconMargin} />
                <Text maxFontSizeMultiplier={1.1} style={styles.shareBtnText}>
                  分享
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityLabel="预览文档"
              accessibilityRole="button"
              disabled={isBusy}
              hitSlop={8}
              onPress={onPress}
              style={({ pressed }) => [
                styles.previewBtn,
                { backgroundColor: formatMeta.badgeGradientStart },
                isBusy && styles.btnDisabled,
                pressed && !isBusy && styles.btnPressed,
              ]}
            >
              <Ionicons color="#FFFFFF" name="eye-outline" size={12} style={styles.btnIconMargin} />
              <Text maxFontSizeMultiplier={1.1} style={styles.previewBtnText}>
                预览
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    // 整体比例对标伴侣日记卡片：纯横向胶囊排版 (~2.5:1)，紧凑无大片空白，圆角柔和
    width: 292,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  pressed: {
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 6,
  },
  formatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  badgeIcon: {
    marginRight: 2.5,
  },
  formatText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  titleWrap: {
    flex: 1,
  },
  filenameText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  versionPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  versionPillOriginal: {
    backgroundColor: '#F1F5F9',
  },
  versionPillDerived: {
    backgroundColor: '#F3E8FF',
  },
  versionPillText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  versionTextOriginal: {
    color: '#64748B',
  },
  versionTextDerived: {
    color: '#7E22CE',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  streamingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
    marginRight: 6,
  },
  streamingStatusTitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#2563EB',
  },
  compilingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  spinIcon: {
    marginRight: 4,
  },
  compilingText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '500',
  },
  metaBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 6,
  },
  metaText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontVariant: ['tabular-nums'],
  },
  inlineDiffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  inlineDiffText: {
    fontSize: 9.5,
    color: '#15803D',
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    minHeight: 26,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  shareBtnText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#475569',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    minHeight: 26,
    borderRadius: 6,
  },
  previewBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnIconMargin: {
    marginRight: 3,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.75,
  },
});

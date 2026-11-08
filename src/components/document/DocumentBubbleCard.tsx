import React, { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  formatWeChatFileSize,
  resolveWeChatFileTypeStyle,
  truncateFileNameMiddle,
} from './fileTypeResolver';
import { WeChatFileIcon } from './WeChatFileIcon';

export { truncateFileNameMiddle as truncateMiddle } from './fileTypeResolver';

export type DocumentCardStatus = 'streaming' | 'compiling' | 'ready';

export interface DocumentBubbleCardProps {
  title: string;
  sizeBytes?: number;
  charCount?: number;
  pageCount?: number;
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

/**
 * 独立的流式生成状态指示器组件
 * 遵循 react-best-practices: 将动画 sharedValue 严格隔离在动态分支，杜绝静态历史消息的空转开销
 */
const DocumentGeneratingStatus = memo(function DocumentGeneratingStatus({
  status,
  dotColor,
}: {
  status: 'streaming' | 'compiling';
  dotColor: string;
}) {
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.35, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      pulseOpacity.value = 1;
    };
  }, [pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <Animated.View style={[styles.busyRow, pulseStyle]}>
      <View style={[styles.busyDot, { backgroundColor: dotColor }]} />
      <Text allowFontScaling maxFontSizeMultiplier={1.15} style={styles.sizeText}>
        {status === 'streaming' ? '正在生成...' : '正在处理...'}
      </Text>
    </Animated.View>
  );
});

/**
 * DocumentBubbleCard — 微信原生极简文档消息卡片 (1:1 像素级复刻)
 *
 * 严格按照原型 "docs/文件卡片/code.html" 与 "screen.png" 实现:
 * - 尺寸与外壳: 宽度固定 265px，最小高度 78px，圆角 5px，纯白底色 (#FFFFFF)
 * - 阴影与微边框: box-shadow: 0 1px 2px rgba(0,0,0,0.04) + hairlineWidth 微边框
 * - 左侧文字列: 标题 15px #111111，行高 1.3，最多 2 行 (智能中位截断保留后缀)；文件大小 12px #8E8E93 (mt: 8)
 * - 右侧矢量折角图标: 42x52px 矢量折角切口 + 翻折三角底片 + 原生系统粗体大字
 */
export const DocumentBubbleCard = memo(function DocumentBubbleCard({
  title,
  sizeBytes,
  charCount,
  status = 'ready',
  onPress,
  onLongPress,
  accessibilityHint,
}: DocumentBubbleCardProps) {
  const isBusy = status === 'streaming' || status === 'compiling';

  // 清洗标题中的换行制表符并容错兜底
  const cleanTitle = useMemo(() => {
    return (title || '').replace(/[\r\n\t]+/g, ' ').trim() || '未命名文档';
  }, [title]);

  const fileStyle = useMemo(() => resolveWeChatFileTypeStyle(cleanTitle), [cleanTitle]);
  const displayTitle = useMemo(() => truncateFileNameMiddle(cleanTitle, 14, 8), [cleanTitle]);
  const sizeText = useMemo(() => formatWeChatFileSize(sizeBytes, charCount), [sizeBytes, charCount]);

  return (
    <Pressable
      accessibilityHint={accessibilityHint || '轻触打开文档预览'}
      accessibilityLabel={`文档：${cleanTitle}，大小：${sizeText}`}
      accessibilityRole="button"
      delayLongPress={260}
      disabled={isBusy}
      hitSlop={4}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.cardContainer, pressed && !isBusy && styles.cardPressed]}
    >
      {/* 左侧文字信息列 (stretch, 2行自适应, 上下对齐) */}
      <View style={styles.leftCol}>
        <Text
          allowFontScaling
          ellipsizeMode="middle"
          maxFontSizeMultiplier={1.2}
          numberOfLines={2}
          style={styles.filenameText}
        >
          {displayTitle}
        </Text>

        {isBusy ? (
          <DocumentGeneratingStatus
            dotColor={fileStyle.bgColor}
            status={status as 'streaming' | 'compiling'}
          />
        ) : (
          <Text allowFontScaling maxFontSizeMultiplier={1.15} style={styles.sizeText}>
            {sizeText}
          </Text>
        )}
      </View>

      {/* 右侧微信原生折角图标 (42x52px) */}
      <WeChatFileIcon styleConfig={fileStyle} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    // 微信原型标准: 宽 265px, 最小高 78px, 纯白底色, 圆角 5px
    width: 265,
    minHeight: 78,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    paddingLeft: 14,
    paddingTop: 14,
    paddingBottom: 14,
    paddingRight: 12, // p-3.5 pr-3
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 细致微信阴影
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  cardPressed: {
    backgroundColor: '#F5F5F5',
    opacity: 0.92,
  },
  leftCol: {
    flex: 1,
    paddingRight: 12,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  filenameText: {
    fontSize: 15,
    color: '#111111',
    lineHeight: 20, // 15px * 1.3
    fontWeight: '400',
    includeFontPadding: false,
  },
  sizeText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 8, // mt-2
    lineHeight: 14,
    fontWeight: '400',
    includeFontPadding: false,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  busyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
});

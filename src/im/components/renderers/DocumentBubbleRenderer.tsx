import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useImTheme } from '../../theme/ImThemeProvider';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';
import { ImBubbleBeak } from '../common/ImBubbleBeak';
import { SecureImage } from '../../../components/SecureImage';
import { DocumentBubbleCard } from '../../../components/document/DocumentBubbleCard';
import { exportDocumentToShare } from '../../utils/documentExport';

/**
 * DocumentBubbleRenderer 微信经典极简文档消息卡片渲染器
 *
 * 核心机制:
 * 1. 采用 DocumentBubbleCard (黄金比例 0~4px 实体工件胶囊排版);
 * 2. 格式主锚点渐变色标 + 智能中间截断 + 目录微透出 Chips + 变动摘要行;
 * 3. 极速双触发: 主按钮「预览」即开即读，次按钮「分享」直调系统 Share Sheet。
 */
const MemoizedDocumentBubbleRenderer = React.memo(function DocumentBubbleRendererImpl({
  message,
  companionAvatarUri,
  companionName = '角色',
  userAvatarUri,
  onLongPressMessage,
  onOpenDocument,
  onRetryMessage,
  onNudge,
  onNudgeSelf,
  space = 'normal',
}: BubbleRendererProps) {
  const theme = useImTheme();
  const isUser = message.role === 'user';
  const lastAvatarTapRef = React.useRef(0);
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -5, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 5, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -4, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };

  const handleAvatarPress = () => {
    const now = Date.now();
    if (now - lastAvatarTapRef.current < 320) {
      triggerShake();
      if (isUser) {
        onNudgeSelf?.();
      } else {
        onNudge?.();
      }
      lastAvatarTapRef.current = 0;
    } else {
      lastAvatarTapRef.current = now;
    }
  };

  // 解析文档元数据
  const docMeta = message.metadata?.document || message.metadata || {};
  const docUri = docMeta.casUri || docMeta.uri || docMeta.documentUri || '';
  let fallbackTitle = '未命名文档';
  if (typeof message.content === 'string' && message.content.trim()) {
    const trimmed = message.content.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.title) fallbackTitle = parsed.title;
        else if (parsed?.document?.title) fallbackTitle = parsed.document.title;
      } catch {
        // 忽略非标准 JSON
      }
    } else {
      fallbackTitle = trimmed;
    }
  }
  const docTitle = docMeta.title || fallbackTitle;
  const lowerDocTitle = docTitle.toLowerCase();
  const lowerDocUri = docUri.toLowerCase();
  const isDocx = lowerDocTitle.endsWith('.docx') || lowerDocTitle.endsWith('.doc') || lowerDocUri.endsWith('.docx') || lowerDocUri.endsWith('.doc');
  const isPptx = lowerDocTitle.endsWith('.pptx') || lowerDocTitle.endsWith('.ppt') || lowerDocUri.endsWith('.pptx') || lowerDocUri.endsWith('.ppt');
  const isPdf = lowerDocTitle.endsWith('.pdf') || lowerDocUri.endsWith('.pdf');
  const rawContent: string | Uint8Array | undefined =
    typeof docMeta.content === 'string' || docMeta.content instanceof Uint8Array
      ? docMeta.content
      : undefined;
  const hasRevisions = Boolean(docMeta.hasRevisions) || (typeof rawContent === 'string' && /<ins>|<del>|<w:ins>|<w:del>/i.test(rawContent));
  const isDerived = Boolean(docMeta.derivedFromMsgId);

  const outlineChips = Array.isArray(docMeta.tocSkeleton)
    ? docMeta.tocSkeleton.map((s: any) => s.previewText).filter(Boolean)
    : undefined;

  const resolveContentForView = (): string | Uint8Array | undefined => {
    // 若已有本地物理文件 URI (如 docx / pptx / pdf)，且无特殊修订文本，无需在 JS 主线程执行全量 base64 解码
    if (docUri && (isDocx || isPdf || isPptx) && !hasRevisions) {
      return undefined;
    }
    if (typeof rawContent === 'string' && rawContent.length > 0) {
      const isBinaryFormat = isDocx || isPdf || isPptx;
      if (isBinaryFormat) {
        try {
          const { toByteArray } = require('base64-js');
          return toByteArray(rawContent);
        } catch {
          return rawContent;
        }
      } else {
        try {
          const { toByteArray } = require('base64-js');
          const bytes = toByteArray(rawContent);
          const decoder = new TextDecoder('utf-8');
          return decoder.decode(bytes);
        } catch {
          return rawContent;
        }
      }
    }
    return rawContent as Uint8Array | undefined;
  };

  const resolveUsableUriAsync = async (): Promise<string> => {
    const primary = docMeta.casUri;
    const secondary = docMeta.uri || docMeta.documentUri;

    if (primary) {
      try {
        const info = await FileSystem.getInfoAsync(primary);
        if (info.exists && typeof info.size === 'number' && info.size > 0) {
          return primary;
        }
      } catch {}
    }

    if (secondary) {
      try {
        const info = await FileSystem.getInfoAsync(secondary);
        if (info.exists && typeof info.size === 'number' && info.size > 0) {
          return secondary;
        }
      } catch {}
      return secondary;
    }

    return primary || '';
  };

  const handleCardPress = () => {
    void (async () => {
      const bestUri = await resolveUsableUriAsync();
      const resolvedContent = resolveContentForView();
      onOpenDocument?.({
        uri: bestUri || docUri,
        title: docTitle,
        content: resolvedContent,
        mode: hasRevisions ? 'diff' : 'clean',
      });
    })();
  };

  const handleShare = () => {
    void (async () => {
      const bestUri = await resolveUsableUriAsync();
      const resolvedContent = resolveContentForView();
      void exportDocumentToShare({
        uri: bestUri || docUri,
        title: docTitle,
        content: resolvedContent,
      });
    })();
  };

  const handleLongPress = (event?: any) => {
    if (onLongPressMessage) {
      const pageX = event?.nativeEvent?.pageX ?? 0;
      const pageY = event?.nativeEvent?.pageY ?? 0;
      onLongPressMessage(message, pageX, pageY);
    }
  };

  return (
    <View style={[styles.rowWrap, { flexDirection: isUser ? 'row-reverse' : 'row', marginHorizontal: 12 }]}>
      {/* 头像区 */}
      <View
        style={[
          styles.avatarContainer,
          {
            width: theme.metrics.avatarSize,
            height: theme.metrics.avatarSize,
            borderRadius: theme.radii.avatarRadius,
          },
        ]}
      >
        {isUser ? (
          <Animated.View style={[styles.avatarPressable, { transform: [{ translateX: shakeAnim }] }]}>
            <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
              {userAvatarUri ? (
                <SecureImage space={space} style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]} uri={userAvatarUri} />
              ) : (
                <View style={[styles.userDefaultAvatar, { borderRadius: theme.radii.avatarRadius }]}>
                  <Text style={styles.userDefaultAvatarText}>我</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.avatarPressable, { transform: [{ translateX: shakeAnim }] }]}>
            <Pressable onPress={handleAvatarPress} style={styles.avatarPressable}>
              {companionAvatarUri ? (
                <SecureImage space={space} style={[styles.avatarImage, { borderRadius: theme.radii.avatarRadius }]} uri={companionAvatarUri} />
              ) : (
                <View style={[styles.companionDefaultAvatar, { borderRadius: theme.radii.avatarRadius }]}>
                  <Text style={styles.companionDefaultAvatarText}>{companionName.slice(0, 1)}</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        )}
      </View>

      {/* 气泡包裹区 */}
      <View
        style={[
          styles.bubbleWrap,
          {
            marginLeft: isUser ? 0 : theme.metrics.avatarToBubbleGap,
            marginRight: isUser ? theme.metrics.avatarToBubbleGap : 0,
          },
        ]}
      >
        <ImBubbleBeak customColor="#FFFFFF" direction={isUser ? 'right' : 'left'} offsetTop={14} />
        <DocumentBubbleCard
          accessibilityHint="轻触打开文档预览，点击即开即读"
          title={docTitle}
          sizeBytes={docMeta.sizeBytes ?? docMeta.size}
          charCount={docMeta.charCount ?? (!isDocx && !isPdf && typeof rawContent === 'string' ? rawContent.length : undefined)}
          pageCount={docMeta.pageCount}
          hasRevisions={hasRevisions}
          isDerived={isDerived}
          outlineChips={outlineChips}
          onPress={handleCardPress}
          onShare={handleShare}
          onLongPress={handleLongPress as any}
        />
      </View>

      {/* 失败重试 */}
      {message.status === 'failed' && (
        <Pressable
          hitSlop={8}
          onPress={() => onRetryMessage?.(message)}
          style={{ justifyContent: 'center', alignSelf: 'center', marginHorizontal: 6 }}
        >
          <Ionicons color="#EF4444" name="alert-circle" size={20} />
        </Pressable>
      )}
    </View>
  );
});

export function DocumentBubbleRenderer(props: BubbleRendererProps) {
  return <MemoizedDocumentBubbleRenderer {...props} />;
}

const styles = StyleSheet.create({
  rowWrap: { alignItems: 'flex-start' },
  avatarContainer: {
    overflow: 'hidden',
    backgroundColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
  },
  avatarPressable: { width: '100%', height: '100%' },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  userDefaultAvatar: { width: '100%', height: '100%', backgroundColor: '#4B6B94', justifyContent: 'center', alignItems: 'center' },
  userDefaultAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  companionDefaultAvatar: { width: '100%', height: '100%', backgroundColor: '#006948', justifyContent: 'center', alignItems: 'center' },
  companionDefaultAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  bubbleWrap: { position: 'relative', justifyContent: 'flex-start' },
});

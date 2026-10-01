/**
 * AiChatNoKeyBanner
 *
 * 用户完成引导但未配置 API Key 时，在第一条 AI 回复下方出现的内联提示气泡。
 *
 * 设计规范：
 * - 内联渲染，不阻断用户操作
 * - 包含说明文字：提示用右滑打开右侧控制台，或点击按钮进入全局设置
 * - 黑白配色、4px 圆角矩形按钮 → 点击直接跳转左栏全局设置页
 * - 用户点击关闭后本次会话不再显示（不持久化，刷新后可再次触发）
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { aiLightColors } from './aiLightTheme';

interface AiChatNoKeyBannerProps {
  /** 跳转到左侧全局 AI 接口配置页 */
  onOpenProviderSettings: () => void;
}

export function AiChatNoKeyBanner({ onOpenProviderSettings }: AiChatNoKeyBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        {/* 关闭按钮 */}
        <Pressable
          accessibilityLabel="关闭提示"
          onPress={() => setDismissed(true)}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
        >
          <Ionicons color="#a1a1aa" name="close" size={14} />
        </Pressable>

        {/* 图标 + 标题 */}
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons color="#2563eb" name="key-outline" size={14} />
          </View>
          <Text style={styles.title}>尚未配置 AI 接口</Text>
        </View>

        {/* 说明 */}
        <Text style={styles.body}>
          向右滑动打开左侧面板可配置全局 AI 接口，或直接点击下方按钮前往。
        </Text>

        {/* 黑白矩形按钮，4px 圆角 */}
        <Pressable
          accessibilityRole="button"
          onPress={onOpenProviderSettings}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
        >
          <Ionicons color="#ffffff" name="settings-outline" size={13} />
          <Text style={styles.actionBtnText}>配置 AI 接口</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    alignSelf: 'flex-start',
    maxWidth: '88%',
  },
  banner: {
    backgroundColor: aiLightColors.surface,
    borderColor: '#e4e4e7',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    // 轻微阴影
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  closeBtn: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 22,
  },
  pressed: {
    opacity: 0.6,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  title: {
    color: '#18181b',
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    color: '#71717a',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  // 黑白 4px 圆角矩形按钮
  actionBtn: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#18181b',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnPressed: {
    backgroundColor: '#3f3f46',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import React, { memo, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FILE_TRANSFER_AVATAR = require('../../assets/file_transfer_avatar.png');
import type { PixorySpace } from '../database';
import { runWithDatabaseSpace } from '../database/db';
import { aiThreadRepository } from '../database/repositories/aiThreadRepository';
import { colors, radius, spacing, typography } from '../design/tokens';

export interface FileTransferDrawerProps {
  space: PixorySpace;
  threadId: string;
  visible: boolean;
  onClose: () => void;
  onClearRecords: () => void;
  onSearchPress: () => void;
  isPinned: boolean;
  onTogglePin: (pinned: boolean) => void;
  onSelectCategory?: (category: 'all' | 'media' | 'document' | 'text') => void;
}

interface TransferStats {
  totalMessages: number;
  totalImages: number;
  totalDocuments: number;
}

export const FileTransferDrawer = memo(function FileTransferDrawer({
  space,
  threadId,
  visible,
  onClose,
  onClearRecords,
  onSearchPress,
  isPinned,
  onTogglePin,
  onSelectCategory,
}: FileTransferDrawerProps) {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<TransferStats>({
    totalMessages: 0,
    totalImages: 0,
    totalDocuments: 0,
  });

  useEffect(() => {
    if (!visible) return;
    let isMounted = true;
    void runWithDatabaseSpace(space, async (db) => {
      try {
        const [msgCountRow, imgCountRow, docCountRow] = await Promise.all([
          db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM ai_messages WHERE threadId = ?',
            threadId
          ),
          db.getFirstAsync<{ count: number }>(
            "SELECT COUNT(*) as count FROM ai_message_attachments WHERE threadId = ? AND kind = 'image'",
            threadId
          ),
          db.getFirstAsync<{ count: number }>(
            "SELECT COUNT(*) as count FROM ai_message_attachments WHERE threadId = ? AND kind = 'document'",
            threadId
          ),
        ]);
        if (isMounted) {
          setStats({
            totalMessages: msgCountRow?.count ?? 0,
            totalImages: imgCountRow?.count ?? 0,
            totalDocuments: docCountRow?.count ?? 0,
          });
        }
      } catch (err) {
        console.error('Failed to load file transfer stats:', err);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space, threadId, visible]);

  const handleConfirmClear = () => {
    Alert.alert(
      '清空传输记录',
      '确定要清空文件传输助手的所有历史记录吗？本地缓存的文件与图片也将一并清除，此操作无法撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: () => {
            onClose();
            onClearRecords();
          },
        },
      ]
    );
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.modalOverlay}>
        <Pressable onPress={onClose} style={styles.backdrop} />

        <View style={[styles.drawerPanel, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>传输设置</Text>
            <Pressable
              accessibilityLabel="关闭传输设置"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Ionicons color={colors.text.secondary} name="close" size={22} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Assistant Profile Card */}
            <View style={styles.profileCard}>
              <ExpoImage
                contentFit="cover"
                source={FILE_TRANSFER_AVATAR}
                style={styles.profileAvatar}
              />
              <View style={styles.profileInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.profileName}>文件传输助手</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>系统</Text>
                  </View>
                </View>
                <Text style={styles.profileDesc}>本地与多端文件、图片、音视频及文本中转</Text>
              </View>
            </View>

            {/* Section 1: 常用操作 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>常用操作</Text>
              <View style={styles.cardGroup}>
                <Pressable
                  accessibilityLabel="查找聊天内容"
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    onSearchPress();
                  }}
                  style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowLeft}>
                    <View style={styles.actionIconWrap}>
                      <Ionicons color={colors.text.primary} name="search-outline" size={18} />
                    </View>
                    <Text style={styles.actionRowText}>查找聊天内容</Text>
                  </View>
                  <Ionicons color={colors.text.tertiary} name="chevron-forward" size={16} />
                </Pressable>

                <View style={styles.divider} />

                <Pressable
                  accessibilityLabel="图片与视频"
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    onSelectCategory?.('media');
                  }}
                  style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowLeft}>
                    <View style={styles.actionIconWrap}>
                      <Ionicons color={colors.text.primary} name="images-outline" size={18} />
                    </View>
                    <Text style={styles.actionRowText}>图片与视频</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.countText}>{stats.totalImages} 项</Text>
                    <Ionicons color={colors.text.tertiary} name="chevron-forward" size={16} />
                  </View>
                </Pressable>

                <View style={styles.divider} />

                <Pressable
                  accessibilityLabel="文档与文件"
                  accessibilityRole="button"
                  onPress={() => {
                    onClose();
                    onSelectCategory?.('document');
                  }}
                  style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
                >
                  <View style={styles.rowLeft}>
                    <View style={styles.actionIconWrap}>
                      <Ionicons color={colors.text.primary} name="document-text-outline" size={18} />
                    </View>
                    <Text style={styles.actionRowText}>文档与文件</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.countText}>{stats.totalDocuments} 项</Text>
                    <Ionicons color={colors.text.tertiary} name="chevron-forward" size={16} />
                  </View>
                </Pressable>
              </View>
            </View>

            {/* Section 2: 会话偏好 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>会话偏好</Text>
              <View style={styles.cardGroup}>
                <View style={styles.actionRow}>
                  <View style={styles.rowLeft}>
                    <View style={styles.actionIconWrap}>
                      <Ionicons color={colors.text.primary} name="pin-outline" size={18} />
                    </View>
                    <Text style={styles.actionRowText}>置顶会话</Text>
                  </View>
                  <Switch
                    onValueChange={onTogglePin}
                    thumbColor={colors.background.surface}
                    trackColor={{ false: colors.border.default, true: '#07C160' }}
                    value={isPinned}
                  />
                </View>
              </View>
            </View>

            {/* Section 3: 存储概要 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>传输概要</Text>
              <View style={styles.cardGroup}>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>总记录数</Text>
                  <Text style={styles.statValue}>{stats.totalMessages} 条</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>已发送媒体</Text>
                  <Text style={styles.statValue}>{stats.totalImages} 个</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>已发送文档</Text>
                  <Text style={styles.statValue}>{stats.totalDocuments} 个</Text>
                </View>
              </View>
            </View>

            {/* Section 4: 记录管理 */}
            <View style={styles.section}>
              <View style={styles.cardGroup}>
                <Pressable
                  accessibilityLabel="清空传输记录"
                  accessibilityRole="button"
                  onPress={handleConfirmClear}
                  style={({ pressed }) => [styles.dangerActionRow, pressed && styles.rowPressed]}
                >
                  <Ionicons color={colors.semantic.danger} name="trash-outline" size={18} />
                  <Text style={styles.dangerActionText}>清空传输记录</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
  },
  drawerPanel: {
    width: 310,
    backgroundColor: colors.background.page,
    borderTopLeftRadius: radius.xxl,
    borderBottomLeftRadius: radius.xxl,
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.surface,
  },
  headerTitle: {
    fontSize: typography.textStyles.body.fontSize,
    fontWeight: '600',
    color: colors.text.title,
  },
  closeBtn: {
    padding: spacing[1],
  },
  scrollContent: {
    padding: spacing[4],
    gap: spacing[4],
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    backgroundColor: colors.background.surface,
    borderRadius: radius.xl,
    gap: spacing[3],
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
  },
  profileInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
    marginBottom: spacing[1],
  },
  profileName: {
    fontSize: typography.textStyles.body.fontSize,
    fontWeight: '600',
    color: colors.text.title,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  profileDesc: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
  },
  section: {
    gap: spacing[1.5],
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginLeft: spacing[1],
  },
  cardGroup: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    minHeight: 48,
  },
  rowPressed: {
    backgroundColor: colors.primary.weak,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
  },
  actionIconWrap: {
    width: 24,
    alignItems: 'center',
  },
  actionRowText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  countText: {
    fontSize: 13,
    color: colors.text.tertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.subtle,
    marginLeft: 44,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  statLabel: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  dangerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  dangerActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.semantic.danger,
  },
});

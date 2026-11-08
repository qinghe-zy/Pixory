import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { runWithDatabaseSpace } from '../database/db';
import { settingsRepository } from '../database/repositories/settingsRepository';
import { colors, radius, spacing, typography } from '../design/tokens';

const AI_SYSTEM_AVATAR = require('../../assets/ai_system_avatar.png');
const FILE_TRANSFER_AVATAR = require('../../assets/file_transfer_avatar.png');

interface SystemSessionsSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
}

export function SystemSessionsSettingsScreen({ space, onBack }: SystemSessionsSettingsScreenProps) {
  const [systemAssistantEnabled, setSystemAssistantEnabled] = useState(true);
  const [fileTransferEnabled, setFileTransferEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void runWithDatabaseSpace(space, async (db) => {
      const [sysEnabled, ftEnabled] = await Promise.all([
        settingsRepository.getSystemAssistantEnabled(db),
        settingsRepository.getFileTransferEnabled(db),
      ]);
      if (isMounted) {
        setSystemAssistantEnabled(sysEnabled);
        setFileTransferEnabled(ftEnabled);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space]);

  const handleToggleSystemAssistant = async (value: boolean) => {
    setSystemAssistantEnabled(value);
    await runWithDatabaseSpace(space, async (db) => {
      await settingsRepository.setSystemAssistantEnabled(db, value);
    });
  };

  const handleToggleFileTransfer = async (value: boolean) => {
    setFileTransferEnabled(value);
    await runWithDatabaseSpace(space, async (db) => {
      await settingsRepository.setFileTransferEnabled(db, value);
    });
  };

  return (
    <ScreenScaffold
      backgroundColor="#F6F6F7"
      contentContainerStyle={styles.scrollContent}
      headerStyle={styles.header}
      onBack={onBack}
      scrollable
      title="系统会话"
    >
      <View style={styles.container}>
        <View style={styles.sectionNotice}>
          <Text style={styles.noticeText}>
            管理长聊首页与全局搜索中展示的官方系统级专属会话。关闭后不会清除聊天与传输记录。
          </Text>
        </View>

        <View style={styles.insetGroup}>
          {/* Item 1: Pixory 系统管家 */}
          <View style={styles.sessionRow}>
            <View style={styles.avatarWrap}>
              <ExpoImage
                contentFit="cover"
                source={AI_SYSTEM_AVATAR}
                style={styles.systemAvatar}
              />
            </View>
            <View style={styles.sessionContent}>
              <View style={styles.titleRow}>
                <Text style={styles.sessionTitle}>Pixory 系统管家</Text>
                <View style={styles.systemBadge}>
                  <Text style={styles.systemBadgeText}>系统</Text>
                </View>
              </View>
              <Text style={styles.sessionDescription}>
                系统指令执行、角色卡共创与设置控制
              </Text>
            </View>
            <Switch
              accessibilityLabel="切换 Pixory 系统管家开启状态"
              disabled={loading}
              onValueChange={handleToggleSystemAssistant}
              thumbColor={colors.background.surface}
              trackColor={{ false: colors.border.default, true: colors.text.title }}
              value={systemAssistantEnabled}
            />
          </View>

          <View style={styles.rowDivider} />

          {/* Item 2: 文件传输助手 */}
          <View style={styles.sessionRow}>
            <View style={styles.avatarWrap}>
              <ExpoImage
                contentFit="cover"
                source={FILE_TRANSFER_AVATAR}
                style={styles.systemAvatar}
              />
            </View>
            <View style={styles.sessionContent}>
              <View style={styles.titleRow}>
                <Text style={styles.sessionTitle}>文件传输助手</Text>
                <View style={styles.systemBadge}>
                  <Text style={styles.systemBadgeText}>系统</Text>
                </View>
              </View>
              <Text style={styles.sessionDescription}>
                本地多端文件、图片、音视频及文本中转
              </Text>
            </View>
            <Switch
              accessibilityLabel="切换文件传输助手开启状态"
              disabled={loading}
              onValueChange={handleToggleFileTransfer}
              thumbColor={colors.background.surface}
              trackColor={{ false: colors.border.default, true: colors.text.title }}
              value={fileTransferEnabled}
            />
          </View>
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
    gap: 0,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[1.5],
  },
  container: {
    paddingTop: spacing[3],
    paddingBottom: spacing[8],
    backgroundColor: colors.background.page,
    gap: spacing[3],
  },
  sectionNotice: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[1],
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  insetGroup: {
    backgroundColor: colors.background.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 76,
  },
  avatarWrap: {
    marginRight: spacing[3],
  },
  systemAvatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
  },
  sessionContent: {
    flex: 1,
    paddingRight: spacing[3],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1.5],
    marginBottom: spacing[1],
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.title,
  },
  systemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  systemBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  sessionDescription: {
    fontSize: 13,
    lineHeight: 17,
    color: colors.text.secondary,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.subtle,
    marginLeft: 72,
  },
});

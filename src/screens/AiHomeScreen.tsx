import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { listRecentMaterials } from '../ai/aiDocumentService';
import type { AiDocumentRecord } from '../database/repositories/aiKnowledgeRepository';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiHomeScreenProps {
  footer?: ReactNode;
  space: PixorySpace;
  onStartNormalChat: () => void;
  onStartIpChat: () => void;
  onStartKnowledgeBase: () => void;
  onOpenHistory: () => void;
  onOpenMaterials: () => void;
  onOpenProviderSettings: () => void;
}

const START_ENTRIES = [
  {
    title: '开始普通聊天',
    description: '临时讨论整理思路、命名、备注和批量归类规则。',
    icon: 'chatbubble-ellipses-outline',
  },
  {
    title: '问问某个 IP',
    description: '围绕一个 IP 的设定、分组、标签和本地资料发起对话。',
    icon: 'albums-outline',
  },
  {
    title: '连接知识库',
    description: '使用已导入的文档材料回答，引用来源并保留到当前空间。',
    icon: 'library-outline',
  },
] as const;

export function AiHomeScreen({
  footer,
  space,
  onStartNormalChat,
  onStartIpChat,
  onStartKnowledgeBase,
  onOpenHistory,
  onOpenMaterials,
  onOpenProviderSettings,
}: AiHomeScreenProps) {
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';
  const startHandlers = [onStartNormalChat, onStartIpChat, onStartKnowledgeBase];
  const [recentMaterials, setRecentMaterials] = useState<AiDocumentRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    void listRecentMaterials(space).then((items) => {
      if (isMounted) {
        setRecentMaterials(items);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [space]);

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      footer={footer}
      scrollable
      subtitle={`${spaceLabel} · 离线资料与本地会话`}
      title="AI 工作台"
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons color={colors.primary.active} name="sparkles-outline" size={24} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>围绕素材库写作、检索和整理</Text>
          <Text style={styles.heroText}>第一版只处理文本和文档知识，不读取图片内容，不同步云端，不跨空间混用资料。</Text>
        </View>
      </View>

      <View style={styles.entryList}>
        {START_ENTRIES.map((entry, index) => (
          <Pressable
            accessibilityRole="button"
            key={entry.title}
            onPress={startHandlers[index]}
            style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
          >
            <View style={styles.entryIcon}>
              <Ionicons color={colors.primary.active} name={entry.icon} size={20} />
            </View>
            <View style={styles.entryCopy}>
              <Text style={styles.entryTitle}>{entry.title}</Text>
              <Text style={styles.entryDescription}>{entry.description}</Text>
            </View>
            <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
          </Pressable>
        ))}
      </View>

      <View style={styles.quickGrid}>
        <QuickLink icon="time-outline" label="历史会话" onPress={onOpenHistory} />
        <QuickLink icon="document-text-outline" label="材料库" onPress={onOpenMaterials} />
        <QuickLink icon="key-outline" label="模型设置" onPress={onOpenProviderSettings} />
      </View>

      <Pressable accessibilityRole="button" onPress={onOpenMaterials} style={({ pressed }) => [styles.recentMaterials, pressed && styles.pressed]}>
        <View style={styles.recentHeader}>
          <Text style={styles.entryTitle}>最近材料</Text>
          <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
        </View>
        <Text style={styles.entryDescription}>
          {recentMaterials.length
            ? recentMaterials.slice(0, 3).map((item) => item.title).join(' / ')
            : '导入角色 notes、研究记录或标签体系后会显示在这里。'}
        </Text>
      </Pressable>
    </ScreenScaffold>
  );
}

interface QuickLinkProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

function QuickLink({ icon, label, onPress }: QuickLinkProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}>
      <Ionicons color={colors.primary.active} name={icon} size={18} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroCopy: {
    gap: rhythm.microGap,
  },
  heroTitle: {
    ...typography.textStyles.sectionTitle,
  },
  heroText: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
  },
  entryList: {
    gap: rhythm.entryCardGap,
  },
  entry: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 84,
    padding: spacing[3],
  },
  pressed: {
    opacity: 0.78,
  },
  entryIcon: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  entryCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  entryTitle: {
    ...typography.textStyles.bodyStrong,
  },
  entryDescription: {
    ...typography.textStyles.caption,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: rhythm.compactGridGap,
  },
  quickLink: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: rhythm.microGap,
    minHeight: 70,
    justifyContent: 'center',
    padding: spacing[2],
  },
  quickLabel: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    textAlign: 'center',
  },
  recentMaterials: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  recentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { imageRepository, ipRepository } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatFileSize } from '../utils/formatters';

interface MeScreenProps {
  refreshToken: number;
  footer?: ReactNode;
  onOpenFavorites: () => void;
  onOpenRecentViewed: () => void;
  onOpenTrash: () => void;
}

interface MeStats {
  ipCount: number;
  activeImageCount: number;
  favoriteImageCount: number;
  deletedImageCount: number;
  totalOriginalBytes: number;
}

const ENTRY_ITEMS = [
  {
    key: 'favorites',
    label: '收藏图片',
    description: '查看当前所有已收藏图片',
    icon: 'star-outline',
  },
  {
    key: 'recent',
    label: '最近查看',
    description: '查看最近打开过的图片',
    icon: 'time-outline',
  },
  {
    key: 'trash',
    label: '回收站',
    description: '恢复已软删除图片，或清空后物理删除',
    icon: 'trash-outline',
  },
] as const;

export function MeScreen({
  refreshToken,
  footer,
  onOpenFavorites,
  onOpenRecentViewed,
  onOpenTrash,
}: MeScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<MeStats>(
    async () => {
      const [ipCount, activeImageCount, favoriteImageCount, deletedImageCount, totalOriginalBytes] = await Promise.all([
        ipRepository.count(),
        imageRepository.count(),
        imageRepository.countFavorites(),
        imageRepository.countDeleted(),
        imageRepository.sumFileSize({ includeDeleted: true }),
      ]);

      return {
        ipCount,
        activeImageCount,
        favoriteImageCount,
        deletedImageCount,
        totalOriginalBytes,
      };
    },
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取个人页数据失败：${message}`;
      },
    }
  );

  function handleEntryPress(key: (typeof ENTRY_ITEMS)[number]['key']) {
    if (key === 'favorites') {
      onOpenFavorites();
      return;
    }

    if (key === 'recent') {
      onOpenRecentViewed();
      return;
    }

    onOpenTrash();
  }

  return (
    <ScreenScaffold errorMessage={errorMessage} footer={footer} scrollable title="我的">
      <ContentCard style={styles.heroCard}>
        <Text style={styles.heroTitle}>本地资产概览</Text>
        <Text style={styles.heroDescription}>
          Pixory 当前只管理本地数据，不依赖服务器、云同步或账号系统。
        </Text>
      </ContentCard>

      <ContentCard style={styles.statsCard}>
        <StatBlock label="IP数量" value={String(data?.ipCount ?? 0)} />
        <StatBlock label="图片总数" value={String(data?.activeImageCount ?? 0)} />
        <StatBlock label="收藏数" value={String(data?.favoriteImageCount ?? 0)} />
        <StatBlock label="回收站" value={String(data?.deletedImageCount ?? 0)} />
      </ContentCard>

      <ContentCard style={styles.storageCard}>
        <Text style={styles.storageLabel}>本地存储</Text>
        <Text style={styles.storageValue}>{formatFileSize(data?.totalOriginalBytes ?? 0)}</Text>
        <Text style={styles.storageHint}>当前为原图粗略统计，缩略图占用未单独展开。</Text>
      </ContentCard>

      <View style={styles.entryList}>
        {ENTRY_ITEMS.map((item) => (
          <Pressable key={item.key} onPress={() => handleEntryPress(item.key)} style={({ pressed }) => [styles.entryCard, pressed && styles.pressed]}>
            <View style={styles.entryIconWrap}>
              <Ionicons
                color={item.key === 'trash' ? colors.semantic.danger : colors.primary.default}
                name={item.icon}
                size={22}
              />
            </View>
            <View style={styles.entryCopy}>
              <Text style={styles.entryTitle}>{item.label}</Text>
              <Text style={styles.entryDescription}>{item.description}</Text>
            </View>
            <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
          </Pressable>
        ))}
      </View>

      {isLoading ? <Text style={styles.loadingText}>正在刷新本地统计…</Text> : null}
      {errorMessage ? (
        <Text onPress={reload} style={styles.retryText}>
          重新加载
        </Text>
      ) : null}
    </ScreenScaffold>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: spacing[2],
    padding: spacing[5],
  },
  heroTitle: {
    ...typography.textStyles.pageTitle,
  },
  heroDescription: {
    ...typography.textStyles.body,
    color: colors.text.body,
  },
  statsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing[4],
  },
  statItem: {
    gap: spacing[1],
    width: '50%',
  },
  statValue: {
    ...typography.textStyles.statNumber,
  },
  statLabel: {
    ...typography.textStyles.statLabel,
  },
  storageCard: {
    gap: spacing[1],
  },
  storageLabel: {
    ...typography.textStyles.caption,
  },
  storageValue: {
    ...typography.textStyles.statNumber,
  },
  storageHint: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  entryList: {
    gap: spacing[3],
  },
  entryCard: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
  },
  entryIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  entryCopy: {
    flex: 1,
    gap: spacing[1],
  },
  entryTitle: {
    ...typography.textStyles.sectionTitle,
  },
  entryDescription: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  pressed: {
    opacity: 0.82,
  },
  loadingText: {
    ...typography.textStyles.caption,
    textAlign: 'center',
  },
  retryText: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    textAlign: 'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { imageRepository, ipRepository, type ImageListItem, type IpDetailRecord } from '../database';
import { colors, componentTokens, layout, radius, spacing, typography } from '../design/tokens';
import { formatDateTime } from '../utils/formatters';

interface IpDetailScreenProps {
  ipId: number;
  refreshToken: number;
  onBack: () => void;
  onEdit: () => void;
  onImportImages: () => void;
  onCreateGroup: () => void;
  onOpenGroups: () => void;
  onOpenAllImages: () => void;
  onOpenBatchManagement: () => void;
  onOpenImage: (imageId: number) => void;
}

const QUICK_ACTIONS = [
  { key: 'import', label: '导入图片', icon: 'cloud-upload-outline' },
  { key: 'create-group', label: '新建分组', icon: 'folder-open-outline' },
  { key: 'all-images', label: '全部图片', icon: 'images-outline' },
  { key: 'batch', label: '批量管理', icon: 'albums-outline' },
] as const;

export function IpDetailScreen({
  ipId,
  refreshToken,
  onBack,
  onEdit,
  onImportImages,
  onCreateGroup,
  onOpenGroups,
  onOpenAllImages,
  onOpenBatchManagement,
  onOpenImage,
}: IpDetailScreenProps) {
  const [ip, setIp] = useState<IpDetailRecord | null>(null);
  const [recentImages, setRecentImages] = useState<ImageListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadIp() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [detail, images] = await Promise.all([
          ipRepository.findDetailById(ipId),
          imageRepository.findRecentByIpId(ipId, 6),
        ]);

        if (!isMounted) {
          return;
        }

        setIp(detail);
        setRecentImages(images);
        setErrorMessage(detail ? null : '没有找到这个 IP。');
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取详情失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadIp();

    return () => {
      isMounted = false;
    };
  }, [ipId, refreshToken]);

  const rightSlot = useMemo(
    () => (
      <Pressable onPress={onEdit} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
        <Ionicons color={colors.primary.default} name="create-outline" size={18} />
      </Pressable>
    ),
    [onEdit]
  );

  function handleQuickAction(key: (typeof QUICK_ACTIONS)[number]['key']) {
    if (key === 'import') {
      onImportImages();
      return;
    }

    if (key === 'create-group') {
      onCreateGroup();
      return;
    }

    if (key === 'all-images') {
      onOpenAllImages();
      return;
    }

    onOpenBatchManagement();
  }

  return (
    <AppScreen scrollable>
      <Header onBack={onBack} rightSlot={rightSlot} title="IP详情" />

      {ip ? (
        <>
          <View style={styles.hero}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{ip.name}</Text>
              {ip.isFavorite ? <Ionicons color={colors.semantic.favorite} name="star" size={18} /> : null}
            </View>
            <Text style={styles.description}>{ip.description || '还没有简介'}</Text>
          </View>

          <ContentCard style={styles.statsCard}>
            <StatBlock label="图片数量" value={String(ip.imageCount)} />
            <StatBlock label="分组数量" value={String(ip.groupCount)} />
            <StatBlock label="标签数量" value={String(ip.tagCount)} />
            <StatBlock label="最近更新" value={formatDateTime(ip.recentUpdatedAt)} />
          </ContentCard>

          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => handleQuickAction(action.key)}
                style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}
              >
                <Ionicons color={colors.primary.default} name={action.icon} size={26} />
                <Text style={styles.quickLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>

          <ContentCard>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>分组入口</Text>
              <Pressable onPress={onOpenGroups} style={({ pressed }) => [pressed && styles.pressed]}>
                <Text style={styles.sectionLink}>查看全部</Text>
              </Pressable>
            </View>
            <View style={styles.groupEntryList}>
              {GROUP_TYPE_OPTIONS.map((groupType) => (
                <Pressable key={groupType.value} onPress={onOpenGroups} style={({ pressed }) => [styles.groupEntry, pressed && styles.pressed]}>
                  <Text style={styles.groupEntryTitle}>{groupType.label}</Text>
                  <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
                </Pressable>
              ))}
            </View>
          </ContentCard>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>最近图片</Text>
            {recentImages.length > 0 ? (
              <Pressable onPress={onOpenAllImages} style={({ pressed }) => [pressed && styles.pressed]}>
                <Text style={styles.sectionLink}>全部图片</Text>
              </Pressable>
            ) : null}
          </View>

          {recentImages.length > 0 ? (
            <View style={styles.recentGrid}>
              {recentImages.map((image) => (
                <ThumbnailTile image={image} key={image.id} onPress={onOpenImage} />
              ))}
            </View>
          ) : null}

          {!isLoading && recentImages.length === 0 ? (
            <EmptyState
              actionLabel="导入图片"
              description="导入第一批素材后，这里会显示最近导入的图片。"
              iconName="image-outline"
              onAction={onImportImages}
              title="还没有图片"
            />
          ) : null}
        </>
      ) : null}

      {errorMessage && !ip ? (
        <ContentCard>
          <Text style={styles.sectionTitle}>IP详情不可用</Text>
          <Text style={styles.description}>{errorMessage}</Text>
        </ContentCard>
      ) : null}
    </AppScreen>
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
  headerAction: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  pressed: {
    opacity: 0.8,
  },
  hero: {
    gap: spacing[2],
    marginTop: -spacing[2],
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  title: {
    ...typography.textStyles.pageTitle,
    fontSize: 22,
    lineHeight: 28,
  },
  description: {
    ...typography.textStyles.body,
    color: colors.text.body,
    maxWidth: layout.maxReadableWidth,
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
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  quickCard: {
    alignItems: 'flex-start',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    minHeight: 112,
    padding: spacing[4],
    width: '48.8%',
  },
  quickLabel: {
    ...typography.textStyles.sectionTitle,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  sectionLink: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '500',
  },
  groupEntryList: {
    gap: spacing[2],
  },
  groupEntry: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing[4],
  },
  groupEntryTitle: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});

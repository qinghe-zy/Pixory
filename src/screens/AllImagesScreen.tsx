import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FilterChip } from '../components/FilterChip';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { groupRepository, imageRepository, ipRepository, tagRepository, type GroupRecord, type ImageListItem, type IpRecord, type TagUsageItem } from '../database';
import { colors, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

type AllImagesFilter =
  | { type: 'all' }
  | { type: 'favorite' }
  | { type: 'ungrouped' }
  | { type: 'group'; groupId: number }
  | { type: 'tag'; tagId: number };

interface AllImagesScreenProps {
  ipId: number;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number) => void;
  onStartBatchManagement: (imageId: number) => void;
}

export function AllImagesScreen({
  ipId,
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
  onStartBatchManagement,
}: AllImagesScreenProps) {
  const [activeFilter, setActiveFilter] = useState<AllImagesFilter>({ type: 'all' });
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpRecord | null;
    images: ImageListItem[];
    groups: GroupRecord[];
    tags: TagUsageItem[];
  }>(
    async () => {
      const [ip, groups, tags] = await Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findByIpId(ipId),
        tagRepository.findUsageOverviewByIpId(ipId),
      ]);

      const images =
        activeFilter.type === 'favorite'
          ? await imageRepository.findByIpId(ipId, { favoritesOnly: true })
          : activeFilter.type === 'ungrouped'
            ? await imageRepository.findByIpId(ipId, { ungroupedOnly: true })
            : activeFilter.type === 'group'
              ? await imageRepository.findByGroupId(activeFilter.groupId)
              : activeFilter.type === 'tag'
                ? await imageRepository.findByIpId(ipId, { tagId: activeFilter.tagId })
                : await imageRepository.findByIpId(ipId);

      return { ip, images, groups, tags };
    },
    [activeFilter, ipId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取图片库失败：${message}`;
      },
      initialData: { ip: null, images: [], groups: [], tags: [] },
    }
  );

  const ip = data?.ip ?? null;
  const images = data?.images ?? [];
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
  const activeFilterLabel = useMemo(() => {
    if (activeFilter.type === 'favorite') {
      return '已收藏';
    }

    if (activeFilter.type === 'ungrouped') {
      return '未分组';
    }

    if (activeFilter.type === 'group') {
      return groups.find((group) => group.id === activeFilter.groupId)?.name ?? '按分组';
    }

    if (activeFilter.type === 'tag') {
      return `#${tags.find((tag) => tag.id === activeFilter.tagId)?.name ?? '标签'}`;
    }

    return '全部';
  }, [activeFilter, groups, tags]);

  return (
    <ScreenScaffold decorativeTitle="Gallery" onBack={onBack} scrollable title="分部图片">
      <View style={styles.summary}>
        <View>
          <Text style={styles.subtitle}>{ip?.name ?? '当前 IP'}</Text>
          <Text style={styles.countText}>{activeFilterLabel}</Text>
        </View>
        <Text style={styles.imageCount}>{images.length} 张</Text>
      </View>

      <View style={styles.filterWrap}>
        <View style={styles.filterRow}>
          <FilterChip active={activeFilter.type === 'all'} label="全部" onPress={() => setActiveFilter({ type: 'all' })} />
          <FilterChip
            active={activeFilter.type === 'favorite'}
            label="已收藏"
            onPress={() => setActiveFilter({ type: 'favorite' })}
          />
          <FilterChip
            active={activeFilter.type === 'ungrouped'}
            label="未分组"
            onPress={() => setActiveFilter({ type: 'ungrouped' })}
          />
        </View>

        {groups.length > 0 ? (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>按分组</Text>
            <View style={styles.filterRow}>
              {groups.map((group) => (
                <FilterChip
                  active={activeFilter.type === 'group' && activeFilter.groupId === group.id}
                  key={group.id}
                  label={group.name}
                  onPress={() => setActiveFilter({ type: 'group', groupId: group.id })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {tags.length > 0 ? (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>按标签</Text>
            <View style={styles.filterRow}>
              {tags.map((tag) => (
                <FilterChip
                  active={activeFilter.type === 'tag' && activeFilter.tagId === tag.id}
                  key={tag.id}
                  label={`#${tag.name}`}
                  onPress={() => setActiveFilter({ type: 'tag', tagId: tag.id })}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <PageStateBlock
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription={
          activeFilter.type === 'all'
            ? '上传第一张图片后，就可以在这里按分组和标签进行管理'
            : '这个筛选条件下暂时没有图片。'
        }
        emptyIconName="images-outline"
        emptyTitle={activeFilter.type === 'all' ? commonEmptyStateCopy.noImagesTitle : commonEmptyStateCopy.noSearchResultTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地图片索引加载完成后，这里会展示当前 IP 下的全部图片。"
        loadingTitle="正在读取图片库"
        onEmptyAction={onImportImages}
        onRetry={reload}
      >
        <View style={styles.grid}>
          {images.map((image) => (
            <ThumbnailTile
              image={image}
              key={image.id}
              onLongPress={onStartBatchManagement}
              onPress={onOpenImage}
            />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  countText: {
    ...typography.textStyles.bodyStrong,
  },
  imageCount: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  filterWrap: {
    gap: spacing[3],
  },
  filterGroup: {
    gap: spacing[2],
  },
  filterLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});

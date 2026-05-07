import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import { TagChip } from '../components/TagChip';
import { assetRepository, imageRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageDetailRecord, type PixorySpace, type TagRecord } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useToast } from '../components/AppToast';
import { getFileInfo } from '../services/fileStorageService';
import { saveVideoToSystemAlbum } from '../services/videoImportService';
import { formatDateTime, formatDuration, formatFileSize, formatImageDimensions } from '../utils/formatters';

interface VideoDetailScreenProps {
  videoId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onPlay: (videoId: number) => void;
  onDeleted: () => void;
  onRefreshed: () => void;
}

export function VideoDetailScreen({
  videoId,
  space = 'normal',
  refreshToken,
  onBack,
  onPlay,
  onDeleted,
  onRefreshed,
}: VideoDetailScreenProps) {
  const { showToast } = useToast();
  const [video, setVideo] = useState<ImageDetailRecord | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMoreVisible, setIsMoreVisible] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const coverUri = video?.coverThumbnailFileUri ?? video?.thumbnailFileUri ?? null;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const [detail, tagItems, groupItems] = await runWithDatabaseSpace(space, (db) => Promise.all([
          assetRepository.findVideoDetailById(db, videoId),
          tagRepository.findByImageId(db, videoId),
          imageRepository.findGroupsByImageId(db, videoId),
        ]));

        if (!isMounted) {
          return;
        }
        if (!detail) {
          throw new Error('没有找到这个视频。');
        }

        setVideo(detail);
        setTags(tagItems);
        setGroups(groupItems);
        void runWithDatabaseSpace(space, (db) => imageRepository.touchLastViewedAt(db, videoId));
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取视频详情失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [refreshToken, space, videoId]);

  const actionItems: AppActionSheetItem[] = useMemo(
    () => [
      {
        key: 'save-local',
        label: '保存本地',
        icon: 'download-outline',
        onPress: handleSaveLocal,
      },
      {
        key: 'delete',
        label: '移入回收站',
        icon: 'trash-outline',
        danger: true,
        onPress: handleSoftDelete,
      },
    ],
    [video, isBusy]
  );

  async function handleSaveLocal() {
    if (!video || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await saveVideoToSystemAlbum(video.originalFileUri, video.originalFilename);
      showToast('已保存到系统视频目录');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存失败：${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSoftDelete() {
    if (!video || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await runWithDatabaseSpace(space, (db) => imageRepository.softDelete(db, video.id));
      showToast('已移入回收站');
      onDeleted();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`删除失败：${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function handlePlay() {
    if (!video) {
      return;
    }
    const info = await getFileInfo(video.originalFileUri);
    if (!info.exists || info.isDirectory) {
      showToast('原视频文件不可用');
      return;
    }
    onPlay(video.id);
  }

  return (
    <>
      <ScreenScaffold
        backgroundVariant="detail"
        onBack={onBack}
        rightAction={
          video ? (
            <Pressable accessibilityLabel="更多视频操作" onPress={() => setIsMoreVisible(true)} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <Ionicons color={colors.text.title} name="ellipsis-horizontal" size={20} />
            </Pressable>
          ) : null
        }
        scrollable
        title="视频详情"
      >
        <PageStateBlock
          emptyDescription="这个视频不存在，或已经被移到其他空间。"
          emptyIconName="videocam-outline"
          emptyTitle="未找到视频"
          errorMessage={errorMessage}
          isEmpty={!isLoading && !video}
          loading={isLoading}
          loadingDescription="正在读取本地视频记录。"
          loadingTitle="读取视频"
        >
          {video ? (
            <View style={styles.content}>
              <Pressable onPress={handlePlay} style={({ pressed }) => [styles.coverWrap, pressed && styles.pressed]}>
                {coverUri ? (
                  <SecureImage contentFit="cover" space={space} style={styles.cover} uri={coverUri} />
                ) : (
                  <View style={styles.coverFallback}>
                    <Ionicons color={colors.text.secondary} name="videocam-outline" size={34} />
                  </View>
                )}
                <View style={styles.playButton}>
                  <Ionicons color={colors.text.inverse} name="play" size={24} />
                </View>
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{formatDuration(video.durationMs)}</Text>
                </View>
              </Pressable>

              <View style={styles.titleBlock}>
                <Text style={styles.title}>{video.originalFilename}</Text>
                <Text style={styles.subtitle}>{video.ipName} · {formatDateTime(video.createdAt)}</Text>
              </View>

              <PrimaryButton label="播放视频" onPress={handlePlay} />

              <View style={styles.infoPanel}>
                <InfoRow label="文件大小" value={formatFileSize(video.fileSize)} />
                <InfoRow label="视频尺寸" value={formatImageDimensions(video.width, video.height)} />
                <InfoRow label="时长" value={formatDuration(video.durationMs)} />
                <InfoRow label="分组" value={groups.map((group) => group.name).join('、') || '未分组'} />
                <InfoRow label="备注" value={video.note || '无备注'} />
              </View>

              {tags.length > 0 ? (
                <View style={styles.tagsWrap}>
                  {tags.map((tag) => (
                    <TagChip key={tag.id} label={tag.name} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </PageStateBlock>
      </ScreenScaffold>
      <AppActionSheet items={actionItems} onClose={() => setIsMoreVisible(false)} title="视频操作" visible={isMoreVisible} />
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing[4],
  },
  headerButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  coverWrap: {
    backgroundColor: colors.background.sunken,
    borderRadius: radius.xl,
    minHeight: 220,
    overflow: 'hidden',
    position: 'relative',
  },
  cover: {
    aspectRatio: 16 / 10,
    width: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    aspectRatio: 16 / 10,
    justifyContent: 'center',
    width: '100%',
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(30, 38, 29, 0.72)',
    borderRadius: radius.pill,
    height: 58,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -29,
    marginTop: -29,
    position: 'absolute',
    top: '50%',
    width: 58,
  },
  durationBadge: {
    backgroundColor: 'rgba(30, 38, 29, 0.72)',
    borderRadius: radius.pill,
    bottom: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    position: 'absolute',
    right: spacing[3],
  },
  durationText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  titleBlock: {
    gap: spacing[1],
  },
  title: {
    ...typography.textStyles.pageTitle,
    fontSize: 20,
    lineHeight: 27,
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  infoPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: spacing[3],
  },
  infoRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
  },
  infoLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    width: 72,
  },
  infoValue: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
    textAlign: 'right',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  pressed: {
    opacity: 0.84,
  },
});

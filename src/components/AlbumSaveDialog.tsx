import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';
import { getSystemAlbums, saveImagesToSystemAlbum, type SystemAlbumOption } from '../services/mediaLibraryService';
import { AppDialog } from './AppDialog';
import { OptionSelectRow } from './OptionSelectRow';

type AlbumTargetMode = 'library' | 'existing' | 'new';

interface AlbumSaveDialogProps {
  visible: boolean;
  imageUris: string[];
  isSavingToAlbum: boolean;
  onSavingChange: (isSaving: boolean) => void;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

export function AlbumSaveDialog({
  visible,
  imageUris,
  isSavingToAlbum,
  onSavingChange,
  onClose,
  onSaved,
  onError,
}: AlbumSaveDialogProps) {
  const [albums, setAlbums] = useState<SystemAlbumOption[]>([]);
  const [targetMode, setTargetMode] = useState<AlbumTargetMode>('library');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState('Pixory');
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId]
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    let isMounted = true;
    setProgress(null);
    void (async () => {
      try {
        const nextAlbums = await getSystemAlbums();
        if (isMounted) {
          setAlbums(nextAlbums);
        }
      } catch (error) {
        if (isMounted) {
          onError(error instanceof Error ? error.message : '读取系统相册失败');
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [onError, visible]);

  const canSave =
    imageUris.length > 0 &&
    !isSavingToAlbum &&
    (targetMode !== 'existing' || selectedAlbumId != null) &&
    (targetMode !== 'new' || newAlbumName.trim().length > 0);

  async function handleSave() {
    if (!canSave) {
      return;
    }

    onSavingChange(true);
    setProgress({ completed: 0, total: imageUris.length });
    try {
      const result = await saveImagesToSystemAlbum(imageUris, {
        albumId: targetMode === 'existing' ? selectedAlbumId : null,
        albumTitle: targetMode === 'existing' ? selectedAlbum?.title ?? null : null,
        newAlbumName: targetMode === 'new' ? newAlbumName : null,
        onProgress: (completed, total) => setProgress({ completed, total }),
      });

      if (result.successCount === 0) {
        throw new Error('保存相册失败，请检查相册权限或原图文件。');
      }

      onSaved(
        result.failedCount > 0
          ? `已保存 ${result.successCount} 张，失败 ${result.failedCount} 张`
          : `已保存 ${result.successCount} 张到相册`
      );
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : '保存相册失败');
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <AppDialog
      message={isSavingToAlbum && progress ? `正在保存 ${progress.completed}/${progress.total}，请稍候。` : `将保存 ${imageUris.length} 张原图，不压缩、不重编码。`}
      onClose={isSavingToAlbum ? () => undefined : onClose}
      onPrimary={() => void handleSave()}
      primaryDisabled={!canSave}
      primaryLabel={isSavingToAlbum && progress ? `保存中 ${progress.completed}/${progress.total}` : '开始保存'}
      title="保存到相册"
      visible={visible}
    >
      <View style={styles.section}>
        <OptionSelectRow
          label="系统默认相册"
          meta="使用系统照片库默认位置"
          onPress={() => {
            setTargetMode('library');
            setSelectedAlbumId(null);
          }}
          selected={targetMode === 'library'}
        />
        <OptionSelectRow
          disabled={albums.length === 0}
          label="选择已有相册"
          meta={selectedAlbum ? selectedAlbum.title : albums.length > 0 ? '从下方列表选择目标相册' : '暂无可选相册'}
          onPress={() => setTargetMode('existing')}
          selected={targetMode === 'existing'}
        />
        {targetMode === 'existing' && albums.length > 0 ? (
          <ScrollView style={styles.albumList}>
            {albums.map((album) => (
              <OptionSelectRow
                key={album.id}
                label={album.title}
                meta={`${album.assetCount} 张`}
                onPress={() => {
                  setTargetMode('existing');
                  setSelectedAlbumId(album.id);
                }}
                selected={selectedAlbumId === album.id}
              />
            ))}
          </ScrollView>
        ) : null}
        <OptionSelectRow
          label="新建相册"
          meta={newAlbumName.trim() ? newAlbumName.trim() : '输入新相册名称'}
          onPress={() => setTargetMode('new')}
          selected={targetMode === 'new'}
        />
        {targetMode === 'new' ? (
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setNewAlbumName}
            placeholder="相册名称"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.input}
            value={newAlbumName}
          />
        ) : null}
      </View>
      {progress ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }]} />
          <Text style={styles.progressText}>{progress.completed}/{progress.total}</Text>
        </View>
      ) : null}
    </AppDialog>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing[1],
  },
  albumList: {
    maxHeight: 168,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  progressTrack: {
    backgroundColor: colors.background.input,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  progressFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary.weak,
  },
  progressText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '700',
    textAlign: 'center',
  },
});

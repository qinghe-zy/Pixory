import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type IpListItem, type PixorySpace } from '../../database';
import { aiLightColors } from './aiLightTheme';
import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { copyAiRoleAvatarToAppStorage } from '../../services/fileStorageService';
import { AiLightButton } from './AiLightButton';
import { AiImageCropModal } from './AiImageCropModal';
import { SecureImage } from '../SecureImage';

interface AiAvatarPickerProps {
  avatarUri: string | null;
  onAvatarChange: (uri: string | null) => void;
  space: PixorySpace;
  onError?: (error: Error | string) => void;
}

export function AiAvatarPicker({ avatarUri, onAvatarChange, space, onError }: AiAvatarPickerProps) {
  const [ips, setIps] = useState<IpListItem[]>([]);
  const [avatarIpId, setAvatarIpId] = useState<number | null>(null);
  const [avatarCandidates, setAvatarCandidates] = useState<ImageListItem[]>([]);
  // 待裁剪的图片临时 URI（非 null 时弹出裁剪 Modal）
  const [cropSourceUri, setCropSourceUri] = useState<string | null>(null);

  const loadIps = useCallback(async () => {
    try {
      const nextIps = await runWithDatabaseSpace(space, (db: any) => ipRepository.findLibraryItems(db));
      setIps(nextIps);
      setAvatarIpId((current) => current && nextIps.some((ip) => ip.id === current) ? current : null);
    } catch (e) {
      onError?.(e instanceof Error ? e : String(e));
    }
  }, [space, onError]);

  useEffect(() => {
    void loadIps();
  }, [loadIps]);

  useEffect(() => {
    if (avatarIpId == null) {
      setAvatarCandidates([]);
      return;
    }
    void runWithDatabaseSpace(space, (db: any) => imageRepository.findByIpId(db, avatarIpId, { mediaType: 'image' }))
      .then((images: any) => { setAvatarCandidates(images); })
      .catch((e: any) => { onError?.(e instanceof Error ? e : String(e)); });
  }, [avatarIpId, space, onError]);

  async function pickAvatarFromAlbum() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onError?.('需要相册权限才能选择角色头像。');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // 不使用 allowsEditing：Android 多数厂商 ROM（MIUI / ColorOS / HyperOS 等）
        // 的系统 CROP intent 会显示截取框但没有确认按钮，导致用户无法完成选图。
        // 裁剪改为应用内 AiImageCropModal 完成。
        quality: 1,
      });
      if (result.canceled || !result.assets.length) {
        return;
      }
      // 弹出应用内裁剪 Modal
      setCropSourceUri(result.assets[0].uri);
    } catch (error) {
      onError?.(error instanceof Error ? error : '头像选择失败');
    }
  }

  async function handleCropConfirm(croppedUri: string) {
    setCropSourceUri(null);
    try {
      const copiedUri = await copyAiRoleAvatarToAppStorage(croppedUri, space);
      onAvatarChange(copiedUri);
    } catch (error) {
      onError?.(error instanceof Error ? error : '头像保存失败');
    }
  }

  function handleCropCancel() {
    setCropSourceUri(null);
  }

  return (
    <View style={styles.container}>
      {/* 应用内裁剪 Modal */}
      <AiImageCropModal
        sourceUri={cropSourceUri}
        onConfirm={(uri) => void handleCropConfirm(uri)}
        onCancel={handleCropCancel}
      />

      <View style={styles.inlineActions}>
        <AiLightButton label="从相册选择" onPress={() => void pickAvatarFromAlbum()} variant="ghost" />
        {avatarUri ? <AiLightButton label="清除头像" onPress={() => onAvatarChange(null)} variant="ghost" /> : null}
      </View>

      {ips.length ? (
        <View style={styles.ipAvatarPicker}>
          <Text style={styles.caption}>从 IP 选择</Text>
          <View style={styles.ipChipRow}>
            {ips.slice(0, 8).map((ip) => (
              <Pressable
                accessibilityRole="button"
                key={ip.id}
                onPress={() => setAvatarIpId(ip.id)}
                style={({ pressed }) => [styles.ipChip, avatarIpId === ip.id && styles.ipChipActive, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={[styles.ipChipText, avatarIpId === ip.id && styles.ipChipTextActive]}>{ip.name}</Text>
              </Pressable>
            ))}
          </View>
          {avatarIpId == null ? null : avatarCandidates.length ? (
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.avatarGridScroll}>
              <View style={styles.avatarGrid}>
                {avatarCandidates.map((image) => {
                  const candidateUri = image.coverThumbnailFileUri ?? image.thumbnailFileUri ?? image.originalFileUri;
                  const active = avatarUri === candidateUri;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={image.id}
                      onPress={() => onAvatarChange(candidateUri)}
                      style={({ pressed }) => [styles.avatarChoice, active && styles.avatarChoiceActive, pressed && styles.pressed]}
                    >
                      <SecureImage contentFit="cover" space={space} style={styles.avatarChoiceImage} uri={candidateUri} />
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.caption}>该 IP 下暂无可用图片。</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rhythm.inlineGap,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  ipAvatarPicker: {
    gap: rhythm.inlineGap,
  },
  ipChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  ipChip: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  ipChipActive: {
    backgroundColor: aiLightColors.primarySoft,
    borderColor: aiLightColors.primary,
  },
  ipChipText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
  },
  ipChipTextActive: {
    color: aiLightColors.primaryActive,
    fontWeight: '700',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  avatarGridScroll: {
    maxHeight: metrics.minTouchSize * 4 + spacing[2] * 3,
  },
  avatarChoice: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
  },
  avatarChoiceActive: {
    borderColor: aiLightColors.primary,
    borderWidth: 2,
  },
  avatarChoiceImage: {
    height: '100%',
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
});

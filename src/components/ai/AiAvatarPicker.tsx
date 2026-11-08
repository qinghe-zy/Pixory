import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type IpListItem, type PixorySpace } from '../../database';
import { metrics, rhythm } from '../../design/tokens';
import { copyAiRoleAvatarToAppStorage } from '../../services/fileStorageService';
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
  const [cropSourceUri, setCropSourceUri] = useState<string | null>(null);
  const [showIps, setShowIps] = useState(false);

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
    let isMounted = true;
    if (avatarIpId == null) {
      setAvatarCandidates([]);
      return;
    }
    void runWithDatabaseSpace(space, (db: any) => imageRepository.findByIpId(db, avatarIpId, { mediaType: 'image' }))
      .then((images: any) => {
        if (isMounted) {
          setAvatarCandidates(images);
        }
      })
      .catch((e: any) => {
        if (isMounted) {
          onError?.(e instanceof Error ? e : String(e));
        }
      });

    return () => {
      isMounted = false;
    };
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
        quality: 1,
      });
      if (result.canceled || !result.assets.length) {
        return;
      }
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

  const selectedIp = useMemo(() => ips.find((ip) => ip.id === avatarIpId), [ips, avatarIpId]);
  const displayIpName = selectedIp?.name ?? ips[0]?.name ?? '选择';

  return (
    <View style={styles.container}>
      <AiImageCropModal
        sourceUri={cropSourceUri}
        onConfirm={(uri) => void handleCropConfirm(uri)}
        onCancel={handleCropCancel}
      />

      <View style={styles.pickerActionsRow}>
        <Pressable onPress={() => void pickAvatarFromAlbum()} style={({ pressed }) => [styles.albumBtn, pressed && styles.pressed]}>
          <Ionicons name="images-outline" size={16} color="#1a1c1c" />
          <Text style={styles.albumBtnText}>从相册选择</Text>
        </Pressable>

        {ips.length > 0 && (
          <View style={styles.ipActionRow}>
            <Text style={styles.ipActionLabel}>从 IP 选择</Text>
            <Pressable
              accessibilityLabel={`从 IP 选择，当前：${displayIpName}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: showIps }}
              onPress={() => setShowIps(!showIps)}
              style={({ pressed }) => [styles.ipPickerButton, pressed && styles.pressed]}
            >
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.ipPickerButtonText}>
                {displayIpName}
              </Text>
              <Ionicons color="#1a1c1c" name="options-outline" size={14} />
            </Pressable>
          </View>
        )}
      </View>

      {showIps && ips.length > 0 && (
        <View style={styles.ipAvatarPicker}>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={ips.length > 6}
            style={ips.length > 6 ? styles.ipGridScroll : undefined}
          >
            <View style={styles.ipGrid}>
              {ips.map((ip) => {
                const active = avatarIpId === ip.id;
                return (
                  <Pressable
                    accessibilityLabel={`选择 IP：${ip.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    key={ip.id}
                    onPress={() => setAvatarIpId(ip.id)}
                    style={({ pressed }) => [
                      styles.ipCard,
                      active && styles.ipCardActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.ipCardText, active && styles.ipCardTextActive]}>
                      {ip.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  pickerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    gap: 8,
  },
  albumBtn: {
    height: 32,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  albumBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1c1c',
  },
  ipActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  ipActionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#444748',
    flexShrink: 0,
  },
  ipPickerButton: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#e2e2e2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    flexShrink: 1,
  },
  ipPickerButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a1c1c',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  caption: {
    fontSize: 11,
    color: '#747878',
  },
  ipAvatarPicker: {
    gap: rhythm.inlineGap,
    marginTop: rhythm.compactGridGap,
  },
  ipGridScroll: {
    maxHeight: 168,
  },
  ipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  ipCard: {
    width: '48.5%',
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f9f9f9',
    borderColor: '#e2e2e2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ipCardActive: {
    backgroundColor: '#e8e8e8',
    borderColor: '#000000',
  },
  ipCardText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#1a1c1c',
    textAlign: 'center',
  },
  ipCardTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  avatarGridScroll: {
    maxHeight: metrics.minTouchSize * 4 + rhythm.compactGridGap * 3,
  },
  avatarChoice: {
    borderColor: '#e5e5e5',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
  },
  avatarChoiceActive: {
    borderColor: '#000000',
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

import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useToast } from '../components/AppToast';
import { OrbitalSpectralRing } from '../components/OrbitalSpectralRing';
import { ScreenScaffold } from '../components/ScreenScaffold';
import {
  runWithDatabaseSpace,
  settingsRepository,
  type PixorySpace,
} from '../database';
import { colors, rhythm, spacing, typography } from '../design/tokens';
import { useProfileInfoPreferences } from '../services/aiChatPreferences';
import { copyProfileAvatarToAppStorage } from '../services/fileStorageService';
import { UidService } from '../services/uidService';

interface ProfileInfoScreenProps {
  onBack: () => void;
  space: PixorySpace;
}

export function ProfileInfoScreen({ onBack, space }: ProfileInfoScreenProps) {
  const { showToast } = useToast();
  const {
    avatarRadius,
    avatarFrameEnabled,
    setProfileAvatarRadius,
    setProfileAvatarFrameEnabled,
  } = useProfileInfoPreferences(space);

  const [nickname, setNickname] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  // 加载昵称与头像
  useEffect(() => {
    let cancelled = false;
    void runWithDatabaseSpace(space, async (db) => {
      const savedNickname = await settingsRepository.getProfileNickname(db);
      const savedAvatar = await settingsRepository.getProfileAvatarUri(db);
      const generatedUid = await UidService.getUid();
      if (!cancelled) {
        setNickname(savedNickname || '本地空间');
        setAvatarUri(savedAvatar);
        setUid(generatedUid);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [space]);

  // 保存昵称
  const handleSaveNickname = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      showToast('昵称不能为空');
      return;
    }
    setIsSavingNickname(true);
    try {
      await runWithDatabaseSpace(space, (db) =>
        settingsRepository.setProfileNickname(db, trimmed)
      );
      showToast('昵称保存成功');
    } catch {
      showToast('保存昵称失败');
    } finally {
      setIsSavingNickname(false);
    }
  };

  // 更换头像
  const handlePickAvatar = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets[0]?.uri) return;

      const sourceUri = result.assets[0].uri;
      const localUri = await copyProfileAvatarToAppStorage(sourceUri);

      await runWithDatabaseSpace(space, (db) =>
        settingsRepository.setProfileAvatarUri(db, localUri)
      );
      setAvatarUri(localUri);
      showToast('头像更新成功');
    } catch {
      showToast('更换头像失败');
    }
  }, [showToast, space]);

  return (
    <ScreenScaffold
      contentContainerStyle={styles.scrollContent}
      onBack={onBack}
      scrollable
      title="个人信息"
    >
      <View style={styles.container}>
        {/* 顶部拟真个人资料预览卡片 */}
        <View style={styles.previewCard}>
          <View style={styles.avatarPreviewWrap}>
            <View
              style={[
                styles.avatarContainer,
                { borderRadius: avatarRadius },
              ]}
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={[
                    styles.avatarImage,
                    { borderRadius: avatarRadius },
                  ]}
                />
              ) : (
                <Ionicons
                  color={colors.primary.active}
                  name="person"
                  size={36}
                />
              )}
            </View>

            {/* 头像框佩戴动画预览 */}
            <OrbitalSpectralRing
              avatarSize={68}
              isActive={avatarFrameEnabled}
              padding={3}
            />

            <Pressable
              hitSlop={8}
              onPress={handlePickAvatar}
              style={styles.avatarCameraBadge}
            >
              <Ionicons color="#FFFFFF" name="camera" size={13} />
            </Pressable>
          </View>

          <Text style={styles.previewNickname}>{nickname || '本地空间'}</Text>
          {uid ? <Text style={styles.previewUid}>UID: {uid}</Text> : null}
        </View>

        {/* 昵称修改 */}
        <View style={styles.categorySection}>
          <Text style={styles.sectionHeader}>个人昵称</Text>
          <View style={styles.insetCard}>
            <View style={styles.inputRow}>
              <TextInput
                maxLength={24}
                onChangeText={setNickname}
                placeholder="请输入昵称"
                placeholderTextColor="#94A3B8"
                style={styles.nicknameInput}
                value={nickname}
              />
              <Pressable
                disabled={isSavingNickname}
                onPress={handleSaveNickname}
                style={({ pressed }) => [
                  styles.saveBtn,
                  pressed && styles.saveBtnPressed,
                ]}
              >
                <Text style={styles.saveBtnText}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* 头像圆角大小微调 */}
        <View style={styles.categorySection}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionHeader}>头像圆角大小</Text>
            <Text style={styles.currentSpecValue}>
              {avatarRadius === 34
                ? '34dp · 纯圆'
                : avatarRadius === 0
                ? '0dp · 方形'
                : `${avatarRadius}dp`}
            </Text>
          </View>
          <View style={styles.insetCard}>
            <View style={styles.landmarkRow}>
              {[
                { label: '方形 0dp', val: 0 },
                { label: '微弧 8dp', val: 8 },
                { label: '柔和 16dp', val: 16 },
                { label: '饱满 24dp', val: 24 },
                { label: '纯圆 34dp', val: 34 },
              ].map((item) => {
                const active = avatarRadius === item.val;
                return (
                  <Pressable
                    key={item.val}
                    onPress={() => setProfileAvatarRadius(item.val)}
                    style={[
                      styles.landmarkPill,
                      active ? styles.landmarkPillActive : styles.landmarkPillInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.landmarkPillText,
                        active && styles.landmarkPillTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* 头像框佩戴开关 */}
        <View style={styles.categorySection}>
          <Text style={styles.sectionHeader}>头像框装饰</Text>
          <View style={styles.insetCard}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextCol}>
                <Text style={styles.switchTitle}>佩戴星轨流光头像框</Text>
                <Text style={styles.switchDesc}>
                  开启后头像周围将环绕动态光谱流光圆环，彰显个性
                </Text>
              </View>
              <Switch
                onValueChange={(val) =>
                  setProfileAvatarFrameEnabled(val)
                }
                thumbColor="#FFFFFF"
                trackColor={{ false: '#CBD5E1', true: '#3B82F6' }}
                value={avatarFrameEnabled}
              />
            </View>
          </View>
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
  },
  container: {
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    gap: rhythm.listCardGap,
  },
  sectionHeader: {
    ...typography.textStyles.caption,
    fontWeight: '600',
    color: colors.text.secondary,
    paddingHorizontal: spacing[3],
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[3],
  },
  currentSpecValue: {
    ...typography.textStyles.caption,
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  categorySection: {
    gap: 6,
  },
  insetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 8,
    padding: spacing[3],
    gap: spacing[2],
  },
  // ── 顶部拟真预览卡片 ──
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 8,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  avatarPreviewWrap: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarContainer: {
    width: 68,
    height: 68,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 68,
    height: 68,
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  previewNickname: {
    ...typography.textStyles.body,
    fontSize: 16.5,
    fontWeight: '700',
    color: '#1A1C1C',
    marginTop: 4,
  },
  previewUid: {
    ...typography.textStyles.caption,
    fontSize: 11.5,
    color: '#8E8E93',
    fontFamily: typography.family.brand,
  },
  // ── 昵称修改 ──
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nicknameInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14.5,
    color: '#1A1C1C',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  saveBtn: {
    height: 42,
    paddingHorizontal: 16,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnPressed: {
    opacity: 0.85,
  },
  saveBtnText: {
    ...typography.textStyles.body,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
  // ── 圆角地标 ──
  landmarkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  landmarkPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  landmarkPillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#3B82F6',
  },
  landmarkPillInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  landmarkPillText: {
    ...typography.textStyles.micro,
    fontSize: 10.5,
    color: colors.text.secondary,
  },
  landmarkPillTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  // ── 开关行 ──
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTextCol: {
    flex: 1,
    paddingRight: spacing[3],
    gap: 3,
  },
  switchTitle: {
    ...typography.textStyles.body,
    fontSize: 14.5,
    fontWeight: '500',
    color: '#1A1C1C',
  },
  switchDesc: {
    ...typography.textStyles.caption,
    fontSize: 11.5,
    color: colors.text.secondary,
    lineHeight: 16,
  },
});

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../components/ai/AiLightButton';
import { AiLightInputRow, AiLightTextareaRow } from '../components/ai/AiLightField';
import { AiRoleCardImportPreview } from '../components/ai/AiRoleCardImportPreview';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { AppDialog } from '../components/AppDialog';
import { SecureImage } from '../components/SecureImage';
import { applyRoleCardToThread } from '../ai/aiChatService';
import { deleteRoleCards, listRoleCards, saveImportedRoleCard, saveRoleCard } from '../ai/aiRoleCardService';
import {
  parseSillyTavernJson,
  parseSillyTavernPngBase64,
  type NormalizedSillyTavernRoleCard,
  type SillyTavernParseResult,
} from '../ai/sillyTavernRoleCardParser';
import type { AiRoleCardRecord } from '../ai/types';
import { copyAiRoleAvatarToAppStorage } from '../services/fileStorageService';
import { metrics, radius, rhythm, spacing, typography } from '../design/tokens';
import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type IpListItem, type PixorySpace } from '../database';

interface AiRoleCardEditorScreenProps {
  space: PixorySpace;
  roleCardId?: string;
  threadId?: string;
  onBack: () => void;
  onApplyRoleCard: (roleCardId?: string | null) => void;
  onStartChatWithRole?: (roleCardId: string) => void;
}

export function AiRoleCardEditorScreen({
  space,
  roleCardId,
  threadId,
  onBack,
  onApplyRoleCard,
  onStartChatWithRole,
}: AiRoleCardEditorScreenProps) {
  const [name, setName] = useState('素材整理助手');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [cards, setCards] = useState<AiRoleCardRecord[]>([]);
  const [ips, setIps] = useState<IpListItem[]>([]);
  const [avatarIpId, setAvatarIpId] = useState<number | null>(null);
  const [avatarCandidates, setAvatarCandidates] = useState<ImageListItem[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importedRole, setImportedRole] = useState<NormalizedSillyTavernRoleCard | null>(null);
  const [importedAvatarUri, setImportedAvatarUri] = useState<string | null>(null);
  const [selectedGreeting, setSelectedGreeting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  const loadCards = useCallback(async () => {
    const nextCards = await listRoleCards(space);
    setCards(nextCards);
  }, [space]);

  const loadIps = useCallback(async () => {
    const nextIps = await runWithDatabaseSpace(space, (db) => ipRepository.findLibraryItems(db));
    setIps(nextIps);
    setAvatarIpId((current) => current ?? nextIps[0]?.id ?? null);
  }, [space]);

  useEffect(() => {
    void loadCards();
    void loadIps();
  }, [loadCards, loadIps]);

  useEffect(() => {
    if (avatarIpId == null) {
      setAvatarCandidates([]);
      return;
    }
    void runWithDatabaseSpace(space, (db) => imageRepository.findByIpId(db, avatarIpId, { mediaType: 'image' })).then((images) => {
      setAvatarCandidates(images.slice(0, 12));
    });
  }, [avatarIpId, space]);

  function loadCardIntoEditor(card: AiRoleCardRecord) {
    setName(card.name);
    setDescription(card.description ?? '');
    setPrompt(card.prompt);
    setAvatarEnabled(card.avatarEnabled);
    setAvatarUri(card.avatarUri);
  }

  function toggleSelected(cardId: string) {
    setSelectedCardIds((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
  }

  async function pickAvatarFromAlbum() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus('需要相册权限才能选择角色头像。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }
    try {
      const copiedUri = await copyAiRoleAvatarToAppStorage(result.assets[0].uri, space);
      setAvatarUri(copiedUri);
      setAvatarEnabled(true);
      setStatus('头像已选择。');
    } catch (error) {
      setStatus(error instanceof Error ? `头像选择失败：${error.message}` : '头像选择失败');
    }
  }

  function isJsonAsset(asset: DocumentPicker.DocumentPickerAsset): boolean {
    return asset.mimeType === 'application/json' || asset.name.toLowerCase().endsWith('.json');
  }

  function isPngAsset(asset: DocumentPicker.DocumentPickerAsset): boolean {
    return asset.mimeType === 'image/png' || asset.name.toLowerCase().endsWith('.png');
  }

  async function parsePickedRoleCardAsset(asset: DocumentPicker.DocumentPickerAsset): Promise<SillyTavernParseResult> {
    if (isJsonAsset(asset)) {
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      return parseSillyTavernJson(text);
    }
    if (isPngAsset(asset)) {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      return parseSillyTavernPngBase64(base64);
    }
    return { ok: false, code: 'unsupported_file', message: '请选择 PNG 或 JSON 角色卡。' };
  }

  async function copyImportedAvatar(assetUri: string): Promise<string | null> {
    try {
      return await copyAiRoleAvatarToAppStorage(assetUri, space);
    } catch (error) {
      setStatus(error instanceof Error ? `头像复制失败：${error.message}` : '头像复制失败');
      return null;
    }
  }

  async function importRoleCard() {
    setStatus(null);
    setImportedRole(null);
    setImportedAvatarUri(null);
    setSelectedGreeting(null);
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['image/png', 'application/json'],
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setImporting(true);
    try {
      const parsed = await parsePickedRoleCardAsset(asset);
      if (!parsed.ok) {
        if (parsed.code === 'missing_chara' && isPngAsset(asset)) {
          const copiedUri = await copyImportedAvatar(asset.uri);
          if (copiedUri) {
            setAvatarUri(copiedUri);
            setAvatarEnabled(true);
            setStatus('未检测到角色数据，已将图片作为角色头像。');
          }
          return;
        }
        setStatus(parsed.message);
        return;
      }

      const copiedAvatarUri = isPngAsset(asset) ? await copyImportedAvatar(asset.uri) : null;
      if (isPngAsset(asset) && !copiedAvatarUri) {
        return;
      }
      setImportedRole(parsed.normalized);
      setImportedAvatarUri(copiedAvatarUri);
      setSelectedGreeting(parsed.normalized.firstMessage ?? parsed.normalized.alternateGreetings[0] ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? `导入失败：${error.message}` : '导入失败');
    } finally {
      setImporting(false);
    }
  }

  async function saveImported(startChat: boolean) {
    if (!importedRole) {
      return null;
    }
    setSaving(true);
    try {
      const card = await saveImportedRoleCard({
        avatarUri: importedAvatarUri,
        firstMessage: selectedGreeting,
        imported: importedRole,
        space,
      });
      setImportedRole(null);
      setImportedAvatarUri(null);
      setSelectedGreeting(null);
      setStatus(startChat && onStartChatWithRole ? '已保存，正在开始聊天。' : '已保存角色。');
      await loadCards();
      if (startChat) {
        onStartChatWithRole?.(card.id);
      }
      return card;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
      return null;
    } finally {
      setSaving(false);
    }
  }

  function editImportedRole() {
    if (!importedRole) {
      return;
    }
    setName(importedRole.name);
    setDescription(importedRole.description ?? '');
    setPrompt(importedRole.prompt);
    setAvatarUri(importedAvatarUri);
    setAvatarEnabled(Boolean(importedAvatarUri));
    setImportedRole(null);
    setImportedAvatarUri(null);
    setSelectedGreeting(null);
    setStatus('已填入角色编辑表单。');
  }

  async function deleteSelectedCards() {
    const ids = selectedCardIds;
    if (!ids.length) {
      setConfirmingBatchDelete(false);
      return;
    }
    const count = await deleteRoleCards(space, ids);
    setSelectedCardIds([]);
    setConfirmingBatchDelete(false);
    setStatus(`已删除 ${count} 张角色卡。`);
    await loadCards();
  }

  async function saveReusableRoleCard() {
    if (!prompt.trim()) {
      setStatus('请先填写角色内容。');
      return;
    }
    setSaving(true);
    try {
      const card = await saveRoleCard({
        description,
        name: name.trim() || '未命名角色卡',
        prompt,
        avatarEnabled,
        avatarUri,
        space,
      });
      setStatus('已保存。');
      await loadCards();
      return card;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function applyRoleCard(roleId: string | null) {
    if (threadId) {
      await applyRoleCardToThread({ roleCardId: roleId, space, threadId });
    }
    onApplyRoleCard(roleId);
  }

  async function applyCurrentRole() {
    if (!prompt.trim()) {
      setStatus('使用默认角色。');
      await applyRoleCard(null);
      return;
    }
    const saved = await saveReusableRoleCard();
    if (!saved) {
      return;
    }
    setStatus('已应用。');
    await applyRoleCard(saved.id);
  }

  function getRoleCardSourceLabel(card: AiRoleCardRecord): string {
    if (!card.sourceType || card.sourceType === 'pixory_manual') {
      return 'DIY 角色';
    }
    if (card.sourceType.startsWith('sillytavern_') || card.sourceType === 'tavern_json_v1') {
      return '酒馆角色';
    }
    return '角色';
  }

  const selectionFooter = selectedCardIds.length ? (
    <View style={styles.selectionFooter}>
      <View style={styles.selectionCopy}>
        <Text style={styles.selectionTitle}>已选择 {selectedCardIds.length} 张角色卡</Text>
        <Text style={styles.selectionMeta}>只删除已保存的角色卡，不影响已有聊天记录。</Text>
      </View>
      <View style={styles.selectionActions}>
        <AiLightButton label="批量删除" onPress={() => setConfirmingBatchDelete(true)} variant="outline" />
        <AiLightButton label="取消选择" onPress={() => setSelectedCardIds([])} variant="ghost" />
      </View>
    </View>
  ) : null;

  return (
    <AiLightScaffold
      footer={selectionFooter}
      onBack={onBack}
      scrollable
      subtitle={spaceLabel}
      title="角色"
    >
      <AiLightInputRow
        label="名称"
        onChangeText={setName}
        placeholder="品牌设定整理助手"
        value={name}
      />
      <AiLightTextareaRow
        label="角色内容"
        minHeight={240}
        onChangeText={setPrompt}
        placeholder="粘贴或输入角色内容"
        value={prompt}
      />

      <View style={styles.avatarPanel}>
        <View style={styles.avatarHeader}>
          <View style={styles.avatarPreview}>
            {avatarUri ? (
              <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={avatarUri} />
            ) : (
              <Ionicons color={aiLightColors.coralActive} name="sparkles-outline" size={metrics.iconSizeMd} />
            )}
          </View>
          <View style={styles.avatarCopy}>
            <Text style={styles.sectionTitle}>角色头像</Text>
            <Text style={styles.caption}>{avatarEnabled ? '启用后，聊天回复会显示这个头像。' : '关闭后，聊天保持当前无头像样式。'}</Text>
          </View>
        </View>
        <View style={styles.inlineActions}>
          <AiLightButton label={avatarEnabled ? '隐藏头像' : '启用头像'} onPress={() => setAvatarEnabled((current) => !current)} variant="outline" />
          <AiLightButton label="从相册选择" onPress={() => void pickAvatarFromAlbum()} variant="ghost" />
          {avatarUri ? <AiLightButton label="清除头像" onPress={() => setAvatarUri(null)} variant="ghost" /> : null}
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
            {avatarCandidates.length ? (
              <View style={styles.avatarGrid}>
                {avatarCandidates.map((image) => {
                  const candidateUri = image.coverThumbnailFileUri ?? image.thumbnailFileUri ?? image.originalFileUri;
                  const active = avatarUri === candidateUri;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={image.id}
                      onPress={() => {
                        setAvatarUri(candidateUri);
                        setAvatarEnabled(true);
                      }}
                      style={({ pressed }) => [styles.avatarChoice, active && styles.avatarChoiceActive, pressed && styles.pressed]}
                    >
                      <SecureImage contentFit="cover" space={space} style={styles.avatarChoiceImage} uri={candidateUri} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.caption}>当前 IP 还没有可用图片。</Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <AiLightButton label={importing ? '解析角色卡中' : '导入角色卡'} loading={importing} onPress={() => void importRoleCard()} variant="outline" />
        <AiLightButton label="应用" onPress={() => void applyCurrentRole()} />
        <AiLightButton label="保存" loading={saving} onPress={saveReusableRoleCard} variant="outline" />
        <AiLightButton label="跳过" onPress={() => void applyRoleCard(null)} variant="ghost" />
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      {importedRole ? (
        <AiRoleCardImportPreview
          avatarUri={importedAvatarUri}
          imported={importedRole}
          selectedGreeting={selectedGreeting}
          space={space}
          onCancel={() => {
            setImportedRole(null);
            setImportedAvatarUri(null);
            setSelectedGreeting(null);
          }}
          onEdit={editImportedRole}
          onSave={() => {
            void saveImported(false);
          }}
          onSaveAndStart={() => {
            void saveImported(true);
          }}
          onSelectGreeting={setSelectedGreeting}
        />
      ) : null}

      {cards.length ? (
        <View style={styles.cardList}>
          <Text style={styles.sectionTitle}>已保存</Text>
          {cards.map((card) => {
            const selected = selectedCardIds.includes(card.id);
            const sourceLabel = getRoleCardSourceLabel(card);
            return (
              <Pressable
                accessibilityRole="button"
                key={card.id}
                onLongPress={() => toggleSelected(card.id)}
                onPress={() => {
                  if (selectedCardIds.length) {
                    toggleSelected(card.id);
                    return;
                  }
                  loadCardIntoEditor(card);
                }}
                style={({ pressed }) => [styles.savedCard, selected && styles.selectedSavedCard, pressed && styles.pressed]}
              >
                <View style={styles.savedHeader}>
                  <View style={styles.roleCover}>
                    {card.avatarEnabled && card.avatarUri ? (
                      <SecureImage contentFit="cover" space={space} style={styles.roleCoverImage} uri={card.avatarUri} />
                    ) : (
                      <Ionicons color={aiLightColors.coralActive} name="person-circle-outline" size={metrics.iconButtonSize} />
                    )}
                  </View>
                  <View style={styles.savedCopy}>
                    <View style={styles.savedTitleRow}>
                      <Text numberOfLines={1} style={styles.savedTitle}>{card.name}</Text>
                      {selected ? <Ionicons color={aiLightColors.coralActive} name="checkmark-circle" size={metrics.iconSizeMd} /> : null}
                    </View>
                    <View style={styles.sourceBadge}>
                      <Text style={styles.sourceBadgeText}>{sourceLabel}</Text>
                    </View>
                    <Text numberOfLines={2} style={styles.caption}>{card.description ?? card.prompt}</Text>
                  </View>
                </View>
                {!selectedCardIds.length && threadId ? <AiLightButton label="应用到当前会话" onPress={() => void applyRoleCard(card.id)} variant="ghost" /> : null}
                {!selectedCardIds.length && !threadId ? <AiLightButton label="开始聊天" onPress={() => onStartChatWithRole?.(card.id)} variant="ghost" /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <AppDialog
        danger
        message={`将删除 ${selectedCardIds.length} 张已保存角色卡。已有聊天记录会保留当时的角色快照。`}
        onClose={() => setConfirmingBatchDelete(false)}
        onPrimary={() => {
          void deleteSelectedCards();
        }}
        primaryDisabled={!selectedCardIds.length}
        primaryLabel="批量删除"
        title="删除所选角色卡？"
        visible={confirmingBatchDelete}
      />
    </AiLightScaffold>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  caption: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  actions: {
    gap: rhythm.inlineGap,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.inlineGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: aiLightColors.coralActive,
  },
  cardList: {
    gap: rhythm.listCardGap,
  },
  avatarPanel: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  avatarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  avatarPreview: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: metrics.iconButtonSize,
    justifyContent: 'center',
    overflow: 'hidden',
    width: metrics.iconButtonSize,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  ipAvatarPicker: {
    gap: rhythm.cardContentGap,
  },
  ipChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  ipChip: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 140,
    minHeight: metrics.chipHeight,
    paddingHorizontal: spacing[3],
    justifyContent: 'center',
  },
  ipChipActive: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.coral,
  },
  ipChipText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  ipChipTextActive: {
    color: aiLightColors.coralActive,
    fontWeight: '700',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  avatarChoice: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: metrics.iconButtonSize,
    overflow: 'hidden',
    width: metrics.iconButtonSize,
  },
  avatarChoiceActive: {
    borderColor: aiLightColors.coral,
    borderWidth: 2,
  },
  avatarChoiceImage: {
    height: '100%',
    width: '100%',
  },
  savedCard: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  selectedSavedCard: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.coral,
  },
  savedHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  roleCover: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    height: metrics.minTouchSize * 2,
    justifyContent: 'center',
    overflow: 'hidden',
    width: metrics.minTouchSize * 2,
  },
  roleCoverImage: {
    height: '100%',
    width: '100%',
  },
  savedCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  selectionFooter: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  selectionCopy: {
    gap: rhythm.microGap,
  },
  selectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  selectionMeta: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  selectionActions: {
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.78,
  },
  savedTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  savedTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
  },
  sourceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  sourceBadgeText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontWeight: '700',
  },
});

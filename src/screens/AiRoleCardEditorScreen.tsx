import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiAvatarPicker } from '../components/ai/AiAvatarPicker';
import { AiRoleCardImportPreview } from '../components/ai/AiRoleCardImportPreview';
import { SecureImage } from '../components/SecureImage';
import { applyRoleCardToThread } from '../ai/aiChatService';
import { listRoleCards, saveImportedRoleCard, saveRoleCard } from '../ai/aiRoleCardService';
import {
  parseSillyTavernJson,
  parseSillyTavernPngBase64,
  type NormalizedSillyTavernRoleCard,
  type SillyTavernParseResult,
} from '../ai/sillyTavernRoleCardParser';
import type { AiRoleCardRecord, AiRoleCardSourceType } from '../ai/types';
import { copyAiRoleAvatarToAppStorage } from '../services/fileStorageService';
import type { PixorySpace } from '../database';

interface AiRoleCardEditorScreenProps {
  space: PixorySpace;
  roleCardId?: string;
  threadId?: string;
  onBack: () => void;
  onApplyRoleCard: (roleCardId?: string | null) => void;
  onStartChatWithRole?: (roleCardId: string) => Promise<void> | void;
}

interface RoleCardEditorDraft {
  name: string;
  description: string;
  prompt: string;
  avatarEnabled: boolean;
  avatarUri: string | null;
  firstMessage: string | null;
  alternateGreetings: string[];
  sourceType: AiRoleCardSourceType | null;
  sourceJson: string | null;
  tags: string[];
}

const DEFAULT_ROLE_CARD_DRAFT: RoleCardEditorDraft = {
  name: '',
  description: '',
  prompt: '',
  avatarEnabled: false,
  avatarUri: null,
  firstMessage: null,
  alternateGreetings: [],
  sourceType: 'pixory_manual',
  sourceJson: null,
  tags: [],
};

const ROLE_CONTENT_TEXTAREA_MIN_HEIGHT = 168;

function serializeRoleEditorDraft(draft: RoleCardEditorDraft): string {
  return JSON.stringify(draft);
}

export function AiRoleCardEditorScreen({
  space,
  roleCardId,
  threadId,
  onBack,
  onApplyRoleCard,
  onStartChatWithRole,
}: AiRoleCardEditorScreenProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [avatarEnabled, setAvatarEnabled] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState<string | null>(null);
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>([]);
  const [sourceType, setSourceType] = useState<AiRoleCardSourceType | null>('pixory_manual');
  const [sourceJson, setSourceJson] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [cards, setCards] = useState<AiRoleCardRecord[]>([]);

  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importedRole, setImportedRole] = useState<NormalizedSillyTavernRoleCard | null>(null);
  const [importedAvatarUri, setImportedAvatarUri] = useState<string | null>(null);
  const [selectedGreeting, setSelectedGreeting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [editorBaseline, setEditorBaseline] = useState(() => serializeRoleEditorDraft(DEFAULT_ROLE_CARD_DRAFT));
  
  const [nameFocused, setNameFocused] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);

  const savingImportedRef = useRef(false);
  const loadedInitialRoleIdRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();

  const loadCards = useCallback(async () => {
    const nextCards = await listRoleCards(space);
    setCards(nextCards);
  }, [space]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  function createCurrentDraft(): RoleCardEditorDraft {
    return { name, description, prompt, avatarEnabled, avatarUri, firstMessage, alternateGreetings, sourceType, sourceJson, tags };
  }

  function createDraftFromCard(card: AiRoleCardRecord): RoleCardEditorDraft {
    return {
      name: card.name, description: card.description ?? '', prompt: card.prompt,
      avatarEnabled: card.avatarEnabled, avatarUri: card.avatarUri, firstMessage: card.firstMessage,
      alternateGreetings: card.alternateGreetings, sourceType: card.sourceType, sourceJson: card.sourceJson, tags: card.tags,
    };
  }

  function applyDraftToEditor(draft: RoleCardEditorDraft) {
    setName(draft.name); setDescription(draft.description); setPrompt(draft.prompt);
    setAvatarEnabled(draft.avatarEnabled); setAvatarUri(draft.avatarUri); setFirstMessage(draft.firstMessage);
    setAlternateGreetings(draft.alternateGreetings); setSourceType(draft.sourceType); setSourceJson(draft.sourceJson); setTags(draft.tags);
  }

  function hasUnsavedEditorChanges() {
    return Boolean(importedRole) || serializeRoleEditorDraft(createCurrentDraft()) !== editorBaseline;
  }

  function loadCardIntoEditor(card: AiRoleCardRecord) {
    const draft = createDraftFromCard(card);
    setEditingRoleId(card.id);
    applyDraftToEditor(draft);
    resetImportedPreview();
    setEditorBaseline(serializeRoleEditorDraft(draft));
    setStatus('已载入角色，可继续编辑。');
  }

  function resetImportedPreview() {
    setImportedRole(null); setImportedAvatarUri(null); setSelectedGreeting(null);
  }

  function loadImportedRoleIntoEditor() {
    if (!importedRole) return;
    const draft: RoleCardEditorDraft = {
      name: importedRole.name, description: importedRole.description ?? '', prompt: importedRole.prompt,
      avatarEnabled: Boolean(importedAvatarUri), avatarUri: importedAvatarUri,
      firstMessage: selectedGreeting ?? importedRole.firstMessage, alternateGreetings: importedRole.alternateGreetings,
      sourceType: importedRole.sourceType, sourceJson: importedRole.sourceJson, tags: importedRole.tags,
    };
    setEditingRoleId(null);
    applyDraftToEditor(draft);
    resetImportedPreview();
    setStatus('已填入角色编辑表单，保存后生效。');
  }

  useEffect(() => {
    if (!roleCardId || loadedInitialRoleIdRef.current === roleCardId || hasUnsavedEditorChanges()) return;
    const card = cards.find((candidate) => candidate.id === roleCardId);
    if (!card) return;
    loadedInitialRoleIdRef.current = roleCardId;
    loadCardIntoEditor(card);
  }, [cards, roleCardId]);

  function isJsonAsset(asset: DocumentPicker.DocumentPickerAsset) {
    return asset.mimeType === 'application/json' || asset.name.toLowerCase().endsWith('.json');
  }

  function isPngAsset(asset: DocumentPicker.DocumentPickerAsset) {
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

  async function copyImportedAvatar(assetUri: string) {
    try {
      return await copyAiRoleAvatarToAppStorage(assetUri, space);
    } catch (error) {
      setStatus(error instanceof Error ? `头像复制失败：${error.message}` : '头像复制失败');
      return null;
    }
  }

  async function importRoleCard() {
    setStatus(null); setImportedRole(null); setImportedAvatarUri(null); setSelectedGreeting(null);
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true, multiple: false, type: ['image/png', 'application/json'],
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setImporting(true);
    try {
      const parsed = await parsePickedRoleCardAsset(asset);
      if (!parsed.ok) {
        if (parsed.code === 'missing_chara' && isPngAsset(asset)) {
          const copiedUri = await copyImportedAvatar(asset.uri);
          if (copiedUri) {
            setAvatarUri(copiedUri); setAvatarEnabled(true); setStatus('未检测到角色数据，已将图片作为角色头像。');
          }
          return;
        }
        setStatus(parsed.message);
        return;
      }

      const copiedAvatarUri = isPngAsset(asset) ? await copyImportedAvatar(asset.uri) : null;
      if (isPngAsset(asset) && !copiedAvatarUri) return;
      
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
    if (!importedRole || saving || savingImportedRef.current) return null;
    savingImportedRef.current = true;
    setSaving(true);
    try {
      const card = await saveImportedRoleCard({
        avatarUri: importedAvatarUri, firstMessage: selectedGreeting, imported: importedRole, space,
      });
      setImportedRole(null); setImportedAvatarUri(null); setSelectedGreeting(null);
      setStatus(startChat && !threadId && onStartChatWithRole ? '已保存，正在开始新对话。' : threadId ? '已保存并应用。' : '已保存角色。');
      await loadCards();
      if (startChat && !threadId) {
        try { await onStartChatWithRole?.(card.id); } 
        catch (error) { setStatus(error instanceof Error ? `角色已保存，但开始聊天失败：${error.message}` : '角色已保存，但开始聊天失败'); }
      } else if (threadId) {
        await applyRoleCard(card.id);
      }
      return card;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
      return null;
    } finally {
      savingImportedRef.current = false;
      setSaving(false);
    }
  }

  function editImportedRole() {
    loadImportedRoleIntoEditor();
  }

  async function saveReusableRoleCard() {
    if (!prompt.trim()) {
      setStatus('请先填写角色内容。');
      return;
    }
    setSaving(true);
    try {
      const card = await saveRoleCard({
        roleCardId: editingRoleId, description, name: name.trim() || '未命名角色卡', prompt, firstMessage,
        alternateGreetings, sourceType, sourceJson, avatarEnabled, avatarUri, space, tags,
      });
      const savedDraft = createDraftFromCard(card);
      setEditingRoleId(card.id);
      setEditorBaseline(serializeRoleEditorDraft(savedDraft));
      setStatus(editingRoleId ? '已更新角色卡。' : '已保存角色。');
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
    if (threadId) await applyRoleCardToThread({ roleCardId: roleId, space, threadId });
    onApplyRoleCard(roleId);
  }

  async function saveCurrentRole(startChat: boolean) {
    if (!prompt.trim()) {
      setStatus('请先填写角色内容。');
      return;
    }
    const saved = await saveReusableRoleCard();
    if (!saved) return;
    if (startChat && !threadId) {
      try {
        setStatus('已保存，正在开始新对话。');
        await onStartChatWithRole?.(saved.id);
      } catch (error) {
        setStatus(error instanceof Error ? `角色已保存，但开始聊天失败：${error.message}` : '角色已保存，但开始聊天失败');
      }
      return;
    }
    if (threadId) {
      setStatus('已保存并应用。');
      await applyRoleCard(saved.id);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Pressable style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} onPress={onBack}>
              <Ionicons name="arrow-back" size={20} color="#1a1c1c" />
            </Pressable>
            <Text style={styles.headerTitle}>{editingRoleId ? '编辑角色' : '创建角色'}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        {/* Field 1: 名称 (Name) */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>名称</Text>
          <View style={[styles.inputWrapper, nameFocused && styles.inputWrapperFocused]}>
            <TextInput
              style={styles.textInputName}
              placeholder="输入角色名称..."
              placeholderTextColor="#747878"
              value={name}
              onChangeText={setName}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>
        </View>

        {/* Field 2: 角色内容 (Persona Content) */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>角色内容</Text>
          <View style={[styles.inputWrapper, promptFocused && styles.inputWrapperFocused]}>
            <TextInput
              style={styles.textInputDesc}
              placeholder="粘贴或输入角色内容"
              placeholderTextColor="#747878"
              multiline
              value={prompt}
              onChangeText={setPrompt}
              onFocus={() => setPromptFocused(true)}
              onBlur={() => setPromptFocused(false)}
            />
            <View style={styles.editNoteIcon}>
              <Ionicons name="create-outline" size={16} color="#747878" />
            </View>
          </View>
        </View>

        {/* Field 3: 角色头像 (Persona Avatar) Card */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>角色头像</Text>
          <View style={styles.avatarCard}>
            <View style={styles.avatarHeader}>
              <View style={styles.avatarIconBox}>
                {avatarUri && avatarEnabled ? (
                  <SecureImage contentFit="cover" space={space} style={styles.avatarImage} uri={avatarUri} />
                ) : (
                  <Ionicons name="sparkles" size={18} color="#1a1c1c" />
                )}
              </View>
              <View style={styles.avatarTexts}>
                <Text style={styles.avatarTitle}>角色头像</Text>
                <Text style={styles.avatarSub}>关闭后，聊天保持当前无头像样式。</Text>
              </View>
            </View>
            
            <Pressable 
              style={({ pressed }) => [styles.toggleButton, avatarEnabled && styles.toggleButtonActive, pressed && styles.buttonPressed]} 
              onPress={() => setAvatarEnabled(!avatarEnabled)}
            >
              <Ionicons name="person-circle-outline" size={18} color={avatarEnabled ? '#ffffff' : '#1a1c1c'} />
              <Text style={[styles.toggleButtonText, avatarEnabled && styles.toggleButtonTextActive]}>
                {avatarEnabled ? '已启用头像' : '启用头像'}
              </Text>
            </Pressable>

            <AiAvatarPicker
              avatarUri={avatarUri}
              onAvatarChange={(uri) => {
                setAvatarUri(uri);
                if (uri) setAvatarEnabled(true);
              }}
              space={space}
              onError={(err) => setStatus(err instanceof Error ? err.message : String(err))}
            />
          </View>
        </View>

        {/* Action Buttons Stack */}
        <View style={styles.actionsStack}>
          <Pressable 
            style={({ pressed }) => [styles.btnSecondaryShadow, pressed && styles.buttonPressed]} 
            onPress={() => void importRoleCard()}
            disabled={importing}
          >
            <Ionicons name="enter-outline" size={18} color="#1a1c1c" />
            <Text style={styles.btnText}>{importing ? '解析角色卡中' : '导入角色卡'}</Text>
          </Pressable>
          <Pressable 
            style={({ pressed }) => [styles.btnPrimary, pressed && styles.buttonPressed]} 
            onPress={() => void saveCurrentRole(true)}
            disabled={saving}
          >
            <Ionicons name="checkmark-done" size={18} color="#ffffff" />
            <Text style={styles.btnPrimaryText}>保存并应用</Text>
          </Pressable>
          <Pressable 
            style={({ pressed }) => [styles.btnTertiary, pressed && styles.buttonPressed]} 
            onPress={() => void saveCurrentRole(false)}
            disabled={saving}
          >
            <Text style={styles.btnText}>仅保存</Text>
          </Pressable>
          {threadId ? (
            <Pressable 
              style={({ pressed }) => [styles.btnGhost, pressed && styles.buttonPressed]} 
              onPress={() => void applyRoleCard(null)}
            >
              <Text style={styles.btnText}>使用默认角色</Text>
            </Pressable>
          ) : null}
        </View>

        {status ? <Text style={styles.status}>{status}</Text> : null}

        {importedRole ? (
          <AiRoleCardImportPreview
            allowStartChat={!threadId}
            avatarUri={importedAvatarUri}
            imported={importedRole}
            saveLabel={threadId ? '保存并应用' : '仅保存'}
            saving={saving}
            selectedGreeting={selectedGreeting}
            space={space}
            onCancel={resetImportedPreview}
            onEdit={editImportedRole}
            onSave={() => void saveImported(false)}
            onSaveAndStart={() => void saveImported(true)}
            onSelectGreeting={setSelectedGreeting}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    backgroundColor: 'rgba(249,249,249,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
    zIndex: 50,
  },
  headerContent: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    marginLeft: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#1a1c1c',
    letterSpacing: -0.2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 20,
  },
  fieldContainer: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1c1c',
  },
  inputWrapper: {
    backgroundColor: '#f3f3f4',
    borderRadius: 12,
    width: '100%',
    overflow: 'hidden',
  },
  inputWrapperFocused: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  textInputName: {
    height: 48,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1a1c1c',
  },
  textInputDesc: {
    minHeight: ROLE_CONTENT_TEXTAREA_MIN_HEIGHT,
    padding: 12,
    fontSize: 13,
    color: '#1a1c1c',
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  editNoteIcon: {
    position: 'absolute',
    bottom: 4,
    right: 8,
  },
  avatarCard: {
    backgroundColor: '#f3f3f4',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  avatarHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  avatarIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarTexts: {
    flex: 1,
  },
  avatarTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1c1c',
  },
  avatarSub: {
    fontSize: 13,
    color: '#444748',
    marginTop: 2,
  },
  toggleButton: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e2e2e2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  toggleButtonActive: {
    backgroundColor: '#000000',
  },
  toggleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1c1c',
  },
  toggleButtonTextActive: {
    color: '#ffffff',
  },
  actionsStack: {
    gap: 8,
    paddingTop: 4,
  },
  btnSecondaryShadow: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  btnPrimary: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  btnTertiary: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e8e8e8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1c1c',
  },
  btnGhost: {
    width: '100%',
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
  },
  pressed: {
    opacity: 0.7,
  },
  status: {
    fontSize: 11,
    color: '#000000',
    marginTop: 8,
    textAlign: 'center',
  }
});


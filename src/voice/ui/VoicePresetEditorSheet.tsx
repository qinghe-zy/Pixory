import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../design/tokens';
import type { PixorySpace } from '../../database';
import type { VoicePresetRecord, VoiceEngineKind } from '../types';
import { getEngineCapabilities } from '../modelCapabilities';
import {
  fetchModelsFromEndpoint,
  fetchVoicesFromEndpoint,
  type RemoteVoiceCandidate,
} from '../engines/openAiCompatEngine';
import { getVoicePresetApiKey, setVoicePresetApiKey } from '../voiceSecureStore';
import { voiceService } from '../voiceService';
import { getDatabase } from '../../database/db';

interface VoicePresetEditorSheetProps {
  visible: boolean;
  space: PixorySpace;
  preset?: VoicePresetRecord | null;
  onClose: () => void;
  onSave: (preset: VoicePresetRecord) => void;
  onDelete?: (presetId: string) => void;
}

export function VoicePresetEditorSheet({
  visible,
  space,
  preset,
  onClose,
  onSave,
  onDelete,
}: VoicePresetEditorSheetProps) {
  const isEditing = Boolean(preset && !preset.isBuiltin);

  const [name, setName] = useState('');
  const [engineKind, setEngineKind] = useState<VoiceEngineKind>('openai_compat');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(0.0);
  const [style, setStyle] = useState<string | null>(null);

  // 获取模型列表状态
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelCandidates, setModelCandidates] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 获取音色列表状态
  const [fetchingVoices, setFetchingVoices] = useState(false);
  const [voiceCandidates, setVoiceCandidates] = useState<RemoteVoiceCandidate[]>([]);
  const [fetchVoiceError, setFetchVoiceError] = useState<string | null>(null);

  // 试听状态
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (preset) {
        setName(preset.name);
        setEngineKind(preset.engineKind === 'builtin_free' ? 'openai_compat' : preset.engineKind);
        setBaseUrl(preset.baseUrl || '');
        setModel(preset.model || '');
        setVoiceId(preset.voiceId || '');
        setRate(preset.rate ?? 1.0);
        setPitch(preset.pitch ?? 0.0);
        setStyle(preset.style ?? null);
        void getVoicePresetApiKey(space, preset.id).then((key) => {
          setApiKey(key || '');
        });
      } else {
        setName('我的自定义音色');
        setEngineKind('openai_compat');
        setBaseUrl('https://api.openai.com/v1');
        setApiKey('');
        setModel('tts-1');
        setVoiceId('alloy');
        setRate(1.0);
        setPitch(0.0);
        setStyle(null);
      }
      setModelCandidates([]);
      setFetchError(null);
      setVoiceCandidates([]);
      setFetchVoiceError(null);
      setTestStatus(null);
    }
  }, [visible, preset, space]);

  const capabilities = getEngineCapabilities(engineKind, model);

  async function handleFetchModels() {
    if (!baseUrl.trim()) {
      setFetchError('请先填写接口地址');
      return;
    }
    setFetchingModels(true);
    setFetchError(null);
    try {
      const list = await fetchModelsFromEndpoint(baseUrl, apiKey);
      if (list.length === 0) {
        setFetchError('未获取到模型列表，已切换为手动输入');
      } else {
        setModelCandidates(list);
        if (!model && list[0]) {
          setModel(list[0]);
        }
      }
    } catch (err: any) {
      setFetchError(err?.message || '获取模型失败');
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleFetchVoices() {
    if (!baseUrl.trim()) {
      setFetchVoiceError('请先填写接口地址 (Base URL)');
      return;
    }
    setFetchingVoices(true);
    setFetchVoiceError(null);
    try {
      const list = await fetchVoicesFromEndpoint(baseUrl.trim(), apiKey.trim() || undefined, model.trim() || undefined);
      if (list.length === 0) {
        setFetchVoiceError('未获取到发音人列表');
      } else {
        setVoiceCandidates(list);
        if (!voiceId && list[0]) {
          setVoiceId(list[0].id);
        }
      }
    } catch (err: any) {
      setFetchVoiceError(err?.message || '获取音色列表失败');
    } finally {
      setFetchingVoices(false);
    }
  }

  async function handleTestPlay() {
    setTesting(true);
    setTestStatus('正在合成试听音频...');
    const startTime = Date.now();
    try {
      const db = await getDatabase(space);
      const testPreset: VoicePresetRecord = {
        id: preset?.id || `temp-test-${Date.now()}`,
        name: name || '试听',
        engineKind,
        baseUrl: baseUrl.trim() || null,
        model: model.trim() || null,
        voiceId: voiceId.trim() || (engineKind === 'native' ? 'native-default' : 'alloy'),
        rate,
        pitch,
        style,
        isBuiltin: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (apiKey.trim()) {
        await setVoicePresetApiKey(space, testPreset.id, apiKey);
      }

      const result = await voiceService.prepareAudio('你好呀，今天过得开心吗？', {
        db,
        space,
        directPreset: testPreset,
        directApiKey: apiKey.trim(),
      });

      const elapsed = Date.now() - startTime;
      setTestStatus(`合成成功 (${elapsed}ms，引擎: ${result.engineUsed})`);
      await voiceService.speak('你好呀，今天过得开心吗？', {
        db,
        space,
        directPreset: testPreset,
        directApiKey: apiKey.trim(),
      });
    } catch (err: any) {
      setTestStatus(`试听失败: ${err?.message || '未知错误'}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const presetId = preset?.id || `preset_${Date.now()}`;
    const newPreset: VoicePresetRecord = {
      id: presetId,
      name: trimmedName,
      engineKind,
      baseUrl: baseUrl.trim() || null,
      model: model.trim() || null,
      voiceId: voiceId.trim() || (engineKind === 'native' ? 'native-default' : 'alloy'),
      rate,
      pitch: capabilities.supportsPitch ? pitch : 0.0,
      style: capabilities.supportedStyles.length > 0 ? style : null,
      isBuiltin: false,
      createdAt: preset?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (apiKey.trim()) {
      await setVoicePresetApiKey(space, presetId, apiKey);
    }

    onSave(newPreset);
    onClose();
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭弹窗" onPress={onClose} style={StyleSheet.absoluteFillObject} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoidingSheet}
        >
          <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{isEditing ? '编辑声音模型预设' : '新建声音模型预设'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isEditing && Boolean(onDelete) && (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    if (preset?.id && onDelete) {
                      onDelete(preset.id);
                      onClose();
                    }
                  }}
                  style={styles.closeBtn}
                  accessibilityLabel="删除此自定义预设"
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="关闭弹窗">
                <Ionicons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
            {/* 预设名称 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>预设名称</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="例如：知性温婉·我的专属声线"
                placeholderTextColor={colors.text.tertiary}
              />
            </View>

            {/* 引擎类型选择 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>引擎来源</Text>
              <View style={styles.engineTabs}>
                {(['openai_compat', 'native'] as VoiceEngineKind[]).map((kind) => {
                  const active = engineKind === kind;
                  const label = kind === 'openai_compat' ? '自定义 API / 模型服务商' : '本机离线朗读';
                  return (
                    <Pressable
                      key={kind}
                      onPress={() => setEngineKind(kind)}
                      style={[styles.engineTab, active && styles.engineTabActive]}
                    >
                      <Text style={[styles.engineTabText, active && styles.engineTabTextActive]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 自定义 API 配置 */}
            {engineKind === 'openai_compat' && (
              <View style={styles.apiBox}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>接口地址 (Base URL)</Text>
                  <TextInput
                    style={styles.input}
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    placeholder="https://api.openai.com/v1"
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>API Key (已安全存储在 SecureStore)</Text>
                  <TextInput
                    style={styles.input}
                    value={apiKey}
                    onChangeText={setApiKey}
                    placeholder="sk-..."
                    placeholderTextColor={colors.text.tertiary}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.fieldLabel}>模型名称</Text>
                    <Pressable
                      onPress={handleFetchModels}
                      disabled={fetchingModels}
                      style={styles.fetchBtn}
                      hitSlop={8}
                    >
                      {fetchingModels ? (
                        <ActivityIndicator size="small" color={colors.primary.default} />
                      ) : (
                        <Text style={styles.fetchBtnText}>获取模型列表</Text>
                      )}
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={model}
                    onChangeText={setModel}
                    placeholder="例如：tts-1, mimo-v2.5-tts, speech-01-turbo"
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                  />
                  {fetchError && <Text style={styles.errorText}>{fetchError}</Text>}
                  {modelCandidates.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.candidateRow}>
                      {modelCandidates.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setModel(c)}
                          style={[styles.candidateChip, model === c && styles.candidateChipActive]}
                        >
                          <Text style={[styles.candidateText, model === c && styles.candidateTextActive]}>
                            {c}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>

                <View style={styles.fieldGroup}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.fieldLabel}>音色 ID (Voice ID / 克隆声纹 ID)</Text>
                    <Pressable
                      onPress={handleFetchVoices}
                      disabled={fetchingVoices}
                      style={styles.fetchBtn}
                      hitSlop={8}
                    >
                      {fetchingVoices ? (
                        <ActivityIndicator size="small" color={colors.primary.default} />
                      ) : (
                        <Text style={styles.fetchBtnText}>拉取服务商音色</Text>
                      )}
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={voiceId}
                    onChangeText={setVoiceId}
                    placeholder="例如：alloy, 冰糖, alex, female-tianmei"
                    placeholderTextColor={colors.text.tertiary}
                    autoCapitalize="none"
                  />
                  {fetchVoiceError && <Text style={styles.errorText}>{fetchVoiceError}</Text>}
                  {voiceCandidates.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.candidateRow}>
                      {voiceCandidates.map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => setVoiceId(c.id)}
                          style={[styles.candidateChip, voiceId === c.id && styles.candidateChipActive]}
                        >
                          <Text style={[styles.candidateText, voiceId === c.id && styles.candidateTextActive]}>
                            {c.name} {c.description ? `· ${c.description.split('·')[0].trim()}` : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </View>
            )}

            {/* 语速微调 (0.7x ~ 1.5x) */}
            {capabilities.supportsSpeed && (
              <View style={styles.fieldGroup}>
                <View style={styles.rowBetween}>
                  <Text style={styles.fieldLabel}>语速调节</Text>
                  <Text style={styles.fieldValue}>{rate.toFixed(2)}x</Text>
                </View>
                <View style={styles.stepRow}>
                  {[0.8, 0.9, 1.0, 1.1, 1.25].map((val) => (
                    <Pressable
                      key={val}
                      onPress={() => setRate(val)}
                      style={[styles.stepBtn, rate === val && styles.stepBtnActive]}
                    >
                      <Text style={[styles.stepBtnText, rate === val && styles.stepBtnTextActive]}>
                        {val}x
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* 音高微调 (-20% ~ +20%) - 动态能力过滤 */}
            {capabilities.supportsPitch && (
              <View style={styles.fieldGroup}>
                <View style={styles.rowBetween}>
                  <Text style={styles.fieldLabel}>音高微调 (基频共振)</Text>
                  <Text style={styles.fieldValue}>
                    {pitch > 0 ? `+${pitch.toFixed(1)}%` : `${pitch.toFixed(1)}%`}
                  </Text>
                </View>
                <View style={styles.stepRow}>
                  {[-10, -5, 0, 5, 10].map((val) => (
                    <Pressable
                      key={val}
                      onPress={() => setPitch(val)}
                      style={[styles.stepBtn, pitch === val && styles.stepBtnActive]}
                    >
                      <Text style={[styles.stepBtnText, pitch === val && styles.stepBtnTextActive]}>
                        {val > 0 ? `+${val}%` : `${val}%`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* 情绪底色 - 动态能力过滤 */}
            {capabilities.supportedStyles.length > 0 && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>情绪底色风格</Text>
                <View style={styles.stepRow}>
                  {[
                    { key: null, label: '标准自然' },
                    { key: 'empathic', label: '知心共情' },
                    { key: 'cheerful', label: '欢快元气' },
                    { key: 'whispering', label: '轻声耳语' },
                  ].map((item) => {
                    const active = style === item.key;
                    return (
                      <Pressable
                        key={item.label}
                        onPress={() => setStyle(item.key)}
                        style={[styles.stepBtn, active && styles.stepBtnActive]}
                      >
                        <Text style={[styles.stepBtnText, active && styles.stepBtnTextActive]}>
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 试听与诊断反馈 */}
            {testStatus && (
              <View style={styles.testFeedbackBox}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary.default} />
                <Text style={styles.testFeedbackText}>{testStatus}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Pressable
              onPress={handleTestPlay}
              disabled={testing}
              style={[styles.testBtn, testing && { opacity: 0.6 }]}
            >
              {testing ? (
                <ActivityIndicator size="small" color={colors.primary.default} />
              ) : (
                <>
                  <Ionicons name="play" size={16} color={colors.primary.default} style={{ marginRight: 4 }} />
                  <Text style={styles.testBtnText}>在线试听</Text>
                </>
              )}
            </Pressable>

            <Pressable onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>命名保存</Text>
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  keyboardAvoidingSheet: {
    width: '100%',
    maxHeight: '90%',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
  },
  contentInner: {
    paddingVertical: 16,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary.default,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  engineTabs: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    padding: 3,
  },
  engineTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  engineTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  engineTabText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  engineTabTextActive: {
    color: '#0F172A',
    fontWeight: '600',
  },
  apiBox: {
    gap: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fetchBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  fetchBtnText: {
    fontSize: 12,
    color: colors.primary.default,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
  },
  candidateRow: {
    flexDirection: 'row',
    paddingTop: 4,
  },
  candidateChip: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginRight: 6,
  },
  candidateChipActive: {
    backgroundColor: colors.primary.default,
  },
  candidateText: {
    fontSize: 12,
    color: '#475569',
  },
  candidateTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  voicePresetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  voicePresetChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  voicePresetChipActive: {
    borderColor: colors.primary.default,
    backgroundColor: '#EEF2FF',
  },
  voicePresetText: {
    fontSize: 13,
    color: '#475569',
  },
  voicePresetTextActive: {
    color: colors.primary.default,
    fontWeight: '600',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  stepBtnActive: {
    borderColor: colors.primary.default,
    backgroundColor: '#EEF2FF',
  },
  stepBtnText: {
    fontSize: 12,
    color: '#64748B',
  },
  stepBtnTextActive: {
    color: colors.primary.default,
    fontWeight: '600',
  },
  testFeedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    gap: 8,
  },
  testFeedbackText: {
    fontSize: 12,
    color: '#15803D',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  testBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary.default,
  },
  saveBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

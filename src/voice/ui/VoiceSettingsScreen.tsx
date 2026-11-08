import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppDialog } from '../../components/AppDialog';
import { ScreenScaffold } from '../../components/ScreenScaffold';
import { colors, radius, spacing, typography } from '../../design/tokens';
import type { PixorySpace } from '../../database';
import { getDatabase } from '../../database/db';
import { voiceRepository } from '../../database/repositories/voiceRepository';
import type { VoicePresetRecord } from '../types';
import { BUILTIN_VOICE_PRESETS } from '../builtinPresets';
import { fetchModelsFromEndpoint, fetchVoicesFromEndpoint, type RemoteVoiceCandidate } from '../engines/openAiCompatEngine';
import { resetTier1CircuitBreaker } from '../fallbackChain';
import { clearVoiceCache, getVoiceCacheStats } from '../voiceAudioCache';
import { getVoicePresetApiKey, setVoicePresetApiKey } from '../voiceSecureStore';
import { resolveDeveloperMimoKey } from '../developerVoiceSecurity';
import { voiceService } from '../voiceService';

interface VoiceSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
}

const SPEED_OPTIONS = [0.8, 0.9, 1.0, 1.1, 1.25];

export function VoiceSettingsScreen({ space, onBack }: VoiceSettingsScreenProps) {
  const [dbInstance, setDbInstance] = useState<any>(null);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);

  // 自定义 API 表单参数
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [isTemplateExpanded, setIsTemplateExpanded] = useState(false);

  // 内部统一经典黑白灰极简小圆角弹窗状态
  const [dialogState, setDialogState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    primaryLabel?: string;
    onPrimary?: () => void;
    secondaryLabel?: string | null;
    onSecondary?: () => void;
    danger?: boolean;
  } | null>(null);

  // 小米 MiMo 官方推荐声线选择
  const [selectedBuiltinId, setSelectedBuiltinId] = useState(BUILTIN_VOICE_PRESETS[0]?.id || 'mimo-bingtang');

  // 语速微调
  const [rate, setRate] = useState(1.0);

  // 获取模型列表
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelCandidates, setModelCandidates] = useState<string[]>([]);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);

  // 获取服务商音色列表
  const [isFetchingVoices, setIsFetchingVoices] = useState(false);
  const [voiceCandidates, setVoiceCandidates] = useState<RemoteVoiceCandidate[]>([]);
  const [fetchVoiceError, setFetchVoiceError] = useState<string | null>(null);

  // 试听与播放状态
  const [isTesting, setIsTesting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingPresetId, setPlayingPresetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 保存为新预设（支持重命名）
  const [saveAsNewModalVisible, setSaveAsNewModalVisible] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // 功能开关与缓存统计
  const [voiceBubbleEnabled, setVoiceBubbleEnabled] = useState(true);
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ count: number; totalBytes: number }>({
    count: 0,
    totalBytes: 0,
  });

  const selectedBuiltinPreset = useMemo(() => {
    return BUILTIN_VOICE_PRESETS.find((p) => p.id === selectedBuiltinId) || BUILTIN_VOICE_PRESETS[0];
  }, [selectedBuiltinId]);

  // 监听全局播放器状态联动试听图标，并在页面卸载时安全停止播放释放资源
  useEffect(() => {
    let isMounted = true;
    const unsub = voiceService.subscribe((state) => {
      if (!isMounted) return;
      setIsPlaying(state.isPlaying && state.activeId === 'settings_preview');
      if (!state.isPlaying) {
        setPlayingPresetId(null);
      }
    });
    return () => {
      isMounted = false;
      unsub();
      void voiceService.stop();
    };
  }, []);

  async function handleTogglePlayCard(p: VoicePresetRecord) {
    if (playingPresetId === p.id) {
      await voiceService.stop();
      setPlayingPresetId(null);
      return;
    }
    resetTier1CircuitBreaker();
    setPlayingPresetId(p.id);
    try {
      const effectiveKey =
        apiKey.trim() ||
        (await getVoicePresetApiKey(space, p.id)) ||
        (await getVoicePresetApiKey(space, 'mimo-global')) ||
        (await getVoicePresetApiKey(space, 'mimo-bingtang')) ||
        (await getVoicePresetApiKey(space, 'custom-openai-compat')) ||
        resolveDeveloperMimoKey(p.model, p.baseUrl);

      const draftWithRate: VoicePresetRecord = { ...p, rate };
      await voiceService.speak(
        '你好，我是你的专属伙伴，很高兴能用这种声音和你对话。',
        {
          db: dbInstance,
          space,
          directPreset: draftWithRate,
          directApiKey: effectiveKey || undefined,
        },
        `settings_card_${p.id}`
      );
    } catch (err: any) {
      setDialogState({ visible: true, title: '试听提示', message: err?.message || '试听失败，请检查服务地址与密钥' });
      setPlayingPresetId(null);
    }
  }

  async function loadData() {
    const db = await getDatabase(space);
    setDbInstance(db);

    const [stats, globalBinding] = await Promise.all([
      getVoiceCacheStats(db),
      voiceRepository.getBinding(db, 'global', '*'),
    ]);

    setCacheStats(stats);
    setVoiceBubbleEnabled(globalBinding?.voiceBubbleEnabled ?? true);
    setAutoReadEnabled(globalBinding?.autoReadEnabled ?? false);

    if (globalBinding?.presetId) {
      setCurrentPresetId(globalBinding.presetId);
      if (globalBinding.presetId.startsWith('mimo-')) {
        setSelectedBuiltinId(globalBinding.presetId);
      } else {
        const preset = await voiceRepository.getPresetById(db, globalBinding.presetId);
        if (preset) {
          setBaseUrl(preset.baseUrl || '');
          setModel(preset.model || '');
          setVoiceId(preset.voiceId || '');
          setRate(preset.rate ?? 1.0);
          setIsTemplateExpanded(true);
        }
      }
    }

    // 读取已有 Key
    const savedKey =
      (await getVoicePresetApiKey(space, 'mimo-global')) ||
      (await getVoicePresetApiKey(space, 'mimo-bingtang')) ||
      (await getVoicePresetApiKey(space, 'custom-openai-compat'));
    if (savedKey) setApiKey(savedKey);
  }

  useEffect(() => {
    void loadData();
  }, [space]);

  // 快速模版填充
  function handleApplyPresetTemplate(name: 'mimo' | 'siliconflow' | 'openai' | 'minimax') {
    if (name === 'mimo') {
      setBaseUrl('https://api.xiaomimimo.com/v1');
      setModel('mimo-v2.5-tts');
      setVoiceId('冰糖');
    } else if (name === 'siliconflow') {
      setBaseUrl('https://api.siliconflow.cn/v1');
      setModel('Qwen/CosyVoice2-0.5B');
      setVoiceId('alex');
    } else if (name === 'openai') {
      setBaseUrl('https://api.openai.com/v1');
      setModel('tts-1');
      setVoiceId('alloy');
    } else if (name === 'minimax') {
      setBaseUrl('https://api.minimax.chat/v1');
      setModel('speech-01-hd');
      setVoiceId('female-tianmei');
    }
  }

  // 获取模型列表
  async function handleFetchModels() {
    if (!baseUrl.trim()) {
      setDialogState({ visible: true, title: '提示', message: '请先填写接口地址 (Base URL)' });
      return;
    }
    setIsFetchingModels(true);
    try {
      const models = await fetchModelsFromEndpoint(baseUrl.trim(), apiKey.trim() || undefined);
      if (models.length === 0) {
        setDialogState({ visible: true, title: '未获取到模型', message: '服务已连接但未返回可用模型列表。' });
      } else {
        setModelCandidates(models);
        setModelPickerVisible(true);
      }
    } catch (err: any) {
      setDialogState({ visible: true, title: '获取失败', message: err?.message || '连接超时或权限受限' });
    } finally {
      setIsFetchingModels(false);
    }
  }

  // 获取服务商音色列表
  async function handleFetchVoices() {
    if (!baseUrl.trim()) {
      setDialogState({ visible: true, title: '提示', message: '请先填写接口地址 (Base URL)' });
      return;
    }
    setIsFetchingVoices(true);
    setFetchVoiceError(null);
    try {
      const voices = await fetchVoicesFromEndpoint(baseUrl.trim(), apiKey.trim() || undefined, model.trim() || undefined);
      if (voices.length === 0) {
        setDialogState({ visible: true, title: '未获取到音色', message: '服务已连接但未返回可用音色列表。' });
      } else {
        setVoiceCandidates(voices);
        if (!voiceId && voices[0]) {
          setVoiceId(voices[0].id);
        }
      }
    } catch (err: any) {
      setDialogState({ visible: true, title: '获取音色失败', message: err?.message || '连接超时或权限受限' });
    } finally {
      setIsFetchingVoices(false);
    }
  }

  // 点击【保存为新预设】入口：预填默认名称并打开重命名弹窗
  function handleOpenSaveAsNewModal() {
    const isCustomActive = isTemplateExpanded && Boolean(baseUrl.trim());
    const defaultName = isCustomActive
      ? `${model.trim() || '自定义音色'} · ${voiceId.trim() || '标准'}`
      : `${selectedBuiltinPreset.name} (自定义副本)`;
    setNewPresetName(defaultName);
    setSaveAsNewModalVisible(true);
  }

  // 确认保存新预设并落库 SQLite
  async function handleConfirmSaveAsNewPreset() {
    const trimmed = newPresetName.trim();
    if (!trimmed) {
      setDialogState({ visible: true, title: '提示', message: '请输入预设名称' });
      return;
    }
    const isCustomActive = isTemplateExpanded && Boolean(baseUrl.trim());
    const targetBase = isCustomActive ? baseUrl.trim() : (selectedBuiltinPreset.baseUrl || 'https://api.xiaomimimo.com/v1');
    const targetModel = isCustomActive ? (model.trim() || 'mimo-v2.5-tts') : (selectedBuiltinPreset.model || 'mimo-v2.5-tts');
    const targetVoiceId = isCustomActive ? (voiceId.trim() || 'alloy') : selectedBuiltinPreset.voiceId;

    const newId = `preset_${Date.now()}`;
    const newPreset: VoicePresetRecord = {
      id: newId,
      name: trimmed,
      engineKind: 'openai_compat',
      baseUrl: targetBase,
      model: targetModel,
      voiceId: targetVoiceId,
      rate,
      pitch: 0,
      style: isCustomActive ? null : selectedBuiltinPreset.style,
      isBuiltin: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      if (dbInstance) {
        await voiceRepository.upsertPreset(dbInstance, newPreset);
        if (apiKey.trim()) {
          await setVoicePresetApiKey(space, newId, apiKey.trim());
        }
        await voiceRepository.setBinding(dbInstance, {
          scopeType: 'global',
          scopeId: '*',
          presetId: newId,
          rateOverride: rate,
          pitchOverride: 0,
          voiceBubbleEnabled,
          autoReadEnabled,
          updatedAt: new Date().toISOString(),
        });
      }
      setCurrentPresetId(newId);
      setSaveAsNewModalVisible(false);
      setDialogState({
        visible: true,
        title: '新预设创建成功',
        message: `已持久化保存「${trimmed}」，当前已设为全局默认，并可在长聊侧边栏、伴聊相处定制及角色卡中无缝调用。`,
      });
    } catch (err: any) {
      setDialogState({ visible: true, title: '保存失败', message: err?.message || '无法写入数据库' });
    }
  }

  // 试听当前声音 (就地草稿试听，不污染正式数据库)
  async function handleTestVoice() {
    if (isPlaying) {
      await voiceService.stop();
      setIsPlaying(false);
      return;
    }

    // 用户主动试听，重置可能存在的熔断状态
    resetTier1CircuitBreaker();
    setIsTesting(true);
    try {
      const currentBuiltin = selectedBuiltinPreset;
      // 是否激活了高级自定义 BaseURL
      const isCustomActive = isTemplateExpanded && Boolean(baseUrl.trim());
      const targetBase = isCustomActive ? baseUrl.trim() : (currentBuiltin.baseUrl || 'https://api.xiaomimimo.com/v1');
      const targetModel = isCustomActive ? (model.trim() || 'mimo-v2.5-tts') : (currentBuiltin.model || 'mimo-v2.5-tts');

      // 密钥优先级：界面当前输入的 key -> 预设保存的 key -> 共享的 mimo-global key -> custom key -> 开发者内置授权
      const effectiveKey =
        apiKey.trim() ||
        (await getVoicePresetApiKey(space, currentBuiltin.id)) ||
        (await getVoicePresetApiKey(space, 'mimo-global')) ||
        (await getVoicePresetApiKey(space, 'custom-openai-compat')) ||
        resolveDeveloperMimoKey(targetModel, targetBase);

      // 仅当用户激活了自定义第三方 API 且未填 Key 时才阻断；系统内置预设支持开发者统付免 Key 畅听（自动回退至离线引擎）
      if (isCustomActive && !effectiveKey) {
        setDialogState({
          visible: true,
          title: '试听提示',
          message: '尚未配置 API Key，请在下方【高级自定义 API 服务】中填入您的服务商 API Key 后再试听。',
        });
        setIsTesting(false);
        return;
      }

      const draftPreset: VoicePresetRecord = {
        id: isCustomActive ? (currentPresetId || `draft_${Date.now()}`) : currentBuiltin.id,
        name: isCustomActive ? (model.trim() || '自定义 API 语音') : currentBuiltin.name,
        engineKind: 'openai_compat',
        baseUrl: isCustomActive ? baseUrl.trim() : (currentBuiltin.baseUrl || 'https://api.xiaomimimo.com/v1'),
        model: isCustomActive ? (model.trim() || 'mimo-v2.5-tts') : (currentBuiltin.model || 'mimo-v2.5-tts'),
        voiceId: isCustomActive ? (voiceId.trim() || '冰糖') : currentBuiltin.voiceId,
        rate,
        pitch: 0,
        style: isCustomActive ? null : currentBuiltin.style,
        isBuiltin: !isCustomActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await voiceService.speak(
        '你好，我是你的专属伙伴，很高兴能用这种声音和你对话。',
        {
          db: dbInstance,
          space,
          directPreset: draftPreset,
          directApiKey: effectiveKey || undefined,
        },
        'settings_preview'
      );
    } catch (err: any) {
      setDialogState({ visible: true, title: '试听提示', message: err?.message || '试听失败，请检查服务地址与密钥' });
    } finally {
      setIsTesting(false);
    }
  }

  // 保存并设为全局默认
  async function handleSaveGlobalPreset() {
    if (!dbInstance) return;
    resetTier1CircuitBreaker();
    setIsSaving(true);
    try {
      const isCustomActive = isTemplateExpanded && Boolean(baseUrl.trim());
      let finalPresetId = '';

      if (isCustomActive) {
        const presetId =
          currentPresetId && !currentPresetId.startsWith('mimo-')
            ? currentPresetId
            : `custom_api_${Date.now()}`;
        const preset: VoicePresetRecord = {
          id: presetId,
          name: model.trim() ? `API · ${model.trim()}` : '自定义 API 语音',
          engineKind: 'openai_compat',
          baseUrl: baseUrl.trim(),
          model: model.trim() || 'mimo-v2.5-tts',
          voiceId: voiceId.trim() || '冰糖',
          rate,
          pitch: 0,
          style: null,
          isBuiltin: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await voiceRepository.upsertPreset(dbInstance, preset);
        if (apiKey.trim()) {
          await setVoicePresetApiKey(space, presetId, apiKey.trim());
          await setVoicePresetApiKey(space, 'mimo-global', apiKey.trim());
        }
        finalPresetId = presetId;
      } else {
        finalPresetId = selectedBuiltinPreset.id;
        if (apiKey.trim()) {
          await setVoicePresetApiKey(space, finalPresetId, apiKey.trim());
          await setVoicePresetApiKey(space, 'mimo-global', apiKey.trim());
        }
      }

      await voiceRepository.setBinding(dbInstance, {
        scopeType: 'global',
        scopeId: '*',
        presetId: finalPresetId,
        rateOverride: rate,
        pitchOverride: 0,
        voiceBubbleEnabled,
        autoReadEnabled,
        updatedAt: new Date().toISOString(),
      });

      setCurrentPresetId(finalPresetId);
      setDialogState({ visible: true, title: '设置成功', message: '已保存并设为全局默认语音服务。' });
    } catch (err: any) {
      setDialogState({ visible: true, title: '保存失败', message: err?.message || '未知错误' });
    } finally {
      setIsSaving(false);
    }
  }

  // 开关切换处理
  async function handleToggleVoiceBubble(val: boolean) {
    if (!dbInstance) return;
    setVoiceBubbleEnabled(val);
    const existing = await voiceRepository.getBinding(dbInstance, 'global', '*');
    await voiceRepository.setBinding(dbInstance, {
      scopeType: 'global',
      scopeId: '*',
      presetId: existing?.presetId ?? currentPresetId,
      voiceBubbleEnabled: val,
      autoReadEnabled,
      updatedAt: new Date().toISOString(),
    });
  }

  async function handleToggleAutoRead(val: boolean) {
    if (!dbInstance) return;
    setAutoReadEnabled(val);
    const existing = await voiceRepository.getBinding(dbInstance, 'global', '*');
    await voiceRepository.setBinding(dbInstance, {
      scopeType: 'global',
      scopeId: '*',
      presetId: existing?.presetId ?? currentPresetId,
      voiceBubbleEnabled,
      autoReadEnabled: val,
      updatedAt: new Date().toISOString(),
    });
  }

  // 清理缓存
  async function handleClearCache() {
    if (!dbInstance) return;
    setDialogState({
      visible: true,
      title: '清理语音缓存',
      message: '确定要清理所有本地已缓存的语音文件吗？',
      primaryLabel: '确定清理',
      danger: true,
      onPrimary: async () => {
        setDialogState(null);
        await voiceService.stop();
        await clearVoiceCache(dbInstance, space);
        const stats = await getVoiceCacheStats(dbInstance);
        setCacheStats(stats);
      },
    });
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  return (
    <ScreenScaffold title="声音与朗读" onBack={onBack} compactBack decorativeTitle="">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. 系统内置推荐声学预设 (官方高保真音色 · 开发者统付免 KEY 畅听) */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>系统声学推荐 (官方高保真音色 · 开发者统付免 KEY 畅听)</Text>
        </View>

        <View style={styles.presetSelectionCol}>
          {BUILTIN_VOICE_PRESETS.map((p) => {
            const active = selectedBuiltinId === p.id && (!isTemplateExpanded || !baseUrl.trim());
            const isPlayingThis = playingPresetId === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setSelectedBuiltinId(p.id)}
                style={[styles.presetRowItem, active && styles.presetRowItemActive]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.presetItemName, active && styles.presetItemNameActive]}>
                    {p.name}
                  </Text>
                  <Text style={styles.presetItemDesc}>
                    {p.style}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {/* 用户要求的预设卡片右侧内置小喇叭图标，点击即可试听 */}
                  <Pressable
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      void handleTogglePlayCard(p);
                    }}
                    style={{
                      padding: 6,
                      borderRadius: radius.pill,
                      backgroundColor: isPlayingThis ? '#EEF2FF' : '#F1F5F9',
                    }}
                    accessibilityLabel={isPlayingThis ? '停止试听' : '试听音色'}
                  >
                    <Ionicons
                      name={isPlayingThis ? 'stop-circle' : 'volume-medium-outline'}
                      size={20}
                      color={isPlayingThis ? colors.primary.default : '#64748B'}
                    />
                  </Pressable>
                  {active ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={colors.primary.default}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* 2. 高级自定义 API 服务 (可选 · 自配专属密钥) */}
        <View style={[styles.sectionHeader, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>高级自定义 API 服务 (可选 · 自配专属密钥)</Text>
        </View>

        <View style={styles.formContainer}>
          {/* API 密钥 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>API 密钥 (API Key · 可选)</Text>
            <View style={styles.inputWithAction}>
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="可选：输入自定义小米/硅基流动/OpenAI API Key"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showApiKey}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable
                onPress={() => setShowApiKey(!showApiKey)}
                style={styles.actionIconBtn}
                hitSlop={8}
              >
                <Ionicons
                  name={showApiKey ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="#64748B"
                />
              </Pressable>
            </View>
            <Text style={styles.fieldHint}>
              系统已默认开通开发者专属云端声学服务。如需自配第三方专属服务，密钥将安全保存在设备硬件沙箱 (SecureStore) 中。
            </Text>
          </View>

          {/* 高级自定义服务 (默认折叠) */}
          <View style={styles.fieldGroup}>
            <Pressable
              onPress={() => setIsTemplateExpanded(!isTemplateExpanded)}
              style={styles.templateHeaderRow}
              hitSlop={6}
            >
              <View style={styles.templateHeaderLeft}>
                <Ionicons name="settings-outline" size={15} color={colors.primary.default} />
                <Text style={styles.fieldLabel}>高级自定义 API 服务 (点击展开/折叠)</Text>
              </View>
              <Ionicons
                name={isTemplateExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#64748B"
              />
            </Pressable>

            {isTemplateExpanded && (
              <View style={styles.customSection}>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => handleApplyPresetTemplate('mimo')}
                    style={[styles.quickChip, baseUrl.includes('xiaomimimo') && styles.quickChipActive]}
                  >
                    <Text style={[styles.quickChipText, baseUrl.includes('xiaomimimo') && styles.quickChipTextActive]}>
                      小米 MiMo (官方)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleApplyPresetTemplate('siliconflow')}
                    style={[styles.quickChip, baseUrl.includes('siliconflow') && styles.quickChipActive]}
                  >
                    <Text style={[styles.quickChipText, baseUrl.includes('siliconflow') && styles.quickChipTextActive]}>
                      硅基流动
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleApplyPresetTemplate('openai')}
                    style={[styles.quickChip, baseUrl.includes('openai') && styles.quickChipActive]}
                  >
                    <Text style={[styles.quickChipText, baseUrl.includes('openai') && styles.quickChipTextActive]}>
                      OpenAI
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleApplyPresetTemplate('minimax')}
                    style={[styles.quickChip, baseUrl.includes('minimax') && styles.quickChipActive]}
                  >
                    <Text style={[styles.quickChipText, baseUrl.includes('minimax') && styles.quickChipTextActive]}>
                      MiniMax
                    </Text>
                  </Pressable>
                </View>

                {/* 接口地址 */}
                <View style={[styles.customFieldRow, { marginTop: 10 }]}>
                  <Text style={styles.fieldSubLabel}>接口地址 (Base URL)</Text>
                  <TextInput
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    placeholder="如 https://api.xiaomimimo.com/v1"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                </View>

                {/* 模型名称 */}
                <View style={[styles.customFieldRow, { marginTop: 10 }]}>
                  <Text style={styles.fieldSubLabel}>模型名称 (Model)</Text>
                  <View style={styles.inputWithAction}>
                    <TextInput
                      value={model}
                      onChangeText={setModel}
                      placeholder="如 mimo-v2.5-tts"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Pressable
                      onPress={handleFetchModels}
                      disabled={isFetchingModels}
                      style={styles.inlineFetchBtn}
                    >
                      {isFetchingModels ? (
                        <ActivityIndicator size="small" color={colors.primary.default} />
                      ) : (
                        <Text style={styles.inlineFetchBtnText}>获取模型</Text>
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* 发音人 */}
                <View style={[styles.customFieldRow, { marginTop: 10 }]}>
                  <Text style={styles.fieldSubLabel}>发音人 (Voice ID)</Text>
                  <View style={styles.inputWithAction}>
                    <TextInput
                      value={voiceId}
                      onChangeText={setVoiceId}
                      placeholder="如 冰糖 / 茉莉 / 苏打 / 白桦 / alloy"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Pressable
                      onPress={handleFetchVoices}
                      disabled={isFetchingVoices}
                      style={styles.inlineFetchBtn}
                    >
                      {isFetchingVoices ? (
                        <ActivityIndicator size="small" color={colors.primary.default} />
                      ) : (
                        <Text style={styles.inlineFetchBtnText}>拉取音色</Text>
                      )}
                    </Pressable>
                  </View>
                  {voiceCandidates.length > 0 && (
                    <View style={styles.voiceCandidateGrid}>
                      {voiceCandidates.map((c) => {
                        const active = voiceId === c.id;
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => setVoiceId(c.id)}
                            style={[
                              styles.quickChip,
                              active && styles.quickChipActive,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`选择音色 ${c.name}`}
                          >
                            <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                              {c.name} {c.description ? `· ${c.description.split('·')[0].trim()}` : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* 语速 */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>语速微调 ({rate.toFixed(2)}x)</Text>
            <View style={styles.chipRow}>
              {SPEED_OPTIONS.map((val) => (
                <Pressable
                  key={val}
                  onPress={() => setRate(val)}
                  style={[styles.valueChip, rate === val && styles.valueChipActive]}
                >
                  <Text
                    style={[
                      styles.valueChipText,
                      rate === val && styles.valueChipTextActive,
                    ]}
                  >
                    {val.toFixed(val === 1 ? 0 : 2)}x
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* 3. 试听与保存操作栏 */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleTestVoice}
            disabled={isTesting}
            style={[styles.testBtn, isPlaying && styles.testBtnPlaying]}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <Ionicons
                name={isPlaying ? 'stop' : 'play'}
                size={16}
                color="#0F172A"
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={styles.testBtnText}>
              {isTesting ? '正在合成...' : isPlaying ? '停止播放' : '调试试听'}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleOpenSaveAsNewModal}
            style={[styles.saveBtn, { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' }]}
          >
            <Ionicons
              name="bookmark-outline"
              size={16}
              color="#0F172A"
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.saveBtnText, { color: '#0F172A' }]}>
              另存为新预设
            </Text>
          </Pressable>

          <Pressable
            onPress={handleSaveGlobalPreset}
            disabled={isSaving}
            style={styles.saveBtn}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons
                name="checkmark"
                size={16}
                color="#FFFFFF"
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={styles.saveBtnText}>
              {isSaving ? '保存中...' : '设为默认'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* 4. 交互功能开关 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>交互功能开关</Text>
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>伴聊拟真语音条</Text>
            <Text style={styles.toggleDesc}>在关键情境可发送微信同款长短语音条</Text>
          </View>
          <Switch
            value={voiceBubbleEnabled}
            onValueChange={handleToggleVoiceBubble}
            trackColor={{ false: '#CBD5E1', true: colors.primary.default }}
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>消息自动朗读</Text>
            <Text style={styles.toggleDesc}>聊天回复生成完毕后自动播放声音</Text>
          </View>
          <Switch
            value={autoReadEnabled}
            onValueChange={handleToggleAutoRead}
            trackColor={{ false: '#CBD5E1', true: colors.primary.default }}
          />
        </View>

        <View style={styles.divider} />

        {/* 5. 存储与缓存 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>本地存储</Text>
        </View>

        <View style={styles.storageRow}>
          <View style={styles.toggleTextWrap}>
            <Text style={styles.toggleTitle}>已缓存音频池</Text>
            <Text style={styles.toggleDesc}>
              {cacheStats.count} 个音频文件 · 占用 {formatBytes(cacheStats.totalBytes)}
            </Text>
          </View>
          <Pressable onPress={handleClearCache} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>清理缓存</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 模型选择弹窗 */}
      <Modal
        visible={modelPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModelPickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModelPickerVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择语音模型</Text>
              <Pressable
                onPress={() => setModelPickerVisible(false)}
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {modelCandidates.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    setModel(m);
                    setModelPickerVisible(false);
                  }}
                  style={styles.modalItem}
                >
                  <Text
                    style={[
                      styles.modalItemText,
                      model === m && styles.modalItemTextActive,
                    ]}
                  >
                    {m}
                  </Text>
                  {model === m && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary.default}
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 另存为新预设自定义重命名弹窗 */}
      <AppDialog
        appearance="opaqueMonochrome"
        visible={saveAsNewModalVisible}
        title="另存为新声音预设"
        message="为当前微调调试好的声音命名并持久化保存。保存后可在长聊、伴聊专属相处定制及角色卡中无缝调用。"
        primaryLabel="确认保存"
        onPrimary={handleConfirmSaveAsNewPreset}
        secondaryLabel="取消"
        onClose={() => setSaveAsNewModalVisible(false)}
      >
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#334155', marginBottom: 6 }}>
            预设名称 (支持自定义重命名)
          </Text>
          <TextInput
            value={newPresetName}
            onChangeText={setNewPresetName}
            placeholder="例如：我的甜美冰糖 / 硅基流动专属女声"
            placeholderTextColor="#94A3B8"
            style={{
              borderWidth: 1,
              borderColor: '#CBD5E1',
              borderRadius: radius.md,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              color: '#0F172A',
              backgroundColor: '#F8FAFC',
            }}
          />
        </View>
      </AppDialog>

      {/* 统一黑白灰小圆角极简提示与确认弹窗 */}
      <AppDialog
        appearance="opaqueMonochrome"
        visible={!!dialogState}
        title={dialogState?.title || ''}
        message={dialogState?.message}
        primaryLabel={dialogState?.primaryLabel || '确定'}
        onPrimary={() => {
          if (dialogState?.onPrimary) {
            dialogState.onPrimary();
          } else {
            setDialogState(null);
          }
        }}
        onClose={() => {
          if (dialogState?.onSecondary) {
            dialogState.onSecondary();
          } else {
            setDialogState(null);
          }
        }}
        secondaryLabel={dialogState?.secondaryLabel !== undefined ? dialogState.secondaryLabel : (dialogState?.onSecondary ? '取消' : null)}
        danger={dialogState?.danger}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 48,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: '#FAFAFA',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  presetSelectionCol: {
    gap: 0,
    marginBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  presetRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  presetRowItemActive: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary.default,
  },
  presetItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
  },
  presetItemNameActive: {
    color: colors.primary.default,
  },
  presetItemDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  formContainer: {
    marginBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  fieldGroup: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  customFieldRow: {
    marginBottom: 8,
  },
  voiceCandidateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  fieldSubLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
  },
  fieldHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 16,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  inputWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  actionIconBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  inlineFetchBtn: {
    position: 'absolute',
    right: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.sm,
  },
  inlineFetchBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary.default,
  },
  templateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  templateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customSection: {
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: colors.primary.default,
  },
  quickChipText: {
    fontSize: 12,
    color: '#475569',
  },
  quickChipTextActive: {
    color: colors.primary.default,
    fontWeight: '600',
  },
  valueChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  valueChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: colors.primary.default,
  },
  valueChipText: {
    fontSize: 13,
    color: '#475569',
  },
  valueChipTextActive: {
    color: colors.primary.default,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  testBtnPlaying: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    backgroundColor: '#0F172A',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  divider: {
    height: 10,
    backgroundColor: '#F8FAFC',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  toggleTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
    marginBottom: 2,
  },
  toggleDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: 16,
    width: '100%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  modalItemText: {
    fontSize: 14,
    color: '#334155',
  },
  modalItemTextActive: {
    color: colors.primary.default,
    fontWeight: '600',
  },
});

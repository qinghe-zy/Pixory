import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../design/tokens';
import type { SQLiteDatabase } from 'expo-sqlite';
import { runWithDatabaseSpace, type PixorySpace } from '../../database';
import type { VoicePresetRecord, VoiceScopeType } from '../types';
import { voiceRepository } from '../../database/repositories/voiceRepository';
import { BUILTIN_VOICE_PRESETS, getBuiltinPreset } from '../builtinPresets';
import { resetTier1CircuitBreaker } from '../fallbackChain';
import { voiceService } from '../voiceService';
import { VoicePresetEditorSheet } from './VoicePresetEditorSheet';

interface VoicePresetPickerProps {
  db?: SQLiteDatabase;
  space: PixorySpace;
  scopeType: VoiceScopeType;
  scopeId: string;
  parentPresetName?: string;
  showVoiceBubbleSwitch?: boolean;
  voiceBubbleEnabled?: boolean;
  onToggleVoiceBubble?: (val: boolean) => void | Promise<void>;
  onBindingChanged?: () => void;
}

export function VoicePresetPicker({
  db,
  space,
  scopeType,
  scopeId,
  parentPresetName = '全局默认音色',
  showVoiceBubbleSwitch = false,
  voiceBubbleEnabled: controlledVoiceBubbleEnabled,
  onToggleVoiceBubble: controlledOnToggleVoiceBubble,
  onBindingChanged,
}: VoicePresetPickerProps) {
  const [presets, setPresets] = useState<VoicePresetRecord[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [internalVoiceBubbleEnabled, setInternalVoiceBubbleEnabled] = useState<boolean>(true);
  const isControlled = controlledVoiceBubbleEnabled !== undefined;
  const voiceBubbleEnabled = isControlled ? controlledVoiceBubbleEnabled : internalVoiceBubbleEnabled;
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingPreset, setEditingPreset] = useState<VoicePresetRecord | null>(null);
  const [playingPresetId, setPlayingPresetId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = voiceService.subscribe((state) => {
      if (!state.isPlaying) {
        setPlayingPresetId(null);
      }
    });
    return unsub;
  }, []);

  async function handleTogglePlay(p: VoicePresetRecord) {
    if (playingPresetId === p.id) {
      await voiceService.stop();
      setPlayingPresetId(null);
      return;
    }
    resetTier1CircuitBreaker();
    setPlayingPresetId(p.id);
    try {
      await executeWithDb(async (database) => {
        await voiceService.speak(
          '你好，我是你的专属伙伴，很高兴能用这种声音和你对话。',
          {
            db: database,
            space,
            directPreset: p,
          },
          `picker_preview_${p.id}`
        );
      });
    } catch {
      setPlayingPresetId(null);
    }
  }

  const executeWithDb = React.useCallback(
    <T,>(op: (database: SQLiteDatabase) => Promise<T>): Promise<T> => {
      if (db) return op(db);
      return runWithDatabaseSpace(space, op);
    },
    [db, space]
  );

  async function loadData() {
    await executeWithDb(async (database) => {
      const [allPresets, binding] = await Promise.all([
        voiceRepository.listPresets(database, true),
        voiceRepository.getBinding(database, scopeType, scopeId),
      ]);
      setPresets(allPresets);
      setSelectedPresetId(binding?.presetId ?? null);
      if (!isControlled) {
        setInternalVoiceBubbleEnabled(binding?.voiceBubbleEnabled ?? true);
      }
    });
  }

  useEffect(() => {
    void loadData();
  }, [db, space, scopeType, scopeId]);

  async function handleSelectPreset(presetId: string | null) {
    setSelectedPresetId(presetId);
    await executeWithDb(async (database) => {
      await voiceRepository.setBinding(database, {
        scopeType,
        scopeId,
        presetId,
        voiceBubbleEnabled,
        updatedAt: new Date().toISOString(),
      });
    });
    onBindingChanged?.();
  }

  async function handleToggleVoiceBubble(val: boolean) {
    if (!isControlled) {
      setInternalVoiceBubbleEnabled(val);
    }
    if (controlledOnToggleVoiceBubble) {
      await controlledOnToggleVoiceBubble(val);
    }
    await executeWithDb(async (database) => {
      await voiceRepository.setBinding(database, {
        scopeType,
        scopeId,
        presetId: selectedPresetId,
        voiceBubbleEnabled: val,
        updatedAt: new Date().toISOString(),
      });
    });
    onBindingChanged?.();
  }

  async function handleSaveNewPreset(newPreset: VoicePresetRecord) {
    await executeWithDb(async (database) => {
      await voiceRepository.upsertPreset(database, newPreset);
    });
    await loadData();
    await handleSelectPreset(newPreset.id);
  }

  async function handleDeletePreset(presetId: string) {
    await executeWithDb(async (database) => {
      await voiceRepository.deletePreset(database, presetId);
    });
    await loadData();
    if (selectedPresetId === presetId) {
      await handleSelectPreset(null);
    }
  }

  return (
    <View style={styles.container}>
      {/* 预设列表 */}
      <View style={styles.presetList}>
        {/* 跟随上一级选项 (非全局 scope 展示) */}
        {scopeType !== 'global' && (
          <Pressable
            onPress={() => handleSelectPreset(null)}
            style={[styles.presetCard, selectedPresetId === null && styles.presetCardActive]}
          >
            <View style={styles.presetInfo}>
              <Text style={[styles.presetName, selectedPresetId === null && styles.presetNameActive]}>
                跟随上一级配置
              </Text>
              <Text style={styles.presetDesc}>当前继承自：{parentPresetName}</Text>
            </View>
            {selectedPresetId === null && (
              <Ionicons name="checkmark-circle" size={18} color={colors.primary.default} />
            )}
          </Pressable>
        )}

        {/* 所有可用预设 */}
        {presets.map((p) => {
          const active = selectedPresetId === p.id;
          const isPlayingThis = playingPresetId === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => handleSelectPreset(p.id)}
              style={[styles.presetCard, active && styles.presetCardActive]}
            >
              <View style={styles.presetInfo}>
                <View style={styles.nameRow}>
                  <Text style={[styles.presetName, active && styles.presetNameActive]}>{p.name}</Text>
                  {p.isBuiltin ? (
                    <View style={styles.builtinBadge}><Text style={styles.builtinBadgeText}>官方声学</Text></View>
                  ) : (
                    <View style={[styles.builtinBadge, { backgroundColor: '#E0F2FE' }]}>
                      <Text style={[styles.builtinBadgeText, { color: '#0369A1' }]}>自定义</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.presetDesc}>
                  {p.style || (p.baseUrl?.includes('xiaomi') ? `小米官方 · ${p.voiceId}` : `自定义 API · ${p.model || 'OpenAI 兼容'}`)}
                </Text>
              </View>

              <View style={styles.cardActions}>
                {/* 试听小喇叭：用户明确要求的卡片右侧即点即试听 */}
                <Pressable
                  hitSlop={8}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    void handleTogglePlay(p);
                  }}
                  style={[styles.hornBtn, isPlayingThis && styles.hornBtnActive]}
                  accessibilityLabel={isPlayingThis ? '停止试听' : '试听音色'}
                >
                  <Ionicons
                    name={isPlayingThis ? 'stop-circle' : 'volume-medium-outline'}
                    size={20}
                    color={isPlayingThis ? colors.primary.default : '#64748B'}
                  />
                </Pressable>

                {/* 自定义预设编辑与重命名入口 */}
                {!p.isBuiltin && (
                  <Pressable
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setEditingPreset(p);
                      setEditorVisible(true);
                    }}
                    style={styles.editBtn}
                    accessibilityLabel="编辑与重命名预设"
                  >
                    <Ionicons name="create-outline" size={17} color="#64748B" />
                  </Pressable>
                )}

                {active && <Ionicons name="checkmark-circle" size={18} color={colors.primary.default} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* 新增预设入口 */}
      <Pressable
        onPress={() => {
          setEditingPreset(null);
          setEditorVisible(true);
        }}
        style={styles.addBtn}
      >
        <Ionicons name="add" size={16} color={colors.primary.default} style={{ marginRight: 4 }} />
        <Text style={styles.addBtnText}>新建并保存自定义声音模型</Text>
      </Pressable>

      {/* 伴聊语音条开关 */}
      {showVoiceBubbleSwitch && (
        <View style={styles.switchRow}>
          <View style={styles.switchLabelBox}>
            <Text style={styles.switchLabel}>允许发送拟真语音条</Text>
            <Text style={styles.switchDesc}>开启后在道晚安、亲昵等关键情境可发送即时语音条</Text>
          </View>
          <Switch
            accessibilityLabel="允许发送拟真语音条"
            accessibilityRole="switch"
            value={voiceBubbleEnabled}
            onValueChange={handleToggleVoiceBubble}
            trackColor={{ false: '#CBD5E1', true: colors.primary.default }}
          />
        </View>
      )}

      {/* 预设编辑抽屉 */}
      <VoicePresetEditorSheet
        visible={editorVisible}
        space={space}
        preset={editingPreset}
        onClose={() => setEditorVisible(false)}
        onSave={handleSaveNewPreset}
        onDelete={handleDeletePreset}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  presetList: {
    gap: 8,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  presetCardActive: {
    borderColor: colors.primary.default,
    backgroundColor: '#EEF2FF',
  },
  presetInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1E293B',
  },
  presetNameActive: {
    fontWeight: '600',
    color: colors.primary.default,
  },
  builtinBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  builtinBadgeText: {
    fontSize: 10,
    color: colors.primary.default,
    fontWeight: '500',
  },
  presetDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  hornBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: '#F1F5F9',
  },
  hornBtnActive: {
    backgroundColor: '#EEF2FF',
  },
  editBtn: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: '#F8FAFC',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  addBtnText: {
    fontSize: 13,
    color: colors.primary.default,
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 4,
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  switchLabelBox: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
});

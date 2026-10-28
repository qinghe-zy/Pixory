import React, { useState, useEffect } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../../database';
import { runWithDatabaseSpace } from '../../../database/db';
import { aiProviderRepository } from '../../../database/repositories/aiProviderRepository';

export interface ModelOption {
  providerId: string | null;
  providerName: string;
  modelId: string | null;
  label: string;
}

export interface ImModelPickerModalProps {
  visible: boolean;
  space: PixorySpace;
  currentProviderId?: string | null;
  currentModelId?: string | null;
  onClose: () => void;
  onSelect: (providerId: string | null, modelId: string | null) => void;
}

export function ImModelPickerModal({
  visible,
  space,
  currentProviderId,
  currentModelId,
  onClose,
  onSelect,
}: ImModelPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<ModelOption[]>([]);

  useEffect(() => {
    if (!visible) return;
    void runWithDatabaseSpace(space, async (db) => {
      const providers = await aiProviderRepository.listProviders(db);
      const list: ModelOption[] = [
        {
          providerId: null,
          providerName: '全局',
          modelId: null,
          label: '跟随全局默认模型 (推荐)',
        },
      ];

      for (const p of providers) {
        if (!p.chatEnabled) continue;
        const models = await aiProviderRepository.listModels(db, p.id);
        for (const m of models) {
          if (!m.supportsChat) continue;
          list.push({
            providerId: p.id,
            providerName: p.displayName,
            modelId: m.modelId || m.id,
            label: `${p.displayName} · ${m.modelId || m.id}`,
          });
        }
      }
      setOptions(list);
    });
  }, [visible, space]);

  const isSelected = (opt: ModelOption) => {
    if (opt.providerId === null && opt.modelId === null) {
      return !currentModelId;
    }
    return opt.providerId === currentProviderId && opt.modelId === currentModelId;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>选择伴侣专属模型</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#8E8E93" />
            </Pressable>
          </View>

          <FlatList
            data={options}
            keyExtractor={(item) => `${item.providerId ?? 'global'}_${item.modelId ?? 'default'}`}
            renderItem={({ item }) => {
              const selected = isSelected(item);
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.providerId, item.modelId);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.optionRow, selected && styles.optionSelected, pressed && styles.rowPressed]}
                >
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{item.label}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color="#07C160" />}
                </Pressable>
              );
            }}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EBECEF' },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  closeBtn: { padding: 4 },
  listContent: { paddingVertical: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F2F3F5' },
  optionSelected: { backgroundColor: '#F0F9F4' },
  rowPressed: { backgroundColor: '#F8F9FA' },
  optionLabel: { fontSize: 15, color: '#333333', fontWeight: '500' },
  optionLabelSelected: { color: '#07C160', fontWeight: '600' },
});

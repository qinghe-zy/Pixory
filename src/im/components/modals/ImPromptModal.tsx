import React, { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export interface ImPromptModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  initialValue?: string;
  placeholder?: string;
  presets?: Array<{ label: string; value: string }>;
  onClose: () => void;
  onConfirm: (val: string) => void;
}

export function ImPromptModal({
  visible,
  title,
  subtitle,
  initialValue = '',
  placeholder = '',
  presets,
  onClose,
  onConfirm,
}: ImPromptModalProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const handleConfirm = () => {
    onConfirm(value.trim());
    onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.dialogCard}>
          <Text style={styles.title}>{title}</Text>
          {Boolean(subtitle) && <Text style={styles.subtitle}>{subtitle}</Text>}

          {presets && presets.length > 0 && (
            <View style={styles.presetsRow}>
              {presets.map((p) => {
                const active = value === p.value;
                return (
                  <Pressable
                    key={p.value}
                    onPress={() => setValue(p.value)}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                  >
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <TextInput
            autoFocus
            maxLength={60}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor="#999999"
            style={styles.input}
            value={value}
          />

          <View style={styles.actionRow}>
            <Pressable onPress={onClose} style={[styles.btn, styles.cancelBtn]}>
              <Text style={styles.cancelText}>取消</Text>
            </Pressable>
            <Pressable onPress={handleConfirm} style={[styles.btn, styles.confirmBtn]}>
              <Text style={styles.confirmText}>确定</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialogCard: { width: '100%', maxWidth: 320, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1C1C', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#666666', textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 12 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#F3F4F6' },
  presetChipActive: { backgroundColor: '#1A1C1C' },
  presetText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  presetTextActive: { color: '#FFFFFF' },
  input: { height: 44, borderRadius: 10, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, fontSize: 15, color: '#1A1C1C', marginBottom: 18 },
  actionRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#F3F4F6' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  confirmBtn: { backgroundColor: '#1A1C1C' },
  confirmText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});

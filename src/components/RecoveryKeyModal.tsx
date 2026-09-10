import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, Platform, ToastAndroid } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';
import { generateAndSetRecoveryKey } from '../services/personalSystemService';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialKey: string;
}

export function RecoveryKeyModal({ visible, onClose, initialKey }: Props) {
  const [currentKey, setCurrentKey] = useState(initialKey);
  const [mode, setMode] = useState<'view' | 'custom'>('view');
  const [customInput, setCustomInput] = useState('');
  
  // Format key like XXX-XXX
  const formatKey = (key: string) => {
    const k = key.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (k.length > 3) {
      return `${k.slice(0, 3)}-${k.slice(3, 6)}`;
    }
    return k;
  };

  const handleCustomSave = async () => {
    const cleanKey = customInput.replace(/[^A-Z0-9]/g, '');
    if (cleanKey.length !== 6) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('请输入完整的6位组合', ToastAndroid.SHORT);
      }
      return;
    }
    try {
      const saved = await generateAndSetRecoveryKey(cleanKey);
      setCurrentKey(saved);
      setMode('view');
      setCustomInput('');
      if (Platform.OS === 'android') {
        ToastAndroid.show('自定义恢复密钥已保存', ToastAndroid.SHORT);
      }
    } catch (e) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('保存失败', ToastAndroid.SHORT);
      }
    }
  };

  const handleGenerateNew = async () => {
    try {
      const saved = await generateAndSetRecoveryKey();
      setCurrentKey(saved);
      if (Platform.OS === 'android') {
        ToastAndroid.show('已生成新密钥', ToastAndroid.SHORT);
      }
    } catch (e) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('生成失败', ToastAndroid.SHORT);
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          
          <View style={styles.header}>
            <Text style={styles.title}>恢复密钥</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons color={colors.text.secondary} name="close" size={24} />
            </Pressable>
          </View>

          {mode === 'view' ? (
            <View style={styles.content}>
              <Text style={styles.description}>
                如果忘记了隐私密码，您可以在重置时输入此密钥以找回数据。请务必截图或妥善保管。
              </Text>
              
              <View style={styles.card}>
                <Text style={styles.keyText}>{formatKey(currentKey)}</Text>
              </View>

              <View style={styles.actions}>
                <Pressable onPress={() => void handleGenerateNew()} style={styles.actionBtn}>
                  <Ionicons color={colors.primary.active} name="refresh" size={18} />
                  <Text style={styles.actionText}>换一个</Text>
                </Pressable>
                
                <Pressable onPress={() => { setCustomInput(currentKey); setMode('custom'); }} style={styles.actionBtn}>
                  <Ionicons color={colors.primary.active} name="create-outline" size={18} />
                  <Text style={styles.actionText}>自定义</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.description}>
                您可以自定义6位由大写字母和数字组成的恢复密钥。
              </Text>
              
              <View style={styles.inputWrap}>
                <TextInput
                  autoCapitalize="characters"
                  autoFocus
                  keyboardType="default"
                  maxLength={7}
                  onChangeText={(val) => {
                    const formatted = formatKey(val);
                    setCustomInput(formatted);
                  }}
                  placeholder="XXX-XXX"
                  placeholderTextColor={colors.text.placeholder}
                  style={styles.textInput}
                  value={customInput}
                />
              </View>

              <View style={[styles.actions, { marginTop: spacing[4] }]}>
                <Pressable onPress={() => setMode('view')} style={styles.actionBtn}>
                  <Text style={[styles.actionText, { color: colors.text.secondary }]}>取消</Text>
                </Pressable>
                
                <Pressable onPress={() => void handleCustomSave()} style={styles.actionBtn}>
                  <Text style={[styles.actionText, { fontWeight: '600' }]}>保存</Text>
                </Pressable>
              </View>
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 28, 0.42)',
    justifyContent: 'center',
    padding: spacing[4],
  },
  panel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 400,
    width: '100%',
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 56,
    position: 'relative',
  },
  title: {
    color: colors.text.title,
    fontSize: typography.size.body,
    fontWeight: '600',
  },
  closeBtn: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    width: 56,
  },
  content: {
    padding: spacing[5],
  },
  description: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    lineHeight: 20,
    marginBottom: spacing[4],
    textAlign: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    paddingVertical: spacing[5],
    marginBottom: spacing[4],
  },
  keyText: {
    color: colors.text.primary,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[2],
  },
  actionBtn: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    padding: spacing[2],
  },
  actionText: {
    color: colors.primary.active,
    fontSize: typography.size.body,
  },
  inputWrap: {
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  textInput: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

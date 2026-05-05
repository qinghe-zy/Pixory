import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';
import { AppDialog } from './AppDialog';
import { PrimaryButton } from './PrimaryButton';

interface PersonalUnlockModalProps {
  hasCredential: boolean | null;
  loading: boolean;
  visible: boolean;
  onClose: () => void;
  onSetup: (secret: string) => Promise<void>;
  onUnlock: (secret: string) => Promise<void>;
  onChangePassword: (currentSecret: string, nextSecret: string) => Promise<void>;
  onResetPersonalData: () => Promise<void>;
}

export function PersonalUnlockModal({
  hasCredential,
  loading,
  visible,
  onClose,
  onSetup,
  onUnlock,
  onChangePassword,
  onResetPersonalData,
}: PersonalUnlockModalProps) {
  const [secret, setSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const [currentSecret, setCurrentSecret] = useState('');
  const [nextSecret, setNextSecret] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSecret('');
      setConfirmSecret('');
      setCurrentSecret('');
      setNextSecret('');
      setErrorMessage(null);
      setResetConfirmVisible(false);
    }
  }, [visible]);

  const needsSetup = hasCredential === false;

  async function submitPrimary() {
    setErrorMessage(null);
    try {
      if (needsSetup) {
        if (secret.trim() !== confirmSecret.trim()) {
          throw new Error('两次输入的密码不一致。');
        }
        await onSetup(secret);
        return;
      }

      await onUnlock(secret);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '隐私模式操作失败');
    }
  }

  return (
    <>
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons color={colors.primary.active} name="lock-closed-outline" size={22} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>{needsSetup ? '创建隐私模式密码' : '进入隐私模式'}</Text>
              <Text style={styles.description}>隐私数据保存在独立 SQLite 和独立本地文件目录中。</Text>
            </View>
            <Pressable hitSlop={10} onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Ionicons color={colors.text.secondary} name="close" size={18} />
            </Pressable>
          </View>

          <TextInput
            onChangeText={setSecret}
            placeholder={needsSetup ? '设置密码' : '输入隐私模式密码'}
            placeholderTextColor={colors.text.placeholder}
            secureTextEntry
            style={styles.input}
            value={secret}
          />
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {needsSetup ? (
            <TextInput
              onChangeText={setConfirmSecret}
              placeholder="再次输入密码"
              placeholderTextColor={colors.text.placeholder}
              secureTextEntry
              style={styles.input}
              value={confirmSecret}
            />
          ) : null}
          <PrimaryButton
            disabled={loading || !secret.trim() || (needsSetup && !confirmSecret.trim())}
            label={needsSetup ? '创建并进入' : '验证进入'}
            loading={loading}
            onPress={() => {
              void submitPrimary();
            }}
          />

          {hasCredential ? (
            <View style={styles.secondarySection}>
              <Text style={styles.sectionTitle}>修改密码</Text>
              <TextInput
                onChangeText={setCurrentSecret}
                placeholder="当前密码"
                placeholderTextColor={colors.text.placeholder}
                secureTextEntry
                style={styles.input}
                value={currentSecret}
              />
              <TextInput
                onChangeText={setNextSecret}
                placeholder="新密码"
                placeholderTextColor={colors.text.placeholder}
                secureTextEntry
                style={styles.input}
                value={nextSecret}
              />
              <PrimaryButton
                disabled={loading || !currentSecret.trim() || !nextSecret.trim()}
                label="更新隐私模式密码"
                loading={loading}
                onPress={() => {
                  void onChangePassword(currentSecret, nextSecret).catch((error) => {
                    setErrorMessage(error instanceof Error ? error.message : '修改密码失败');
                  });
                }}
                variant="outline"
              />
              <PrimaryButton
                disabled={loading}
                label="忘记密码，重置隐私数据"
                loading={loading}
                onPress={() => {
                  setResetConfirmVisible(true);
                }}
                variant="outline"
              />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
    <AppDialog
      danger
      message="这只会删除隐私模式的密码、SQLite、原图、缩略图、临时文件和导出文件；普通模式数据不会被删除。"
      onClose={() => setResetConfirmVisible(false)}
      onPrimary={() => {
        setResetConfirmVisible(false);
        void onResetPersonalData().catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : '重置隐私数据失败');
        });
      }}
      primaryLabel="确认重置"
      title="重置隐私数据"
      visible={resetConfirmVisible}
    />
    </>
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
    gap: spacing[3],
    maxWidth: 420,
    padding: spacing[4],
    width: '100%',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[3],
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  titleCopy: {
    flex: 1,
    gap: spacing[1],
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  description: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  closeButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  secondarySection: {
    borderTopColor: colors.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    paddingTop: spacing[3],
  },
  sectionTitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  pressed: {
    opacity: 0.78,
  },
});

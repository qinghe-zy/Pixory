import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';
import { AppDialog } from './AppDialog';
import { PrimaryButton } from './PrimaryButton';

const unlockPatternImage = require('../../docs/black.png');

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
  const [changePasswordErrorMessage, setChangePasswordErrorMessage] = useState<string | null>(null);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSecret('');
      setConfirmSecret('');
      setCurrentSecret('');
      setNextSecret('');
      setErrorMessage(null);
      setChangePasswordErrorMessage(null);
      setChangePasswordVisible(false);
      setResetConfirmVisible(false);
      setShowPassword(false);
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

  function openChangePasswordDialog() {
    setCurrentSecret('');
    setNextSecret('');
    setChangePasswordErrorMessage(null);
    setChangePasswordVisible(true);
  }

  function closeChangePasswordDialog() {
    setChangePasswordVisible(false);
    setCurrentSecret('');
    setNextSecret('');
    setChangePasswordErrorMessage(null);
  }

  async function submitChangePassword() {
    setChangePasswordErrorMessage(null);
    try {
      await onChangePassword(currentSecret, nextSecret);
      closeChangePasswordDialog();
    } catch (error) {
      setChangePasswordErrorMessage(error instanceof Error ? error.message : '修改密码失败');
    }
  }

  return (
    <>
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Image resizeMode="stretch" source={unlockPatternImage} style={styles.patternImage} />
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

          <PasswordInput
            onChangeText={setSecret}
            placeholder={needsSetup ? '设置密码' : '输入隐私模式密码'}
            secureTextEntry={!showPassword}
            showPassword={showPassword}
            onToggleShowPassword={() => setShowPassword((current) => !current)}
            value={secret}
          />
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {needsSetup ? (
            <PasswordInput
              onChangeText={setConfirmSecret}
              placeholder="再次输入密码"
              secureTextEntry={!showPassword}
              showPassword={showPassword}
              onToggleShowPassword={() => setShowPassword((current) => !current)}
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
            <View style={styles.textActions}>
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                hitSlop={8}
                onPress={openChangePasswordDialog}
                style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.updatePasswordText}>更新密码</Text>
              </Pressable>
              <View style={styles.textActionDivider} />
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                hitSlop={8}
                onPress={() => {
                  setResetConfirmVisible(true);
                }}
                style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.forgotPasswordText}>忘记密码</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
    <AppDialog
      message="输入当前密码后设置一个新的隐私模式密码。"
      onClose={closeChangePasswordDialog}
      onPrimary={() => {
        void submitChangePassword();
      }}
      primaryDisabled={loading || !currentSecret.trim() || !nextSecret.trim()}
      primaryLabel="确认更新"
      title="更新隐私模式密码"
      visible={changePasswordVisible}
    >
      <PasswordInput
        onChangeText={setCurrentSecret}
        placeholder="当前密码"
        secureTextEntry={!showPassword}
        showPassword={showPassword}
        onToggleShowPassword={() => setShowPassword((current) => !current)}
        value={currentSecret}
      />
      <PasswordInput
        onChangeText={setNextSecret}
        placeholder="新密码"
        secureTextEntry={!showPassword}
        showPassword={showPassword}
        onToggleShowPassword={() => setShowPassword((current) => !current)}
        value={nextSecret}
      />
      {changePasswordErrorMessage ? <Text style={styles.errorText}>{changePasswordErrorMessage}</Text> : null}
    </AppDialog>
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

function PasswordInput({
  onChangeText,
  onToggleShowPassword,
  placeholder,
  secureTextEntry,
  showPassword,
  value,
}: {
  onChangeText: (value: string) => void;
  onToggleShowPassword: () => void;
  placeholder: string;
  secureTextEntry: boolean;
  showPassword: boolean;
  value: string;
}) {
  return (
    <View style={styles.passwordInputWrap}>
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
        secureTextEntry={secureTextEntry}
        style={styles.passwordInput}
        value={value}
      />
      <Pressable accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'} hitSlop={8} onPress={onToggleShowPassword} style={styles.passwordToggle}>
        <Ionicons color={colors.text.secondary} name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} />
      </Pressable>
    </View>
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
    overflow: 'hidden',
    padding: spacing[4],
    width: '100%',
  },
  patternImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.24,
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
  passwordInputWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 44,
  },
  passwordInput: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  passwordToggle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  textActions: {
    alignItems: 'center',
    borderTopColor: colors.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    paddingTop: spacing[3],
  },
  textActionButton: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  textActionDivider: {
    backgroundColor: colors.border.subtle,
    height: 14,
    width: StyleSheet.hairlineWidth,
  },
  updatePasswordText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  forgotPasswordText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  pressed: {
    opacity: 0.78,
  },
});

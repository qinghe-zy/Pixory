import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View, ToastAndroid, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

import { colors, radius, spacing, typography } from '../design/tokens';
import { AppDialog } from './AppDialog';
import { PasswordInput } from './PasswordInput';
import { PrimaryButton } from './PrimaryButton';
import { SecurityUnlockModule } from './SecurityUnlockModule';
import { getPersonalCredentialConfig, PersonalCredentialConfig, setPersonalFingerprintEnabled } from '../services/personalSystemService';

const unlockPatternImage = require('../../docs/black.png');

interface PersonalUnlockModalProps {
  hasCredential: boolean | null;
  loading: boolean;
  visible: boolean;
  title?: string;
  description?: string;
  hideActions?: boolean;
  onClose: () => void;
  onSetup: (secret: string, method?: 'password' | 'pattern') => Promise<void>;
  onUnlock: (secret: string) => Promise<void>;
  onChangePassword: (currentSecret: string, nextSecret: string, method?: 'password' | 'pattern') => Promise<void>;
  onResetPersonalData: () => Promise<void>;
}

export function PersonalUnlockModal({
  hasCredential,
  loading,
  visible,
  title,
  description,
  hideActions,
  onClose,
  onSetup,
  onUnlock,
  onChangePassword,
  onResetPersonalData,
}: PersonalUnlockModalProps) {
  const [secret, setSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  
  // Setup Pattern state
  const [setupPatternMethod, setSetupPatternMethod] = useState<'password' | 'pattern' | null>(null);
  const [firstPattern, setFirstPattern] = useState('');

  const [currentSecret, setCurrentSecret] = useState('');
  const [nextSecret, setNextSecret] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [changePasswordErrorMessage, setChangePasswordErrorMessage] = useState<string | null>(null);
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unlockMethod, setUnlockMethod] = useState<'password' | 'pattern'>('pattern');
  const [patternError, setPatternError] = useState(false);

  // New states
  const [config, setConfig] = useState<PersonalCredentialConfig | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [promptSeen, setPromptSeen] = useState(true);
  const [changePasswordMethod, setChangePasswordMethod] = useState<'password' | 'pattern'>('password');

  useEffect(() => {
    LocalAuthentication.hasHardwareAsync().then(setBiometricSupported);
    SecureStore.getItemAsync('pixory.personal.fingerprintPromptSeen').then(val => {
      setPromptSeen(val === 'true');
    });
  }, []);

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
      setUnlockMethod('pattern');
      setPatternError(false);
      setSetupPatternMethod(null);
      setFirstPattern('');
    } else {
      getPersonalCredentialConfig().then(cfg => {
        setConfig(cfg);
        if (cfg.hasCredential) {
          setUnlockMethod(cfg.defaultMethod);
          if (cfg.fingerprintEnabled) {
            triggerBiometric();
          }
        }
      });
    }
  }, [visible]);

  const needsSetup = hasCredential === false;

  async function submitPrimary() {
    setErrorMessage(null);
    try {
      if (needsSetup) {
        if (setupPatternMethod === 'password') {
          if (secret !== confirmSecret) {
            setErrorMessage('两次输入的密码不一致');
            return;
          }
          await onSetup(secret, 'password');
        } else {
          // the pattern setup is handled in handlePatternUnlock
        }
      } else {
        await onUnlock(secret);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '隐私模式操作失败');
    }
  }

  const triggerBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: title || '验证指纹/面容进入隐私模式',
        fallbackLabel: '使用密码',
        disableDeviceFallback: true,
      });
      if (result.success) {
        handleBiometricUnlock();
      } else if (result.error && result.error !== 'user_cancel') {
        setErrorMessage('指纹/面容验证未通过');
      }
    } catch (e) {
      console.log('Biometric auth error:', e);
    }
  };

  async function handlePatternUnlock(patternStr: string) {
    setErrorMessage(null);
    setPatternError(false);
    
    if (needsSetup && setupPatternMethod === 'pattern') {
      if (!firstPattern) {
        setFirstPattern(patternStr);
        setErrorMessage('请再次绘制以确认');
      } else {
        if (firstPattern === patternStr) {
          try {
            await onSetup(patternStr, 'pattern');
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : '创建失败');
            setPatternError(true);
            setFirstPattern('');
          }
        } else {
          setErrorMessage('两次绘制的图案不一致，请重试');
          setPatternError(true);
          setFirstPattern('');
        }
      }
      return;
    }

    try {
      await onUnlock(patternStr);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '验证失败');
      setPatternError(true);
    }
  }

  async function handleBiometricUnlock() {
    setErrorMessage(null);
    setPatternError(false);
    try {
      await onUnlock('__BIOMETRIC_PASSTHROUGH__');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '验证失败');
    }
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
      await onChangePassword(currentSecret, nextSecret, changePasswordMethod);
      closeChangePasswordDialog();
    } catch (error) {
      setChangePasswordErrorMessage(error instanceof Error ? error.message : '修改密码失败');
    }
  }

  // Effect to load red dot states
  const [updatePromptSeen, setUpdatePromptSeen] = useState(true);
  useEffect(() => {
    SecureStore.getItemAsync('pixory.personal.updatePromptSeen').then(val => {
      setUpdatePromptSeen(val === 'true');
    });
  }, []);

  function openChangePasswordDialog() {
    if (!updatePromptSeen) {
       setUpdatePromptSeen(true);
       SecureStore.setItemAsync('pixory.personal.updatePromptSeen', 'true').catch(console.error);
    }
    setCurrentSecret('');
    setNextSecret('');
    setChangePasswordErrorMessage(null);
    setChangePasswordVisible(true);
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

          {needsSetup ? (
            setupPatternMethod === null ? (
              <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
                <PrimaryButton label="设置图案密码" onPress={() => setSetupPatternMethod('pattern')} />
                <PrimaryButton label="设置数字/字母密码" onPress={() => setSetupPatternMethod('password')} />
              </View>
            ) : setupPatternMethod === 'password' ? (
              <>
                <PasswordInput
                  onChangeText={setSecret}
                  placeholder="设置数字/字母密码"
                  secureTextEntry={!showPassword}
                  showPassword={showPassword}
                  onToggleShowPassword={() => setShowPassword((current) => !current)}
                  value={secret}
                />
                <PasswordInput
                  onChangeText={setConfirmSecret}
                  placeholder="再次输入密码"
                  secureTextEntry={!showPassword}
                  showPassword={showPassword}
                  onToggleShowPassword={() => setShowPassword((current) => !current)}
                  value={confirmSecret}
                />
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                <PrimaryButton
                  disabled={loading || !secret.trim() || !confirmSecret.trim()}
                  label="创建并进入"
                  loading={loading}
                  onPress={() => {
                    void submitPrimary();
                  }}
                />
              </>
            ) : (
              <>
                <SecurityUnlockModule 
                  onUnlockAttempt={handlePatternUnlock}
                  onBiometricSuccess={handleBiometricUnlock}
                  isError={patternError}
                  size={260}
                  disableBiometric={true}
                />
                {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
              </>
            )
          ) : (
            <>
              {unlockMethod === 'password' ? (
                <>
                  <PasswordInput
                    onChangeText={setSecret}
                    placeholder="输入隐私模式密码"
                    secureTextEntry={!showPassword}
                    showPassword={showPassword}
                    onToggleShowPassword={() => setShowPassword((current) => !current)}
                    value={secret}
                  />
                  {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                  <PrimaryButton
                    disabled={loading || !secret.trim()}
                    label="验证进入"
                    loading={loading}
                    onPress={() => {
                      void submitPrimary();
                    }}
                  />
                </>
              ) : (
                <>
                  <SecurityUnlockModule 
                    onUnlockAttempt={handlePatternUnlock}
                    onBiometricSuccess={handleBiometricUnlock}
                    isError={patternError}
                    size={260}
                    disableBiometric={true}
                  />
                  {errorMessage && !patternError ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                </>
              )}

              {hasCredential && config?.fingerprintEnabled ? (
            <View style={{ alignItems: 'center', marginTop: spacing[2] }}>
              <Pressable onPress={triggerBiometric} style={({pressed}) => [{ alignItems: 'center', gap: spacing[1], padding: spacing[2] }, pressed && { opacity: 0.7 }]}>
                <Ionicons name="finger-print" size={48} color={colors.primary.default} />
                <Text style={{ ...typography.textStyles.caption, color: colors.text.secondary }}>使用指纹/面容解锁</Text>
              </Pressable>
            </View>
          ) : null}

          {biometricSupported && !config?.fingerprintEnabled ? (
                <Pressable
                  onPress={async () => {
                    if (!promptSeen) {
                      setPromptSeen(true);
                      await SecureStore.setItemAsync('pixory.personal.fingerprintPromptSeen', 'true');
                    }
                    try {
                      const res = await LocalAuthentication.authenticateAsync({ promptMessage: '验证以开启指纹解锁' });
                      if (res.success) {
                        await setPersonalFingerprintEnabled(true);
                        const cfg = await getPersonalCredentialConfig();
                        setConfig(cfg);
                      }
                    } catch (e) {
                      setErrorMessage('无法开启指纹解锁');
                    }
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing[2] }}
                >
                  <Text style={{ ...typography.textStyles.caption, color: colors.text.secondary }}>点击设置指纹密码</Text>
                  {!promptSeen && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.semantic.danger, marginLeft: spacing[1], marginBottom: 6 }} />}
                </Pressable>
              ) : null}

              <Pressable 
                onPress={() => setUnlockMethod(m => m === 'pattern' ? 'password' : 'pattern')}
                style={styles.toggleMethodButton}
              >
                <Text style={styles.toggleMethodText}>
                  {unlockMethod === 'pattern' ? '切换为数字/字母密码' : '切换为图案解锁'}
                </Text>
              </Pressable>
            </>
          )}

          {hasCredential ? (
            <View style={styles.textActions}>
              <View>
                <Pressable
                  accessibilityRole="button"
                  disabled={loading}
                  hitSlop={8}
                  onPress={openChangePasswordDialog}
                  style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
                >
                  <Text style={styles.updatePasswordText}>更新密码</Text>
                </Pressable>
                {(!updatePromptSeen || (!config?.hasPattern && !config?.fingerprintEnabled)) && (
                  <View style={{ position: 'absolute', top: 0, right: -4, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.semantic.danger }} pointerEvents="none" />
                )}
              </View>
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
      <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[1], marginBottom: spacing[2], alignSelf: 'center' }}>
         <Pressable onPress={() => { setChangePasswordMethod('pattern'); setNextSecret(''); }} style={[{ padding: spacing[1], paddingHorizontal: spacing[2], borderRadius: radius.sm }, changePasswordMethod === 'pattern' && { backgroundColor: colors.primary.weak }]}>
           <Text style={styles.updatePasswordText}>新图案密码</Text>
         </Pressable>
         <Pressable onPress={() => { setChangePasswordMethod('password'); setNextSecret(''); }} style={[{ padding: spacing[1], paddingHorizontal: spacing[2], borderRadius: radius.sm }, changePasswordMethod === 'password' && { backgroundColor: colors.primary.weak }]}>
           <Text style={styles.updatePasswordText}>新数字密码</Text>
         </Pressable>
      </View>
      
      {changePasswordMethod === 'password' ? (
        <PasswordInput
          onChangeText={setNextSecret}
          placeholder="新密码"
          secureTextEntry={!showPassword}
          showPassword={showPassword}
          onToggleShowPassword={() => setShowPassword((current) => !current)}
          value={nextSecret}
        />
      ) : (
        <View style={{ alignItems: 'center' }}>
          <SecurityUnlockModule 
            onUnlockAttempt={(str) => { setNextSecret(str); setChangePasswordErrorMessage('已录入，请点击确认更新'); }} 
            onBiometricSuccess={() => {}} 
            disableBiometric 
            size={200} 
          />
        </View>
      )}
      
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
  toggleMethodButton: {
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  toggleMethodText: {
    ...typography.textStyles.body,
    color: colors.primary.default,
  },
  pressed: {
    opacity: 0.78,
  },
});

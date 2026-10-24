import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View, ToastAndroid, Platform, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

import { colors, radius, spacing, typography } from '../design/tokens';
import { AppDialog } from './AppDialog';
import { PasswordInput } from './PasswordInput';
import { PrimaryButton } from './PrimaryButton';
import { SecurityUnlockModule } from './SecurityUnlockModule';
import {
  getPersonalCredentialConfig,
  PersonalCredentialConfig,
  resetPasswordWithRecoveryKey,
  setPersonalFingerprintEnabled,
  verifyPersonalPassword,
  verifyRecoveryKey,
} from '../services/personalSystemService';

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
  
  // Change Password flow states
  type ChangePasswordStep = 'verify_old' | 'choose_new' | 'enter_new_digital' | 'enter_new_pattern' | 'confirm_new_pattern';
  const [changePasswordStep, setChangePasswordStep] = useState<ChangePasswordStep>('verify_old');
  const [changePasswordOldMethod, setChangePasswordOldMethod] = useState<'password' | 'pattern'>('pattern');
  const [changePasswordMethod, setChangePasswordMethod] = useState<'password' | 'pattern'>('password');
  const [changePasswordFirstPattern, setChangePasswordFirstPattern] = useState('');

  // Recovery flow states
  type RecoveryStep = 'enter_key' | 'enter_new_pattern' | 'confirm_new_pattern';
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('enter_key');
  const [recoveryFirstPattern, setRecoveryFirstPattern] = useState('');
  const [recoveryErrorMessage, setRecoveryErrorMessage] = useState<string | null>(null);
  const [recoveryPatternError, setRecoveryPatternError] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

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
      setRecoveryModalVisible(false);
      setRecoveryKeyInput('');
      setRecoveryStep('enter_key');
      setRecoveryFirstPattern('');
      setRecoveryErrorMessage(null);
      setRecoveryPatternError(false);
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
    setChangePasswordFirstPattern('');
    setChangePasswordErrorMessage(null);
    setPatternError(false);
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
    setChangePasswordFirstPattern('');
    setChangePasswordErrorMessage(null);
    setPatternError(false);
    const preferredOld = (config?.hasPattern && !config?.hasPassword)
      ? 'pattern'
      : (config?.defaultMethod || 'pattern');
    setChangePasswordOldMethod(preferredOld);
    setChangePasswordStep('verify_old');
    setChangePasswordVisible(true);
  }

  function openRecoveryModal() {
    setRecoveryKeyInput('');
    setRecoveryStep('enter_key');
    setRecoveryFirstPattern('');
    setRecoveryErrorMessage(null);
    setRecoveryPatternError(false);
    setRecoveryLoading(false);
    setRecoveryModalVisible(true);
  }

  function closeRecoveryModal() {
    setRecoveryModalVisible(false);
    setRecoveryKeyInput('');
    setRecoveryStep('enter_key');
    setRecoveryFirstPattern('');
    setRecoveryErrorMessage(null);
    setRecoveryPatternError(false);
    setRecoveryLoading(false);
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
                  key={firstPattern ? 'setup-confirm' : 'setup-first'}
                  onUnlockAttempt={handlePatternUnlock}
                  onBiometricSuccess={handleBiometricUnlock}
                  onUnlockErrorHint={(hint) => setErrorMessage(hint)}
                  isError={patternError}
                  size={260}
                  disableBiometric={true}
                />
                {errorMessage ? (
                  <Text style={styles.errorText}>{errorMessage}</Text>
                ) : (
                  <Text style={{ marginTop: spacing[2], ...typography.textStyles.caption, color: colors.text.secondary, textAlign: 'center' }}>
                    {firstPattern ? '请再次绘制以确认' : '请连接至少 4 个点'}
                  </Text>
                )}
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
                  {hasCredential && config?.fingerprintEnabled ? (
                    <View style={{ alignItems: 'center', marginTop: spacing[2] }}>
                      <Pressable onPress={triggerBiometric} style={({pressed}) => [{ alignItems: 'center', gap: spacing[1], padding: spacing[2] }, pressed && { opacity: 0.7 }]}>
                        <Ionicons name="finger-print" size={42} color={colors.primary.default} />
                        <Text style={{ ...typography.textStyles.caption, color: colors.text.secondary }}>使用指纹/面容解锁</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <SecurityUnlockModule 
                    key="unlock-pattern"
                    onUnlockAttempt={handlePatternUnlock}
                    onBiometricSuccess={handleBiometricUnlock}
                    onUnlockErrorHint={(hint) => setErrorMessage(hint)}
                    isError={patternError}
                    size={260}
                    disableBiometric={!config?.fingerprintEnabled}
                  />
                  {errorMessage && !patternError ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                </>
              )}

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

              {config?.hasPassword && config?.hasPattern ? (
                <Pressable
                  onPress={() => setUnlockMethod(m => m === 'pattern' ? 'password' : 'pattern')}
                  style={styles.toggleMethodButton}
                >
                  <Text style={styles.toggleMethodText}>
                    {unlockMethod === 'pattern' ? '切换为数字/字母密码' : '切换为图案解锁'}
                  </Text>
                </Pressable>
              ) : null}
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
                onPress={openRecoveryModal}
                style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.forgotPasswordText}>忘记密码</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
    <Modal animationType="fade" onRequestClose={closeChangePasswordDialog} transparent visible={changePasswordVisible}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Image resizeMode="stretch" source={unlockPatternImage} style={styles.patternImage} />
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons color={colors.primary.active} name="lock-closed-outline" size={22} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>
                {changePasswordStep === 'verify_old' ? '验证当前隐私密码' :
                 changePasswordStep === 'choose_new' ? '选择新验证方式' :
                 changePasswordStep === 'enter_new_digital' ? '设置新数字密码' :
                 changePasswordStep === 'enter_new_pattern' ? '设置新图案密码' :
                 '请再次绘制以确认'}
              </Text>
              <Text style={styles.description}>请完成安全验证。</Text>
            </View>
            <Pressable hitSlop={10} onPress={closeChangePasswordDialog} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Ionicons color={colors.text.secondary} name="close" size={18} />
            </Pressable>
          </View>

          {changePasswordStep === 'verify_old' && (
            <>
              {changePasswordOldMethod === 'password' && config?.hasPassword ? (
                <>
                  <PasswordInput
                    onChangeText={setCurrentSecret}
                    placeholder="当前数字/字母密码"
                    secureTextEntry={!showPassword}
                    showPassword={showPassword}
                    onToggleShowPassword={() => setShowPassword((current) => !current)}
                    value={currentSecret}
                  />
                  {changePasswordErrorMessage ? <Text style={styles.errorText}>{changePasswordErrorMessage}</Text> : null}
                  <PrimaryButton
                    disabled={loading || !currentSecret.trim()}
                    label="验证"
                    loading={loading}
                    onPress={() => {
                      verifyPersonalPassword(currentSecret).then(result => {
                        if (result.ok) {
                          setChangePasswordStep('choose_new');
                          setChangePasswordErrorMessage(null);
                          setPatternError(false);
                        } else {
                          setChangePasswordErrorMessage(result.message || '密码不正确');
                        }
                      }).catch(() => setChangePasswordErrorMessage('验证失败'));
                    }}
                  />
                  {config?.hasPattern ? (
                    <Pressable onPress={() => setChangePasswordOldMethod('pattern')} style={{ marginTop: spacing[2], alignItems: 'center' }}>
                      <Text style={styles.toggleMethodText}>切换为图案验证</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <SecurityUnlockModule 
                    key="change-verify-old-pattern"
                    onUnlockAttempt={(str) => {
                      verifyPersonalPassword(str).then(result => {
                        if (result.ok) {
                          setCurrentSecret(str);
                          if (!config?.hasPassword) {
                            setChangePasswordMethod('pattern');
                            setChangePasswordStep('enter_new_pattern');
                          } else {
                            setChangePasswordStep('choose_new');
                          }
                          setChangePasswordErrorMessage(null);
                          setPatternError(false);
                        } else {
                          setChangePasswordErrorMessage(result.message || '图案不正确');
                          setPatternError(true);
                        }
                      }).catch(() => { setChangePasswordErrorMessage('验证失败'); setPatternError(true); });
                    }}
                    onBiometricSuccess={() => {
                       setCurrentSecret('__BIOMETRIC_PASSTHROUGH__');
                       if (!config?.hasPassword) {
                         setChangePasswordMethod('pattern');
                         setChangePasswordStep('enter_new_pattern');
                       } else {
                         setChangePasswordStep('choose_new');
                       }
                       setChangePasswordErrorMessage(null);
                       setPatternError(false);
                    }} 
                    isError={patternError}
                    disableBiometric={!config?.fingerprintEnabled} 
                    size={260} 
                  />
                  {changePasswordErrorMessage ? <Text style={styles.errorText}>{changePasswordErrorMessage}</Text> : null}
                  {config?.hasPassword ? (
                    <Pressable onPress={() => setChangePasswordOldMethod('password')} style={{ marginTop: spacing[3], alignItems: 'center' }}>
                      <Text style={styles.toggleMethodText}>切换为数字验证</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </>
          )}

          {changePasswordStep === 'choose_new' && (
            <View style={{ gap: spacing[3], marginTop: spacing[2] }}>
              <PrimaryButton label="设置图案密码" onPress={() => { setChangePasswordMethod('pattern'); setChangePasswordStep('enter_new_pattern'); setChangePasswordErrorMessage(null); setPatternError(false); }} />
              <PrimaryButton label="设置数字/字母密码" onPress={() => { setChangePasswordMethod('password'); setChangePasswordStep('enter_new_digital'); setChangePasswordErrorMessage(null); setPatternError(false); }} />
            </View>
          )}

          {changePasswordStep === 'enter_new_digital' && (
            <>
              <PasswordInput
                onChangeText={setNextSecret}
                placeholder="新密码"
                secureTextEntry={!showPassword}
                showPassword={showPassword}
                onToggleShowPassword={() => setShowPassword((current) => !current)}
                value={nextSecret}
              />
              {changePasswordErrorMessage ? <Text style={styles.errorText}>{changePasswordErrorMessage}</Text> : null}
              <PrimaryButton
                disabled={loading || !nextSecret.trim()}
                label="确认修改"
                loading={loading}
                onPress={() => submitChangePassword()}
              />
            </>
          )}

          {changePasswordStep === 'enter_new_pattern' && (
            <View style={{ alignItems: 'center' }}>
              <SecurityUnlockModule 
                key="change-enter-new-pattern"
                onUnlockAttempt={(str) => {
                  setChangePasswordFirstPattern(str);
                  setChangePasswordStep('confirm_new_pattern');
                  setChangePasswordErrorMessage(null);
                  setPatternError(false);
                }} 
                onUnlockErrorHint={(hint) => setChangePasswordErrorMessage(hint)}
                onBiometricSuccess={() => {}} 
                disableBiometric 
                size={260} 
              />
              <Text style={{ marginTop: spacing[2], ...typography.textStyles.caption, color: colors.text.secondary }}>请绘制新图案</Text>
            </View>
          )}

          {changePasswordStep === 'confirm_new_pattern' && (
            <View style={{ alignItems: 'center' }}>
              <SecurityUnlockModule 
                key="change-confirm-new-pattern"
                onUnlockAttempt={(str) => {
                  if (str === changePasswordFirstPattern) {
                    setNextSecret(str);
                    setChangePasswordErrorMessage(null);
                    onChangePassword(currentSecret, str, 'pattern')
                      .then(() => {
                        closeChangePasswordDialog();
                        getPersonalCredentialConfig().then(setConfig);
                      })
                      .catch((err) => {
                        setChangePasswordErrorMessage(err instanceof Error ? err.message : '修改密码失败');
                        setPatternError(true);
                      });
                  } else {
                    setChangePasswordErrorMessage('两次绘制的图案不一致，请重试');
                    setPatternError(true);
                    setChangePasswordFirstPattern('');
                    setChangePasswordStep('enter_new_pattern');
                  }
                }} 
                onUnlockErrorHint={(hint) => setChangePasswordErrorMessage(hint)}
                onBiometricSuccess={() => {}} 
                disableBiometric 
                isError={patternError}
                size={260} 
              />
              {changePasswordErrorMessage ? (
                <Text style={styles.errorText}>{changePasswordErrorMessage}</Text>
              ) : (
                <Text style={{ marginTop: spacing[2], ...typography.textStyles.caption, color: colors.text.secondary }}>请再次绘制图案以确认</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
    <Modal animationType="fade" onRequestClose={closeRecoveryModal} transparent visible={recoveryModalVisible}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <Image resizeMode="stretch" source={unlockPatternImage} style={styles.patternImage} />
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons color={colors.primary.active} name="key-outline" size={22} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>
                {recoveryStep === 'enter_key' ? '找回隐私密码' :
                 recoveryStep === 'enter_new_pattern' ? '设置新图案密码' : '请再次绘制确认'}
              </Text>
              <Text style={styles.description}>
                {recoveryStep === 'enter_key' ? '请输入 6 位恢复密钥以重置图案密码。' : '请绘制新的隐私空间图案密码。'}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={closeRecoveryModal} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Ionicons color={colors.text.secondary} name="close" size={18} />
            </Pressable>
          </View>

          {recoveryStep === 'enter_key' && (
            <View style={{ gap: spacing[3] }}>
              <TextInput
                autoCapitalize="characters"
                maxLength={7}
                onChangeText={(text) => {
                  setRecoveryKeyInput(text.toUpperCase());
                  setRecoveryErrorMessage(null);
                }}
                placeholder="6 位恢复密钥（如 AB2-C3D）"
                placeholderTextColor={colors.text.placeholder}
                style={[styles.input, { letterSpacing: 2, textAlign: 'center', fontSize: 18, fontWeight: '600' }]}
                value={recoveryKeyInput}
              />
              {recoveryErrorMessage ? <Text style={styles.errorText}>{recoveryErrorMessage}</Text> : null}
              <PrimaryButton
                disabled={recoveryLoading || !recoveryKeyInput.trim()}
                label="验证恢复密钥"
                loading={recoveryLoading}
                onPress={async () => {
                  setRecoveryLoading(true);
                  setRecoveryErrorMessage(null);
                  try {
                    const ok = await verifyRecoveryKey(recoveryKeyInput);
                    if (ok) {
                      setRecoveryStep('enter_new_pattern');
                    } else {
                      setRecoveryErrorMessage('恢复密钥不正确，请重新输入');
                    }
                  } catch (e) {
                    setRecoveryErrorMessage(e instanceof Error ? e.message : '验证失败');
                  } finally {
                    setRecoveryLoading(false);
                  }
                }}
              />
              <Pressable
                onPress={() => {
                  closeRecoveryModal();
                  setResetConfirmVisible(true);
                }}
                style={{ alignItems: 'center', marginTop: spacing[1] }}
              >
                <Text style={{ ...typography.textStyles.caption, color: colors.semantic.danger }}>
                  遗失了恢复密钥？清空并重置隐私数据
                </Text>
              </Pressable>
            </View>
          )}

          {recoveryStep === 'enter_new_pattern' && (
            <View style={{ alignItems: 'center' }}>
              <SecurityUnlockModule
                key="rec-enter-new-pattern"
                onUnlockAttempt={(str) => {
                  setRecoveryFirstPattern(str);
                  setRecoveryStep('confirm_new_pattern');
                  setRecoveryErrorMessage(null);
                  setRecoveryPatternError(false);
                }}
                onUnlockErrorHint={(hint) => setRecoveryErrorMessage(hint)}
                onBiometricSuccess={() => {}}
                disableBiometric
                size={260}
              />
              <Text style={{ marginTop: spacing[2], ...typography.textStyles.caption, color: colors.text.secondary }}>请绘制新图案</Text>
            </View>
          )}

          {recoveryStep === 'confirm_new_pattern' && (
            <View style={{ alignItems: 'center' }}>
              <SecurityUnlockModule
                key="rec-confirm-new-pattern"
                isError={recoveryPatternError}
                onUnlockAttempt={async (str) => {
                  if (str === recoveryFirstPattern) {
                    setRecoveryLoading(true);
                    setRecoveryErrorMessage(null);
                    try {
                      await resetPasswordWithRecoveryKey(recoveryKeyInput, str, 'pattern');
                      closeRecoveryModal();
                      const cfg = await getPersonalCredentialConfig();
                      setConfig(cfg);
                      if (Platform.OS === 'android') {
                        ToastAndroid.show('图案密码已重置', ToastAndroid.SHORT);
                      }
                      await onUnlock(str);
                    } catch (err) {
                      setRecoveryErrorMessage(err instanceof Error ? err.message : '重置失败');
                      setRecoveryPatternError(true);
                    } finally {
                      setRecoveryLoading(false);
                    }
                  } else {
                    setRecoveryErrorMessage('两次绘制的图案不一致，请重试');
                    setRecoveryPatternError(true);
                    setRecoveryFirstPattern('');
                    setRecoveryStep('enter_new_pattern');
                  }
                }}
                onUnlockErrorHint={(hint) => setRecoveryErrorMessage(hint)}
                onBiometricSuccess={() => {}}
                disableBiometric
                size={260}
              />
              {recoveryErrorMessage ? (
                <Text style={styles.errorText}>{recoveryErrorMessage}</Text>
              ) : (
                <Text style={{ marginTop: spacing[2], ...typography.textStyles.caption, color: colors.text.secondary }}>请再次绘制图案以确认</Text>
              )}
            </View>
          )}
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

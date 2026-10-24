import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, Switch, ToastAndroid, Platform } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radius, spacing, typography } from '../design/tokens';
import {
  getPersonalCredentialConfig,
  PersonalCredentialConfig,
  setDefaultUnlockMethod,
  setPersonalFingerprintEnabled,
  changePersonalPassword,
  generateAndSetRecoveryKey,
  getPersonalRecoveryKeyPlain,
  verifyPersonalPassword
} from '../services/personalSystemService';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { AppDialog } from '../components/AppDialog';
import { PasswordInput } from '../components/PasswordInput';
import { PersonalUnlockModal } from '../components/PersonalUnlockModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { RecoveryKeyModal } from '../components/RecoveryKeyModal';
import { SecurityUnlockModule } from '../components/SecurityUnlockModule';

const unlockPatternImage = require('../../docs/black.png');

interface Props {
  onBack: () => void;
}

export function PasswordAndSecurityScreen({ onBack }: Props) {
  const [config, setConfig] = useState<PersonalCredentialConfig | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  
  type ChangePasswordStep = 'verify_old' | 'choose_new' | 'enter_new_digital' | 'enter_new_pattern' | 'confirm_new_pattern';
  const [changePasswordStep, setChangePasswordStep] = useState<ChangePasswordStep>('verify_old');
  const [changePasswordOldMethod, setChangePasswordOldMethod] = useState<'password' | 'pattern'>('pattern');
  const [changePasswordFirstPattern, setChangePasswordFirstPattern] = useState('');
  const [patternError, setPatternError] = useState(false);

  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentSecret, setCurrentSecret] = useState('');
  const [nextSecret, setNextSecret] = useState('');
  const [confirmNextSecret, setConfirmNextSecret] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changePasswordMethod, setChangePasswordMethod] = useState<'password' | 'pattern'>('password');
  const [changePasswordErrorMessage, setChangePasswordErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [currentRecoveryKey, setCurrentRecoveryKey] = useState('');
  const [verifyForRecoveryVisible, setVerifyForRecoveryVisible] = useState(false);
  const [redDotSeen, setRedDotSeen] = useState(true);

  useEffect(() => {
    void loadConfig();
    LocalAuthentication.hasHardwareAsync().then(has => setBiometricSupported(has));
  }, []);

  async function loadConfig() {
    const cfg = await getPersonalCredentialConfig();
    setConfig(cfg);

    const seen = await SecureStore.getItemAsync('pixory.personal.recoveryKeyPromptSeen');
    setRedDotSeen(seen === '1');
  }

  async function handleOpenRecoveryVerified() {
    await SecureStore.setItemAsync('pixory.personal.recoveryKeyPromptSeen', '1');
    setRedDotSeen(true);
    setVerifyForRecoveryVisible(false);
    setCurrentSecret('');
    setChangePasswordErrorMessage(null);

    const existing = await getPersonalRecoveryKeyPlain();
    if (!existing) {
      const newKey = await generateAndSetRecoveryKey();
      setCurrentRecoveryKey(newKey);
    } else {
      setCurrentRecoveryKey(existing);
    }
    setRecoveryModalVisible(true);
  }

  async function submitVerifyForRecovery() {
    setLoading(true);
    setChangePasswordErrorMessage(null);
    try {
      const res = await verifyPersonalPassword(currentSecret);
      if (res.ok) {
        await handleOpenRecoveryVerified();
      } else {
        setChangePasswordErrorMessage('密码不正确');
      }
    } catch (error) {
      setChangePasswordErrorMessage(error instanceof Error ? error.message : '验证失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleFingerprint(val: boolean) {
    if (val) {
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: '验证以开启指纹解锁' });
      if (!res.success) return;
    }
    await setPersonalFingerprintEnabled(val);
    await loadConfig();
  }

  async function handleSetDefaultMethod(method: 'password' | 'pattern') {
    await setDefaultUnlockMethod(method);
    await loadConfig();
    if (Platform.OS === 'android') {
      ToastAndroid.show('默认解锁方式已更改', ToastAndroid.SHORT);
    }
  }

  async function submitChangePassword() {
    if (changePasswordMethod === 'password') {
      if (nextSecret !== confirmNextSecret) {
        setChangePasswordErrorMessage('两次输入的密码不一致');
        return;
      }
    }
    setLoading(true);
    setChangePasswordErrorMessage(null);
    try {
      await changePersonalPassword(currentSecret, nextSecret, changePasswordMethod);
      setChangePasswordVisible(false);
      setCurrentSecret('');
      setNextSecret('');
      setConfirmNextSecret('');
      await loadConfig();
      if (Platform.OS === 'android') {
        ToastAndroid.show('密码修改成功', ToastAndroid.SHORT);
      }
    } catch (error) {
      setChangePasswordErrorMessage(error instanceof Error ? error.message : '修改密码失败');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChangePassword() {
    setCurrentSecret('');
    setNextSecret('');
    setConfirmNextSecret('');
    setChangePasswordFirstPattern('');
    setChangePasswordErrorMessage(null);
    setPatternError(false);
    const preferredOld = config?.hasPattern && !config?.hasPassword
      ? 'pattern'
      : (config?.defaultMethod || 'pattern');
    setChangePasswordOldMethod(preferredOld);
    setChangePasswordMethod(preferredOld === 'pattern' ? 'pattern' : 'password');
    setChangePasswordStep('verify_old');
    setChangePasswordVisible(true);
  }

  function closeChangePasswordModal() {
    setChangePasswordVisible(false);
    setCurrentSecret('');
    setNextSecret('');
    setConfirmNextSecret('');
    setChangePasswordFirstPattern('');
    setChangePasswordErrorMessage(null);
    setPatternError(false);
  }

  function renderChangePasswordDialog() {
    return (
      <Modal animationType="fade" onRequestClose={closeChangePasswordModal} transparent visible={changePasswordVisible}>
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.panel}>
            <Image resizeMode="stretch" source={unlockPatternImage} style={modalStyles.patternImage} />
            <View style={modalStyles.header}>
              <View style={modalStyles.iconWrap}>
                <Ionicons color={colors.primary.active} name="lock-closed-outline" size={22} />
              </View>
              <View style={modalStyles.titleCopy}>
                <Text style={modalStyles.title}>
                  {changePasswordStep === 'verify_old' ? '验证当前隐私密码' :
                   changePasswordStep === 'choose_new' ? '选择新验证方式' :
                   changePasswordStep === 'enter_new_digital' ? '设置新数字密码' :
                   changePasswordStep === 'enter_new_pattern' ? '设置新图案密码' :
                   '请再次绘制以确认'}
                </Text>
                <Text style={modalStyles.description}>请完成安全验证。</Text>
              </View>
              <Pressable hitSlop={10} onPress={closeChangePasswordModal} style={({ pressed }) => [modalStyles.closeButton, pressed && modalStyles.pressed]}>
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
                    {changePasswordErrorMessage ? <Text style={modalStyles.errorText}>{changePasswordErrorMessage}</Text> : null}
                    <PrimaryButton
                      disabled={loading || !currentSecret.trim()}
                      label="验证"
                      loading={loading}
                      onPress={() => {
                        verifyPersonalPassword(currentSecret).then(result => {
                          if (result.ok) {
                            if (!config?.hasPassword) {
                              setChangePasswordMethod('pattern');
                              setChangePasswordStep('enter_new_pattern');
                            } else {
                              setChangePasswordStep('choose_new');
                            }
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
                        <Text style={modalStyles.toggleMethodText}>切换为图案验证</Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <SecurityUnlockModule
                      key="sec-verify-old-pattern"
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
                      size={250}
                    />
                    {changePasswordErrorMessage ? <Text style={modalStyles.errorText}>{changePasswordErrorMessage}</Text> : null}
                    {config?.hasPassword ? (
                      <Pressable onPress={() => setChangePasswordOldMethod('password')} style={{ marginTop: spacing[3], alignItems: 'center' }}>
                        <Text style={modalStyles.toggleMethodText}>切换为数字验证</Text>
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
                <PasswordInput
                  onChangeText={setConfirmNextSecret}
                  placeholder="再次输入新密码"
                  secureTextEntry={!showPassword}
                  showPassword={showPassword}
                  onToggleShowPassword={() => setShowPassword((current) => !current)}
                  value={confirmNextSecret}
                />
                {changePasswordErrorMessage ? <Text style={modalStyles.errorText}>{changePasswordErrorMessage}</Text> : null}
                <PrimaryButton
                  disabled={loading || !nextSecret.trim() || !confirmNextSecret.trim()}
                  label="确认修改"
                  loading={loading}
                  onPress={() => submitChangePassword()}
                />
                <Pressable
                  onPress={() => {
                    setChangePasswordMethod('pattern');
                    setChangePasswordStep('enter_new_pattern');
                    setChangePasswordErrorMessage(null);
                  }}
                  style={{ marginTop: spacing[3], alignItems: 'center' }}
                >
                  <Text style={modalStyles.toggleMethodText}>改为设置图案密码</Text>
                </Pressable>
              </>
            )}

            {changePasswordStep === 'enter_new_pattern' && (
              <View style={{ alignItems: 'center' }}>
                <SecurityUnlockModule
                  key="sec-change-enter-new-pattern"
                  onUnlockAttempt={(str) => {
                    setChangePasswordFirstPattern(str);
                    setChangePasswordStep('confirm_new_pattern');
                    setChangePasswordErrorMessage(null);
                    setPatternError(false);
                  }}
                  onUnlockErrorHint={(hint) => setChangePasswordErrorMessage(hint)}
                  onBiometricSuccess={() => {}}
                  disableBiometric
                  size={250}
                />
                <Text style={{ marginTop: spacing[2], ...typography.textStyles.caption, color: colors.text.secondary }}>请绘制新图案</Text>
                <Pressable
                  onPress={() => {
                    setChangePasswordMethod('password');
                    setChangePasswordStep('enter_new_digital');
                    setChangePasswordErrorMessage(null);
                  }}
                  style={{ marginTop: spacing[3], alignItems: 'center' }}
                >
                  <Text style={modalStyles.toggleMethodText}>改为设置数字/字母密码</Text>
                </Pressable>
              </View>
            )}

            {changePasswordStep === 'confirm_new_pattern' && (
              <View style={{ alignItems: 'center' }}>
                <SecurityUnlockModule
                  key="sec-change-confirm-new-pattern"
                  onUnlockAttempt={async (str) => {
                    if (str === changePasswordFirstPattern) {
                      setLoading(true);
                      setChangePasswordErrorMessage(null);
                      try {
                        await changePersonalPassword(currentSecret, str, 'pattern');
                        closeChangePasswordModal();
                        await loadConfig();
                        if (Platform.OS === 'android') {
                          ToastAndroid.show('密码修改成功', ToastAndroid.SHORT);
                        }
                      } catch (err) {
                        setChangePasswordErrorMessage(err instanceof Error ? err.message : '修改密码失败');
                        setPatternError(true);
                      } finally {
                        setLoading(false);
                      }
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
                  size={250}
                />
                {changePasswordErrorMessage ? (
                  <Text style={modalStyles.errorText}>{changePasswordErrorMessage}</Text>
                ) : (
                  <Text style={{ marginTop: spacing[2], ...typography.textStyles.caption, color: colors.text.secondary }}>请再次绘制图案以确认</Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <ScreenScaffold
      contentContainerStyle={styles.scrollContent}
      onBack={onBack}
      scrollable
      title="密码与安全"
    >
      <View style={styles.container}>

        {/* 解锁方式设置 */}
        <View style={styles.insetGroup}>
          {biometricSupported && (
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.iconWrap}>
                <Ionicons color="#1A1C1C" name="finger-print-outline" size={20} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>指纹/面容解锁</Text>
              </View>
              <Switch
                value={config?.fingerprintEnabled ?? false}
                onValueChange={(val) => void handleToggleFingerprint(val)}
                thumbColor="#FFFFFF"
                trackColor={{ true: '#1A1C1C', false: colors.border.subtle }}
              />
            </View>
          )}

          <View style={[styles.row, config?.hasPattern ? styles.rowBorder : null]}>
            <View style={styles.iconWrap}>
              <Ionicons color="#1A1C1C" name="keypad-outline" size={20} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>优先使用数字/字母密码</Text>
            </View>
            <Switch
              value={config?.defaultMethod === 'password'}
              onValueChange={(val) => {
                if (config?.hasPassword && config?.hasPattern) {
                  void handleSetDefaultMethod(val ? 'password' : 'pattern');
                }
              }}
              disabled={!config?.hasPassword || !config?.hasPattern}
              thumbColor="#FFFFFF"
              trackColor={{ true: '#1A1C1C', false: colors.border.subtle }}
            />
          </View>

          {config?.hasPattern && (
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons color="#1A1C1C" name="grid-outline" size={20} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>优先使用图案密码</Text>
              </View>
              <Switch
                value={config?.defaultMethod === 'pattern'}
                onValueChange={(val) => {
                  if (config?.hasPassword && config?.hasPattern) {
                    void handleSetDefaultMethod(val ? 'pattern' : 'password');
                  }
                }}
                disabled={!config?.hasPassword || !config?.hasPattern}
                thumbColor="#FFFFFF"
                trackColor={{ true: '#1A1C1C', false: colors.border.subtle }}
              />
            </View>
          )}
        </View>

        {/* 密码管理 */}
        <View style={styles.insetGroup}>
          <Pressable
            onPress={handleOpenChangePassword}
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Ionicons color="#1A1C1C" name="shield-checkmark-outline" size={20} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>更新隐私密码</Text>
            </View>
            <Ionicons color="#C4C7C7" name="chevron-forward" size={17} />
          </Pressable>

          <Pressable
            onPress={() => {
              setCurrentSecret('');
              setChangePasswordErrorMessage(null);
              setVerifyForRecoveryVisible(true);
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Ionicons color="#1A1C1C" name="key-outline" size={20} />
            </View>
            <View style={styles.copy}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Text style={styles.rowTitle}>备份/重置恢复密钥</Text>
                {(!redDotSeen && !config?.hasRecoveryKey) && (
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.semantic.danger }} />
                )}
              </View>
            </View>
            <Ionicons color="#C4C7C7" name="chevron-forward" size={17} />
          </Pressable>
        </View>

      </View>
      {renderChangePasswordDialog()}

      <PersonalUnlockModal
        visible={verifyForRecoveryVisible}
        onClose={() => setVerifyForRecoveryVisible(false)}
        hasCredential={config?.hasCredential || false}
        loading={loading}
        title="验证身份"
        description="为保障安全，请先验证您的身份。"
        hideActions={true}
        onSetup={async () => {}}
        onChangePassword={async () => {}}
        onResetPersonalData={async () => {}}
        onUnlock={async (secret) => {
          const result = await verifyPersonalPassword(secret);
          if (result.ok) {
            setVerifyForRecoveryVisible(false);
            let rk = await getPersonalRecoveryKeyPlain();
            if (!rk) {
              rk = await generateAndSetRecoveryKey();
              setConfig(prev => prev ? { ...prev, hasRecoveryKey: true } : null);
            }
            setCurrentRecoveryKey(rk);
            setRecoveryModalVisible(true);
          } else {
            throw new Error('密码或验证失败');
          }
        }}
      />

      <RecoveryKeyModal 
        visible={recoveryModalVisible} 
        onClose={() => setRecoveryModalVisible(false)} 
        initialKey={currentRecoveryKey} 
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
  },
  container: {
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    gap: 10,
  },
  insetGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    minHeight: 50,
    backgroundColor: '#FFFFFF',
  },
  rowBorder: {
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: 28,
    marginRight: spacing[1],
  },
  copy: {
    flex: 1,
  },
  rowTitle: {
    ...typography.textStyles.body,
    fontSize: 15,
    color: '#1A1C1C',
    fontWeight: '500',
  },
  pressed: {
    backgroundColor: '#F3F3F4',
  },
  errorText: {
    color: colors.semantic.danger,
    fontSize: typography.size.caption,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  updatePasswordText: {
    color: colors.primary.active,
    fontSize: typography.size.body,
    fontWeight: '600',
  },
});

const modalStyles = StyleSheet.create({
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
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
    textAlign: 'center',
  },
  toggleMethodText: {
    ...typography.textStyles.body,
    color: colors.primary.default,
  },
  pressed: {
    opacity: 0.78,
  },
});

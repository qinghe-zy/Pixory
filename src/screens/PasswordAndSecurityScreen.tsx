import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, Switch, ToastAndroid, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radius, spacing, typography } from '../design/tokens';
import {
  changePersonalPassword,
  DEFAULT_PERSONAL_BACKGROUND_LOCK_TIMEOUT_MS,
  enrollPersonalBiometric,
  generateAndSetRecoveryKey,
  getPersonalBackgroundLockLabel,
  getPersonalBackgroundLockTimeoutMs,
  getPersonalCredentialConfig,
  getPersonalRecoveryKeyPlain,
  PERSONAL_BACKGROUND_LOCK_OPTIONS,
  PersonalBackgroundLockTimeoutMs,
  PersonalCredentialConfig,
  setDefaultUnlockMethod,
  setPersonalBackgroundLockTimeoutMs,
  setPersonalFingerprintEnabled,
  verifyPersonalPassword,
} from '../services/personalSystemService';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { AppDialog } from '../components/AppDialog';
import { PasswordInput } from '../components/PasswordInput';
import { PersonalUnlockModal } from '../components/PersonalUnlockModal';
import { PrimaryButton } from '../components/PrimaryButton';
import { RecoveryKeyModal } from '../components/RecoveryKeyModal';
import { SecurityUnlockModule } from '../components/SecurityUnlockModule';

const unlockPatternImage = require('../../assets/black.png');

interface Props {
  isPersonalUnlocked?: boolean;
  onBack: () => void;
}

export function PasswordAndSecurityScreen({ isPersonalUnlocked = false, onBack }: Props) {
  const [config, setConfig] = useState<PersonalCredentialConfig | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [gateVerified, setGateVerified] = useState(isPersonalUnlocked);
  const [gateVisible, setGateVisible] = useState(false);
  const [backgroundLockTimeoutMs, setBackgroundLockTimeoutMs] = useState<PersonalBackgroundLockTimeoutMs>(
    DEFAULT_PERSONAL_BACKGROUND_LOCK_TIMEOUT_MS
  );
  const [lockTimeoutModalVisible, setLockTimeoutModalVisible] = useState(false);
  
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
    const [cfg, timeoutMs] = await Promise.all([
      getPersonalCredentialConfig(),
      getPersonalBackgroundLockTimeoutMs(),
    ]);
    setConfig(cfg);
    setBackgroundLockTimeoutMs(timeoutMs);

    if (cfg.hasCredential && !isPersonalUnlocked && !gateVerified) {
      setGateVisible(true);
    } else {
      setGateVerified(true);
      setGateVisible(false);
    }

    const seen = await SecureStore.getItemAsync('pixory.personal.recoveryKeyPromptSeen');
    setRedDotSeen(seen === '1');
  }

  async function handleToggleFingerprint(val: boolean) {
    if (val) {
      if (!config?.hasCredential) {
        if (Platform.OS === 'android') {
          ToastAndroid.show('请先设置隐私密码', ToastAndroid.SHORT);
        } else {
          Alert.alert('提示', '请先设置隐私密码后再开启指纹解锁。');
        }
        return;
      }
      try {
        await enrollPersonalBiometric();
      } catch (error) {
        const message = error instanceof Error ? error.message : '开启指纹解锁失败';
        if (!message.includes('已取消')) {
          if (Platform.OS === 'android') {
            ToastAndroid.show(message, ToastAndroid.SHORT);
          } else {
            Alert.alert('无法开启指纹解锁', message);
          }
        }
        return;
      }
    } else {
      await setPersonalFingerprintEnabled(false);
    }
    await loadConfig();
  }

  async function handleSelectBackgroundLockTimeout(timeoutMs: PersonalBackgroundLockTimeoutMs) {
    await setPersonalBackgroundLockTimeoutMs(timeoutMs);
    setBackgroundLockTimeoutMs(timeoutMs);
    setLockTimeoutModalVisible(false);
    if (Platform.OS === 'android') {
      ToastAndroid.show(`后台锁定已设为「${getPersonalBackgroundLockLabel(timeoutMs)}」`, ToastAndroid.SHORT);
    }
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
      <Modal animationType="fade" onRequestClose={closeChangePasswordModal} statusBarTranslucent transparent visible={changePasswordVisible}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
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
        </KeyboardAvoidingView>
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
      {gateVerified ? (
      <View style={styles.container}>

        {/* 解锁方式设置 */}
        <View style={styles.insetGroup}>
          {biometricSupported && (
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.iconWrap}>
                <Ionicons color={colors.text.title} name="finger-print-outline" size={20} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>指纹/面容解锁</Text>
                <Text style={styles.rowSubtitle}>使用本机指纹（系统新增指纹时自动失效）</Text>
              </View>
              <Switch
                value={config?.fingerprintEnabled ?? false}
                onValueChange={(val) => void handleToggleFingerprint(val)}
                thumbColor={colors.background.surface}
                trackColor={{ true: colors.primary.active, false: colors.border.subtle }}
              />
            </View>
          )}

          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.iconWrap}>
              <Ionicons color={colors.text.title} name="keypad-outline" size={20} />
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
              thumbColor={colors.background.surface}
              trackColor={{ true: colors.primary.active, false: colors.border.subtle }}
            />
          </View>

          {config?.hasPattern && (
            <View style={[styles.row, styles.rowBorder]}>
              <View style={styles.iconWrap}>
                <Ionicons color={colors.text.title} name="grid-outline" size={20} />
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
                thumbColor={colors.background.surface}
                trackColor={{ true: colors.primary.active, false: colors.border.subtle }}
              />
            </View>
          )}

          <Pressable
            onPress={() => setLockTimeoutModalVisible(true)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Ionicons color={colors.text.title} name="timer-outline" size={20} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>后台自动锁定</Text>
              {backgroundLockTimeoutMs === -1 ? (
                <Text style={styles.rowSubtitle}>退到后台仍会模糊多任务卡片，但不自动退出</Text>
              ) : null}
            </View>
            <Text style={styles.rowValue}>{getPersonalBackgroundLockLabel(backgroundLockTimeoutMs)}</Text>
            <Ionicons color={colors.text.tertiary} name="chevron-forward" size={17} />
          </Pressable>
        </View>

        {/* 密码管理 */}
        <View style={styles.insetGroup}>
          <Pressable
            onPress={handleOpenChangePassword}
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Ionicons color={colors.text.title} name="shield-checkmark-outline" size={20} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>更新隐私密码</Text>
            </View>
            <Ionicons color={colors.text.tertiary} name="chevron-forward" size={17} />
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
              <Ionicons color={colors.text.title} name="key-outline" size={20} />
            </View>
            <View style={styles.copy}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Text style={styles.rowTitle}>备份/重置恢复密钥</Text>
                {(!redDotSeen && !config?.hasRecoveryKey) && (
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.semantic.danger }} />
                )}
              </View>
            </View>
            <Ionicons color={colors.text.tertiary} name="chevron-forward" size={17} />
          </Pressable>
        </View>

      </View>
      ) : (
        <View style={styles.gatePlaceholder} />
      )}
      {renderChangePasswordDialog()}

      <Modal
        animationType="fade"
        onRequestClose={() => setLockTimeoutModalVisible(false)}
        statusBarTranslucent
        transparent
        visible={lockTimeoutModalVisible}
      >
        <Pressable onPress={() => setLockTimeoutModalVisible(false)} style={modalStyles.backdrop}>
          <Pressable onPress={() => undefined} style={modalStyles.panel}>
            <View style={modalStyles.header}>
              <View style={modalStyles.iconWrap}>
                <Ionicons color={colors.primary.active} name="timer-outline" size={22} />
              </View>
              <View style={modalStyles.titleCopy}>
                <Text style={modalStyles.title}>后台自动锁定时间</Text>
                <Text style={modalStyles.description}>切换出 App 超过设定时长后自动锁定隐私空间</Text>
              </View>
              <Pressable hitSlop={10} onPress={() => setLockTimeoutModalVisible(false)} style={({ pressed }) => [modalStyles.closeButton, pressed && modalStyles.pressed]}>
                <Ionicons color={colors.text.secondary} name="close" size={18} />
              </Pressable>
            </View>
            <View style={styles.optionList}>
              {PERSONAL_BACKGROUND_LOCK_OPTIONS.map((option) => {
                const selected = option.value === backgroundLockTimeoutMs;
                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => void handleSelectBackgroundLockTimeout(option.value)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      selected && styles.optionRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {option.label}
                    </Text>
                    {selected ? <Ionicons color={colors.primary.active} name="checkmark" size={18} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <PersonalUnlockModal
        visible={gateVisible}
        onClose={() => {
          setGateVisible(false);
          onBack();
        }}
        hasCredential={config?.hasCredential || false}
        loading={loading}
        title="验证隐私密码"
        description="进入密码与安全设置前，请先完成身份验证。"
        hideActions={true}
        onSetup={async () => {}}
        onChangePassword={async () => {}}
        onResetPersonalData={async () => {}}
        onUnlock={async (secret) => {
          const result = await verifyPersonalPassword(secret);
          if (result.ok) {
            setGateVerified(true);
            setGateVisible(false);
          } else {
            throw new Error(result.message ?? '密码或验证失败');
          }
        }}
      />

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
            await SecureStore.setItemAsync('pixory.personal.recoveryKeyPromptSeen', '1');
            setRedDotSeen(true);
            let rk = await getPersonalRecoveryKeyPlain();
            if (!rk) {
              rk = await generateAndSetRecoveryKey();
              setConfig((prev) => (prev ? { ...prev, hasRecoveryKey: true } : null));
            }
            setCurrentRecoveryKey(rk);
            setRecoveryModalVisible(true);
          } else {
            throw new Error(result.message ?? '密码或验证失败');
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
    paddingVertical: spacing[3],
    backgroundColor: colors.background.page,
    gap: spacing[3],
  },
  insetGroup: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.sm,
    marginHorizontal: spacing[2],
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    minHeight: 52,
    backgroundColor: colors.background.surface,
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
    fontSize: typography.size.body,
    color: colors.text.title,
    fontWeight: '500',
  },
  rowSubtitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  rowValue: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    marginRight: spacing[1],
  },
  gatePlaceholder: {
    flex: 1,
    minHeight: 240,
  },
  optionList: {
    gap: spacing[1],
  },
  optionRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  optionRowSelected: {
    backgroundColor: colors.primary.weak,
  },
  optionLabel: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  optionLabelSelected: {
    color: colors.primary.active,
    fontWeight: '600',
  },
  pressed: {
    backgroundColor: colors.primary.weak,
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

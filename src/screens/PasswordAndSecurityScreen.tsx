import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Switch, ToastAndroid, Platform } from 'react-native';

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
import { RecoveryKeyModal } from '../components/RecoveryKeyModal';
import { SecurityUnlockModule } from '../components/SecurityUnlockModule';

interface Props {
  onBack: () => void;
}

export function PasswordAndSecurityScreen({ onBack }: Props) {
  const [config, setConfig] = useState<PersonalCredentialConfig | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  
  const [changePasswordVisible, setChangePasswordVisible] = useState(false);
  const [currentSecret, setCurrentSecret] = useState('');
  const [nextSecret, setNextSecret] = useState('');
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
    setLoading(true);
    setChangePasswordErrorMessage(null);
    try {
      await changePersonalPassword(currentSecret, nextSecret, changePasswordMethod);
      setChangePasswordVisible(false);
      setCurrentSecret('');
      setNextSecret('');
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

  function renderChangePasswordDialog() {
    return (
      <AppDialog
        message="验证当前密码并设置新的隐私模式密码。"
        onClose={() => setChangePasswordVisible(false)}
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
    );
  }

  return (
    <ScreenScaffold onBack={onBack} scrollable title="密码与安全">
      <View style={styles.container}>
        
        {/* Section 1: 解锁方式设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>解锁方式</Text>
          <View style={styles.card}>
            {biometricSupported && (
              <View style={[styles.row, styles.rowBorder]}>
                <View style={styles.iconWrap}>
                  <Ionicons color={colors.primary.active} name="finger-print-outline" size={20} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>指纹/面容解锁</Text>
                </View>
                <Switch 
                  value={config?.fingerprintEnabled ?? false} 
                  onValueChange={(val) => void handleToggleFingerprint(val)}
                  trackColor={{ true: colors.primary.default }}
                />
              </View>
            )}

            <View style={[styles.row, config?.hasPattern ? styles.rowBorder : null]}>
              <View style={styles.iconWrap}>
                <Ionicons color={colors.primary.active} name="keypad-outline" size={20} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>优先使用数字/字母密码</Text>
              </View>
              <Switch 
                value={config?.defaultMethod === 'password'} 
                onValueChange={(val) => {
                  if (val || config?.hasPattern) {
                    void handleSetDefaultMethod(val ? 'password' : 'pattern');
                  }
                }}
                disabled={!config?.hasPattern} // if no pattern, MUST use password
                trackColor={{ true: colors.primary.default }}
              />
            </View>

            {config?.hasPattern && (
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons color={colors.primary.active} name="grid-outline" size={20} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>优先使用图案密码</Text>
                </View>
                <Switch 
                  value={config?.defaultMethod === 'pattern'} 
                  onValueChange={(val) => void handleSetDefaultMethod(val ? 'pattern' : 'password')}
                  trackColor={{ true: colors.primary.default }}
                />
              </View>
            )}
          </View>
          <Text style={styles.sectionFooter}>开启图案密码后，可在上方切换进入隐私空间时的首选解锁界面。</Text>
        </View>

        {/* Section 2: 密码管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>密码管理</Text>
          <View style={styles.card}>
            <Pressable 
              onPress={() => {
                setCurrentSecret('');
                setNextSecret('');
                setChangePasswordErrorMessage(null);
                setChangePasswordVisible(true);
              }} 
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}>
                <Ionicons color={colors.primary.active} name="shield-checkmark-outline" size={20} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>更新隐私密码</Text>
              </View>
              <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
            </Pressable>
          </View>
          <Text style={styles.sectionFooter}>你可以在此处随时更新你的数字密码或图案密码。</Text>

          <View style={[styles.card, { marginTop: spacing[3] }]}>
            <Pressable 
              onPress={() => {
                setCurrentSecret('');
                setChangePasswordErrorMessage(null);
                setVerifyForRecoveryVisible(true);
              }} 
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}>
                <Ionicons color={colors.primary.active} name="key-outline" size={20} />
              </View>
              <View style={styles.copy}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <Text style={styles.rowTitle}>备份/重置恢复密钥</Text>
                  {(!redDotSeen && !config?.hasRecoveryKey) && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.semantic.danger }} />
                  )}
                </View>
              </View>
              <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
            </Pressable>
          </View>
          <Text style={styles.sectionFooter}>如果忘记了之前的恢复密钥，可在此处重新生成。</Text>
        </View>

      </View>
      {renderChangePasswordDialog()}

      <AppDialog
        message="为保障安全，请先验证当前数字密码。"
        onClose={() => setVerifyForRecoveryVisible(false)}
        onPrimary={() => {
          void submitVerifyForRecovery();
        }}
        primaryDisabled={loading || !currentSecret.trim()}
        primaryLabel="验证"
        title="验证身份"
        visible={verifyForRecoveryVisible}
      >
        <PasswordInput
          onChangeText={setCurrentSecret}
          placeholder="当前数字密码"
          secureTextEntry={!showPassword}
          showPassword={showPassword}
          onToggleShowPassword={() => setShowPassword((current) => !current)}
          value={currentSecret}
        />
        {changePasswordErrorMessage ? <Text style={styles.errorText}>{changePasswordErrorMessage}</Text> : null}
      </AppDialog>

      <RecoveryKeyModal 
        visible={recoveryModalVisible} 
        onClose={() => setRecoveryModalVisible(false)} 
        initialKey={currentRecoveryKey} 
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing[2],
  },
  section: {
    marginBottom: spacing[6],
  },
  sectionHeader: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    fontWeight: '600',
    paddingHorizontal: spacing[6],
    marginBottom: spacing[2],
    textTransform: 'uppercase',
  },
  sectionFooter: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    paddingHorizontal: spacing[6],
    marginTop: spacing[2],
  },
  card: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginHorizontal: spacing[4],
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    minHeight: 56,
  },
  rowBorder: {
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  copy: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text.primary,
    fontSize: typography.size.body,
  },
  pressed: {
    backgroundColor: colors.background.secondary,
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

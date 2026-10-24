import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { getPersonalCredentialConfig, type PersonalCredentialConfig } from '../services/personalSystemService';
import { SecurityUnlockModule } from './SecurityUnlockModule';
import { colors, radius, typography } from '../design/tokens';
import { aiLightColors } from './ai/aiLightTheme';

export interface PersonalCredentialPromptProps {
  theme?: 'ai' | 'default';
  isError?: boolean;
  disabled?: boolean;
  passwordValue: string;
  onPasswordChange: (text: string) => void;
  onPatternSubmit: (pattern: string) => void;
  onBiometricSuccess: () => void;
  onAuthMethodChange?: (method: 'password' | 'pattern') => void;
}

export function PersonalCredentialPrompt({
  theme = 'default',
  isError = false,
  disabled = false,
  passwordValue,
  onPasswordChange,
  onPatternSubmit,
  onBiometricSuccess,
  onAuthMethodChange,
}: PersonalCredentialPromptProps) {
  const [config, setConfig] = useState<PersonalCredentialConfig | null>(null);
  const [authMethod, setAuthMethod] = useState<'password' | 'pattern'>('pattern');

  const isAiTheme = theme === 'ai';
  const textColor = isAiTheme ? aiLightColors.mutedReadable : colors.text.secondary;
  const primaryColor = isAiTheme ? aiLightColors.primary : colors.primary.default;

  useEffect(() => {
    void getPersonalCredentialConfig().then((cfg) => {
      setConfig(cfg);
      let initialMethod: 'password' | 'pattern' = 'pattern';
      if (cfg.hasPattern && !cfg.hasPassword) {
        initialMethod = 'pattern';
      } else if (cfg.hasPassword && !cfg.hasPattern) {
        initialMethod = 'password';
      } else {
        initialMethod = cfg.defaultMethod === 'password' ? 'password' : 'pattern';
      }
      setAuthMethod(initialMethod);
      onAuthMethodChange?.(initialMethod);
    });
  }, []);

  const handleToggleMethod = (nextMethod: 'password' | 'pattern') => {
    setAuthMethod(nextMethod);
    onAuthMethodChange?.(nextMethod);
  };

  if (config && !config.hasCredential) {
    return (
      <Text style={[styles.message, { color: textColor }]}>
        您尚未设置隐私空间密码，请先前往设置初始化。
      </Text>
    );
  }

  if (authMethod === 'pattern') {
    return (
      <View style={styles.patternContainer}>
        <Text style={[styles.hintText, { color: textColor }]}>
          绘制图案以验证身份
        </Text>
        <SecurityUnlockModule
          disableBiometric={!config?.fingerprintEnabled}
          isError={isError}
          onBiometricSuccess={onBiometricSuccess}
          onUnlockAttempt={onPatternSubmit}
          size={200}
        />
        {config?.hasPassword ? (
          <Pressable
            hitSlop={8}
            onPress={() => handleToggleMethod('password')}
            style={styles.toggleButton}
          >
            <Text style={[styles.toggleText, { color: primaryColor }]}>使用数字/文字密码</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.passwordContainer}>
      <TextInput
        editable={!disabled}
        onChangeText={onPasswordChange}
        placeholder={isAiTheme ? '隐私密码' : '输入隐私密码'}
        placeholderTextColor={isAiTheme ? aiLightColors.mutedSoft : colors.text.placeholder}
        secureTextEntry
        selectionColor={primaryColor}
        style={[
          styles.input,
          isAiTheme
            ? {
                backgroundColor: aiLightColors.surface,
                borderColor: aiLightColors.hairline,
                color: aiLightColors.ink,
              }
            : {
                backgroundColor: colors.background.input,
                borderColor: colors.border.default,
                color: colors.text.body,
              },
        ]}
        value={passwordValue}
      />
      {config?.hasPattern ? (
        <Pressable
          hitSlop={8}
          onPress={() => handleToggleMethod('pattern')}
          style={styles.toggleButtonCenter}
        >
          <Text style={[styles.toggleText, { color: primaryColor }]}>使用图案密码</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    ...typography.textStyles.caption,
    marginTop: 12,
  },
  patternContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  passwordContainer: {
    marginTop: 8,
  },
  hintText: {
    ...typography.textStyles.caption,
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 16,
    marginTop: 4,
    padding: 12,
  },
  toggleButton: {
    marginTop: 12,
    paddingVertical: 4,
  },
  toggleButtonCenter: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 13,
  },
});

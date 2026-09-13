import re

with open('src/components/PersonalUnlockModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

trigger_code = """
  const triggerBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '验证指纹/面容进入隐私模式',
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
"""

content = content.replace("async function handlePatternUnlock", trigger_code.strip() + "\n\n  async function handlePatternUnlock")

old_effect = """
    } else {
      getPersonalCredentialConfig().then(cfg => {
        setConfig(cfg);
        if (cfg.hasCredential) {
          setUnlockMethod(cfg.defaultMethod);
        }
      });
    }
"""
new_effect = """
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
"""
content = content.replace(old_effect.strip(), new_effect.strip())

biometric_ui = """
          {hasCredential && config?.fingerprintEnabled ? (
            <View style={{ alignItems: 'center', marginTop: spacing[2] }}>
              <Pressable onPress={triggerBiometric} style={({pressed}) => [{ alignItems: 'center', gap: spacing[1], padding: spacing[2] }, pressed && { opacity: 0.7 }]}>
                <Ionicons name="finger-print" size={48} color={colors.primary.default} />
                <Text style={{ ...typography.textStyles.caption, color: colors.text.secondary }}>使用指纹/面容解锁</Text>
              </Pressable>
            </View>
          ) : null}
"""

content = content.replace("{biometricSupported && !config?.fingerprintEnabled ?", biometric_ui.strip() + "\n\n          {biometricSupported && !config?.fingerprintEnabled ?")

content = content.replace("disableBiometric={!config?.fingerprintEnabled}", "disableBiometric={true}")

with open('src/components/PersonalUnlockModal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

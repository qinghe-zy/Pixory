import os

with open('src/screens/PasswordAndSecurityScreen.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Modify imports
if 'PersonalUnlockModal' not in text:
    text = text.replace("import { PasswordInput } from '../components/PasswordInput';", "import { PasswordInput } from '../components/PasswordInput';\nimport { PersonalUnlockModal } from '../components/PersonalUnlockModal';")

# Find AppDialog and replace with PersonalUnlockModal
app_dialog_old = """<AppDialog
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
      </AppDialog>"""

app_dialog_new = """<PersonalUnlockModal
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
          const isValid = await personalSystemService.verifyPersonalSecret(secret);
          if (isValid) {
            setVerifyForRecoveryVisible(false);
            let rk = await personalSystemService.getRecoveryKey();
            if (!rk) {
              rk = await personalSystemService.generateAndSetRecoveryKey();
              setConfig(prev => prev ? { ...prev, hasRecoveryKey: true } : null);
            }
            setCurrentRecoveryKey(rk);
            setRecoveryModalVisible(true);
          } else {
            throw new Error('验证未通过');
          }
        }}
      />"""

if app_dialog_old in text:
    text = text.replace(app_dialog_old, app_dialog_new)
else:
    print('Could not find AppDialog')

with open('src/screens/PasswordAndSecurityScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print('Updated PasswordAndSecurityScreen.tsx')

import os

with open('src/screens/PasswordAndSecurityScreen.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace the incorrect usages in my previous patch
patch_old = """const isValid = await personalSystemService.verifyPersonalSecret(secret);
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
          }"""

patch_new = """const result = await verifyPersonalPassword(secret);
          if (result.valid) {
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
          }"""

text = text.replace(patch_old, patch_new)

with open('src/screens/PasswordAndSecurityScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print('Fixed usages in PasswordAndSecurityScreen.tsx')

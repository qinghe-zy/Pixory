import os

with open('src/components/PersonalUnlockModal.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

props_old = """interface PersonalUnlockModalProps {
  hasCredential: boolean | null;
  loading: boolean;
  visible: boolean;
  onClose: () => void;
  onSetup: (secret: string, method?: 'password' | 'pattern') => Promise<void>;
  onUnlock: (secret: string) => Promise<void>;
  onChangePassword: (currentSecret: string, nextSecret: string, method?: 'password' | 'pattern') => Promise<void>;
  onResetPersonalData: () => Promise<void>;
}"""

props_new = """interface PersonalUnlockModalProps {
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
}"""
text = text.replace(props_old, props_new)

destruct_old = """export function PersonalUnlockModal({
  hasCredential,
  loading,
  visible,
  onClose,
  onSetup,
  onUnlock,
  onChangePassword,
  onResetPersonalData,
}: PersonalUnlockModalProps) {"""
destruct_new = """export function PersonalUnlockModal({
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
}: PersonalUnlockModalProps) {"""
text = text.replace(destruct_old, destruct_new)

title_old = """<Text style={styles.title}>{needsSetup ? '创建隐私模式密码' : '进入隐私模式'}</Text>
            <Text style={styles.description}>隐私数据保存在独立 SQLite 和独立本地文件目录中。</Text>"""
title_new = """<Text style={styles.title}>{title || (needsSetup ? '创建隐私模式密码' : '进入隐私模式')}</Text>
            <Text style={styles.description}>{description || '隐私数据保存在独立 SQLite 和独立本地文件目录中。'}</Text>"""
text = text.replace(title_old, title_new)

actions_old = """<View style={styles.textActions}>
              <Pressable
                onPress={() => {
                  setErrorMessage(null);
                  setCurrentSecret('');
                  setNextSecret('');
                  setChangePasswordErrorMessage(null);
                  setChangePasswordVisible(true);
                }}
                style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.updatePasswordText}>更新密码</Text>
              </Pressable>
              
              <View style={styles.textActionDivider} />

              <Pressable
                onPress={() => {
                  setErrorMessage(null);
                  setResetConfirmVisible(true);
                }}
                style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.forgotPasswordText}>忘记密码</Text>
              </Pressable>
            </View>"""
actions_new = """{!hideActions && (
            <View style={styles.textActions}>
              <Pressable
                onPress={() => {
                  setErrorMessage(null);
                  setCurrentSecret('');
                  setNextSecret('');
                  setChangePasswordErrorMessage(null);
                  setChangePasswordVisible(true);
                }}
                style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.updatePasswordText}>更新密码</Text>
              </Pressable>
              
              <View style={styles.textActionDivider} />

              <Pressable
                onPress={() => {
                  setErrorMessage(null);
                  setResetConfirmVisible(true);
                }}
                style={({ pressed }) => [styles.textActionButton, pressed && styles.pressed]}
              >
                <Text style={styles.forgotPasswordText}>忘记密码</Text>
              </Pressable>
            </View>
            )}"""
text = text.replace(actions_old, actions_new)

biometric_old = "promptMessage: '验证指纹/面容进入隐私模式'"
biometric_new = "promptMessage: title || '验证指纹/面容进入隐私模式'"
text = text.replace(biometric_old, biometric_new)

with open('src/components/PersonalUnlockModal.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print('Updated PersonalUnlockModal.tsx')

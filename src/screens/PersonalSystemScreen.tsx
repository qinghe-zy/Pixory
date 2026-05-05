import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ContentCard } from '../components/ContentCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ipRepository, runWithDatabaseSpace, type IpListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import {
  hasPersonalPassword,
  resetPersonalSystemData,
  setPersonalPassword,
  verifyPersonalPassword,
} from '../services/personalSystemService';
import { useToast } from '../components/AppToast';

interface PersonalSystemScreenProps {
  refreshToken: number;
  onBack: () => void;
  onImportImages: (ipId: number) => void;
}

export function PersonalSystemScreen({ refreshToken, onBack, onImportImages }: PersonalSystemScreenProps) {
  const { showToast } = useToast();
  const [hasCredential, setHasCredential] = useState<boolean | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [secret, setSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const [ipName, setIpName] = useState('');
  const [items, setItems] = useState<IpListItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function reloadCredential() {
    setHasCredential(await hasPersonalPassword());
  }

  async function reloadPersonalIps() {
    if (!isUnlocked) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const nextItems = await runWithDatabaseSpace('personal', () => ipRepository.findLibraryItems());
      setItems(nextItems);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取隐私系统失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reloadCredential();
  }, []);

  useEffect(() => {
    void reloadPersonalIps();
  }, [isUnlocked, refreshToken]);

  async function handleSetSecret() {
    try {
      if (secret.trim() !== confirmSecret.trim()) {
        throw new Error('两次输入的密码不一致。');
      }
      await setPersonalPassword(secret);
      setSecret('');
      setConfirmSecret('');
      setHasCredential(true);
      setIsUnlocked(true);
      showToast('隐私系统已创建');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '设置隐私系统失败');
    }
  }

  async function handleUnlock() {
    const result = await verifyPersonalPassword(secret);
    if (!result.ok) {
      showToast(result.message ?? '验证失败');
      return;
    }

    setSecret('');
    setIsUnlocked(true);
    showToast('已进入 Personal System');
  }

  async function handleCreatePersonalIp() {
    const preparedName = ipName.trim();
    if (!preparedName) {
      showToast('请输入 IP 名称');
      return;
    }

    try {
      await runWithDatabaseSpace('personal', () =>
        ipRepository.create({
          name: preparedName,
          description: 'Personal System',
        })
      );
      setIpName('');
      await reloadPersonalIps();
      showToast(`已创建 ${preparedName} (ps)`);
    } catch (error) {
      showToast(error instanceof Error ? `创建失败：${error.message}` : '创建失败');
    }
  }

  async function handleResetPersonalData() {
    try {
      await resetPersonalSystemData();
      setHasCredential(false);
      setIsUnlocked(false);
      setItems([]);
      showToast('已清除隐私系统数据');
    } catch (error) {
      showToast(error instanceof Error ? `清除失败：${error.message}` : '清除失败');
    }
  }

  if (!isUnlocked) {
    const isSetup = hasCredential === false;
    return (
      <ScreenScaffold decorativeTitle="Personal" onBack={onBack} scrollable title="Personal System">
        <ContentCard style={styles.guardCard}>
          <View style={styles.guardIcon}>
            <Ionicons color={colors.primary.active} name="lock-closed-outline" size={28} />
          </View>
          <Text style={styles.guardTitle}>{isSetup ? '创建隐私系统' : '验证后进入隐私系统'}</Text>
          <Text style={styles.guardText}>
            personal IP 使用独立 SQLite 和独立文件目录。忘记密码无法找回，只能清除隐私系统数据后重置。
          </Text>
          <TextInput
            onChangeText={setSecret}
            placeholder={isSetup ? '设置数字或文本密码' : '输入隐私系统密码'}
            placeholderTextColor={colors.text.placeholder}
            secureTextEntry
            style={styles.input}
            value={secret}
          />
          {isSetup ? (
            <TextInput
              onChangeText={setConfirmSecret}
              placeholder="再次输入密码"
              placeholderTextColor={colors.text.placeholder}
              secureTextEntry
              style={styles.input}
              value={confirmSecret}
            />
          ) : null}
          <PrimaryButton label={isSetup ? '创建并进入' : '验证进入'} onPress={isSetup ? handleSetSecret : handleUnlock} />
          {hasCredential ? (
            <PrimaryButton label="忘记密码，清除隐私系统数据" onPress={handleResetPersonalData} variant="outline" />
          ) : null}
        </ContentCard>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold decorativeTitle="Personal" onBack={onBack} scrollable title="Personal System">
      <View style={styles.createRow}>
        <TextInput
          onChangeText={setIpName}
          placeholder="新建 private IP"
          placeholderTextColor={colors.text.placeholder}
          style={styles.input}
          value={ipName}
        />
        <PrimaryButton label="新建" onPress={handleCreatePersonalIp} />
      </View>
      <PageStateBlock
        emptyDescription="private IP 会写入独立 personal 数据库和 pixory_personal 文件目录。"
        emptyIconName="lock-closed-outline"
        emptyTitle="还没有 private IP"
        errorMessage={errorMessage}
        isEmpty={!isLoading && items.length === 0}
        loading={isLoading}
        loadingDescription="正在读取 personal 数据库。"
        loadingTitle="读取隐私系统"
        onRetry={reloadPersonalIps}
      >
        <View style={styles.ipList}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onImportImages(item.id)}
              style={({ pressed }) => [styles.ipRow, pressed && styles.pressed]}
            >
              <View style={styles.ipIcon}>
                <Ionicons color={colors.primary.active} name="image-outline" size={18} />
              </View>
              <View style={styles.ipCopy}>
                <Text numberOfLines={1} style={styles.ipName}>{item.name} (ps)</Text>
                <Text style={styles.ipMeta}>{item.imageCount} 张图片 · 点击导入</Text>
              </View>
              <Ionicons color={colors.text.secondary} name="chevron-forward" size={17} />
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
      <PrimaryButton label="退出隐私系统" onPress={() => setIsUnlocked(false)} variant="outline" />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  guardCard: {
    gap: spacing[4],
    padding: spacing[5],
  },
  guardIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.lg,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  guardTitle: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  guardText: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
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
  createRow: {
    gap: spacing[3],
  },
  ipList: {
    gap: spacing[2],
  },
  ipRow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 62,
    padding: spacing[3],
  },
  ipIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  ipCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  ipName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  ipMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.82,
  },
});


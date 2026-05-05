import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ContentCard } from '../components/ContentCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ipRepository, runWithDatabaseSpace, type IpListItem, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import {
  changePersonalPassword,
  hasPersonalPassword,
  resetPersonalSystemData,
  setPersonalPassword,
  verifyPersonalPassword,
} from '../services/personalSystemService';
import { useToast } from '../components/AppToast';

interface PersonalSystemScreenProps {
  refreshToken: number;
  isUnlocked: boolean;
  onBack: () => void;
  onUnlocked: () => void;
  onExit: () => void;
  onCreateIp: (space: PixorySpace) => void;
  onOpenIp: (ipId: number, space: PixorySpace) => void;
  onImportImages: (ipId: number, space: PixorySpace) => void;
  onOpenImportHistory: (ipId: number, space: PixorySpace) => void;
  onOpenGlobalSearch: (space: PixorySpace) => void;
  onOpenGroups: (space: PixorySpace) => void;
  onOpenTags: (space: PixorySpace) => void;
  onOpenFavorites: (space: PixorySpace) => void;
  onOpenRecentViewed: (space: PixorySpace) => void;
  onOpenTrash: (space: PixorySpace) => void;
  onOpenBackup: (space: PixorySpace) => void;
  onOpenQuickOrganize: (space: PixorySpace) => void;
}

type DashboardAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function PersonalSystemScreen({
  refreshToken,
  isUnlocked,
  onBack,
  onUnlocked,
  onExit,
  onCreateIp,
  onOpenIp,
  onImportImages,
  onOpenImportHistory,
  onOpenGlobalSearch,
  onOpenGroups,
  onOpenTags,
  onOpenFavorites,
  onOpenRecentViewed,
  onOpenTrash,
  onOpenBackup,
  onOpenQuickOrganize,
}: PersonalSystemScreenProps) {
  const { showToast } = useToast();
  const [hasCredential, setHasCredential] = useState<boolean | null>(null);
  const [secret, setSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const [currentSecret, setCurrentSecret] = useState('');
  const [nextSecret, setNextSecret] = useState('');
  const [normalItems, setNormalItems] = useState<IpListItem[]>([]);
  const [personalItems, setPersonalItems] = useState<IpListItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function reloadCredential() {
    setHasCredential(await hasPersonalPassword());
  }

  async function reloadDashboard() {
    if (!isUnlocked) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [nextNormalItems, nextPersonalItems] = await Promise.all([
        runWithDatabaseSpace('normal', () => ipRepository.findLibraryItems()),
        runWithDatabaseSpace('personal', () => ipRepository.findLibraryItems()),
      ]);
      setNormalItems(nextNormalItems);
      setPersonalItems(nextPersonalItems);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '读取 Personal System 失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void reloadCredential();
  }, []);

  useEffect(() => {
    void reloadDashboard();
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
      onUnlocked();
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
    onUnlocked();
    showToast('已进入 Personal System');
  }

  async function handleChangePassword() {
    try {
      await changePersonalPassword(currentSecret, nextSecret);
      setCurrentSecret('');
      setNextSecret('');
      showToast('隐私系统密码已更新');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '修改密码失败');
    }
  }

  async function handleResetPersonalData() {
    try {
      await resetPersonalSystemData();
      setHasCredential(false);
      setNormalItems([]);
      setPersonalItems([]);
      onExit();
      showToast('已清除隐私系统数据，普通空间未受影响');
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

  const actions: DashboardAction[] = [
    { key: 'search', label: '搜索', icon: 'search-outline', onPress: () => onOpenGlobalSearch('personal') },
    { key: 'groups', label: '分组', icon: 'albums-outline', onPress: () => onOpenGroups('personal') },
    { key: 'tags', label: '标签', icon: 'pricetag-outline', onPress: () => onOpenTags('personal') },
    { key: 'favorites', label: '收藏', icon: 'star-outline', onPress: () => onOpenFavorites('personal') },
    { key: 'recent', label: '最近', icon: 'time-outline', onPress: () => onOpenRecentViewed('personal') },
    { key: 'trash', label: '回收站', icon: 'trash-outline', onPress: () => onOpenTrash('personal') },
    { key: 'backup', label: '备份导出', icon: 'archive-outline', onPress: () => onOpenBackup('personal') },
    { key: 'quick', label: '快速整理', icon: 'sparkles-outline', onPress: () => onOpenQuickOrganize('personal') },
  ];

  return (
    <ScreenScaffold decorativeTitle="Personal" onBack={onBack} scrollable title="Personal System">
      <View style={styles.actionGrid}>
        <PrimaryButton label="新建普通 IP" onPress={() => onCreateIp('normal')} variant="outline" />
        <PrimaryButton label="新建隐私 IP" onPress={() => onCreateIp('personal')} />
      </View>

      <View style={styles.quickGrid}>
        {actions.map((action) => (
          <Pressable key={action.key} onPress={action.onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
            <Ionicons color={colors.primary.active} name={action.icon} size={18} />
            <Text numberOfLines={1} style={styles.quickActionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      <PageStateBlock
        emptyDescription="Personal System 会同时展示普通空间和隐私空间，隐私数据只在解锁后出现。"
        emptyIconName="lock-closed-outline"
        emptyTitle="还没有可管理的 IP"
        errorMessage={errorMessage}
        isEmpty={!isLoading && normalItems.length === 0 && personalItems.length === 0}
        loading={isLoading}
        loadingDescription="正在分别读取 normal 和 personal 数据库。"
        loadingTitle="读取 Personal System"
        onRetry={reloadDashboard}
      >
        <View style={styles.sections}>
          <IpSection
            emptyText="普通空间还没有 IP"
            items={normalItems}
            onImportImages={onImportImages}
            onOpenImportHistory={onOpenImportHistory}
            onOpenIp={(item) => onOpenIp(item.id, 'normal')}
            title="普通 IP"
          />
          <IpSection
            emptyText="隐私空间还没有 IP"
            isPersonal
            items={personalItems}
            onImportImages={onImportImages}
            onOpenImportHistory={onOpenImportHistory}
            onOpenIp={(item) => onOpenIp(item.id, 'personal')}
            title="隐私 IP"
          />
        </View>
      </PageStateBlock>

      <ContentCard style={styles.passwordCard}>
        <Text style={styles.sectionTitle}>修改密码</Text>
        <TextInput
          onChangeText={setCurrentSecret}
          placeholder="当前密码"
          placeholderTextColor={colors.text.placeholder}
          secureTextEntry
          style={styles.input}
          value={currentSecret}
        />
        <TextInput
          onChangeText={setNextSecret}
          placeholder="新密码"
          placeholderTextColor={colors.text.placeholder}
          secureTextEntry
          style={styles.input}
          value={nextSecret}
        />
        <PrimaryButton
          disabled={!currentSecret.trim() || !nextSecret.trim()}
          label="更新隐私系统密码"
          onPress={handleChangePassword}
          variant="outline"
        />
      </ContentCard>

      <PrimaryButton label="退出隐私系统并锁定" onPress={onExit} variant="outline" />
    </ScreenScaffold>
  );
}

function IpSection({
  emptyText,
  isPersonal = false,
  items,
  onImportImages,
  onOpenImportHistory,
  onOpenIp,
  title,
}: {
  emptyText: string;
  isPersonal?: boolean;
  items: IpListItem[];
  onImportImages: (ipId: number, space: PixorySpace) => void;
  onOpenImportHistory: (ipId: number, space: PixorySpace) => void;
  onOpenIp: (item: IpListItem) => void;
  title: string;
}) {
  return (
    <ContentCard style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? <Text style={styles.emptyLine}>{emptyText}</Text> : null}
      {items.map((item) => (
        <Pressable key={`${isPersonal ? 'personal' : 'normal'}-${item.id}`} onPress={() => onOpenIp(item)} style={({ pressed }) => [styles.ipRow, pressed && styles.pressed]}>
          <View style={styles.ipIcon}>
            <Ionicons color={colors.primary.active} name={isPersonal ? 'lock-closed-outline' : 'image-outline'} size={18} />
          </View>
          <View style={styles.ipCopy}>
            <Text numberOfLines={1} style={styles.ipName}>{item.name}{isPersonal ? ' (ps)' : ''}</Text>
            <Text style={styles.ipMeta}>{item.imageCount} 张图片 · {item.groupCount} 个分组</Text>
          </View>
          <View style={styles.rowActions}>
            <Pressable hitSlop={8} onPress={() => onImportImages(item.id, isPersonal ? 'personal' : 'normal')} style={({ pressed }) => [styles.importChip, pressed && styles.pressed]}>
              <Text style={styles.importChipText}>导入</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => onOpenImportHistory(item.id, isPersonal ? 'personal' : 'normal')} style={({ pressed }) => [styles.importChip, pressed && styles.pressed]}>
              <Text style={styles.importChipText}>导入历史</Text>
            </Pressable>
            <Pressable hitSlop={8} onPress={() => onOpenImportHistory(item.id, isPersonal ? 'personal' : 'normal')} style={({ pressed }) => [styles.importChip, pressed && styles.pressed]}>
              <Text style={styles.importChipText}>疑似重复</Text>
            </Pressable>
          </View>
          <Ionicons color={colors.text.secondary} name="chevron-forward" size={17} />
        </Pressable>
      ))}
    </ContentCard>
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
  actionGrid: {
    gap: spacing[3],
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '23%',
    flexGrow: 1,
    gap: spacing[1],
    minHeight: 64,
    justifyContent: 'center',
    padding: spacing[2],
  },
  quickActionText: {
    ...typography.textStyles.caption,
    color: colors.text.title,
  },
  sections: {
    gap: spacing[3],
  },
  sectionCard: {
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  emptyLine: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
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
  importChip: {
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  importChipText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  passwordCard: {
    gap: spacing[3],
  },
  pressed: {
    opacity: 0.82,
  },
});

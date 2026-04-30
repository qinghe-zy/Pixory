import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { FilterChip } from '../components/FilterChip';
import { FormField } from '../components/FormField';
import { Header } from '../components/Header';
import { PrimaryButton } from '../components/PrimaryButton';
import { GROUP_TYPE_OPTIONS, type GroupTypeValue } from '../constants/groups';
import { colors, radius, spacing, typography } from '../design/tokens';
import { groupRepository, ipRepository } from '../database';
import { useEffect } from 'react';

interface CreateGroupScreenProps {
  ipId: number;
  ipName?: string;
  onBack: () => void;
  onCreated: () => void;
}

export function CreateGroupScreen({ ipId, ipName, onBack, onCreated }: CreateGroupScreenProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupTypeValue | null>(null);
  const [description, setDescription] = useState('');
  const [resolvedIpName, setResolvedIpName] = useState(ipName ?? `IP #${ipId}`);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (ipName) {
      setResolvedIpName(ipName);
      return;
    }

    let isMounted = true;

    ipRepository
      .findById(ipId)
      .then((ip) => {
        if (isMounted && ip) {
          setResolvedIpName(ip.name);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [ipId, ipName]);

  async function handleCreate() {
    if (!trimmedName) {
      setErrorMessage('请输入分组名称。');
      return;
    }

    if (!type) {
      setErrorMessage('请选择分组类型。');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await groupRepository.create({
        ipId,
        name: trimmedName,
        type,
        description,
      });
      onCreated();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`创建失败：${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen scrollable>
      <Header onBack={onBack} title="新建分组" />

      <View style={styles.formWrap}>
        <ContentCard>
          <FormField hint="当前新建的分组会直接归属这个 IP。" label="所属IP">
            <View style={styles.readonlyBox}>
              <Text style={styles.readonlyText}>{resolvedIpName}</Text>
            </View>
          </FormField>
        </ContentCard>

        <ContentCard>
          <FormField label="分组名称">
            <TextInput
              maxLength={40}
              onChangeText={setName}
              placeholder="例如：2026 夏季、夜景场景、海报KV"
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
              style={styles.singleLineInput}
              value={name}
            />
          </FormField>
        </ContentCard>

        <ContentCard>
          <FormField hint="按你后续最常用的整理方式来选。" label="分组类型">
            <View style={styles.typeWrap}>
              {GROUP_TYPE_OPTIONS.map((option) => (
                <FilterChip
                  active={type === option.value}
                  key={option.value}
                  label={option.label}
                  onPress={() => setType(option.value)}
                />
              ))}
            </View>
          </FormField>
        </ContentCard>

        <ContentCard>
          <FormField hint="可选，帮助你区分该分组的使用场景。" label="分组描述">
            <TextInput
              maxLength={160}
              multiline
              onChangeText={setDescription}
              placeholder="例如：适合活动主视觉、角色立绘、社媒图等。"
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
              style={styles.multilineInput}
              textAlignVertical="top"
              value={description}
            />
          </FormField>
        </ContentCard>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.actions}>
        <PrimaryButton disabled={!trimmedName || !type} label="创建分组" loading={isSubmitting} onPress={handleCreate} />
        <PrimaryButton label="取消返回" onPress={onBack} variant="ghost" />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: spacing[4],
  },
  readonlyBox: {
    backgroundColor: colors.background.input,
    borderRadius: radius.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  readonlyText: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  singleLineInput: {
    ...typography.textStyles.body,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  multilineInput: {
    ...typography.textStyles.body,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text.title,
    minHeight: 120,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  typeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  actions: {
    gap: spacing[3],
    paddingTop: spacing[2],
  },
});

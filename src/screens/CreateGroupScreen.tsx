import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { FilterChip } from '../components/FilterChip';
import { FormField } from '../components/FormField';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { MultilineFieldCard } from '../components/MultilineFieldCard';
import { ReadonlyFieldCard } from '../components/ReadonlyFieldCard';
import { TextFieldCard } from '../components/TextFieldCard';
import { GROUP_NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '../constants/limits';
import { GROUP_TYPE_OPTIONS, type GroupTypeValue } from '../constants/groups';
import { metrics, spacing } from '../design/tokens';
import { groupRepository, ipRepository } from '../database';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

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
  const {
    data: resolvedIpName,
  } = useScreenLoad(
    async () => {
      if (ipName) {
        return ipName;
      }

      const record = await ipRepository.findById(ipId);
      return record?.name ?? `IP #${ipId}`;
    },
    [ipId, ipName],
    { initialData: ipName ?? `IP #${ipId}` }
  );
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const trimmedName = useMemo(() => name.trim(), [name]);

  function handleCreate() {
    const selectedType = type;

    void runSubmit(async () => {
      await groupRepository.create({
        ipId,
        name: trimmedName,
        type: selectedType as GroupTypeValue,
        description,
      });
      onCreated();
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `创建失败：${message}`;
      },
      validate: () => {
        if (!trimmedName) {
          return '请输入分组名称。';
        }

        if (!type) {
          return '请选择分组类型。';
        }

        return null;
      },
    });
  }

  return (
    <FormScreenScaffold
      errorMessage={submitError}
      onBack={onBack}
      primaryAction={{ disabled: !trimmedName || !type, label: '创建分组', loading: isSubmitting, onPress: handleCreate }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="新建分组"
    >
      <View style={styles.formWrap}>
        <ReadonlyFieldCard
          hint="当前新建的分组会直接归属这个 IP。"
          label="所属IP"
          value={resolvedIpName ?? `IP #${ipId}`}
        />

        <TextFieldCard
          editable={!isSubmitting}
          label="分组名称"
          maxLength={GROUP_NAME_MAX_LENGTH}
          onChangeText={(value) => {
            setName(value);
            if (submitError) {
              clearSubmitError();
            }
          }}
          placeholder="例如：2026 夏季、夜景场景、海报KV"
          value={name}
        />

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

        <MultilineFieldCard
          editable={!isSubmitting}
          hint="可选，帮助你区分该分组的使用场景。"
          label="分组描述"
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChangeText={(value) => {
            setDescription(value);
            if (submitError) {
              clearSubmitError();
            }
          }}
          placeholder="例如：适合活动主视觉、角色立绘、社媒图等。"
          value={description}
        />
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: metrics.formFieldGap,
  },
  typeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
});

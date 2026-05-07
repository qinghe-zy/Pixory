import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormInputRow } from '../components/FormInputRow';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { ReadonlyInfoRow } from '../components/ReadonlyInfoRow';
import { GROUP_NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH } from '../constants/limits';
import { GROUP_TYPE_OPTIONS, type GroupTypeValue } from '../constants/groups';
import { spacing } from '../design/tokens';
import { groupRepository, ipRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

interface CreateGroupScreenProps {
  ipId: number;
  space?: PixorySpace;
  ipName?: string;
  onBack: () => void;
  onCreated: () => void;
}

export function CreateGroupScreen({ ipId, space = 'normal', ipName, onBack, onCreated }: CreateGroupScreenProps) {
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

      const record = await runWithDatabaseSpace(space, (db) => ipRepository.findById(db, ipId));
      return record?.name ?? `IP #${ipId}`;
    },
    [ipId, ipName, space],
    { initialData: ipName ?? `IP #${ipId}` }
  );
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const trimmedName = useMemo(() => name.trim(), [name]);

  function handleCreate() {
    const selectedType = type;

    void runSubmit(async () => {
      await runWithDatabaseSpace(space, (db) => groupRepository.create(db, {
        ipId,
        name: trimmedName,
        type: selectedType as GroupTypeValue,
        description,
      }));
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
      backgroundVariant="archive"
      errorMessage={submitError}
      onBack={onBack}
      primaryAction={{ disabled: !trimmedName || !type, label: '创建分组', loading: isSubmitting, onPress: handleCreate }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="新建分组"
    >
      <View style={styles.formWrap}>
        <LightFormSection title="分组信息">
          <ReadonlyInfoRow
            hint="新分组会归属这个 IP。"
            label="所属 IP"
            value={resolvedIpName ?? `IP #${ipId}`}
          />

          <FormInputRow
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

          <View style={styles.optionList}>
            {GROUP_TYPE_OPTIONS.map((option) => (
              <OptionSelectRow
                key={option.value}
                label={option.label}
                meta={option.description}
                onPress={() => setType(option.value)}
                selected={type === option.value}
              />
            ))}
          </View>

          <FormTextareaRow
            editable={!isSubmitting}
            hint="可选，帮助区分使用场景。"
            label="分组描述"
            maxLength={DESCRIPTION_MAX_LENGTH}
            minHeight={84}
            onChangeText={(value) => {
              setDescription(value);
              if (submitError) {
                clearSubmitError();
              }
            }}
            placeholder="例如：活动主视觉、角色立绘、社媒图。"
            value={description}
          />
        </LightFormSection>
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: spacing[3],
  },
  optionList: {
    gap: spacing[1],
    paddingVertical: spacing[1],
  },
});

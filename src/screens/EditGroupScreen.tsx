import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { FormInputRow } from '../components/FormInputRow';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { ReadonlyInfoRow } from '../components/ReadonlyInfoRow';
import { GROUP_TYPE_OPTIONS, type GroupTypeValue } from '../constants/groups';
import { DESCRIPTION_MAX_LENGTH, GROUP_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, ipRepository, type GroupRecord, type IpRecord } from '../database';
import { colors, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

interface EditGroupScreenProps {
  ipId: number;
  groupId: number;
  onBack: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}

export function EditGroupScreen({ ipId, groupId, onBack, onDeleted, onSaved }: EditGroupScreenProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupTypeValue | null>(null);
  const [description, setDescription] = useState('');
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const { data, errorMessage } = useScreenLoad<{ ip: IpRecord | null; group: GroupRecord | null }>(
    async () => {
      const [ip, group] = await Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findById(groupId),
      ]);

      if (!group) {
        throw new Error('没有找到这个分组。');
      }

      return { group, ip };
    },
    [groupId, ipId],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组失败：${message}`;
      },
      initialData: { group: null, ip: null },
    }
  );
  const group = data?.group ?? null;
  const ip = data?.ip ?? null;
  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (!group) {
      return;
    }

    setName(group.name);
    setType(group.type as GroupTypeValue);
    setDescription(group.description ?? '');
  }, [group]);

  function handleSave() {
    const selectedType = type;

    void runSubmit(async () => {
      const updated = await groupRepository.update(groupId, {
        description,
        name: trimmedName,
        type: selectedType as GroupTypeValue,
      });

      if (!updated) {
        throw new Error('没有找到这个分组。');
      }

      onSaved();
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `保存失败：${message}`;
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

  function handleDelete() {
    if (!group || isSubmitting) {
      return;
    }

    setIsDeleteDialogVisible(true);
  }

  function confirmDelete() {
    if (!group) {
      return;
    }

    setIsDeleteDialogVisible(false);
    void runSubmit(async () => {
      const deletedCount = await groupRepository.deleteById(group.id);
      if (deletedCount === 0) {
        throw new Error('没有找到这个分组。');
      }

      onDeleted();
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `删除失败：${message}`;
      },
    });
  }

  const footerExtra = group ? (
    <Pressable disabled={isSubmitting} onPress={handleDelete} style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}>
      <Text style={styles.deleteText}>删除分组</Text>
    </Pressable>
  ) : null;

  return (
    <>
    <FormScreenScaffold
      errorMessage={submitError ?? errorMessage}
      footerExtra={footerExtra}
      onBack={onBack}
      primaryAction={{ disabled: !trimmedName || !type || !group, label: '保存分组', loading: isSubmitting, onPress: handleSave }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="编辑分组"
    >
      <View style={styles.formWrap}>
        <LightFormSection title="分组信息">
          <ReadonlyInfoRow
            hint="只更新分组记录，不移动本地图片文件。"
            label="所属 IP"
            value={ip?.name ?? `IP #${ipId}`}
          />

          <FormInputRow
            editable={!isSubmitting && !!group}
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
                disabled={isSubmitting || !group}
                key={option.value}
                label={option.label}
                meta={option.description}
                onPress={() => setType(option.value)}
                selected={type === option.value}
              />
            ))}
          </View>

          <FormTextareaRow
            editable={!isSubmitting && !!group}
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
    <AppDialog
      danger
      message={group ? `删除「${group.name}」后，分组内图片会保留并移动到未分组。` : ''}
      onClose={() => setIsDeleteDialogVisible(false)}
      onPrimary={confirmDelete}
      primaryLabel="确认删除"
      title="删除分组"
      visible={isDeleteDialogVisible}
    />
    </>
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
  deleteAction: {
    alignItems: 'center',
    paddingVertical: spacing[1],
  },
  deleteText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.76,
  },
});

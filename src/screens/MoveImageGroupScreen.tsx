import { StyleSheet, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';

import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { ReadonlyInfoRow } from '../components/ReadonlyInfoRow';
import { getGroupTypeLabel } from '../constants/groups';
import { groupRepository, imageRepository, type GroupRecord, type ImageDetailRecord } from '../database';
import { metrics, spacing } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';

interface MoveImageGroupScreenProps {
  imageId: number;
  refreshToken: number;
  onBack: () => void;
  onSaved: () => void;
}

export function MoveImageGroupScreen({ imageId, refreshToken, onBack, onSaved }: MoveImageGroupScreenProps) {
  const { data, errorMessage: loadErrorMessage } = useScreenLoad<{
    image: (ImageDetailRecord & { loadedGroupIds?: number[] }) | null;
    groups: GroupRecord[];
  }>(
    async () => {
      const detail = await imageRepository.findDetailById(imageId, { includeDeleted: true });
      if (!detail) {
        throw new Error('没有找到这张图片。');
      }

      const [groups, groupIds] = await Promise.all([
        groupRepository.findByIpId(detail.ipId),
        imageRepository.findGroupIdsByImageId(imageId),
      ]);
      return { image: { ...detail, loadedGroupIds: groupIds }, groups };
    },
    [imageId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组移动信息失败：${message}`;
      },
      initialData: { image: null, groups: [] },
    }
  );
  const { isSubmitting, submitError, runSubmit } = useSubmitState();
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const image = data?.image ?? null;
  const groups = data?.groups ?? [];

  useEffect(() => {
    if (image) {
      setSelectedGroupIds(image.loadedGroupIds ?? (image.groupId != null ? [image.groupId] : []));
    }
  }, [image]);

  const canSubmit = useMemo(
    () => Boolean(image) && !isSubmitting,
    [image, isSubmitting]
  );

  function handleSave() {
    if (!image) {
      return;
    }

    void runSubmit(
      async () => {
        const updated = await imageRepository.setImageGroups(image.id, selectedGroupIds);
        if (!updated) {
          throw new Error('调整分组时没有找到这张图片。');
        }

        onSaved();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `调整分组失败：${message}`;
        },
      }
    );
  }

  return (
    <FormScreenScaffold
      errorMessage={submitError ?? loadErrorMessage}
      onBack={onBack}
      primaryAction={{ disabled: !canSubmit, label: '保存分组', loading: isSubmitting, onPress: handleSave }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="调整分组"
    >
      <View style={styles.formWrap}>
        <LightFormSection title="当前图片">
          <ReadonlyInfoRow label="所属 IP" value={image?.ipName ?? '当前IP'} valueNumberOfLines={1} />
          <ReadonlyInfoRow label="图片文件名" value={image?.originalFilename ?? '当前图片'} valueNumberOfLines={2} />
        </LightFormSection>

        <LightFormSection hint="可同时属于多个分组，只更新数据库记录，不移动本地文件。" title="目标分组">
          <ReadonlyInfoRow
            label="当前选择"
            value={
              selectedGroupIds.length === 0
                ? '无分组'
                : selectedGroupIds
                    .map((groupId) => groups.find((group) => group.id === groupId)?.name)
                    .filter(Boolean)
                    .join('、')
            }
          />
          <View style={styles.optionList}>
            <OptionSelectRow
              label="无分组"
              meta="保留在当前 IP"
              onPress={() => setSelectedGroupIds([])}
              selected={selectedGroupIds.length === 0}
            />
            {groups.map((group) => (
              <OptionSelectRow
                key={group.id}
                label={group.name}
                meta={getGroupTypeLabel(group.type)}
                onPress={() =>
                  setSelectedGroupIds((current) =>
                    current.includes(group.id)
                      ? current.filter((groupId) => groupId !== group.id)
                      : [...current, group.id]
                  )
                }
                selected={selectedGroupIds.includes(group.id)}
              />
            ))}
          </View>
        </LightFormSection>
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: metrics.formFieldGap,
  },
  optionList: {
    gap: spacing[1],
    paddingVertical: spacing[2],
  },
});

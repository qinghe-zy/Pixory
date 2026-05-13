import { useEffect, useMemo, useState } from 'react';

import { GROUP_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { useToast } from './AppToast';
import { AppDialog } from './AppDialog';
import { FormInputRow } from './FormInputRow';

interface RenameableGroup {
  id: number;
  name: string;
}

interface GroupRenameDialogProps {
  group: RenameableGroup | null;
  space?: PixorySpace;
  visible: boolean;
  onClose: () => void;
  onRenamed: () => void;
}

export function GroupRenameDialog({
  group,
  space = 'normal',
  visible,
  onClose,
  onRenamed,
}: GroupRenameDialogProps) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (!visible || !group) {
      return;
    }
    setName(group.name);
    setErrorMessage(null);
  }, [group, visible]);

  function handleClose() {
    if (isSaving) {
      return;
    }
    onClose();
  }

  function handleRename() {
    if (!group || isSaving) {
      return;
    }
    if (!trimmedName) {
      setErrorMessage('请输入分组名称。');
      return;
    }
    if (trimmedName === group.name) {
      onClose();
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    void (async () => {
      try {
        const updated = await runWithDatabaseSpace(space, (db) => groupRepository.update(db, group.id, { name: trimmedName }));
        if (!updated) {
          throw new Error('没有找到这个分组。');
        }
        showToast('已重命名分组');
        onClose();
        onRenamed();
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        setErrorMessage(`重命名失败：${message}`);
      } finally {
        setIsSaving(false);
      }
    })();
  }

  return (
    <AppDialog
      onClose={handleClose}
      onPrimary={handleRename}
      primaryDisabled={!trimmedName || isSaving}
      primaryLabel={isSaving ? '保存中' : '保存'}
      title="重命名分组"
      visible={visible}
    >
      <FormInputRow
        autoFocus
        editable={!isSaving}
        errorMessage={errorMessage}
        label="分组名称"
        maxLength={GROUP_NAME_MAX_LENGTH}
        onChangeText={(value) => {
          setName(value);
          if (errorMessage) {
            setErrorMessage(null);
          }
        }}
        placeholder="输入新的分组名称"
        returnKeyType="done"
        onSubmitEditing={handleRename}
        value={name}
      />
    </AppDialog>
  );
}

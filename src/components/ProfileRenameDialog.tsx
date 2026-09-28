import { useEffect, useMemo, useState } from 'react';
import { runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../database';
import { useToast } from './AppToast';
import { AppDialog } from './AppDialog';
import { FormInputRow } from './FormInputRow';

interface ProfileRenameDialogProps {
  currentNickname: string | null;
  space?: PixorySpace;
  visible: boolean;
  onClose: () => void;
  onRenamed: (newNickname: string) => void;
}

export function ProfileRenameDialog({
  currentNickname,
  space = 'normal',
  visible,
  onClose,
  onRenamed,
}: ProfileRenameDialogProps) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const trimmedName = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(currentNickname || '');
    setErrorMessage(null);
  }, [currentNickname, visible]);

  function handleClose() {
    if (isSaving) {
      return;
    }
    onClose();
  }

  async function handleRename() {
    if (!trimmedName) {
      setErrorMessage('昵称不能为空');
      return;
    }

    if (trimmedName.length > 20) {
      setErrorMessage('昵称最长 20 个字符');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await runWithDatabaseSpace(space, (db) => settingsRepository.setProfileNickname(db, trimmedName));
      onRenamed(trimmedName);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(message);
      showToast(`修改昵称失败：${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppDialog
      onClose={handleClose}
      onPrimary={handleRename}
      primaryDisabled={isSaving || !trimmedName}
      primaryLabel={isSaving ? '保存中...' : '保存'}
      secondaryLabel="取消"
      title="修改昵称"
      visible={visible}
    >
      <FormInputRow
        autoCapitalize="none"
        autoFocus
        clearButtonMode="while-editing"
        editable={!isSaving}
        errorMessage={errorMessage}
        label="昵称"
        maxLength={20}
        onChangeText={(text) => {
          setName(text);
          if (errorMessage) {
            setErrorMessage(null);
          }
        }}
        onSubmitEditing={handleRename}
        placeholder="例如：我的空间"
        returnKeyType="done"
        value={name}
      />
    </AppDialog>
  );
}

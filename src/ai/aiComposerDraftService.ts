import * as FileSystem from 'expo-file-system/legacy';

const DRAFTS_DIR = `${FileSystem.documentDirectory}composer_drafts/`;

async function ensureDraftsDir() {
  const info = await FileSystem.getInfoAsync(DRAFTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DRAFTS_DIR, { intermediates: true });
  }
}

export async function getComposerDraft(threadId: string): Promise<string> {
  try {
    const fileUri = `${DRAFTS_DIR}${threadId}.txt`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      return '';
    }
    return await FileSystem.readAsStringAsync(fileUri);
  } catch (err) {
    console.warn('Failed to read composer draft', err);
    return '';
  }
}

export async function setComposerDraft(threadId: string, text: string): Promise<void> {
  try {
    await ensureDraftsDir();
    const fileUri = `${DRAFTS_DIR}${threadId}.txt`;
    if (!text.trim()) {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists) {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
      return;
    }
    await FileSystem.writeAsStringAsync(fileUri, text);
  } catch (err) {
    console.warn('Failed to save composer draft', err);
  }
}

export async function clearComposerDraft(threadId: string): Promise<void> {
  try {
    const fileUri = `${DRAFTS_DIR}${threadId}.txt`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  } catch (err) {
    console.warn('Failed to clear composer draft', err);
  }
}

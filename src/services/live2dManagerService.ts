import * as FileSystem from 'expo-file-system/legacy';
import { unzip } from 'react-native-zip-archive';

export const LIVE2D_DIR = `${FileSystem.documentDirectory}live2d_models/`;

export const live2dManagerService = {
  /**
   * Ensure the base directory exists
   */
  async ensureDir() {
    const dirInfo = await FileSystem.getInfoAsync(LIVE2D_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(LIVE2D_DIR, { intermediates: true });
    }
  },

  /**
   * Check if a model is fully downloaded and unzipped
   */
  async isModelDownloaded(id: string): Promise<boolean> {
    const modelDir = `${LIVE2D_DIR}${id}/`;
    const info = await FileSystem.getInfoAsync(modelDir);
    if (!info.exists) return false;
    
    // Check if the actual model3.json exists inside the folder
    // Since we don't know the exact filename of the model3.json, we just assume
    // if the directory exists and has files, it's downloaded.
    const files = await FileSystem.readDirectoryAsync(modelDir);
    return files.length > 0;
  },

  /**
   * Get the local file URL for the model's model3.json
   */
  async getModelLocalUrl(id: string): Promise<string | null> {
    const modelDir = `${LIVE2D_DIR}${id}/`;
    if (!(await this.isModelDownloaded(id))) return null;

    const files = await FileSystem.readDirectoryAsync(modelDir);
    // Find the .model3.json file. Wait, zip might extract to a subfolder!
    // Often when downloading a zip, it might contain a root folder or just files.
    // Let's do a recursive search or just assume flat for now, but we must check.
    // Better: find any .model3.json recursively.
    const findModel3Json = async (dir: string): Promise<string | null> => {
      const contents = await FileSystem.readDirectoryAsync(dir);
      for (const item of contents) {
        const itemPath = `${dir}${item}`;
        const info = await FileSystem.getInfoAsync(itemPath);
        if (info.isDirectory) {
          const res = await findModel3Json(itemPath + '/');
          if (res) return res;
        } else if (item.endsWith('.model3.json')) {
          return `file://${itemPath}`;
        }
      }
      return null;
    };

    return await findModel3Json(modelDir);
  },

  /**
   * Download and unzip a model
   */
  async downloadAndUnzipModel(id: string, zipUrl: string, onProgress?: (progress: number) => void): Promise<void> {
    await this.ensureDir();
    const zipPath = `${LIVE2D_DIR}${id}.zip`;
    const targetDir = `${LIVE2D_DIR}${id}/`;

    // 1. Download
    const downloadResumable = FileSystem.createDownloadResumable(
      zipUrl,
      zipPath,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      }
    );

    try {
      await downloadResumable.downloadAsync();
      
      // 2. Clear target dir if exists
      const targetInfo = await FileSystem.getInfoAsync(targetDir);
      if (targetInfo.exists) {
        await FileSystem.deleteAsync(targetDir, { idempotent: true });
      }
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });

      // 3. Unzip
      await unzip(zipPath, targetDir);

      // 4. Cleanup ZIP
      await FileSystem.deleteAsync(zipPath, { idempotent: true });
      
    } catch (e) {
      // Cleanup on failure
      await FileSystem.deleteAsync(zipPath, { idempotent: true });
      await FileSystem.deleteAsync(targetDir, { idempotent: true });
      throw e;
    }
  },

  /**
   * Delete a local model
   */
  async deleteModel(id: string): Promise<void> {
    const targetDir = `${LIVE2D_DIR}${id}/`;
    await FileSystem.deleteAsync(targetDir, { idempotent: true });
  }
};

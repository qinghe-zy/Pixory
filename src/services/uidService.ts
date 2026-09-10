import * as SecureStore from 'expo-secure-store';

const UID_KEY = 'pixory.uid.current';
const SERVER_URL = 'https://mist01.com/api/get_id';

let fetchPromise: Promise<string | null> | null = null;

export class UidService {
  static getUid(): Promise<string | null> {
    if (fetchPromise) {
      return fetchPromise;
    }
    fetchPromise = this._getUid().then((res) => {
      // 允许网络错误后重试，如果失败，下次调用依然可以重新发起
      if (res === null) {
        fetchPromise = null;
      }
      return res;
    });
    return fetchPromise;
  }

  private static async _getUid(): Promise<string | null> {
    try {
      // 1. 先查本地缓存
      let uid = await SecureStore.getItemAsync(UID_KEY);
      
      // 2. 如果本地没有，才发起网络请求
      if (!uid) {
        // 设置 3 秒超时，绝不阻塞弱网环境
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(SERVER_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (data && data.success && data.id) {
          uid = data.id;
          // 3. 拿到后永久存入本地
          await SecureStore.setItemAsync(UID_KEY, String(uid));
          if (data.raw !== undefined) {
            await SecureStore.setItemAsync('pixory.uid.raw', data.raw.toString());
          }
        }
      }
      return uid;
    } catch (e) {
      // 弱网、断网、超时都会进这里，直接静默返回 null，下次再试
      console.warn('Failed to fetch or read UID:', e);
      return null;
    }
  }

  static async clearUid(): Promise<void> {
    try {
      fetchPromise = null;
      await SecureStore.deleteItemAsync(UID_KEY);
    } catch (e) {
      console.warn('Failed to clear UID:', e);
    }
  }
}
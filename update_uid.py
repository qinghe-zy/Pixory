import re

new_content = """import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import nacl from 'tweetnacl';

const UID_KEY = 'pixory.uid.current';
const UID_RAW_KEY = 'pixory.uid.raw';
const UID_SIG_KEY = 'pixory.uid.sig';
const SERVER_URL = 'https://mist01.com/api/get_id';

// 服务器的公钥 (用于验签防伪)
const PUBLIC_KEY_BASE64 = 'crai188MQ628GExSVjOhQGvGdEuOiwIktMFCrwtcfpw=';

let fetchPromise: Promise<string | null> | null = null;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

function stringToUint8Array(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}

export class UidService {
  static getUid(): Promise<string | null> {
    if (fetchPromise) {
      return fetchPromise;
    }
    fetchPromise = this._getUid().then((res) => {
      if (res === null) {
        fetchPromise = null;
      }
      return res;
    });
    return fetchPromise;
  }

  private static async _getUid(): Promise<string | null> {
    try {
      let uid = await SecureStore.getItemAsync(UID_KEY);
      
      // 【创世用户补发签名】: 给早期的 001 补发私钥签名
      if (uid === 'AAA-001') {
        const sig = await SecureStore.getItemAsync(UID_SIG_KEY);
        if (!sig) {
          const genesisSig = 'dGDoui6nC5kSe5aeRqj+QSg4JTkRaKqJQtbAKuPRCM/ySm/hkKD13wafSbK0btJHe2Cw4LxcPwzRq6Z+nLmdCQ==';
          await SecureStore.setItemAsync(UID_SIG_KEY, genesisSig);
        }
      }
      
      if (!uid) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(SERVER_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (data && data.success && data.id) {
          uid = data.id;
          await SecureStore.setItemAsync(UID_KEY, String(uid));
          if (data.raw !== undefined) {
            await SecureStore.setItemAsync(UID_RAW_KEY, data.raw.toString());
          }
          if (data.signature) {
            await SecureStore.setItemAsync(UID_SIG_KEY, data.signature);
          }
        }
      }
      return uid;
    } catch (e) {
      console.warn('Failed to fetch or read UID:', e);
      return null;
    }
  }

  static async exportIdentity(destinationDirUri: string): Promise<string> {
    const id = await SecureStore.getItemAsync(UID_KEY);
    const raw = await SecureStore.getItemAsync(UID_RAW_KEY);
    const sig = await SecureStore.getItemAsync(UID_SIG_KEY);

    if (!id || !raw || !sig) {
      throw new Error('Identity incomplete. Cannot export.');
    }

    const payload = JSON.stringify({ id, raw, signature: sig });
    const base64Payload = btoa(payload);
    
    // Create temporary file
    const tempFile = `${FileSystem.cacheDirectory}identity_${raw}.pixoryid`;
    await FileSystem.writeAsStringAsync(tempFile, base64Payload);

    // Copy to destination via SAF
    const { StorageAccessFramework } = FileSystem;
    const destUri = await StorageAccessFramework.createFileAsync(
      destinationDirUri,
      `identity_${raw}.pixoryid`,
      'application/octet-stream'
    );
    
    const content = await FileSystem.readAsStringAsync(tempFile, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(destUri, content, { encoding: FileSystem.EncodingType.Base64 });
    
    return destUri;
  }

  static async importIdentity(fileUri: string): Promise<boolean> {
    try {
      // Read file content
      const base64Payload = await FileSystem.readAsStringAsync(fileUri);
      const payloadStr = atob(base64Payload);
      const payload = JSON.parse(payloadStr);

      if (!payload.id || !payload.raw || !payload.signature) {
        throw new Error('Invalid identity file format.');
      }

      // Verify signature
      const publicKey = base64ToUint8Array(PUBLIC_KEY_BASE64);
      const signature = base64ToUint8Array(payload.signature);
      const message = stringToUint8Array(payload.raw.toString());

      const isValid = nacl.sign.detached.verify(message, signature, publicKey);
      if (!isValid) {
        throw new Error('Signature verification failed! Fake identity detected.');
      }

      // Overwrite local identity
      await SecureStore.setItemAsync(UID_KEY, payload.id);
      await SecureStore.setItemAsync(UID_RAW_KEY, payload.raw.toString());
      await SecureStore.setItemAsync(UID_SIG_KEY, payload.signature);

      // Reset in-memory cache
      fetchPromise = null;
      return true;
    } catch (e) {
      console.error('Import identity failed:', e);
      return false;
    }
  }
}
"""

with open("src/services/uidService.ts", "w", encoding="utf-8") as f:
    f.write(new_content)
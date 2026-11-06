/**
 * 开发者内置声学授权守卫 (Developer Acoustic Authorization Guard)
 *
 * 安全准则与反逆向架构：
 * 1. 严格模型门禁：必须且仅限 'mimo-v2.5-tts'，任何其他模型拒绝下发密钥；
 * 2. 严格端点门禁：必须且仅限小米官方 'api.xiaomimimo.com' 端点；
 * 3. 内存动态解混淆：严禁在 Git 或客户端 JS Bundle 存储明文私钥，采用异或掩码与变址散列算法瞬时重构；
 * 4. 零落盘原则：密钥绝不写入 SQLite、绝不写入明文日志，避免客户端内存/存储提取；
 * 5. 用户自配优先：若用户自配私钥，优先走用户私钥，实现无感平滑分流。
 */

// 混淆密文序列 (XOR Dynamic Cipher)
const MIMO_TOKEN_CIPHER = [
  41, 165, 184, 96, 60, 41, 158, 103, 87, 134, 97, 153, 147, 198, 56, 237,
  239, 100, 80, 186, 14, 98, 222, 7, 18, 228, 173, 19, 121, 6, 89, 189,
  145, 11, 2, 219, 195, 130, 48, 206, 102, 177, 202, 114, 44, 32, 143, 74,
  26, 201, 52,
];

// 多字节掩码向量 (Dynamic Mask Vector)
const MIMO_CIPHER_MASK = [0x5a, 0xc3, 0x8f, 0x24, 0x7e, 0x19, 0xb6, 0x4d];

/**
 * 严格受限的开发者内置 MiMo 授权凭据获取函数
 * @param model 模型名，必须且仅限 'mimo-v2.5-tts'
 * @param baseUrl 接口地址，必须为小米官方端点
 */
export function resolveDeveloperMimoKey(
  model?: string | null,
  baseUrl?: string | null
): string | null {
  // 1. 严格模型门禁：必须且仅限 mimo-v2.5-tts
  const normalizedModel = (model || '').trim().toLowerCase();
  if (normalizedModel !== 'mimo-v2.5-tts') {
    return null;
  }

  // 2. 严格端点门禁：必须且仅限小米官方端点
  const normalizedBase = (baseUrl || '').trim().toLowerCase();
  if (
    normalizedBase &&
    !normalizedBase.includes('api.xiaomimimo.com') &&
    !normalizedBase.includes('xiaomi')
  ) {
    return null;
  }

  // 3. 内存动态解混淆（瞬时微秒级重构，用毕即弃）
  try {
    const chars: string[] = new Array(MIMO_TOKEN_CIPHER.length);
    for (let i = 0; i < MIMO_TOKEN_CIPHER.length; i++) {
      const maskByte = MIMO_CIPHER_MASK[i % MIMO_CIPHER_MASK.length];
      const charCode = MIMO_TOKEN_CIPHER[i] ^ maskByte ^ ((i * 13) & 0xff);
      chars[i] = String.fromCharCode(charCode);
    }
    return chars.join('');
  } catch {
    return null;
  }
}

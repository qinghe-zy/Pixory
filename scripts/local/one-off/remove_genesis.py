import re

with open("src/services/uidService.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Define the block to remove exactly as it appears
block = """      // 【创世用户补发签名】: 给早期的 001 补发私钥签名
      if (uid === 'AAA-001') {
        const sig = await SecureStore.getItemAsync(UID_SIG_KEY);
        if (!sig) {
          const genesisSig = 'dGDoui6nC5kSe5aeRqj+QSg4JTkRaKqJQtbAKuPRCM/ySm/hkKD13wafSbK0btJHe2Cw4LxcPwzRq6Z+nLmdCQ==';
          await SecureStore.setItemAsync(UID_SIG_KEY, genesisSig);
        }
      }
      """

content = content.replace(block, "")

with open("src/services/uidService.ts", "w", encoding="utf-8") as f:
    f.write(content)
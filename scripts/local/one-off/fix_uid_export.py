import re

with open("src/services/uidService.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Update exportIdentity error message
content = content.replace(
    "throw new Error('Identity incomplete. Cannot export.');",
    "throw new Error(`Identity incomplete (id: ${!!id}, raw: ${!!raw}, sig: ${!!sig}). Cannot export.`);"
)

# Inject raw = '1' for AAA-001
injection_search = """      // 【创世用户补发签名】: 给早期的 001 补发私钥签名
      if (uid === 'AAA-001') {
        const sig = await SecureStore.getItemAsync(UID_SIG_KEY);
        if (!sig) {
          const genesisSig = 'dGDoui6nC5kSe5aeRqj+QSg4JTkRaKqJQtbAKuPRCM/ySm/hkKD13wafSbK0btJHe2Cw4LxcPwzRq6Z+nLmdCQ==';
          await SecureStore.setItemAsync(UID_SIG_KEY, genesisSig);
        }
      }"""
      
injection_replace = """      // 【创世用户补发签名】: 给早期的 001 补发私钥签名
      if (uid === 'AAA-001') {
        const sig = await SecureStore.getItemAsync(UID_SIG_KEY);
        if (!sig) {
          const genesisSig = 'dGDoui6nC5kSe5aeRqj+QSg4JTkRaKqJQtbAKuPRCM/ySm/hkKD13wafSbK0btJHe2Cw4LxcPwzRq6Z+nLmdCQ==';
          await SecureStore.setItemAsync(UID_SIG_KEY, genesisSig);
        }
        const raw = await SecureStore.getItemAsync(UID_RAW_KEY);
        if (!raw) {
          await SecureStore.setItemAsync(UID_RAW_KEY, '1');
        }
      }"""

content = content.replace(injection_search, injection_replace)

with open("src/services/uidService.ts", "w", encoding="utf-8") as f:
    f.write(content)
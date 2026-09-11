import re

with open("src/services/uidService.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Remove the backdoor
backdoor_pattern = r"\s*// 【创世用户补发签名】.*?\s*if \(uid === 'AAA-001'\) \{.*?\s*\}\s*\}\s*"
# Wait, let's use a simpler replace
backdoor = """      // 【创世用户补发签名】: 给早期的 001 补发私钥签名
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

if backdoor in content:
    content = content.replace(backdoor, "")
else:
    print("Warning: backdoor block not exactly matched")

with open("src/services/uidService.ts", "w", encoding="utf-8") as f:
    f.write(content)
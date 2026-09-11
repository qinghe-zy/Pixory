import re

with open("src/services/uidService.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Put back the genesis block
target = "if (!uid) {"
genesis_block = """// 【创世用户补发签名】: 给早期的 001 补发私钥签名
      if (uid === 'AAA-001') {
        const sig = await SecureStore.getItemAsync(UID_SIG_KEY);
        if (!sig) {
          const genesisSig = 'dGDoui6nC5kSe5aeRqj+QSg4JTkRaKqJQtbAKuPRCM/ySm/hkKD13wafSbK0btJHe2Cw4LxcPwzRq6Z+nLmdCQ==';
          await SecureStore.setItemAsync(UID_SIG_KEY, genesisSig);
        }
      }

      if (!uid) {"""

if target in content and "genesisSig" not in content:
    content = content.replace(target, genesis_block)
    with open("src/services/uidService.ts", "w", encoding="utf-8") as f:
        f.write(content)
    print("Injected genesis block.")
else:
    print("Failed or already injected.")
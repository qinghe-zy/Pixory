import re

with open("src/screens/SettingsScreen.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Add the UI buttons under 更多设置 using SettingsRow
ui_search = """              <SettingsRow
                icon="options-outline"
                title="更多设置"
                description="正在整理中..."
                onPress={() => {}}
              />"""
ui_replace = """              <SettingsRow
                icon="options-outline"
                title="更多设置"
                description="正在整理中..."
                onPress={() => {}}
              />
              <SettingsRow
                icon="id-card-outline"
                title="导出数字身份凭证"
                description="生成带私钥防伪签名的 .pixoryid 文件"
                onPress={handleExportIdentity}
              />
              <SettingsRow
                icon="download-outline"
                title="载入数字身份凭证"
                description="跨设备或卸载重装后恢复身份"
                onPress={handleImportIdentity}
              />"""

content = content.replace(ui_search, ui_replace)

with open("src/screens/SettingsScreen.tsx", "w", encoding="utf-8") as f:
    f.write(content)
import re

with open("src/screens/SettingsScreen.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Add imports
import_search = "import { ScreenScaffold } from '../components/ScreenScaffold';"
import_replace = """import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { UidService } from '../services/uidService';
import { ScreenScaffold } from '../components/ScreenScaffold';"""

if import_search in content:
    content = content.replace(import_search, import_replace)
else:
    print("Warning: import_search not found")

# Add handlers
handler_search = "const developerMode = useDeveloperMode();"
handler_replace = """const developerMode = useDeveloperMode();

  async function handleExportIdentity() {
    try {
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) return;
      
      const destUri = await UidService.exportIdentity(permissions.directoryUri);
      Alert.alert('凭证导出成功', '已保存至系统文件夹\n请妥善保管这把属于你的顶级防伪私钥证明。');
    } catch (e: any) {
      Alert.alert('导出失败', e.message);
    }
  }

  async function handleImportIdentity() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      
      const fileUri = result.assets[0].uri;
      const success = await UidService.importIdentity(fileUri);
      if (success) {
        Alert.alert('凭证载入成功！', '防伪校验通过，欢迎归来。请重启 App 刷新身份。');
      } else {
        Alert.alert('凭证无效', '防伪验签失败，该文件可能已被篡改。');
      }
    } catch (e: any) {
      Alert.alert('载入失败', e.message);
    }
  }
"""

if handler_search in content:
    content = content.replace(handler_search, handler_replace)
else:
    print("Warning: handler_search not found")

# Add UI
ui_search = """            <SettingsRow
              icon="options-outline"
              title="更多设置"
              description="正在整理中..."
              onPress={() => {}}
            />"""
ui_replace = """            <SettingsRow
              icon="id-card-outline"
              title="导出数字身份凭证"
              description="生成带私钥防伪签名的 .pixoryid 文件"
              onPress={handleExportIdentity}
              showBorder
            />
            <SettingsRow
              icon="download-outline"
              title="载入数字身份凭证"
              description="跨设备或卸载重装后恢复身份"
              onPress={handleImportIdentity}
            />"""

if ui_search in content:
    content = content.replace(ui_search, ui_replace)
else:
    print("Warning: ui_search not found")

with open("src/screens/SettingsScreen.tsx", "w", encoding="utf-8") as f:
    f.write(content)
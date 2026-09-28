import { StyleSheet, View, Text, Pressable, Alert } from 'react-native';
import { ScreenScaffold } from '../components/ScreenScaffold';
import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { UidService } from '../services/uidService';
import type { PixorySpace } from '../database';
import { colors, spacing, typography } from '../design/tokens';
import { Ionicons } from '@expo/vector-icons';

interface AdvancedSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
}

export function AdvancedSettingsScreen({ space, onBack }: AdvancedSettingsScreenProps) {
  
  async function handleExportIdentity() {
    try {
      await UidService.getUid();
      
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

  return (
    <ScreenScaffold onBack={onBack} scrollable title="更多设置">
      <View style={styles.list}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleExportIdentity}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="id-card-outline" size={20} color={colors.text.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>导出数字身份凭证</Text>
            <Text style={styles.rowDescription}>生成带私钥防伪签名的 .pixoryid 文件</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleImportIdentity}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="download-outline" size={20} color={colors.text.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>载入数字身份凭证</Text>
            <Text style={styles.rowDescription}>跨设备或卸载重装后恢复身份</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
        </Pressable>
        <View style={styles.divider} />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: spacing[4],
    backgroundColor: colors.background.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[6],
    backgroundColor: colors.background.surface,
  },
  rowPressed: {
    backgroundColor: colors.background.soft,
  },
  iconContainer: {
    width: 32,
    alignItems: 'flex-start',
  },
  rowContent: {
    flex: 1,
    paddingRight: spacing[3],
  },
  rowTitle: {
    ...typography.textStyles.body,
    color: colors.text.primary,
  },
  rowDescription: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginLeft: spacing[6] + 32,
  },
});
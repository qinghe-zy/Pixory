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
    <ScreenScaffold
      contentContainerStyle={styles.scrollContent}
      onBack={onBack}
      scrollable
      title="更多设置"
    >
      <View style={styles.container}>
        <View style={styles.insetGroup}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={handleExportIdentity}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="id-card-outline" size={20} color="#1A1C1C" />
            </View>
            <View style={[styles.rowContent, styles.rowContentBorder]}>
              <Text style={styles.rowTitle}>导出数字身份凭证</Text>
              <Ionicons name="chevron-forward" size={17} color="#C4C7C7" />
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={handleImportIdentity}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="download-outline" size={20} color="#1A1C1C" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>载入数字身份凭证</Text>
              <Ionicons name="chevron-forward" size={17} color="#C4C7C7" />
            </View>
          </Pressable>
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
  },
  container: {
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
  },
  insetGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing[4],
    minHeight: 50,
    backgroundColor: '#FFFFFF',
  },
  rowPressed: {
    backgroundColor: '#F3F3F4',
  },
  iconContainer: {
    width: 28,
    alignItems: 'flex-start',
    marginRight: spacing[1],
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[4],
    paddingVertical: 14,
    minHeight: 50,
  },
  rowContentBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  rowTitle: {
    ...typography.textStyles.body,
    fontSize: 15,
    color: '#1A1C1C',
    fontWeight: '500',
  },
});
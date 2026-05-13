import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { Header } from '../components/Header';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { runImageImportDevelopmentCheck } from '../services/imageImportService';

interface ImportDevelopmentScreenProps {
  onBack: () => void;
}

export function ImportDevelopmentScreen({ onBack }: ImportDevelopmentScreenProps) {
  const [isRunningImportCheck, setIsRunningImportCheck] = useState(false);
  const [importCheckStatus, setImportCheckStatus] = useState('手动导入 smoke test 当前空闲。');

  async function handleRunImportDevelopmentCheck() {
    setIsRunningImportCheck(true);
    setImportCheckStatus('正在运行导入 smoke test...');

    try {
      const result = await runImageImportDevelopmentCheck();

      if (result.canceled) {
        setImportCheckStatus('已取消图片选择。');
        return;
      }

      const summary = `已导入 ${result.result.successCount} 张，失败 ${result.result.failedCount} 张，验证通过 ${result.verification.verifiedCount} 项，目标 IP #${result.ipId}。`;
      setImportCheckStatus(summary);
      Alert.alert('Smoke Test 完成', summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setImportCheckStatus(`Smoke test 失败：${message}`);
      Alert.alert('Smoke Test 失败', message);
    } finally {
      setIsRunningImportCheck(false);
    }
  }

  return (
    <AppScreen backgroundVariant="workflow" scrollable>
      <Header onBack={onBack} title="导入 Smoke Test" />

      <View style={styles.card}>
        <Text style={styles.title}>开发校验入口</Text>
        <Text style={styles.description}>
          这里保留现有的本地图片导入链路检查，不进入正式首页流程，也不会和当前第一批 UI 页面耦合。
        </Text>
        <PrimaryButton
          label={isRunningImportCheck ? '正在运行...' : '运行导入 Smoke Test'}
          loading={isRunningImportCheck}
          onPress={handleRunImportDevelopmentCheck}
        />
        <Text style={styles.status}>{importCheckStatus}</Text>
      </View>
      <StatusBar style="dark" />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadows.sm,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.entryCardGap,
    padding: spacing[6],
  },
  title: {
    ...typography.textStyles.pageTitle,
  },
  description: {
    ...typography.textStyles.body,
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
});

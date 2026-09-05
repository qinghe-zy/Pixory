import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { useToast } from '../components/AppToast';
import type { PixorySpace } from '../database';
import { runWithDatabaseSpace } from '../database/db';
import { settingsRepository, type DiagnosticsSettingsRecord } from '../database/repositories/settingsRepository';
import { listAiHistoryThreads } from '../ai/aiChatService';
import { colors, radius, spacing, typography } from '../design/tokens';
import { exportDiagnostics } from '../diagnostics/diagnosticExportService';
import { clearDiagnosticEvents } from '../diagnostics/diagnosticRepository';
import { flushDiagnostics, setDiagnosticsEnabled } from '../diagnostics/diagnosticLogger';

type TimeRange = '24h' | '7d' | 'all';
export function DiagnosticsSettingsScreen({ space, onBack }: { space: PixorySpace; onBack: () => void }) {
  const { showToast } = useToast();
  const [working, setWorking] = useState(false);
  const [settings, setSettings] = useState<DiagnosticsSettingsRecord>({ enabled: true, retentionDays: 7, maxEvents: 20000 });
  const [threads, setThreads] = useState<Array<{ id: string; title: string }>>([]);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [includeResponseSnippets, setIncludeResponseSnippets] = useState(false);
  useEffect(() => { void Promise.all([runWithDatabaseSpace(space, (db) => settingsRepository.getDiagnosticsSettings(db)), listAiHistoryThreads({ space, limit: 8 })]).then(([loaded, items]) => { setSettings(loaded); setDiagnosticsEnabled(space, loaded.enabled); setThreads(items.map((item) => ({ id: item.id, title: item.title || '未命名会话' }))); }); }, [space]);
  const from = useMemo(() => timeRange === 'all' ? undefined : new Date(Date.now() - (timeRange === '24h' ? 86400000 : 7 * 86400000)).toISOString(), [timeRange]);
  const saveSettings = async (patch: Partial<DiagnosticsSettingsRecord>) => { const next = await runWithDatabaseSpace(space, (db) => settingsRepository.updateDiagnosticsSettings(db, patch)); setSettings(next); setDiagnosticsEnabled(space, next.enabled); };
  const runExport = async (level: 'standard' | 'deep') => { setWorking(true); try { await flushDiagnostics(space); const uri = await exportDiagnostics({ level, space, threadId, from, includeResponseSnippets: level === 'deep' && includeResponseSnippets }); await Share.share({ message: `Pixory ${level === 'deep' ? '深度' : '标准'}诊断包`, url: uri }); } catch (error) { showToast(error instanceof Error ? `导出失败：${error.message}` : '导出失败'); } finally { setWorking(false); } };
  const selectedThreadTitle = threadId ? threads.find((thread) => thread.id === threadId)?.title ?? '已选会话' : '全部会话';
  const confirmDeepExport = () => Alert.alert('导出深度诊断包', `范围：${selectedThreadTitle}，${timeRange === '24h' ? '最近24小时' : timeRange === '7d' ? '最近7天' : '全部时间'}。${includeResponseSnippets ? '包含 reasoning/answer 字段。' : '不包含 reasoning 字段。'} 本次授权不会被记住。`, [{ text: '取消', style: 'cancel' }, { text: '继续导出', onPress: () => { void runExport('deep'); } }]);
  return <ScreenScaffold onBack={onBack} scrollable title="性能与诊断"><View style={styles.card}>
    <Text style={styles.title}>可复盘诊断</Text><Text style={styles.body}>标准包不含聊天正文、提示词、Base64 或密钥；深度包每次二次确认。</Text>
    <View style={styles.row}><Text style={styles.label}>启用基础诊断</Text><Switch value={settings.enabled} onValueChange={(enabled) => { void saveSettings({ enabled }); }} /></View>
    <View style={styles.row}><Text style={styles.label}>保留天数</Text><TextInput keyboardType="number-pad" style={styles.input} value={String(settings.retentionDays)} onEndEditing={(event) => { void saveSettings({ retentionDays: Number(event.nativeEvent.text) || 7 }); }} /></View>
    <View style={styles.row}><Text style={styles.label}>事件上限</Text><TextInput keyboardType="number-pad" style={styles.input} value={String(settings.maxEvents)} onEndEditing={(event) => { void saveSettings({ maxEvents: Number(event.nativeEvent.text) || 20000 }); }} /></View>
    <Text style={styles.sectionLabel}>导出时间范围</Text><View style={styles.optionRow}>{(['24h', '7d', 'all'] as TimeRange[]).map((value) => <Pressable key={value} onPress={() => setTimeRange(value)} style={[styles.option, timeRange === value && styles.optionActive]}><Text style={[styles.optionText, timeRange === value && styles.optionTextActive]}>{value === '24h' ? '24小时' : value === '7d' ? '7天' : '全部'}</Text></Pressable>)}</View>
    <Text style={styles.sectionLabel}>目标会话</Text><Pressable onPress={() => setThreadId(undefined)} style={[styles.threadOption, !threadId && styles.optionActive]}><Text style={[styles.optionText, !threadId && styles.optionTextActive]}>全部会话</Text></Pressable>{threads.map((thread) => <Pressable key={thread.id} onPress={() => setThreadId(thread.id)} style={[styles.threadOption, threadId === thread.id && styles.optionActive]}><Text numberOfLines={1} style={[styles.optionText, threadId === thread.id && styles.optionTextActive]}>{thread.title}</Text></Pressable>)}
    <View style={styles.row}><Text style={styles.label}>深度包包含响应片段</Text><Switch value={includeResponseSnippets} onValueChange={setIncludeResponseSnippets} /></View>
    <Pressable disabled={working} onPress={() => { void runExport('standard'); }} style={styles.button}><Text style={styles.buttonText}>{working ? '正在处理…' : '导出标准诊断包'}</Text></Pressable>
    <Pressable disabled={working} onPress={confirmDeepExport} style={styles.button}><Text style={styles.buttonText}>二次确认后导出深度包</Text></Pressable>
    <Pressable disabled={working} onPress={() => { void flushDiagnostics(space).then(() => showToast('诊断日志已刷新')); }} style={styles.secondary}><Text style={styles.secondaryText}>立即写入本地日志</Text></Pressable>
    <Pressable disabled={working} onPress={() => Alert.alert('清除诊断日志', '只清除当前空间的诊断事件，不影响聊天、记忆或附件。', [{ text: '取消', style: 'cancel' }, { text: '清除', style: 'destructive', onPress: () => { void runWithDatabaseSpace(space, (db) => clearDiagnosticEvents(db, space)).then(() => showToast('当前空间日志已清除')); } }])} style={styles.secondary}><Text style={styles.secondaryText}>清除当前空间日志</Text></Pressable>
  </View></ScreenScaffold>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.background.surface, borderColor: colors.border.subtle, borderRadius: radius.lg, borderWidth: 1, margin: spacing[6], padding: spacing[6] }, title: { color: colors.text.primary, fontSize: typography.size.sectionTitle, fontWeight: '700' }, body: { color: colors.text.secondary, fontSize: typography.size.body, lineHeight: 21, marginTop: spacing[3] }, row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[4] }, label: { color: colors.text.primary, fontSize: typography.size.body }, input: { borderColor: colors.border.subtle, borderRadius: radius.sm, borderWidth: 1, color: colors.text.primary, minWidth: 90, paddingHorizontal: spacing[3], paddingVertical: spacing[2], textAlign: 'right' }, sectionLabel: { color: colors.text.secondary, fontSize: typography.size.caption, marginTop: spacing[5] }, optionRow: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }, option: { borderColor: colors.border.subtle, borderRadius: radius.md, borderWidth: 1, flex: 1, padding: spacing[3] }, optionActive: { backgroundColor: colors.primary.active, borderColor: colors.primary.active }, optionText: { color: colors.text.primary, fontSize: typography.size.body, textAlign: 'center' }, optionTextActive: { color: colors.text.inverse }, threadOption: { borderColor: colors.border.subtle, borderRadius: radius.md, borderWidth: 1, marginTop: spacing[2], padding: spacing[3] }, button: { alignItems: 'center', backgroundColor: colors.primary.active, borderRadius: radius.md, marginTop: spacing[4], padding: spacing[4] }, buttonText: { color: colors.text.inverse, fontSize: typography.size.body, fontWeight: '700' }, secondary: { alignItems: 'center', marginTop: spacing[3], padding: spacing[2] }, secondaryText: { color: colors.primary.active, fontSize: typography.size.body, fontWeight: '600' } });

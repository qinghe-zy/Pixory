/**
 * 手账日记操作交互与状态 Hook (useDiaryActions)
 * 封装补写、重写确认、版本回退与删除等核心逻辑，保持 UI 视图纯粹轻巧
 */

import { useState, useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform, ToastAndroid, type AlertButton } from 'react-native';
import type { PixorySpace } from '../../../database';
import { generateCompanionDailyDiary } from '../engine/imDiaryGenerator';
import { restorePreviousDiaryVersion, deleteCompanionDiary } from '../repository/imDiaryRepository';
import { toLocalDateStr } from '../engine/diaryDayWindow';
import type { ImCompanionDiary } from '../types';

export interface UseDiaryActionsParams {
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  companionName: string;
  onRefreshList: (targetDateStr?: string) => Promise<void>;
  onDiaryGenerated?: () => void;
}

export function useDiaryActions({
  space,
  threadId,
  roleCardId,
  companionName,
  onRefreshList,
  onDiaryGenerated,
}: UseDiaryActionsParams) {
  const [generating, setGenerating] = useState(false);

  const showToast = useCallback((msg: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert('提示', msg);
    }
  }, []);

  const handleGenerateDiary = useCallback(
    async (targetDateStr?: string, isRewrite = false) => {
      try {
        setGenerating(true);
        await generateCompanionDailyDiary({
          space,
          threadId,
          roleCardId,
          roleName: companionName,
          targetDateStr,
          forceRewrite: isRewrite,
        });
        await onRefreshList(targetDateStr);
        onDiaryGenerated?.();
        showToast(isRewrite ? '已为您重新撰写并保留上一版' : '已为您完成手账日记撰写');
      } catch (err: any) {
        console.error('[useDiaryActions] Diary generation failed:', err);
        const message = err?.message || '';
        if (message.includes('NO_PROVIDER_CONFIGURED')) {
          showToast('请先在「设置」中配置有效的 AI 模型与 Key');
        } else if (message.includes('NO_MESSAGES_FOR_DATE')) {
          showToast('该日期暂无聊天记录，无法撰写手账');
        } else if (message.includes('GENERATION_TIMEOUT')) {
          showToast('日记生成超时，请检查网络或稍后重试');
        } else if (message.includes('database is locked') || message.includes('SQLITE_BUSY')) {
          showToast('数据库繁忙，请稍等片刻后重试');
        } else if (message.includes('401') || message.includes('Unauthorized')) {
          showToast('模型 API Key 认证失败，请在设置中检查');
        } else if (message.includes('429') || /rate limit|quota/i.test(message)) {
          showToast('模型调用额度超限或频次过高，请稍后再试');
        } else if (/network|failed to fetch/i.test(message)) {
          showToast('网络连接中断，请检查手机网络后重试');
        } else if (message.includes('GENERATION_EMPTY_FAILED')) {
          showToast('暂未构思出日记内容，请重试一次');
        } else if (message.includes('NativeDatabase') || message.includes('SQLite') || message.includes('prepare')) {
          showToast('数据库读取异常，请重试');
        } else {
          const detail = message ? `：${message.slice(0, 40)}` : '，请确认模型连接后重试';
          showToast(`日记撰写失败${detail}`);
        }
      } finally {
        setGenerating(false);
      }
    },
    [space, threadId, roleCardId, companionName, onRefreshList, onDiaryGenerated, showToast]
  );

  const handleRestorePrevious = useCallback(
    async (diaryDate?: string) => {
      if (!diaryDate) return;
      try {
        const res = await restorePreviousDiaryVersion(space, threadId, diaryDate);
        if (res) {
          await onRefreshList(diaryDate);
          showToast('已成功撤销并恢复上一版日记');
        } else {
          showToast('暂无历史版本可供恢复');
        }
      } catch {
        showToast('恢复历史版本失败');
      }
    },
    [space, threadId, onRefreshList, showToast]
  );

  const handleDelete = useCallback(
    async (diaryDate?: string) => {
      if (!diaryDate) return;
      Alert.alert(
        '删除手账',
        `确认要移除 ${diaryDate} 的这一页手账日记吗？此操作无法撤销。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确认删除',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteCompanionDiary(space, threadId, diaryDate);
                await onRefreshList();
                showToast('已移除该页手账');
              } catch {
                showToast('删除手账失败');
              }
            },
          },
        ]
      );
    },
    [space, threadId, onRefreshList, showToast]
  );

  const openActionMenu = useCallback(
    (currentDiary?: ImCompanionDiary, currentDateStr?: string) => {
      const today = toLocalDateStr();
      const hasCurrent = Boolean(currentDiary);
      const canUndo = Boolean(currentDiary?.previousVersions && currentDiary.previousVersions.length > 0);

      const options: string[] = ['取消'];
      if (currentDateStr !== today) options.push('补写今日手账');
      if (hasCurrent) options.push('重写本篇手账 (保留版本)');
      if (canUndo) options.push('撤销并恢复上一版手账');
      if (hasCurrent) options.push('删除本篇手账');

      const handleSelect = (idx: number) => {
        const chosen = options[idx];
        if (chosen === '补写今日手账') void handleGenerateDiary(today);
        else if (chosen === '重写本篇手账 (保留版本)') {
          Alert.alert('重写手账', '确认重新撰写本篇手账吗？旧版本将保留，随时可以撤销回退。', [
            { text: '取消', style: 'cancel' },
            { text: '开始重写', onPress: () => void handleGenerateDiary(currentDateStr, true) },
          ]);
        } else if (chosen === '撤销并恢复上一版手账') void handleRestorePrevious(currentDateStr);
        else if (chosen === '删除本篇手账') void handleDelete(currentDateStr);
      };

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options, cancelButtonIndex: 0, destructiveButtonIndex: options.indexOf('删除本篇手账') },
          handleSelect
        );
      } else {
        Alert.alert(
          '手账操作',
          `${companionName} 的日记管理`,
          options.slice(1).map((opt): AlertButton => ({
            text: opt,
            style: opt.includes('删除') ? 'destructive' : 'default',
            onPress: () => handleSelect(options.indexOf(opt)),
          })).concat([{ text: '取消', style: 'cancel', onPress: () => {} }])
        );
      }
    },
    [companionName, handleGenerateDiary, handleRestorePrevious, handleDelete]
  );

  return {
    generating,
    handleGenerateDiary,
    handleRestorePrevious,
    handleDelete,
    openActionMenu,
  };
}

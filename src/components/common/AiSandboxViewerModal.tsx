import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WebView } from 'react-native-webview';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { RegenerateIcon } from '../ai/AiMessageActionIcons';
import { buildSandboxAssembly, extractArtifactTitle } from '../../services/sandbox/sandboxAssembler';
import { decideInitialMode } from '../../services/sandbox/sandboxDetector';
import type { SandboxConsoleEvent } from '../../services/sandbox/sandboxTypes';
import { DocumentExportModal } from './DocumentExportModal';

export interface AiSandboxViewerModalProps {
  visible: boolean;
  code: string;
  language?: string;
  title?: string;
  artifactId?: string;
  messageId?: string;
  generating?: boolean;
  onRequestAiFix?: (errorReport: string) => void;
  onRegenerate?: (messageId: string) => void;
  onClose: () => void;
}

export function AiSandboxViewerModal({
  visible,
  code,
  language,
  title,
  artifactId,
  messageId,
  generating,
  onRequestAiFix,
  onRegenerate,
  onClose,
}: AiSandboxViewerModalProps) {
  const insets = useSafeAreaInsets();
  const displayTitle = useMemo(() => title || extractArtifactTitle(code, language), [title, code, language]);
  const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [consoleEvents, setConsoleEvents] = useState<SandboxConsoleEvent[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const copiedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化决策
  useEffect(() => {
    if (visible && code) {
      const initialMode = decideInitialMode(code);
      setIsFullScreen(initialMode === 'fullscreen');
      setConsoleEvents([]);
      setIsConsoleOpen(false);
      setActiveTab('preview');
    }
  }, [visible, code]);

  // 卸载与关闭时的横竖屏复位守卫
  const safeResetPortrait = useCallback(async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsLandscape(false);
    } catch {
      // 容错处理
    }
  }, []);

  const handleClose = useCallback(() => {
    void safeResetPortrait();
    onClose();
  }, [safeResetPortrait, onClose]);

  useEffect(() => {
    return () => {
      void safeResetPortrait();
      if (copiedToastTimerRef.current) {
        clearTimeout(copiedToastTimerRef.current);
        copiedToastTimerRef.current = null;
      }
    };
  }, [safeResetPortrait]);

  // 固化缺省 artifactId，防止无 ID 场景下重复重载 WebView
  const fallbackArtifactIdRef = useRef<string | null>(null);
  if (!fallbackArtifactIdRef.current) {
    fallbackArtifactIdRef.current = `art_${Date.now().toString(36)}`;
  }
  const effectiveArtifactId = artifactId || fallbackArtifactIdRef.current;

  // 组装带单行垫片和独立子域名的 HTML
  const { html: assembledHtml, baseUrl } = useMemo(() => {
    return buildSandboxAssembly({
      code,
      language,
      artifactId: effectiveArtifactId,
      title: displayTitle,
    });
  }, [code, language, effectiveArtifactId, displayTitle]);

  // 顶部拖拽 Handle PanResponder（仅 Handle 响应下滑关闭，WebView 视口完全隔离）
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 80 || gesture.vy > 0.6) {
            handleClose();
          }
        },
      }),
    [handleClose]
  );

  // 旋转屏幕切换
  const handleToggleOrientation = useCallback(async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsLandscape(true);
        setIsFullScreen(true); // 横屏时自动铺满全屏
      }
    } catch {
      // 容错
    }
  }, [isLandscape]);

  // 全屏切换
  const handleToggleFullScreen = useCallback(() => {
    setIsFullScreen((prev) => !prev);
  }, []);

  // 刷新重载
  const handleReload = useCallback(() => {
    setConsoleEvents([]);
    setReloadKey((k) => k + 1);
  }, []);

  // 复制代码
  const handleCopyCode = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopiedToast(true);
      if (copiedToastTimerRef.current) {
        clearTimeout(copiedToastTimerRef.current);
      }
      copiedToastTimerRef.current = setTimeout(() => {
        setCopiedToast(false);
        copiedToastTimerRef.current = null;
      }, 1500);
    } catch {
      Alert.alert('提示', '复制代码失败');
    }
  }, [code]);

  // 复制错误日志
  const handleCopyLogs = useCallback(async () => {
    if (consoleEvents.length === 0) return;
    const logText = consoleEvents
      .map((e) => `[${e.type}] ${e.message}${e.line ? ` (第 ${e.line} 行)` : ''}${e.stack ? `\n${e.stack}` : ''}`)
      .join('\n\n');
    await Clipboard.setStringAsync(logText);
    Alert.alert('提示', '日志已复制到剪贴板');
  }, [consoleEvents]);

  // 重新生成回复（复用消息重新生成按钮）
  const handleRegeneratePress = useCallback(() => {
    if (onRegenerate && messageId) {
      void safeResetPortrait();
      onClose();
      onRegenerate(messageId);
    } else {
      // 若无关联 messageId，降级为重载沙箱运行环境
      handleReload();
    }
  }, [onRegenerate, messageId, safeResetPortrait, onClose, handleReload]);

  // 让 TA 修复
  const handleRequestAiFix = useCallback(() => {
    if (!onRequestAiFix) return;
    const errorLogs = consoleEvents
      .filter((e) => e.type === 'CONSOLE_ERROR' || e.type === 'CDN_LOAD_ERROR')
      .map((e) => `报错信息：${e.message}${e.line ? ` (line: ${e.line}, col: ${e.col})` : ''}${e.stack ? `\n堆栈：${e.stack}` : ''}`)
      .join('\n\n');

    const report = errorLogs || '运行出现异常，请检查代码逻辑。';
    void safeResetPortrait();
    onClose();
    onRequestAiFix(report);
  }, [consoleEvents, onRequestAiFix, safeResetPortrait, onClose]);

  // 监听 WebView postMessage 事件
  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        message?: string;
        line?: number;
        col?: number;
        stack?: string | null;
        src?: string;
      };

      if (data.type === 'CONSOLE_ERROR') {
        setConsoleEvents((prev) => {
          const nextItem: SandboxConsoleEvent = {
            id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'CONSOLE_ERROR',
            message: data.message || '未知脚本运行时异常',
            line: data.line,
            col: data.col,
            stack: data.stack,
            timestamp: Date.now(),
          };
          return prev.length >= 50 ? [...prev.slice(1), nextItem] : [...prev, nextItem];
        });
      } else if (data.type === 'CDN_LOAD_ERROR') {
        setConsoleEvents((prev) => {
          const nextItem: SandboxConsoleEvent = {
            id: `cdn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'CDN_LOAD_ERROR',
            message: `外部脚本或样式资源加载失败: ${data.src || '未知 URL'}`,
            src: data.src,
            timestamp: Date.now(),
          };
          return prev.length >= 50 ? [...prev.slice(1), nextItem] : [...prev, nextItem];
        });
      }
    } catch {
      // 忽略非 JSON 数据
    }
  }, []);

  const errorCount = useMemo(() => {
    return consoleEvents.filter((e) => e.type === 'CONSOLE_ERROR' || e.type === 'CDN_LOAD_ERROR').length;
  }, [consoleEvents]);

  const statusBarHeight = useMemo(() => {
    return Platform.OS === 'android'
      ? Math.max(StatusBar.currentHeight ?? 0, insets.top)
      : insets.top;
  }, [insets.top]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={handleClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <StatusBar backgroundColor="transparent" barStyle="dark-content" translucent />
      <View style={styles.modalBackdrop}>
        {/* 背景轻触关闭（仅在抽屉模式生效） */}
        {!isFullScreen && <Pressable onPress={handleClose} style={styles.backdropPressArea} />}

        <View
          style={[
            styles.dialogCard,
            isFullScreen ? styles.dialogCardFullScreen : styles.dialogCardDrawer,
            {
              paddingTop: isFullScreen ? statusBarHeight : 0,
              paddingBottom: Math.max(insets.bottom, 0),
              paddingLeft: isFullScreen ? insets.left : 0,
              paddingRight: isFullScreen ? insets.right : 0,
            },
          ]}
        >
          {/* 顶部拖动 Handle（仅抽屉模式展示） */}
          {!isFullScreen && (
            <View {...panResponder.panHandlers} style={styles.handleContainer}>
              <View style={styles.handleBar} />
            </View>
          )}

          {/* 顶部操作工具栏 */}
          <View style={styles.toolbar}>
            <View style={styles.toolbarLeft}>
              {/* 预览 / 源码 极简分段器（靠左放置并带图标） */}
              <View style={styles.segmentedControl}>
                <Pressable
                  accessibilityLabel="预览视图"
                  accessibilityRole="tab"
                  onPress={() => setActiveTab('preview')}
                  style={[styles.segmentTab, activeTab === 'preview' && styles.segmentTabActive]}
                >
                  <Ionicons
                    color={activeTab === 'preview' ? '#111827' : '#6B7280'}
                    name="eye-outline"
                    size={13}
                  />
                  <Text style={[styles.segmentTabText, activeTab === 'preview' && styles.segmentTabTextActive]}>
                    预览
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="源码视图"
                  accessibilityRole="tab"
                  onPress={() => setActiveTab('source')}
                  style={[styles.segmentTab, activeTab === 'source' && styles.segmentTabActive]}
                >
                  <Ionicons
                    color={activeTab === 'source' ? '#111827' : '#6B7280'}
                    name="code-slash-outline"
                    size={13}
                  />
                  <Text style={[styles.segmentTabText, activeTab === 'source' && styles.segmentTabTextActive]}>
                    源码
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 右侧动作图标组（叉号位于最右侧，方便右手操作） */}
            <View style={styles.toolbarRight}>
              <Pressable
                accessibilityLabel={onRegenerate && messageId ? '重新生成' : '重新加载'}
                accessibilityRole="button"
                disabled={Boolean(generating)}
                hitSlop={spacing[2]}
                onLongPress={handleReload}
                onPress={handleRegeneratePress}
                style={({ pressed }) => [
                  styles.iconButton,
                  generating && styles.disabledButton,
                  pressed && !generating && styles.pressed,
                ]}
              >
                <RegenerateIcon color={generating ? '#D1D5DB' : '#6B7280'} size={17} />
              </Pressable>

              <Pressable
                accessibilityLabel="切换横竖屏"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={() => void handleToggleOrientation()}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color="#6B7280" name="phone-landscape-outline" size={19} />
              </Pressable>

              <Pressable
                accessibilityLabel={isFullScreen ? '退出全屏' : '全屏展示'}
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={handleToggleFullScreen}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color="#6B7280" name={isFullScreen ? 'contract-outline' : 'scan-outline'} size={19} />
              </Pressable>

              <Pressable
                accessibilityLabel="导出制品"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={() => setExportModalVisible(true)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color="#6B7280" name="share-outline" size={19} />
              </Pressable>

              <Pressable
                accessibilityLabel="复制代码"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={() => void handleCopyCode()}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color="#6B7280" name={copiedToast ? 'checkmark' : 'copy-outline'} size={19} />
              </Pressable>

              <Pressable
                accessibilityLabel="关闭沙箱"
                accessibilityRole="button"
                hitSlop={spacing[2]}
                onPress={handleClose}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color="#111827" name="close-outline" size={22} />
              </Pressable>
            </View>
          </View>

          {/* 主视口区域 */}
          <View style={styles.viewportContainer}>
            {activeTab === 'preview' ? (
              <WebView
                allowFileAccess={false}
                allowFileAccessFromFileURLs={false}
                allowUniversalAccessFromFileURLs={false}
                bounces={false}
                domStorageEnabled
                javaScriptCanOpenWindowsAutomatically={false}
                javaScriptEnabled
                key={`sb_wv_${reloadKey}`}
                mixedContentMode="never"
                onMessage={handleMessage}
                originWhitelist={['*']}
                renderError={(e) => (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>页面加载出错: {e}</Text>
                  </View>
                )}
                scrollEnabled
                setSupportMultipleWindows={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                source={{ html: assembledHtml, baseUrl }}
                style={styles.webView}
              />
            ) : (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.sourceScrollContent}
                showsVerticalScrollIndicator
                style={styles.sourceContainer}
              >
                <Text selectable style={styles.sourceText}>
                  {code}
                </Text>
              </ScrollView>
            )}
          </View>

          {/* 底部控制台状态条 */}
          <View style={styles.statusBar}>
            <View style={styles.statusIndicatorRow}>
              <View style={[styles.statusDot, errorCount > 0 ? styles.statusDotError : styles.statusDotOk]} />
              <Text style={styles.statusText}>
                {errorCount > 0 ? `运行报错 (${errorCount})` : '运行正常'}
              </Text>
            </View>

            {/* 制品名称（水平居中，两侧截断保护） */}
            <View style={styles.bottomTitleContainer}>
              <Text ellipsizeMode="tail" numberOfLines={1} style={styles.bottomArtifactTitle}>
                {displayTitle}
              </Text>
            </View>

            <Pressable
              hitSlop={spacing[2]}
              onPress={() => setIsConsoleOpen((prev) => !prev)}
              style={({ pressed }) => [styles.consoleToggle, pressed && styles.pressed]}
            >
              <Text style={styles.consoleToggleText}>{isConsoleOpen ? '收起日志' : '展开日志'}</Text>
              <Ionicons
                color="#6B7280"
                name={isConsoleOpen ? 'chevron-down-outline' : 'chevron-up-outline'}
                size={14}
              />
            </Pressable>
          </View>

          {/* 控制台错误详情抽屉 */}
          {isConsoleOpen && (
            <View style={styles.consoleDrawer}>
              <ScrollView bounces={false} style={styles.consoleScroll}>
                {consoleEvents.length === 0 ? (
                  <Text style={styles.consoleEmptyText}>暂无异常日志输出</Text>
                ) : (
                  consoleEvents.map((evt) => (
                    <View key={evt.id} style={styles.consoleEventItem}>
                      <Text style={styles.consoleEventMessage}>
                        [{evt.type}]{' '}
                        {evt.line ? `(line ${evt.line}:${evt.col ?? 0}) ` : ''}
                        {evt.message}
                      </Text>
                      {evt.stack ? <Text style={styles.consoleEventStack}>{evt.stack}</Text> : null}
                    </View>
                  ))
                )}
              </ScrollView>

              {/* 日志操作动作条 */}
              <View style={styles.consoleActions}>
                {onRequestAiFix && errorCount > 0 ? (
                  <Pressable
                    onPress={handleRequestAiFix}
                    style={({ pressed }) => [styles.fixButton, pressed && styles.pressed]}
                  >
                    <Ionicons color="#FFFFFF" name="build-outline" size={14} />
                    <Text style={styles.fixButtonText}>让 TA 修复</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => void handleCopyLogs()}
                  style={({ pressed }) => [styles.copyLogsButton, pressed && styles.pressed]}
                >
                  <Ionicons color="#6B7280" name="copy-outline" size={14} />
                  <Text style={styles.copyLogsButtonText}>复制日志</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* 导出文档模态框 */}
      {exportModalVisible && (
        <DocumentExportModal
          content={code}
          defaultTitle={displayTitle}
          onClose={() => setExportModalVisible(false)}
          visible={exportModalVisible}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPressArea: {
    flex: 1,
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  dialogCardDrawer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '75%',
  },
  dialogCardFullScreen: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    height: '100%',
    width: '100%',
  },
  handleContainer: {
    alignItems: 'center',
    height: 16,
    justifyContent: 'center',
    width: '100%',
  },
  handleBar: {
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    height: 4,
    width: 36,
  },
  toolbar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 48,
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
  },
  toolbarLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  toolbarRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  iconButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  disabledButton: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.65,
  },
  segmentedControl: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    flexDirection: 'row',
    padding: 2,
  },
  segmentTab: {
    alignItems: 'center',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  segmentTabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  segmentTabText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  segmentTabTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  viewportContainer: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  webView: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  sourceContainer: {
    backgroundColor: '#FAFAFA',
    flex: 1,
  },
  sourceScrollContent: {
    padding: spacing[3],
  },
  sourceText: {
    color: '#1F2937',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  statusBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    flexDirection: 'row',
    height: 36,
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
  },
  statusIndicatorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusDotOk: {
    backgroundColor: '#4B5563',
  },
  statusDotError: {
    backgroundColor: '#EF4444',
  },
  statusText: {
    color: '#4B5563',
    fontSize: 12,
  },
  bottomTitleContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: spacing[2],
  },
  bottomArtifactTitle: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  consoleToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
  },
  consoleToggleText: {
    color: '#6B7280',
    fontSize: 12,
  },
  consoleDrawer: {
    backgroundColor: '#F9FAFB',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    maxHeight: 180,
    padding: spacing[2],
  },
  consoleScroll: {
    maxHeight: 110,
  },
  consoleEmptyText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontStyle: 'italic',
    padding: 6,
  },
  consoleEventItem: {
    borderBottomColor: '#F3F4F6',
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  consoleEventMessage: {
    color: '#DC2626',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  consoleEventStack: {
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    marginTop: 2,
  },
  consoleActions: {
    alignItems: 'center',
    borderTopColor: '#E5E7EB',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingTop: 6,
  },
  fixButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  fixButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  copyLogsButton: {
    alignItems: 'center',
    borderColor: '#D1D5DB',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  copyLogsButtonText: {
    color: '#4B5563',
    fontSize: 12,
  },
  errorContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing[4],
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
  },
});

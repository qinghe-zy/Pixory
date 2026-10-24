import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../design/tokens';
import { ParallaxLightSweep } from '../ParallaxLightSweep';
import { activeSandboxArtifactManager } from './activeSandboxArtifactManager';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 展开变速：320ms 高阻尼拟物轻弹，初程迅速展开，后程自然吸合
const EXPAND_ANIMATION_CONFIG = {
  duration: 320,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.spring,
    springDamping: 0.82,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

// 收拢变速：260ms 极速优雅缓出，不黏滞拖沓
const COLLAPSE_ANIMATION_CONFIG = {
  duration: 260,
  create: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    type: LayoutAnimation.Types.easeInEaseOut,
  },
  delete: {
    type: LayoutAnimation.Types.easeInEaseOut,
    property: LayoutAnimation.Properties.opacity,
  },
};

export interface AiSandboxArtifactViewfinderProps {
  id?: string;
  code: string;
  language: 'html' | 'svg';
  title: string;
  lineCount?: number;
  messageId?: string;
  isSandboxModalOpen?: boolean;
  streaming?: boolean;
  defaultExpanded?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (expanded: boolean) => void;
  onOpenSandbox?: (params: {
    code: string;
    language?: string;
    title?: string;
    initialTab?: 'preview' | 'code';
    messageId?: string;
  }) => void;
  onDegradeToCodeBlock?: () => void;
}

function buildViewfinderHtmlDocument(code: string, language: 'html' | 'svg'): string {
  const isSvg = language === 'svg';

  const silentShim = `try {
    var SilentAudioContext = function() {
      return {
        state: 'suspended',
        resume: function() { return Promise.resolve(); },
        suspend: function() { return Promise.resolve(); },
        close: function() { return Promise.resolve(); },
        createGain: function() { return { gain: { value: 0 }, connect: function() {} }; },
        createOscillator: function() { return { start: function() {}, stop: function() {}, connect: function() {} }; },
        createBufferSource: function() { return { start: function() {}, stop: function() {}, connect: function() {} }; },
        destination: {}
      };
    };
    window.AudioContext = SilentAudioContext;
    window.webkitAudioContext = SilentAudioContext;
  } catch(e) {}`;

  if (isSvg) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #FFFFFF; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    }
    svg { max-width: 90%; max-height: 90%; object-fit: contain; overflow: visible; }
  </style>
  <script>
    ${silentShim}
    window.addEventListener('error', function(e) {
      try {
        var msg = e && e.message ? String(e.message) : '';
        if (msg.indexOf('ResizeObserver') !== -1 || msg.indexOf('Script error') !== -1) return;
        if (window.__pixory_viewfinder_ready) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RUNTIME_ERROR', message: msg }));
      } catch(err) {}
    });
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          var target = document.querySelector('svg');
          if (!target) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WHITE_SCREEN' }));
          } else {
            window.__pixory_viewfinder_ready = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
          }
        } catch(err) {}
      }, 200);
    });
  </script>
</head>
<body>
  ${code}
</body>
</html>`;
  }

  // HTML 采用独立 iframe 隔离样式作用域，并使用 transform-origin: center center 等比居中缩放
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=360, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background: #FFFFFF; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    }
    #stage-container {
      width: 360px;
      height: 380px;
      transform: scale(0.42);
      transform-origin: center center;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      pointer-events: none;
    }
    iframe {
      width: 360px;
      height: 380px;
      border: none;
      pointer-events: none;
      background: #FFFFFF;
    }
  </style>
  <script>
    ${silentShim}
    window.addEventListener('error', function(e) {
      try {
        var msg = e && e.message ? String(e.message) : '';
        if (msg.indexOf('ResizeObserver') !== -1 || msg.indexOf('Script error') !== -1) return;
        if (window.__pixory_viewfinder_ready) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RUNTIME_ERROR', message: msg }));
      } catch(err) {}
    });

    function notifyReady() {
      window.__pixory_viewfinder_ready = true;
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
      } catch(e) {}
    }

    function notifyWhiteScreen() {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WHITE_SCREEN' }));
      } catch(e) {}
    }

    window.addEventListener('DOMContentLoaded', function() {
      try {
        var frame = document.getElementById('preview-frame');
        var doc = frame.contentWindow.document;
        doc.open();
        var injectedCode = ${JSON.stringify(code).replace(/</g, '\\u003c')};
        doc.write('<script>' + ${JSON.stringify(silentShim).replace(/</g, '\\u003c')} + '<\\/script>' + injectedCode);
        doc.close();

        frame.onload = function() {
          setTimeout(function() {
            try {
              var innerDoc = frame.contentWindow.document;
              var hasContent = innerDoc && innerDoc.body && (
                innerDoc.body.children.length > 0 ||
                (innerDoc.body.innerText && innerDoc.body.innerText.trim().length > 0)
              );
              if (hasContent) {
                notifyReady();
              } else {
                notifyWhiteScreen();
              }
            } catch(e) {
              notifyReady();
            }
          }, 300);
        };
      } catch(err) {
        notifyReady();
      }
    });
  </script>
</head>
<body>
  <div id="stage-container">
    <iframe id="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
  </div>
</body>
</html>`;
}

export const AiSandboxArtifactViewfinder = React.memo(function AiSandboxArtifactViewfinder({
  id: idProp,
  code,
  language,
  title,
  lineCount,
  messageId,
  isSandboxModalOpen = false,
  streaming = false,
  defaultExpanded = true,
  isExpanded: isExpandedProp,
  onToggleExpand,
  onOpenSandbox,
  onDegradeToCodeBlock,
}: AiSandboxArtifactViewfinderProps) {
  const instanceId = useMemo(() => {
    if (idProp) return idProp;
    if (messageId) return `${messageId}:${title}`;
    return `viewfinder:${title}:${language}`;
  }, [idProp, messageId, title, language]);

  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = isExpandedProp !== undefined;
  // 流式生成期间必须处于展开态以呈现极光骨架与行数跳动
  const expanded = streaming ? true : isControlled ? isExpandedProp : internalExpanded;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // 动画过渡锁：防止用户在 300ms 形变插值期间连击按钮导致 Android LayoutAnimation 布局打断跳变
  const isTransitioningRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 展开动画进行中状态（保证视口延展瞬间极光扫弦与网格骨架 100% 立即满格点亮，绝无空白闪变）
  const [isMorphing, setIsMorphing] = useState(false);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 仅在展开或流式构建时按需估算行数，卡片收拢态零计算开销
  const calculatedLineCount = (expanded || streaming)
    ? (lineCount ?? (code ? code.split('\n').length : 1))
    : 0;

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
      }
      if (morphTimerRef.current) {
        clearTimeout(morphTimerRef.current);
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      if (activeSandboxArtifactManager.getActiveId() === instanceId) {
        activeSandboxArtifactManager.setActiveId(null);
      }
    };
  }, [instanceId]);

  // 统一收拢复原核心逻辑，消除重复代码并补齐单例注销与状态重置
  const performCollapse = useCallback((animate = true) => {
    if (animate) {
      LayoutAnimation.configureNext(COLLAPSE_ANIMATION_CONFIG);
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (morphTimerRef.current) {
      clearTimeout(morphTimerRef.current);
      morphTimerRef.current = null;
    }
    setIsLoaded(false);
    setIsMorphing(false);
    if (!isControlled) {
      if (activeSandboxArtifactManager.getActiveId() === instanceId) {
        activeSandboxArtifactManager.setActiveId(null);
      }
      setInternalExpanded(false);
    }
    onToggleExpand?.(false);
  }, [instanceId, isControlled, onToggleExpand]);

  // 1. 全会话物理级单例活跃取景框互斥联动：
  // 当其他卡片展开或有新的流式生成时，当前展开的取景框自动优雅收拢，确保全会话物理活跃 WebView 严格 <= 1
  useEffect(() => {
    if (isControlled) return;

    if (streaming) {
      activeSandboxArtifactManager.setActiveId(instanceId);
    } else if (defaultExpanded && activeSandboxArtifactManager.getActiveId() === null) {
      activeSandboxArtifactManager.setActiveId(instanceId);
    }

    const unsubscribe = activeSandboxArtifactManager.subscribe((activeId) => {
      if (activeId !== instanceId && expandedRef.current) {
        // 当其他取景框主动展开时，发起方已调度全局 LayoutAnimation。
        // 被动收拢方绝不应在同帧再次 configureNext，防止覆盖全局动画配置造成 Android 插值竞争撕裂
        performCollapse(activeId === null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [instanceId, isControlled, streaming, defaultExpanded, performCollapse]);

  const handleToggleExpand = useCallback(() => {
    if (streaming || isTransitioningRef.current) return;
    const next = !expanded;

    isTransitioningRef.current = true;
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      isTransitioningRef.current = false;
    }, next ? 350 : 280);

    if (next) {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      // 展开变速：320ms 高阻尼轻弹
      LayoutAnimation.configureNext(EXPAND_ANIMATION_CONFIG);
      setIsLoaded(false); // 重置加载态，防止白屏脏读闪烁
      setIsMorphing(true);
      if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
      morphTimerRef.current = setTimeout(() => {
        setIsMorphing(false);
      }, 340);

      if (!isControlled) {
        activeSandboxArtifactManager.setActiveId(instanceId);
        setInternalExpanded(true);
      }

      onToggleExpand?.(true);
    } else {
      performCollapse(true);
    }
  }, [expanded, instanceId, isControlled, onToggleExpand, performCollapse, streaming]);

  const isHtml = language === 'html';
  const badgeLabel = isHtml ? 'HTML5' : 'SVG';
  const displayTitle = title || (isHtml ? 'HTML5 交互呈现' : 'SVG 矢量绘图');

  const handleOpenPreview = useCallback(() => {
    if (streaming) return;
    onOpenSandbox?.({
      code,
      language,
      title: displayTitle,
      initialTab: 'preview',
      messageId,
    });
  }, [code, language, displayTitle, messageId, onOpenSandbox, streaming]);

  const handleOpenCode = useCallback(() => {
    if (streaming) return;
    onOpenSandbox?.({
      code,
      language,
      title: displayTitle,
      initialTab: 'code',
      messageId,
    });
  }, [code, language, displayTitle, messageId, onOpenSandbox, streaming]);

  // 仅在展开或流式构建时装配微缩舞台 HTML，收拢态短路返回空字符串，消除历史卡片常驻内存
  const previewHtmlDocument = useMemo(() => {
    if (!expanded && !streaming) return '';
    return buildViewfinderHtmlDocument(code, language);
  }, [code, language, expanded, streaming]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { type: string; message?: string };
      if (data.type === 'READY') {
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        setIsLoaded(true);
      } else if (data.type === 'RUNTIME_ERROR' || data.type === 'WHITE_SCREEN') {
        // 首帧致命报错或白屏，触发自动退化机制回退为普通代码块
        onDegradeToCodeBlock?.();
      }
    } catch {
      // 忽略无法解析的消息
    }
  }, [onDegradeToCodeBlock]);

  if (!expanded) {
    return (
      <View key="sandbox-collapsed-card" style={styles.cardContainer}>
        {/* 左侧 36×36dp 圆角图标徽标 */}
        <View style={styles.cardIconWrap}>
          <Ionicons
            color="#475569"
            name={isHtml ? 'code-slash' : 'color-palette-outline'}
            size={16}
          />
        </View>

        {/* 中间杂志风内容排版 */}
        <View style={styles.cardContent}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {displayTitle}
          </Text>
          <Text numberOfLines={1} style={styles.cardSubtitle}>
            {isHtml ? 'HTML5 交互应用 · 矢量动画' : 'SVG 矢量绘图 · 独立组件'}
          </Text>
        </View>

        {/* 右侧轻盈大气操作按钮群 (方案 A：浅灰高质感) */}
        <View style={styles.cardActions}>
          <Pressable
            accessibilityLabel="展开取景器"
            accessibilityRole="button"
            hitSlop={spacing[1]}
            onPress={handleToggleExpand}
            style={({ pressed }) => [styles.cardSquareButton, pressed && styles.actionPressed]}
          >
            <Ionicons color="#475569" name="scan-outline" size={15} />
          </Pressable>

          <Pressable
            accessibilityLabel="运行制品"
            accessibilityRole="button"
            hitSlop={spacing[1]}
            onPress={handleOpenPreview}
            style={({ pressed }) => [styles.cardPillButton, pressed && styles.actionPressed]}
          >
            <Ionicons color="#475569" name="play" size={11} />
            <Text style={styles.cardPillButtonText}>运行</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View key="sandbox-expanded-viewfinder" style={styles.viewfinderCard}>
      {/* 极简顶栏 */}
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
          <Text numberOfLines={1} style={styles.title}>
            {displayTitle}
          </Text>
        </View>

        {streaming ? (
          <View style={styles.buildingBadge}>
            <View style={styles.buildingPulse} />
            <Text style={styles.buildingText}>构建中</Text>
          </View>
        ) : (
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="查看源码"
              accessibilityRole="button"
              hitSlop={spacing[1]}
              onPress={handleOpenCode}
              style={({ pressed }) => [styles.headerButton, pressed && styles.actionPressed]}
            >
              <Ionicons color="#475569" name="code-slash-outline" size={12} />
              <Text style={styles.headerButtonText}>源码</Text>
            </Pressable>

            {/* 胶囊运行/全屏按钮（折叠由其他取景框打开被动触发） */}
            <Pressable
              accessibilityLabel="全屏运行"
              accessibilityRole="button"
              hitSlop={spacing[1]}
              onPress={handleOpenPreview}
              style={({ pressed }) => [styles.headerPrimaryButton, pressed && styles.actionPressed]}
            >
              <Ionicons color="#0F172A" name="play" size={11} />
              <Text style={styles.headerPrimaryButtonText}>全屏</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 取景器视口 (160dp)：展开态或流式期间展开 */}
      <View style={styles.viewport}>
        {/* 全屏沙箱打开、流式构建期或形变动画过渡期不挂载真实 WebView，实现严格 0 WebView 物理安全防御 */}
        {!isSandboxModalOpen && !streaming && !isMorphing ? (
          <WebView
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            bounces={false}
            domStorageEnabled={false}
            javaScriptCanOpenWindowsAutomatically={false}
            javaScriptEnabled
            mixedContentMode="never"
            onError={() => onDegradeToCodeBlock?.()}
            onHttpError={() => onDegradeToCodeBlock?.()}
            onLoadEnd={() => {
              if (!fallbackTimerRef.current) {
                fallbackTimerRef.current = setTimeout(() => {
                  setIsLoaded(true);
                }, 1200);
              }
            }}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
            originWhitelist={['about:blank']}
            scrollEnabled={false}
            setSupportMultipleWindows={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            source={{ html: previewHtmlDocument, baseUrl: 'about:blank' }}
            style={[styles.webView, (!isLoaded || streaming || isMorphing) && styles.hiddenWebView]}
          />
        ) : null}

        {/* 占位态：高阶拟真线框舞台骨架屏 + 视差极光扫弦 (ParallaxLightSweep) */}
        {!isLoaded || isSandboxModalOpen || streaming || isMorphing ? (
          <View style={styles.skeletonContainer}>
            {/* 1. 微型应用舞台坐标线网格 */}
            <View style={styles.wireframeGrid}>
              <View style={[styles.wireframeLine, { top: 26 }]} />
              <View style={[styles.wireframeLine, { top: 68 }]} />
              <View style={[styles.wireframeLine, { top: 110 }]} />
            </View>

            {/* 2. 微型应用顶栏 Faux HUD 状态指示胶囊 */}
            <View style={styles.miniFauxHud}>
              <View style={styles.miniHudPillLeft} />
              <View style={styles.miniHudPillCenter} />
              <View style={styles.miniHudPillRight} />
            </View>

            {/* 3. 中央核心视口节点（拟真画布中枢） */}
            <View style={styles.centralStageCard}>
              <View style={styles.centralIconWrap}>
                <Ionicons color="#9CA3AF" name="cube-outline" size={20} />
              </View>
              <View style={styles.centralBarPrimary} />
              <View style={styles.centralBarSecondary} />
            </View>

            {/* 4. 底部微型虚拟操控台/滑动触控板 */}
            <View style={styles.stageControlsWrap}>
              <View style={styles.stageControlKnob} />
              <View style={styles.stageControlTrack} />
              <View style={styles.stageControlKnob} />
            </View>

            {/* 5. 极光扫弦层（全息扫描激光编译质感，即使在半途展开中也 100% 满格点亮） */}
            <ParallaxLightSweep
              active={!isLoaded || streaming || isMorphing}
              color1="#00f2fe"
              color2="#fe5196"
              fadeDuration={300}
              opacity={0.32}
              variant="edges"
              visible={!isLoaded || streaming || isMorphing}
            />
          </View>
        ) : null}

        {/* 覆盖层点击交互：拦截触控并触发全屏沙箱，流式生成期禁用 */}
        {!streaming ? (
          <Pressable
            accessibilityLabel="轻触进入全屏沙箱交互"
            accessibilityRole="button"
            onPress={handleOpenPreview}
            style={styles.touchOverlay}
          />
        ) : null}
      </View>

      {/* 极简底栏 */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomStatus}>
          <View style={[styles.statusDot, streaming && styles.buildingDot]} />
          <Text style={styles.statusText}>
            {streaming
              ? `正在实时构建... · ${calculatedLineCount} 行代码`
              : `已就绪 · ${calculatedLineCount} 行代码`}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // Claude 风格黄金比例卡片容器 (收拢态 · 方案 A 一比一复刻)
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    letterSpacing: -0.1,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardSquareButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 5,
  },
  cardPillButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    letterSpacing: 0.1,
  },

  // 取景器视口容器 (展开态)
  viewfinderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 8,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 0,
    alignSelf: 'stretch',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
    backgroundColor: '#F8FAFC',
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    backgroundColor: '#E2E8F0',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.1,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
    gap: 4,
  },
  headerButtonText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  headerPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 13,
    height: 32,
    borderRadius: 16,
    gap: 5,
  },
  headerPrimaryButtonText: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  buildingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  buildingPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#475569',
  },
  buildingText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
  },
  buildingDot: {
    backgroundColor: '#64748B',
  },
  actionPressed: {
    opacity: 0.75,
  },
  viewport: {
    height: 160,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  hiddenWebView: {
    opacity: 0,
  },
  skeletonContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wireframeGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  wireframeLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  miniFauxHud: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  miniHudPillLeft: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  miniHudPillCenter: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  miniHudPillRight: {
    width: 22,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  centralStageCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  centralIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  centralBarPrimary: {
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    marginBottom: 4,
  },
  centralBarSecondary: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  stageControlsWrap: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageControlKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  stageControlTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginHorizontal: 12,
  },
  touchOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
    backgroundColor: '#F8FAFC',
  },
  bottomStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#64748B',
  },
  statusText: {
    fontSize: 11,
    color: '#64748B',
  },
});

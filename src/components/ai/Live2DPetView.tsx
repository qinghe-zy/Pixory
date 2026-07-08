import React, { forwardRef, useImperativeHandle, useRef, useState, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, ViewProps } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

interface Live2DPetViewProps extends ViewProps {
  /**
   * 模型的 JSON 配置文件 URL
   * 必须确保可被 WebView 加载（推荐 CDN 绝对路径）
   */
  modelUrl: string;
  /**
   * 模型成功加载后的回调
   */
  onLoadSuccess?: (motions?: string[]) => void;
  /**
   * 模型加载失败的回调
   */
  onLoadError?: (error: string) => void;
  /**
   * 点击命中物理区域的回调
   */
  onHitAreaClicked?: (areaName: string) => void;
}

export interface Live2DPetViewRef {
  playMotion: (group: string, index?: number) => void;
  setExpression: (expressionId: string) => void;
  injectJavaScript: (script: string) => void;
  switchModel: (url: string) => void;
  trackPointer: (x: number, y: number) => void;
}

export const Live2DPetView = forwardRef<Live2DPetViewRef, Live2DPetViewProps>(({
  modelUrl,
  onLoadSuccess,
  onLoadError,
  onHitAreaClicked,
  style,
  ...rest
}, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const initialUrlRef = useRef(modelUrl);

  useImperativeHandle(ref, () => ({
    playMotion: (group: string, index?: number) => {
      webViewRef.current?.injectJavaScript(`
        if (window.currentModel) {
          window.currentModel.motion('${group}', ${index !== undefined ? index : ''});
        }
        true;
      `);
    },
    setExpression: (expressionId: string) => {
      webViewRef.current?.injectJavaScript(`
        if (window.currentModel) {
          window.currentModel.expression('${expressionId}');
        }
        true;
      `);
    },
    injectJavaScript: (script: string) => {
      webViewRef.current?.injectJavaScript(script);
    },
    switchModel: (url: string) => {
      setLoading(true);
      webViewRef.current?.injectJavaScript(
        `if (typeof loadModel === 'function') { loadModel(${JSON.stringify(url)}); } true;`
      );
    },
    trackPointer: (x: number, y: number) => {
      webViewRef.current?.injectJavaScript(`if(window.setFocus) { window.setFocus(${x}, ${y}); } true;`);
    }
  }));

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'MODEL_LOADED':
          setLoading(false);
          onLoadSuccess?.();
          break;
        case 'MODEL_ERROR':
          setLoading(false);
          onLoadError?.(data.payload.message);
          break;
        case 'HIT_AREA_CLICKED':
          onHitAreaClicked?.(data.payload.area);
          break;
      }
    } catch (e) {
      console.warn('Live2DPetView message parse error:', e);
    }
  };

  // 生成 HTML 字符串，注意严格的时序和依赖版本
  // 使用 CDN 加载所需核心库
  const htmlContent = useMemo(() => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: transparent;
      overflow: hidden;
      touch-action: none; /* 防止页面滚动冲突 */
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      width: 100vw;
    }
    #canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
  <!-- 1. 最先加载官方 Cubism Core -->
  <script src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"></script>
  <!-- 2. 加载完整的 PixiJS v7 UMD 包，包含事件和 Ticker 系统 -->
  <script src="https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js"></script>
  <!-- 3. 加载对应的 Live2D Display 库 (支持 mulmotion 的 v0.5.x 分支) -->
  <script src="https://cdn.jsdelivr.net/npm/pixi-live2d-display-mulmotion@0.5.0-mm-6/dist/cubism4.min.js"></script>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
    // 监听全局错误，向上汇报
    window.addEventListener('error', (e) => {
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'MODEL_ERROR',
        payload: { message: e.message }
      }));
    });

    // 确保依赖已就绪
    if (!window.PIXI || !window.PIXI.live2d || !window.Live2DCubismCore) {
      throw new Error("Live2D 核心库加载失败");
    }

    const { Application } = PIXI;
    const { Live2DModel } = PIXI.live2d;

    // 保险起见，注册 PIXI 的 Ticker 驱动 Live2D，确保呼吸、自动动作正常执行
    Live2DModel.registerTicker(PIXI.Ticker.shared);

    const app = new Application({
      view: document.getElementById('canvas'),
      backgroundAlpha: 0, // PixiJS v7 推荐用法，移除废弃的 transparent: true
      resizeTo: window,
      autoDensity: true,
      // 限制高分屏分辨率，最高封顶 2 倍，防止显存爆炸 (OOM)
      resolution: Math.min(window.devicePixelRatio, 2),
    });

    let currentModel = null;

    async function loadModel(url) {
      try {
        if (currentModel) {
          // 先从舞台移除，再销毁并释放 WebGL 纹理，防止反复加载引发 OOM
          app.stage.removeChild(currentModel);
          currentModel.destroy({ children: true, texture: true, baseTexture: true });
          currentModel = null;
          window.currentModel = null;
        }

        const model = await Live2DModel.from(url);
        
        app.stage.addChild(model);

        // 居中且自适应大小（用 screen 逻辑像素 + 未缩放的 internalModel 尺寸，锚点居中）
        model.anchor.set(0.5, 0.5);
        model.position.set(app.screen.width / 2, app.screen.height / 2);
        const scale = Math.min(
          app.screen.width  / model.internalModel.width,
          app.screen.height / model.internalModel.height
        ) * 0.9;
        model.scale.set(scale);

        // 挂载到全局，供外部 injectJavaScript 访问
        window.currentModel = model;
        currentModel = model;

        window.setFocus = (x, y) => {
          if (currentModel) {
            currentModel.focus(x, y);
          }
        };

        // 监听点击碰撞盒
        model.on('hit', (hitAreas) => {
          window._lastNativeHitTime = Date.now();
          if (hitAreas.length > 0) {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
              type: 'HIT_AREA_CLICKED',
              payload: { area: hitAreas[0] } // 汇报最上层命中的区域
            }));
          }
        });

        // 绑定后背回退点击机制 (Fallback)
        app.view.addEventListener('pointerdown', (e) => {
          if (currentModel) {
            const bounds = currentModel.getBounds();
            // Check if touch is inside model bounds
            if (e.clientX >= bounds.x && e.clientX <= bounds.x + bounds.width &&
                e.clientY >= bounds.y && e.clientY <= bounds.y + bounds.height) {
              
              // Wait slightly to see if native hit area was triggered
              window._lastNativeHitTime = window._lastNativeHitTime || 0;
              setTimeout(() => {
                if (Date.now() - window._lastNativeHitTime > 50) {
                  // No native hit, fallback to geometric approximation
                  const relativeY = e.clientY - bounds.y;
                  const isHead = relativeY < (bounds.height * 0.33);
                  window.ReactNativeWebView?.postMessage(JSON.stringify({
                    type: 'HIT_AREA_CLICKED',
                    payload: { area: isHead ? 'Head' : 'Body' }
                  }));
                }
              }, 50);
            }
          }
        });

        
        // 提取支持的 motions
        let extractedMotions = [];
        try {
          if (model.internalModel.motionManager) {
            if (model.internalModel.motionManager.motionGroups) {
              extractedMotions = Object.keys(model.internalModel.motionManager.motionGroups);
            } else if (model.internalModel.motionManager.groups) {
              extractedMotions = Object.keys(model.internalModel.motionManager.groups);
            }
          }
          if (extractedMotions.length === 0 && model.internalModel.settings && model.internalModel.settings.motions) {
            extractedMotions = Object.keys(model.internalModel.settings.motions);
          }
        } catch(e) {}

        // 通知 RN 加载成功
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'MODEL_LOADED',
          payload: { status: 'success', motions: extractedMotions }
        }));
      } catch (e) {
        console.error(e);
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'MODEL_ERROR',
          payload: { message: e.message || '模型加载失败' }
        }));
      }
    }

    // 接收初始 URL 并加载
    loadModel('${initialUrlRef.current}');

    // 监听窗口大小变化以重新调整模型布局
    window.addEventListener('resize', () => {
      if (currentModel) {
        const scale = Math.min(
          app.screen.width  / currentModel.internalModel.width,
          app.screen.height / currentModel.internalModel.height
        ) * 0.9;
        currentModel.scale.set(scale);
        currentModel.position.set(app.screen.width / 2, app.screen.height / 2);
      }
    });
  </script>
</body>
</html>
  `, []);

  return (
    <View style={[styles.container, style]} {...rest} pointerEvents="box-none">
      <WebView
        ref={webViewRef}
        style={styles.webview}
        source={{ html: htmlContent }}
        originWhitelist={['*']}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        onMessage={handleMessage}
        bounces={false}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // 为了使 WebView 背景透明
        containerStyle={{ backgroundColor: 'transparent' }}
      />
      {loading && (
        <View style={styles.loadingContainer} pointerEvents="none">
          <ActivityIndicator size="large" color="#FF69B4" />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
});

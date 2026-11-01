import React, { useRef, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  ToastAndroid,
  Alert,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PixorySpace } from '../../../database';
import { SecureImage } from '../../../components/SecureImage';
import { saveImageToSystemAlbum } from '../../../services/mediaLibraryService';

export interface ImImageViewerModalProps {
  visible: boolean;
  imageUri: string | null;
  space?: PixorySpace;
  onClose: () => void;
}

const DOUBLE_TAP_DELAY = 280;

export function ImImageViewerModal({
  visible,
  imageUri,
  space = 'normal',
  onClose,
}: ImImageViewerModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);
  const currentScaleRef = useRef(1);

  useEffect(() => {
    if (visible) {
      scale.setValue(1);
      translateY.setValue(0);
      translateX.setValue(0);
      currentScaleRef.current = 1;
    }
  }, [visible, scale, translateY, translateX]);

  const toggleZoom = () => {
    const nextScale = currentScaleRef.current > 1.2 ? 1 : 2.5;
    currentScaleRef.current = nextScale;
    Animated.parallel([
      Animated.spring(scale, {
        toValue: nextScale,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 || Math.abs(gesture.dy) > 10,
      onPanResponderGrant: () => {
        const now = Date.now();
        if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
          toggleZoom();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      },
      onPanResponderMove: (_, gesture) => {
        if (currentScaleRef.current > 1) {
          translateX.setValue(gesture.dx);
          translateY.setValue(gesture.dy);
        } else if (gesture.dy > 0) {
          translateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (currentScaleRef.current <= 1 && gesture.dy > 120) {
          onClose();
        } else {
          Animated.parallel([
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  const executeSave = async () => {
    if (!imageUri || isSaving) return;
    setIsSaving(true);
    try {
      await saveImageToSystemAlbum(imageUri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === 'android') {
        ToastAndroid.show('已保存到系统相册', ToastAndroid.SHORT);
      }
    } catch (err: any) {
      if (Platform.OS === 'android') {
        ToastAndroid.show(err?.message || '保存失败', ToastAndroid.SHORT);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveToAlbum = () => {
    if (!imageUri || isSaving) return;
    if (space === 'personal') {
      Alert.alert(
        '私密空间导出提醒',
        '当前处于私密空间，将此图片保存至系统公开相册将允许系统相册和其他应用查看，确定保存吗？',
        [
          { text: '取消', style: 'cancel' },
          { text: '确认保存', onPress: () => void executeSave() },
        ]
      );
    } else {
      void executeSave();
    }
  };

  if (!visible || !imageUri) return null;

  const { width, height } = Dimensions.get('window');

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.container}>
        {/* 顶部工具栏 */}
        <View style={styles.topBar}>
          <Pressable
            hitSlop={12}
            onPress={onClose}
            style={styles.actionBtn}
          >
            <Ionicons color="#FFFFFF" name="close" size={24} />
          </Pressable>

          <Pressable
            disabled={isSaving}
            hitSlop={12}
            onPress={handleSaveToAlbum}
            style={[styles.actionBtn, isSaving && styles.btnDisabled]}
          >
            <Ionicons color="#FFFFFF" name="download-outline" size={22} />
            <Text style={styles.saveText}>{isSaving ? '保存中...' : '保存'}</Text>
          </Pressable>
        </View>

        {/* 图片缩放主视口 */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.imageWrapper,
            {
              transform: [
                { scale },
                { translateX },
                { translateY },
              ],
            },
          ]}
        >
          <SecureImage
            contentFit="contain"
            space={space}
            style={{ width, height: height * 0.75 }}
            uri={imageUri}
          />
        </Animated.View>

        {/* 底部双击提示 */}
        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>双击放大 · 下滑返回</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 54,
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 4,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  imageWrapper: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomHint: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
  },
});

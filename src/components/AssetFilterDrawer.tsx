import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { ReactNode } from 'react';

export interface AssetFilterDrawerProps {
  onClose: () => void;
  visible: boolean;
  children: ReactNode;
}

export function AssetFilterDrawer({ onClose, visible, children }: AssetFilterDrawerProps) {
  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill}>
          <Pressable onPress={onClose} style={styles.backdrop} />
        </Animated.View>
        <Animated.View entering={SlideInRight.springify().damping(20).stiffness(200)} exiting={SlideOutRight.duration(200)} style={styles.drawer}>
          <View style={styles.header}>
            <Text style={styles.title}>筛选</Text>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
              <Ionicons color={colors.text.body} name="close" size={24} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    flex: 1,
  },
  drawer: {
    backgroundColor: colors.background.surface,
    borderBottomLeftRadius: radius.xl,
    borderTopLeftRadius: radius.xl,
    elevation: 20,
    height: '100%',
    width: '85%',
    maxWidth: 360,
    ...shadows.floating,
    shadowColor: '#000',
    shadowOpacity: 0.15,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[4],
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.primary,
  },
  closeBtn: {
    padding: spacing[2],
    margin: -spacing[2],
  },
  content: {
    padding: spacing[6],
    gap: rhythm.screenSectionGap,
  },
  pressed: {
    opacity: 0.7,
  },
});

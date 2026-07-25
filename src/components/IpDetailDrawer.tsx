import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { ReactNode } from 'react';

export interface IpDetailDrawerProps {
  onClose: () => void;
  visible: boolean;
  children: ReactNode;
  title?: string;
}

export function IpDetailDrawer({ onClose, visible, children, title = 'IP 选项' }: IpDetailDrawerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill}>
          <Pressable onPress={onClose} style={styles.backdrop} />
        </Animated.View>
        <Animated.View entering={SlideInRight.duration(300)} exiting={SlideOutRight.duration(250)} style={styles.drawer}>
          <View style={[styles.header, { paddingTop: insets.top + spacing[8] }]}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}>
              <Ionicons color={colors.text.body} name="close" size={24} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[6]) }]}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
              <Text style={styles.footerBtnText}>收起面板</Text>
              <View style={styles.footerIconWrap}>
                <Ionicons color={colors.text.primary} name="chevron-forward" size={20} />
              </View>
            </Pressable>
          </View>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[4],
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
    fontSize: 18,
  },
  closeBtn: {
    padding: spacing[2],
    margin: -spacing[2],
  },
  content: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[5],
    gap: rhythm.screenSectionGap,
  },
  footer: {
    backgroundColor: colors.background.surface,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[2],
  },
  footerBtn: {
    alignItems: 'center',
    backgroundColor: colors.background.sunken,
    borderRadius: radius.pill,
    flexDirection: 'row',
    height: 56,
    justifyContent: 'space-between',
    paddingHorizontal: spacing[2],
    paddingLeft: spacing[6],
  },
  footerBtnText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
    fontSize: 16,
  },
  footerIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
    ...shadows.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});

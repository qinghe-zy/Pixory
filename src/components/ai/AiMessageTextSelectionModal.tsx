import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout } from '../../design/tokens/layout';
import { metrics, radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

type AiMessageTextSelectionModalProps = {
  content: string;
  onClose: () => void;
  visible: boolean;
};

export function AiMessageTextSelectionModal({
  content,
  onClose,
  visible,
}: AiMessageTextSelectionModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View
        style={[
          styles.screen,
          {
            paddingBottom: insets.bottom,
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="关闭选择文本"
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              color={aiLightColors.ink}
              name="chevron-back"
              size={metrics.iconSizeMd}
            />
          </Pressable>
          <Text style={styles.title}>选择文本</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator
        >
          <Text selectable selectionColor={aiLightColors.primary} style={styles.content}>
            {content}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: aiLightColors.canvas,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: spacing[12],
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: metrics.minTouchSize,
  },
  contentContainer: {
    paddingBottom: spacing[8],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[6],
  },
  content: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  pressed: {
    backgroundColor: aiLightColors.primarySoft,
  },
});

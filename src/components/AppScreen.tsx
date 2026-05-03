import type { ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, shadows, spacing } from '../design/tokens';

interface AppScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  footer?: ReactNode;
  footerStyle?: StyleProp<ViewStyle>;
  dismissKeyboardOnTouch?: boolean;
}

export function AppScreen({
  children,
  scrollable = false,
  contentStyle,
  backgroundColor = colors.background.page,
  footer,
  footerStyle,
  dismissKeyboardOnTouch = false,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const bodyBottomPadding = (footer ? 0 : insets.bottom) + layout.pageBottomOffset;

  const body = scrollable ? (
    <ScrollView
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bodyBottomPadding }, contentStyle]}
      style={styles.flex}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { paddingBottom: bodyBottomPadding }, contentStyle]}>{children}</View>
  );

  const screenContent = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + layout.stickyFooterBottomOffset,
            },
            footerStyle,
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );

  if (dismissKeyboardOnTouch) {
    return (
      <View style={[styles.safeArea, { backgroundColor }]}>
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          {screenContent}
        </TouchableWithoutFeedback>
      </View>
    );
  }

  if (scrollable) {
    return (
      <View style={[styles.safeArea, { backgroundColor }]}>
        {screenContent}
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor }]}>
      {screenContent}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.pagePaddingHorizontal,
    gap: layout.sectionGap,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.pagePaddingHorizontal,
    gap: layout.sectionGap,
  },
  footer: {
    backgroundColor: colors.background.page,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
    ...shadows.hairline,
  },
});

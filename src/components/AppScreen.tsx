import type { ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, layout, spacing } from '../design/tokens';

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
  const body = scrollable ? (
    <ScrollView
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, contentStyle]}
      style={styles.flex}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  const screenContent = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      {body}
      {footer ? <View style={[styles.footer, footerStyle]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );

  if (dismissKeyboardOnTouch) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          {screenContent}
        </TouchableWithoutFeedback>
      </SafeAreaView>
    );
  }

  if (scrollable) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        {screenContent}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
      {screenContent}
    </SafeAreaView>
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
    paddingBottom: layout.screenBottomPadding,
    gap: spacing[6],
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingBottom: layout.screenBottomPadding,
    gap: spacing[6],
  },
  footer: {
    backgroundColor: colors.background.page,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingBottom: layout.screenBottomPadding,
    paddingTop: spacing[3],
  },
});

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

import type { PageBackgroundVariant } from '../design/backgrounds';
import { colors, layout, radius, shadows, spacing } from '../design/tokens';
import { PageBackground } from './PageBackground';

interface AppScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  footer?: ReactNode;
  footerStyle?: StyleProp<ViewStyle>;
  dismissKeyboardOnTouch?: boolean;
  backgroundVariant?: PageBackgroundVariant;
  backgroundDimmed?: boolean;
}

export function AppScreen({
  children,
  scrollable = false,
  contentStyle,
  backgroundColor = colors.background.page,
  footer,
  footerStyle,
  dismissKeyboardOnTouch = false,
  backgroundVariant,
  backgroundDimmed,
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
      <PageBackground backgroundColor={backgroundColor} dimmed={backgroundDimmed} variant={backgroundVariant}>
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          {screenContent}
        </TouchableWithoutFeedback>
      </PageBackground>
    );
  }

  if (scrollable) {
    return (
      <PageBackground backgroundColor={backgroundColor} dimmed={backgroundDimmed} variant={backgroundVariant}>
        {screenContent}
      </PageBackground>
    );
  }

  return (
    <PageBackground backgroundColor={backgroundColor} dimmed={backgroundDimmed} variant={backgroundVariant}>
      {screenContent}
    </PageBackground>
  );
}

const styles = StyleSheet.create({
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

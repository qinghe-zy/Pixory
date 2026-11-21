import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as ScrollViewType,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { colors, layout, radius, rhythm, shadows, spacing } from '../design/tokens';
import { PageBackground } from './PageBackground';

export const FloatingFooterContext = createContext<number>(0);

interface AppScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  keyboardAware?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  footer?: ReactNode;
  footerNaked?: boolean;
  footerStyle?: StyleProp<ViewStyle>;
  dismissKeyboardOnTouch?: boolean;
  backgroundVariant?: PageBackgroundVariant;
  backgroundDimmed?: boolean;
  scrollViewRef?: RefObject<ScrollViewType | null>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function AppScreen({
  children,
  scrollable = false,
  keyboardAware = true,
  contentStyle,
  backgroundColor = colors.background.page,
  footer,
  footerNaked = false,
  footerStyle,
  dismissKeyboardOnTouch = false,
  backgroundVariant,
  backgroundDimmed,
  scrollViewRef,
  onScroll,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const floatingFooterHeight = useContext(FloatingFooterContext);
  
  // When footer is present, absolute, and not naked, we need extra padding on scrollable content so it isn't hidden
  const footerEstimateHeight = (footer && !footerNaked) ? 100 : 0;
  const baseBottomInset = (footer && !footerNaked) ? footerEstimateHeight : (floatingFooterHeight > 0 ? 0 : insets.bottom);
  const bodyBottomPadding = scrollable ? (baseBottomInset + layout.pageBottomOffset + floatingFooterHeight) : 0;

  const body = scrollable ? (
    keyboardAware ? (
      <KeyboardAwareScrollView
        ref={scrollViewRef as RefObject<KeyboardAwareScrollViewRef | null>}
        bottomOffset={spacing[6]}
        extraKeyboardSpace={spacing[4]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bodyBottomPadding }, contentStyle]}
        style={styles.flex}
      >
        {children}
      </KeyboardAwareScrollView>
    ) : (
      <ScrollView
        ref={scrollViewRef}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        directionalLockEnabled
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bodyBottomPadding }, contentStyle]}
        style={styles.flex}
      >
        {children}
      </ScrollView>
    )
  ) : (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  const bodyContent = Platform.OS === 'ios' && (!scrollable || !keyboardAware) ? (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      {body}
    </KeyboardAvoidingView>
  ) : body;

  const screenContent = (
    <View style={styles.flex}>
      {bodyContent}
      {footer ? (
        footerNaked ? (
          // Naked mode: no BlurView, no background — just an absolute transparent wrapper
          <View style={styles.footerWrap} pointerEvents="box-none">
            {footer}
          </View>
        ) : (
          <View style={styles.footerWrap} pointerEvents="box-none">
            <BlurView
              intensity={85}
              tint="light"
              style={[
                styles.footer,
                {
                  paddingBottom: insets.bottom + layout.stickyFooterBottomOffset,
                },
                footerStyle,
              ]}
            >
              {footer}
            </BlurView>
          </View>
        )
      ) : null}
    </View>
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
    gap: rhythm.screenSectionGap,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.pagePaddingHorizontal,
    gap: rhythm.screenSectionGap,
  },
  footerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footer: {
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
});

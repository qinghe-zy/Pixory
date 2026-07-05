import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiDocxReader } from '../components/ai/AiDocxReader';
import { AiMarkdownReader } from '../components/ai/AiMarkdownReader';
import { AiPdfReader } from '../components/ai/AiPdfReader';
import { AiTextReader } from '../components/ai/AiTextReader';
import { aiLightColors, aiLightDisplayFont } from '../components/ai/aiLightTheme';
import { AppScreen } from '../components/AppScreen';
import { readDocumentForReader } from '../ai/aiDocumentService';
import type { AiDocumentReaderLocator, AiReadableDocument } from '../ai/readers/readerTypes';
import { layout, metrics, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiDocumentReaderScreenProps {
  space: PixorySpace;
  documentId?: string;
  locator?: AiDocumentReaderLocator;
  title?: string;
  onBack: () => void;
}

export function AiDocumentReaderScreen({ space, documentId, locator, title, onBack }: AiDocumentReaderScreenProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const [readable, setReadable] = useState<AiReadableDocument | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const displayTitle = readable?.document.title ?? title ?? '文档阅读';

  useEffect(() => {
    if (!documentId) {
      setReadable(null);
      return;
    }
    let isMounted = true;
    setLoading(true);
    setErrorMessage(null);
    void readDocumentForReader({ documentId, space })
      .then((nextReadable) => {
        if (isMounted) {
          setReadable(nextReadable);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : '读取文档失败');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [documentId, space]);

  const reader = readable ? renderReader(readable, locator) : null;
  const webViewMode = readable?.document.sourceType === 'pdf' || readable?.document.sourceType === 'markdown';

  return (
    <AppScreen backgroundColor={aiLightColors.canvas} contentStyle={styles.screen}>
      <View style={[styles.header, { paddingTop: statusBarHeight + spacing[2] }]}>
        <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Ionicons color={aiLightColors.ink} name="chevron-back" size={22} />
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>{displayTitle}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.readerHost, { paddingTop: statusBarHeight + metrics.minTouchSize + spacing[4] }]}>
        {loading ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator color={aiLightColors.coral} />
            <Text style={styles.stateText}>正在打开文档...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.stateBlock}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : reader ? (
          webViewMode ? reader : (
            <ScrollView contentContainerStyle={styles.textScrollContent} showsVerticalScrollIndicator={false}>
              {reader}
            </ScrollView>
          )
        ) : (
          <View style={styles.stateBlock}>
            <Text style={styles.stateText}>没有可打开的文档</Text>
          </View>
        )}
      </View>
    </AppScreen>
  );
}

function renderReader(readable: AiReadableDocument, locator?: AiDocumentReaderLocator) {
  if (readable.document.sourceType === 'markdown') {
    return <AiMarkdownReader locator={locator} readable={readable} />;
  }
  if (readable.document.sourceType === 'docx') {
    return <AiDocxReader locator={locator} readable={readable} />;
  }
  if (readable.document.sourceType === 'pdf') {
    return <AiPdfReader locator={locator} readable={readable} />;
  }
  return <AiTextReader locator={locator} readable={readable} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 0,
  },
  header: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    left: 0,
    paddingBottom: spacing[2],
    paddingHorizontal: layout.pagePaddingHorizontal,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: metrics.minTouchSize,
    justifyContent: 'center',
    width: metrics.minTouchSize,
  },
  pressed: {
    opacity: 0.78,
  },
  title: {
    ...typography.textStyles.navTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontWeight: '400',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: metrics.minTouchSize,
  },
  readerHost: {
    flex: 1,
  },
  textScrollContent: {
    paddingBottom: spacing[8],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
  },
  stateBlock: {
    alignItems: 'center',
    flex: 1,
    gap: rhythm.cardContentGap,
    justifyContent: 'center',
    padding: spacing[4],
  },
  stateText: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    textAlign: 'center',
  },
  errorText: {
    ...typography.textStyles.body,
    color: aiLightColors.coralActive,
    textAlign: 'center',
  },
});

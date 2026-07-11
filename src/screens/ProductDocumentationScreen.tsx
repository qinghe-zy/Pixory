import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '../components/AppToast';
import { AppScreen } from '../components/AppScreen';
import { AiMarkdownReader } from '../components/ai/AiMarkdownReader';
import type { AiReadableDocument } from '../ai/readers/readerTypes';
import { colors, layout, spacing, typography } from '../design/tokens';
import { getProductDocumentationMarkdown } from '../services/productDocumentationService';

interface ProductDocumentationScreenProps {
  onBack: () => void;
  preloadedMarkdown?: string | null;
}

export function ProductDocumentationScreen({
  onBack,
  preloadedMarkdown,
}: ProductDocumentationScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [markdown, setMarkdown] = useState<string | null>(preloadedMarkdown ?? null);
  const readable = useMemo<Pick<AiReadableDocument, 'text'> | null>(
    () => (markdown ? { text: markdown } : null),
    [markdown]
  );

  useEffect(() => {
    let isMounted = true;

    void getProductDocumentationMarkdown()
      .then((content) => {
        if (isMounted) {
          setMarkdown(content);
        }
      })
      .catch(() => {
        if (isMounted && !preloadedMarkdown) {
          showToast('加载产品文档失败');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [preloadedMarkdown, showToast]);

  const handleLinkPress = (url: string) => {
    void Linking.openURL(url).catch(() => {
      showToast('打开链接失败');
    });
  };

  return (
    <AppScreen backgroundColor={DOC_CANVAS} contentStyle={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing[3] }]}>
        <Pressable
          accessibilityLabel="返回"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Ionicons color={colors.text.title} name="arrow-back" size={28} />
          <Text style={styles.backText}>返回</Text>
        </Pressable>

        <View pointerEvents="none" style={styles.brandWrap}>
          <Text style={styles.brandText}>Pixory</Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.container}>
        {readable ? (
          <AiMarkdownReader onLinkPress={handleLinkPress} readable={readable} />
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.text.title} size="large" />
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const DOC_CANVAS = '#FAF9F5';

const styles = StyleSheet.create({
  screen: {
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  header: {
    alignItems: 'center',
    backgroundColor: DOC_CANVAS,
    borderBottomColor: colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: layout.headerHeight + spacing[2],
    paddingHorizontal: spacing[5],
  },
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    minWidth: 96,
    paddingVertical: spacing[2],
  },
  backButtonPressed: {
    opacity: 0.72,
  },
  backText: {
    ...typography.textStyles.body,
    color: colors.text.title,
    fontSize: 18,
    lineHeight: 24,
  },
  brandWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  brandText: {
    color: '#141413',
    fontFamily: typography.family.serif,
    fontSize: 24,
    lineHeight: 30,
  },
  headerSpacer: {
    minWidth: 96,
  },
  container: {
    backgroundColor: DOC_CANVAS,
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

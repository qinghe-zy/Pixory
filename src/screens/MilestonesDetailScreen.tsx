import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreen } from '../components/AppScreen';
import { AiMarkdownReader } from '../components/ai/AiMarkdownReader';
import { generateMilestonesDetailMarkdown } from '../services/milestoneService';
import { useToast } from '../components/AppToast';
import { colors, layout, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface MilestonesDetailScreenProps {
  onBack: () => void;
  onPushRoute: (route: any) => void;
  space?: PixorySpace;
  preloadedMarkdown?: string | null;
}

export function MilestonesDetailScreen({ onBack, onPushRoute, space = 'normal', preloadedMarkdown }: MilestonesDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [markdown, setMarkdown] = useState<string | null>(preloadedMarkdown ?? null);

  useEffect(() => {
    let isMounted = true;
    if (preloadedMarkdown) {
      // If we already have the preloaded markdown, we don't need to fetch it again immediately
      return;
    }
    
    void generateMilestonesDetailMarkdown(space)
      .then((md) => {
        if (isMounted) setMarkdown(md);
      })
      .catch((err) => {
        if (isMounted) {
          showToast('加载详细信息失败');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [space, showToast]);

  const handleLinkPress = (url: string) => {
    if (url.startsWith('pixory://ip/')) {
      const ipId = parseInt(url.replace('pixory://ip/', ''), 10);
      if (!isNaN(ipId)) {
        onPushRoute({ name: 'ip-detail', ipId, space });
      }
    } else if (url.startsWith('pixory://thread/')) {
      const threadId = url.replace('pixory://thread/', '');
      if (threadId) {
        onPushRoute({ name: 'ai-chat', threadId, space });
      }
    }
  };

  return (
    <AppScreen backgroundColor={DOC_CANVAS} contentStyle={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing[3] }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.text.title} name="arrow-back" size={28} />
        </Pressable>
        <Text style={styles.headerTitle}>详细信息</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.container}>
        {markdown ? (
          <AiMarkdownReader
            readable={{ text: markdown } as any}
            onLinkPress={handleLinkPress}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary.default} />
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
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  pressed: {
    opacity: 0.72,
  },
  headerTitle: {
    ...typography.textStyles.navTitle,
    color: colors.text.title,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 44,
  },
  container: {
    flex: 1,
    backgroundColor: DOC_CANVAS,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

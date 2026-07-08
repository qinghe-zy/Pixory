import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { AiMarkdownReader } from '../components/ai/AiMarkdownReader';
import { generateMilestonesDetailMarkdown } from '../services/milestoneService';
import { useToast } from '../components/AppToast';
import { colors } from '../design/tokens';
import type { PixorySpace } from '../database';

interface MilestonesDetailScreenProps {
  onBack: () => void;
  onPushRoute: (route: any) => void;
  space?: PixorySpace;
  preloadedMarkdown?: string | null;
}

export function MilestonesDetailScreen({ onBack, onPushRoute, space = 'normal', preloadedMarkdown }: MilestonesDetailScreenProps) {
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
    <ScreenScaffold
      backgroundVariant="detail"
      onBack={onBack}
      title="详细信息"
      contentContainerStyle={{ paddingHorizontal: 0, gap: 0 }}
    >
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
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9f5', // match webview background
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

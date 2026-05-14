import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';

interface AiHomeScreenProps {
  footer?: ReactNode;
}

export function AiHomeScreen({ footer }: AiHomeScreenProps) {
  return (
    <ScreenScaffold backgroundVariant="search" decorativeTitle="AI" footer={footer} scrollable title="AI">
      <View style={styles.panel}>
        <View style={styles.iconWrap}>
          <Ionicons color={colors.primary.active} name="chatbubble-ellipses-outline" size={24} />
        </View>
        <PageStateBlock
          emptyDescription="后续会在这里接入每个 IP 的专属聊天、文档知识库和普通对话入口。"
          emptyIconName="sparkles-outline"
          emptyTitle="AI 入口已预留"
          isEmpty
          loading={false}
        >
          <View />
        </PageStateBlock>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.listCardGap,
    padding: spacing[4],
  },
  iconWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
});

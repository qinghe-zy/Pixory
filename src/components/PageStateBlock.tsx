import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { commonButtonCopy, commonErrorCopy } from '../constants/copy';
import { typography } from '../design/tokens';
import { ContentCard } from './ContentCard';
import { EmptyState } from './EmptyState';
import { LoadingTransition } from './LoadingTransition';
import { PrimaryButton } from './PrimaryButton';

interface PageStateBlockProps {
  loading: boolean;
  errorMessage?: string | null;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  emptyIconName?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
  loadingTitle?: string;
  loadingComponent?: ReactNode;
  loadingDescription?: string;
  errorTitle?: string;
  emptyContainerStyle?: StyleProp<ViewStyle>;
}

export function PageStateBlock({
  loading,
  errorMessage,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  emptyIconName,
  children,
  retryLabel = commonButtonCopy.retry,
  onRetry,
  loadingTitle = commonErrorCopy.genericLoadingTitle,
  loadingDescription = '请稍候，这里的内容会在本地数据读取完成后展示。',
  errorTitle = commonErrorCopy.pageUnavailableTitle,
  emptyContainerStyle,
  loadingComponent,
}: PageStateBlockProps) {
  if (loading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    return (
      <View style={styles.loadingWrap}>
        <LoadingTransition description={loadingDescription} title={loadingTitle} />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <ContentCard style={styles.feedbackCard}>
        <Text style={styles.feedbackTitle}>{errorTitle}</Text>
        <Text style={styles.feedbackText}>{errorMessage}</Text>
        {onRetry ? <PrimaryButton label={retryLabel} onPress={onRetry} variant="outline" /> : null}
      </ContentCard>
    );
  }

  if (isEmpty) {
    return (
      <View style={[styles.emptyWrap, emptyContainerStyle]}>
        <EmptyState
          actionLabel={emptyActionLabel}
          description={emptyDescription}
          iconName={emptyIconName}
          onAction={onEmptyAction}
          title={emptyTitle}
        />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 280,
  },
  feedbackCard: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    maxWidth: 320,
    width: '100%',
  },
  feedbackTitle: {
    ...typography.textStyles.emptyTitle,
    textAlign: 'center',
  },
  feedbackText: {
    ...typography.textStyles.emptyDescription,
    textAlign: 'center',
  },
  emptyWrap: {
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
  },
});

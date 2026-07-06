import { StyleSheet, Text, View } from 'react-native';

import type { AiUsageAggregate, AiUsageRound } from '../../ai/aiUsageAnalytics';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiUsageSummaryProps {
  usage: AiUsageAggregate;
  recentTitle?: string;
  showRecent?: boolean;
}

function formatTokenCount(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return String(Math.round(value));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatRoundTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function metricCells(usage: AiUsageAggregate) {
  return [
    { label: '总量', value: formatTokenCount(usage.totalTokens) },
    { label: '缓存', value: formatTokenCount(usage.cachedInputTokens) },
    { label: '命中率', value: formatPercent(usage.cachedTokenRatio) },
    { label: '请求', value: String(usage.observedRequestCount) },
  ];
}

function AiTokenStackBar({
  cached,
  input,
  output,
}: {
  cached: number;
  input: number;
  output: number;
}) {
  const total = cached + input + output;
  if (total <= 0) {
    return <View style={[styles.tokenBarTrack, styles.emptyTokenBar]} />;
  }
  return (
    <View style={styles.tokenBarTrack}>
      {cached > 0 ? <View style={[styles.tokenBarSegment, styles.cachedSegment, { flex: cached }]} /> : null}
      {input > 0 ? <View style={[styles.tokenBarSegment, styles.inputSegment, { flex: input }]} /> : null}
      {output > 0 ? <View style={[styles.tokenBarSegment, styles.outputSegment, { flex: output }]} /> : null}
    </View>
  );
}

function RecentRoundRow({ round }: { round: AiUsageRound }) {
  return (
    <View style={styles.recentRow}>
      <View style={styles.recentCopy}>
        <Text numberOfLines={1} style={styles.recentTitle}>
          {round.providerId} · {round.modelId}
        </Text>
        <Text style={styles.caption}>{formatRoundTime(round.createdAt)}</Text>
      </View>
      <View style={styles.recentNumbers}>
        <Text style={styles.recentValue}>{formatTokenCount(round.totalTokens)}</Text>
        <Text style={styles.caption}>{formatPercent(round.cachedTokenRatio)}</Text>
      </View>
    </View>
  );
}

export function AiUsageSummary({ usage, recentTitle = '最近', showRecent = true }: AiUsageSummaryProps) {
  const cells = metricCells(usage);
  return (
    <View style={styles.container}>
      <View style={styles.metricGrid}>
        {cells.map((cell) => (
          <View key={cell.label} style={styles.metricCell}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.metricValue}>
              {cell.value}
            </Text>
            <Text numberOfLines={1} style={styles.metricLabel}>
              {cell.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.tokenPanel}>
        <AiTokenStackBar
          cached={usage.cachedInputTokens}
          input={usage.nonCachedInputTokens}
          output={usage.completionTokens}
        />
        <View style={styles.legendRow}>
          <Text style={styles.legendCached}>缓存 {formatTokenCount(usage.cachedInputTokens)}</Text>
          <Text style={styles.legendInput}>输入 {formatTokenCount(usage.nonCachedInputTokens)}</Text>
          <Text style={styles.legendOutput}>输出 {formatTokenCount(usage.completionTokens)}</Text>
        </View>
      </View>

      {showRecent && usage.recentRounds.length > 0 ? (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>{recentTitle}</Text>
          <View style={styles.recentList}>
            {usage.recentRounds.map((round) => (
              <RecentRoundRow key={round.id} round={round} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rhythm.cardContentGap,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  metricCell: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: spacing[12],
    minWidth: spacing[12] * 2,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  metricValue: {
    ...typography.textStyles.statNumber,
    color: aiLightColors.ink,
  },
  metricLabel: {
    ...typography.textStyles.statLabel,
    color: aiLightColors.muted,
  },
  tokenPanel: {
    gap: rhythm.microGap,
  },
  tokenBarTrack: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: spacing[2],
    overflow: 'hidden',
  },
  emptyTokenBar: {
    backgroundColor: aiLightColors.card,
  },
  tokenBarSegment: {
    minWidth: spacing[1],
  },
  cachedSegment: {
    backgroundColor: aiLightColors.primary,
  },
  inputSegment: {
    backgroundColor: aiLightColors.primarySoft,
  },
  outputSegment: {
    backgroundColor: aiLightColors.dark,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.inlineGap,
  },
  legendCached: {
    ...typography.textStyles.micro,
    color: aiLightColors.primaryActive,
  },
  legendInput: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
  },
  legendOutput: {
    ...typography.textStyles.micro,
    color: aiLightColors.ink,
  },
  recentSection: {
    gap: rhythm.microGap,
  },
  sectionTitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  recentList: {
    gap: rhythm.microGap,
  },
  recentRow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: spacing[10],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  recentCopy: {
    flex: 1,
    minWidth: 0,
  },
  recentTitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
  },
  recentNumbers: {
    alignItems: 'flex-end',
  },
  recentValue: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
  },
  caption: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
  },
});

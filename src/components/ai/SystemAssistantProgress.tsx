import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SystemTaskSnapshot } from '../../ai/systemAssistant/systemAssistantTypes';
import { getSystemProgressRows, getSystemProgressState, shouldShowSystemProgress } from '../../ai/systemAssistant/systemAssistantPresentation';
import { colors, metrics, rhythm, spacing, typography } from '../../design/tokens';

const toneColor = (tone: string) => tone === 'danger' ? colors.semantic.danger
  : tone === 'success' ? colors.semantic.taskSuccess : colors.text.secondary;

function StatusNode({ tone, busy }: { tone: string; busy: boolean }) {
  const color = toneColor(tone);
  return (
    <View style={styles.node}>
      {busy ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={tone === 'success' ? 'checkmark-circle' : tone === 'danger' ? 'close-circle' : 'ellipse-outline'}
          color={color} size={metrics.iconSizeSm} />}
    </View>
  );
}

export function SystemAssistantProgress({ task, messageStatus, hasAnswer, defaultExpanded = false, onExpandedChange }: {
  task?: SystemTaskSnapshot | null; messageStatus: string; hasAnswer: boolean;
  defaultExpanded?: boolean; onExpandedChange?(expanded: boolean): void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => setExpanded(defaultExpanded), [defaultExpanded]);
  if (!shouldShowSystemProgress(task)) return null;
  const state = getSystemProgressState(task, messageStatus, hasAnswer);
  const rows = getSystemProgressRows(task, state);
  const current = rows.at(-1)!;
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityLabel={current.label}
        accessibilityState={{ expanded, busy: state.busy }}
        onPress={() => { const next = !expanded; setExpanded(next); onExpandedChange?.(next); }}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <StatusNode tone={current.tone} busy={current.busy} />
        <Text numberOfLines={1} style={styles.label}>{current.label}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={colors.text.secondary} size={metrics.iconSizeSm} />
      </Pressable>
      {expanded ? (
        <View style={styles.steps} accessibilityLiveRegion="polite">
          {rows.map((row, index) => (
            <View style={styles.step} key={`${index}:${row.label}`}>
              <View style={styles.track}>
                {index < rows.length - 1 ? <View style={styles.connector} /> : null}
                <StatusNode tone={row.tone} busy={row.busy} />
              </View>
              <Text numberOfLines={2} style={[styles.stepLabel, row.tone === 'danger' && styles.danger]}>{row.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', minWidth: 0 },
  header: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: metrics.minTouchSize,
    flexDirection: 'row', alignItems: 'center', gap: rhythm.microGap },
  node: { width: metrics.iconSizeMd, height: metrics.iconSizeMd, alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.textStyles.caption, flexShrink: 1, color: colors.text.secondary, fontWeight: typography.weight.medium },
  steps: { alignSelf: 'stretch', paddingBottom: spacing[2] },
  step: { flexDirection: 'row', alignItems: 'flex-start', minHeight: spacing[7], gap: rhythm.inlineGap },
  track: { alignSelf: 'stretch', width: metrics.iconSizeMd },
  connector: { position: 'absolute', top: metrics.iconSizeMd, bottom: 0, left: metrics.iconSizeMd / 2,
    width: StyleSheet.hairlineWidth, backgroundColor: colors.border.default },
  stepLabel: { ...typography.textStyles.caption, flex: 1, minWidth: 0, color: colors.text.secondary, paddingBottom: spacing[2] },
  danger: { color: colors.semantic.danger },
  pressed: { opacity: 0.65 },
});

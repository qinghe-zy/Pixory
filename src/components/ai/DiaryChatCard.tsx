import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { diaryThemeAssets } from '../../ai/diary/diaryThemeAssets';
import { beijingDiaryDate, beijingTimeLabel, type DiaryThemeKey } from '../../ai/diary/diaryTypes';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';
import { AiVersionStepper } from './AiVersionStepper';

interface DiaryChatCardProps {
  createdAt: string;
  diaryDate: string;
  themeKey: DiaryThemeKey;
  contextOptIn: boolean | null;
  onOpen: () => void;
  onContextChoice: (accepted: boolean) => void;
  onLongPress: (pageX: number, pageY: number) => void;
  onNextVersion: () => void;
  onPreviousVersion: () => void;
  versionIndex: number;
  versionTotal: number;
}

export function DiaryChatCard({ createdAt, diaryDate, themeKey, contextOptIn, onOpen, onContextChoice, onLongPress, onNextVersion, onPreviousVersion, versionIndex, versionTotal }: DiaryChatCardProps) {
  const isToday = diaryDate === beijingDiaryDate(new Date());
  const label = isToday ? `TODAY · ${beijingTimeLabel(createdAt)}` : diaryDate.replaceAll('-', '.');
  return (
    <View style={styles.host}>
      <Pressable accessibilityRole="button" accessibilityLabel="打开角色日记" delayLongPress={500} onLongPress={(event) => onLongPress(event.nativeEvent.pageX, event.nativeEvent.pageY)} onPress={onOpen} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <ImageBackground imageStyle={styles.image} source={diaryThemeAssets[themeKey].card} style={styles.background}>
          <View style={styles.glass}>
            <Text style={styles.meta}>{label}</Text>
            <Text style={styles.title}>当天日记已生成</Text>
            <Text style={styles.open}>打开</Text>
          </View>
        </ImageBackground>
      </Pressable>
      {versionTotal > 1 ? <AiVersionStepper currentIndex={versionIndex} nextAccessibilityLabel="下一版日记" onNext={onNextVersion} onPrevious={onPreviousVersion} previousAccessibilityLabel="上一版日记" total={versionTotal} /> : null}
      <View style={styles.contextRow}>
        <Text style={styles.contextHint}>是否将该日记纳入上下文？</Text>
        <Pressable onPress={() => onContextChoice(true)}><Text style={[styles.contextAction, contextOptIn === true && styles.contextSelected]}>是</Text></Pressable>
        <Pressable onPress={() => onContextChoice(false)}><Text style={[styles.contextAction, contextOptIn === false && styles.contextSelected]}>否</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { gap: rhythm.microGap, paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  card: { borderRadius: radius.sm, overflow: 'hidden' },
  pressed: { opacity: 0.88 },
  background: { aspectRatio: 2.6, justifyContent: 'flex-end' },
  image: { borderRadius: radius.sm },
  glass: { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.52)', borderTopColor: 'rgba(255,255,255,0.66)', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  meta: { ...typography.textStyles.micro, color: colors.text.secondary, letterSpacing: 0 },
  title: { ...typography.textStyles.caption, color: colors.text.primary, marginTop: 1 },
  open: { ...typography.textStyles.caption, color: colors.primary.default, position: 'absolute', right: spacing[3], top: spacing[3] },
  contextRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[1] },
  contextHint: { ...typography.textStyles.micro, color: colors.text.tertiary },
  contextAction: { ...typography.textStyles.micro, color: colors.text.tertiary },
  contextSelected: { color: colors.primary.default, fontWeight: '600' },
});

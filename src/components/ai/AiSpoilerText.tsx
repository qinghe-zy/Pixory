import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { aiLightColors } from './aiLightTheme';

export function AiSpoilerText({ text, textStyle }: { text: string; textStyle?: any }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Text
      onPress={() => setRevealed(true)}
      style={[textStyle, styles.container, !revealed && styles.hidden]}
    >
      <Text style={!revealed ? styles.hiddenText : undefined}>{text}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hidden: {
    backgroundColor: aiLightColors.mutedSoft,
    color: aiLightColors.mutedSoft,
  },
  hiddenText: {
    opacity: 0,
  },
});

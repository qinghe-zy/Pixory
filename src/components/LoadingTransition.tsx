import { StyleSheet, Text, View } from 'react-native';

import { typography } from '../design/tokens';

interface LoadingTransitionProps {
  title: string;
  description?: string;
}

export function LoadingTransition({ title, description }: LoadingTransitionProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: 10,
    maxWidth: 320,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
  },
  title: {
    ...typography.textStyles.emptyTitle,
    textAlign: 'center',
  },
  description: {
    ...typography.textStyles.emptyDescription,
    textAlign: 'center',
  },
});

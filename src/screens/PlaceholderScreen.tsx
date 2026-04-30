import { StyleSheet, Text } from 'react-native';

import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { Header } from '../components/Header';
import { typography } from '../design/tokens';

interface PlaceholderScreenProps {
  title: string;
  description: string;
  onBack: () => void;
}

export function PlaceholderScreen({ title, description, onBack }: PlaceholderScreenProps) {
  return (
    <AppScreen scrollable>
      <Header onBack={onBack} title={title} />
      <ContentCard>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </ContentCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.textStyles.pageTitle,
  },
  description: {
    ...typography.textStyles.body,
  },
});

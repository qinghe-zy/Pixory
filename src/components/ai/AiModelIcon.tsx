import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Claude, DeepSeek, Gemini, OpenAI, XAI, Zhipu } from '@lobehub/icons-rn';

import type { AiModelIconBrand } from '../../ai/aiModelIconService';
import { aiLightColors } from './aiLightTheme';

interface AiModelIconProps {
  brand: AiModelIconBrand;
  size?: number;
}

/**
 * Renders the official brand SVG icon for a recognized AI model provider.
 * Uses @lobehub/icons-rn for pixel-perfect official brand logos.
 * Falls back to a generic sparkles Ionicon for unrecognized models.
 */
export const AiModelIcon = memo(function AiModelIcon({ brand, size = 22 }: AiModelIconProps) {
  switch (brand) {
    case 'deepseek':
      return <DeepSeek.Color size={size} />;
    case 'openai':
      return <OpenAI size={size} />;
    case 'gemini':
      return <Gemini.Color size={size} />;
    case 'claude':
      return <Claude.Color size={size} />;
    case 'grok':
      return <XAI size={size} />;
    case 'zhipu':
      return <Zhipu.Color size={size} />;
    default:
      return (
        <View style={[styles.fallbackWrap, { width: size, height: size }]}>
          <Ionicons color={aiLightColors.muted} name="sparkles-outline" size={size * 0.8} />
        </View>
      );
  }
});

const styles = StyleSheet.create({
  fallbackWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

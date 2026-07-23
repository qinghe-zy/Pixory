import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

interface LiquidGlassBezelProps {
  radius: number;
  active?: boolean;
  contentIntensity?: 'heavy' | 'light' | 'none';
}

export function LiquidGlassBezel({ radius, active = false, contentIntensity = 'none' }: LiquidGlassBezelProps) {
  return (
    <>
      {contentIntensity !== 'none' && (
        <View pointerEvents="none" style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: contentIntensity === 'heavy' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.2)',
          }
        ]} />
      )}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={active ? ['rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 0.0)'] : ['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.0)']}
          end={{ x: 0.5, y: 0.8 }}
          start={{ x: 0.2, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View pointerEvents="none" style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          borderBottomColor: 'rgba(0, 0, 0, 0.05)',
          borderBottomWidth: 1,
          borderLeftColor: active ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.9)',
          borderLeftWidth: 1.5,
          borderRightColor: 'rgba(0, 0, 0, 0.05)',
          borderRightWidth: 1,
          borderTopColor: active ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 1)',
          borderTopWidth: 2,
        }
      ]} />
    </>
  );
}

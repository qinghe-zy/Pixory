import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radius, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AboutScreenProps {
  onBack: () => void;
  space?: PixorySpace;
}

export function AboutScreen({ onBack, space = 'normal' }: AboutScreenProps) {
  const version = Constants.expoConfig?.version ?? '2.4.6';
  const anims = useRef([...Array(4)].map(() => new Animated.Value(0))).current;
  const logoScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.stagger(
      120,
      anims.map((anim) =>
        Animated.spring(anim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [anims]);

  const handleLogoPressIn = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(logoScale, {
      toValue: 0.96,
      useNativeDriver: true,
    }).start();
  };

  const handleLogoPressOut = () => {
    Animated.spring(logoScale, {
      toValue: 1,
      friction: 4,
      tension: 60,
      useNativeDriver: true,
    }).start();
  };

  const getAnimatedStyle = (index: number, includeScale = false) => {
    const baseTransform: any[] = [
      {
        translateY: anims[index].interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ];

    if (includeScale) {
      baseTransform.push({ scale: logoScale });
    }

    return {
      opacity: anims[index],
      transform: baseTransform,
    };
  };

  return (
    <ScreenScaffold
      backgroundVariant="profile"
      decorativeTitle={space === 'personal' ? 'About Private' : 'About'}
      onBack={onBack}
      scrollable
      title="关于"
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Logo & Version with Haptic Interaction */}
          <Animated.View style={[styles.brandContainer, getAnimatedStyle(0, true)]}>
            <Pressable
              onPressIn={handleLogoPressIn}
              onPressOut={handleLogoPressOut}
              style={styles.brandPressable}
            >
              <Text style={styles.brandName}>Pixory</Text>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>v{version}</Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Slogans */}
          <Animated.View style={[styles.sloganContainer, getAnimatedStyle(1)]}>
            <Text style={styles.englishSlogan}>
              Stories that stay. Companions that grow.
            </Text>
            {/* Elegant Ambient Ornament instead of a dot */}
            <Text style={styles.ornamentStar}>✦</Text>
            <Text style={styles.chineseSlogan}>
              故事不会走散，陪伴与日生长。
            </Text>
          </Animated.View>

          {/* Philosophy / Info */}
          <Animated.View style={[styles.philosophyContainer, getAnimatedStyle(2)]}>
            <Text style={styles.philosophyText}>
              Pixory 致力于提供一个安全、私密且长久的陪伴空间。
            </Text>
            <Text style={styles.philosophyText}>
              在这里，您的所有记忆、角色卡片及故事素材，
              都经过精心守护并安放于本地。
            </Text>
            <Text style={styles.philosophyTextHighlight}>
              确保每一段故事，只属于您自己。
            </Text>
          </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View style={[styles.footer, getAnimatedStyle(3)]}>
          <Text style={styles.copyrightText}>
            © {new Date().getFullYear()} Pixory. All Rights Reserved.
          </Text>
        </Animated.View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[12],
    paddingBottom: spacing[12],
  },
  content: {
    alignItems: 'center',
  },
  brandContainer: {
    marginBottom: spacing[12],
  },
  brandPressable: {
    alignItems: 'center',
  },
  brandName: {
    ...typography.textStyles.brandLogo,
    fontSize: 64,
    lineHeight: 72,
    color: colors.text.title,
    letterSpacing: -1.5,
  },
  versionBadge: {
    marginTop: spacing[3],
    backgroundColor: 'rgba(0,0,0,0.03)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.pill,
  },
  versionText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    letterSpacing: 1,
  },
  sloganContainer: {
    alignItems: 'center',
    marginBottom: spacing[12],
    width: '100%',
  },
  englishSlogan: {
    ...typography.textStyles.body,
    color: colors.text.placeholder,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  ornamentStar: {
    fontSize: 14,
    color: colors.text.placeholder,
    marginVertical: spacing[5],
    opacity: 0.6,
  },
  chineseSlogan: {
    ...typography.textStyles.cardTitle,
    color: colors.text.heading,
    textAlign: 'center',
    letterSpacing: 3,
  },
  philosophyContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing[2],
    gap: spacing[4],
  },
  philosophyText: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
    lineHeight: 26,
    textAlign: 'center',
  },
  philosophyTextHighlight: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
    lineHeight: 26,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: spacing[12],
  },
  copyrightText: {
    ...typography.textStyles.micro,
    color: colors.text.placeholder,
  },
});

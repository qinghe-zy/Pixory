import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Linking, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';

import * as Updates from 'expo-updates';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { useToast } from '../components/AppToast';
import { checkForAppUpdate } from '../services/updateCheckService';
import { colors, radius, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AboutScreenProps {
  onBack: () => void;
  space?: PixorySpace;
}

export function AboutScreen({ onBack, space = 'normal' }: AboutScreenProps) {
  const { showToast } = useToast();
  const version = Constants.expoConfig?.version ?? '2.5.2';

  // Logo Interaction
  const logoScale = useSharedValue(1);
  const handleLogoPressIn = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logoScale.value = 0.95;
  };
  const handleLogoPressOut = () => {
    logoScale.value = 1;
  };
  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(logoScale.value, { damping: 14, stiffness: 200 }) }],
  }));

  // Ethereal Breathing Animation for the Botanical Watermark
  const floatY = useSharedValue(0);
  const rotateZ = useSharedValue(0);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-12, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        withTiming(12, { duration: 4000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    rotateZ.value = withRepeat(
      withSequence(
        withTiming(2, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
        withTiming(-2, { duration: 6000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);

  const animatedWatermarkStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatY.value },
      { rotate: `${rotateZ.value}deg` },
    ],
  }));

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleCheckOta = async () => {
    try {
      showToast('正在检查热更新...');
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        showToast('发现新热更新，正在下载...');
        await Updates.fetchUpdateAsync();
        showToast({
          message: '热更新下载完毕，即将重启应用',
          durationMs: 2000,
        });
        setTimeout(() => Updates.reloadAsync(), 2000);
      } else {
        showToast('当前已是最新代码');
      }
    } catch (error) {
      showToast('热更新检查失败或未配置');
    }
  };

  const handleCheckVersion = async () => {
    try {
      showToast('正在检查版本更新...');
      const info = await checkForAppUpdate();
      if (info) {
        showToast(`发现新版本 v${info.version}，正在前往下载`);
        setTimeout(() => openUrl(info.downloadUrl), 1000);
      } else {
        showToast('当前已是最新版本');
      }
    } catch (error) {
      showToast('版本更新检查失败');
    }
  };

  const Crosshair = ({ position }: { position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }) => (
    <View style={[styles.crosshair, styles[position]]}>
      <View style={styles.crosshairH} />
      <View style={styles.crosshairV} />
    </View>
  );

  return (
    <ScreenScaffold
      backgroundVariant="profile"
      decorativeTitle={space === 'personal' ? 'About Private' : 'About'}
      onBack={onBack}
      scrollable
      title="关于"
    >
      <View style={styles.container}>
        {/* The Ethereal Botanical Specimen */}
        <Animated.View
          entering={FadeIn.duration(2000).delay(200)}
          pointerEvents="none"
          style={[styles.watermarkContainer, animatedWatermarkStyle]}
        >
          <Image
            source={require('../../assets/backgrounds/japanese-fresh/elements/botanical-branch.png')}
            style={styles.botanicalImage}
          />
        </Animated.View>

        <View style={styles.content}>
          {/* Gallery Placard (Glass Panel) */}
          <Animated.View
            entering={FadeInUp.delay(100).duration(800).springify()}
            style={styles.placard}
          >
            <Crosshair position="topLeft" />
            <Crosshair position="topRight" />
            <Crosshair position="bottomLeft" />
            <Crosshair position="bottomRight" />

            <View style={styles.placardInner}>
              <Text style={styles.eyebrowText}>
                STORIES THAT STAY. COMPANIONS THAT GROW.
              </Text>

              <Pressable
                onPressIn={handleLogoPressIn}
                onPressOut={handleLogoPressOut}
                style={styles.brandPressable}
              >
                <Animated.View style={animatedLogoStyle}>
                  <Text style={styles.brandName}>Pixory</Text>
                </Animated.View>
                <View style={styles.versionBadge}>
                  <Text style={styles.versionText}>v{version}</Text>
                </View>
              </Pressable>

              <View style={styles.editorialContainer}>
                <View style={styles.quoteBorder} />
                <View style={styles.editorialContent}>
                  <Text style={styles.chineseSlogan}>
                    故事不会走散，{'\n'}陪伴与日生长。
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Spacer to push links down */}
          <View style={styles.spacer} />

          {/* Interactive Links Container */}
          <Animated.View
            entering={FadeInUp.delay(350).duration(800).springify()}
            style={styles.linksContainer}
          >
            <Pressable
              onPress={() => openUrl('https://mist01.com')}
              style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            >
              <View style={styles.linkIconWrapper}>
                <Feather color={colors.primary.dark} name="globe" size={18} />
              </View>
              <Text style={styles.linkText}>访问官方网站</Text>
              <Feather color={colors.text.placeholder} name="arrow-up-right" size={16} style={styles.linkIconTrailing} />
            </Pressable>

            <View style={styles.linkSeparator} />

            <Pressable
              onPress={() => openUrl('https://github.com/qinghe-zy/Pixory')}
              style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            >
              <View style={styles.linkIconWrapper}>
                <Feather color={colors.primary.dark} name="github" size={18} />
              </View>
              <Text style={styles.linkText}>GitHub 源码仓库</Text>
              <Feather color={colors.text.placeholder} name="arrow-up-right" size={16} style={styles.linkIconTrailing} />
            </Pressable>

            <View style={styles.linkSeparator} />

            <Pressable
              onPress={handleCheckOta}
              style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            >
              <View style={styles.linkIconWrapper}>
                <Feather color={colors.primary.dark} name="refresh-cw" size={18} />
              </View>
              <Text style={styles.linkText}>检查热更新</Text>
              <Feather color={colors.text.placeholder} name="arrow-right" size={16} style={styles.linkIconTrailing} />
            </Pressable>

            <View style={styles.linkSeparator} />

            <Pressable
              onPress={handleCheckVersion}
              style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
            >
              <View style={styles.linkIconWrapper}>
                <Feather color={colors.primary.dark} name="download-cloud" size={18} />
              </View>
              <Text style={styles.linkText}>检查版本更新</Text>
              <Feather color={colors.text.placeholder} name="arrow-right" size={16} style={styles.linkIconTrailing} />
            </Pressable>
          </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View
          entering={FadeInDown.delay(500).duration(800).springify()}
          style={styles.footer}
        >
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
    flex: 1,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[8],
    paddingBottom: spacing[12],
    position: 'relative',
    overflow: 'hidden',
    minHeight: 700, // Ensure it stretches nicely on short screens
  },
  watermarkContainer: {
    position: 'absolute',
    top: -80,
    right: -120,
    zIndex: -1,
  },
  botanicalImage: {
    width: 600,
    height: 600,
    resizeMode: 'contain',
    tintColor: colors.primary.default,
    opacity: 0.05,
    transform: [{ rotate: '-15deg' }],
  },
  content: {
    flex: 1,
    alignItems: 'center', // Center the placard itself
  },
  /* --- Gallery Placard Styles --- */
  placard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 2, // Sharp editorial edge
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    padding: spacing[8],
    position: 'relative',
    shadowColor: colors.primary.dark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.03,
    shadowRadius: 32,
    elevation: 0,
  },
  placardInner: {
    alignItems: 'flex-start',
  },
  crosshair: {
    position: 'absolute',
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 12,
    height: 1,
    backgroundColor: colors.text.placeholder,
    opacity: 0.4,
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: 12,
    backgroundColor: colors.text.placeholder,
    opacity: 0.4,
  },
  topLeft: { top: 8, left: 8 },
  topRight: { top: 8, right: 8 },
  bottomLeft: { bottom: 8, left: 8 },
  bottomRight: { bottom: 8, right: 8 },
  /* ------------------------------- */
  eyebrowText: {
    ...typography.textStyles.micro,
    fontFamily: undefined,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing[12],
    opacity: 0.7,
  },
  brandPressable: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing[12],
    gap: spacing[4],
  },
  brandName: {
    ...typography.textStyles.brandLogo,
    fontSize: 56,
    color: colors.text.title,
    letterSpacing: -1,
  },
  versionBadge: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  versionText: {
    ...typography.textStyles.micro,
    fontFamily: undefined,
    color: colors.text.secondary,
    letterSpacing: 0.5,
  },
  editorialContainer: {
    flexDirection: 'row',
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  quoteBorder: {
    width: 2,
    backgroundColor: colors.primary.light,
    borderRadius: 2,
    marginRight: spacing[5],
    opacity: 0.7,
  },
  editorialContent: {
    flex: 1,
    justifyContent: 'center',
  },
  chineseSlogan: {
    ...typography.textStyles.cardTitle,
    fontSize: 20,
    lineHeight: 34,
    color: colors.text.primary,
    textAlign: 'left',
    letterSpacing: 2.5,
  },
  spacer: {
    flex: 1,
    minHeight: spacing[8],
  },
  /* --- Links Container --- */
  linksContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: radius.xxl,
    paddingVertical: spacing[2],
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: colors.primary.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.02,
    shadowRadius: 24,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
  },
  linkButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  linkIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFF',
    marginRight: spacing[4],
  },
  linkText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
    flex: 1,
    letterSpacing: 0.5,
  },
  linkIconTrailing: {
    opacity: 0.4,
  },
  linkSeparator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.03)',
    marginHorizontal: spacing[5],
  },
  /* --- Footer --- */
  footer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: spacing[12],
  },
  copyrightText: {
    ...typography.textStyles.micro,
    fontFamily: undefined,
    color: colors.text.placeholder,
    letterSpacing: 0.5,
  },
});

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { RegenerateIcon } from '../components/ai/AiMessageActionIcons';
import type {
  PixorySpace,
  TypographyGear,
} from '../database';
import { colors, rhythm, spacing, typography } from '../design/tokens';
import {
  AI_CHAT_FONT_SIZE_CONFIGS,
  AI_CHAT_LETTER_SPACING_CONFIGS,
  AI_CHAT_LINE_HEIGHT_CONFIGS,
  AI_CHAT_PARAGRAPH_SPACING_CONFIGS,
  useChatAppearancePreferences,
  useChatTypographyPreferences,
  useProfileInfoPreferences,
} from '../services/aiChatPreferences';

interface ChatAppearanceSettingsScreenProps {
  onBack: () => void;
  space: PixorySpace;
}

const PRESET_COLOR_SWATCHES = [
  { label: '微信绿', hex: '#95EC69', textHex: '#000000' },
  { label: '纯净白', hex: '#FFFFFF', textHex: '#0F172A' },
  { label: '经典浅灰', hex: '#F1F5F9', textHex: '#0F172A' },
  { label: '冰川雾蓝', hex: '#DCEBFA', textHex: '#1E3A8A' },
  { label: '薰衣草紫', hex: '#EDE9FE', textHex: '#5B21B6' },
  { label: '薄荷淡青', hex: '#D1FAE5', textHex: '#065F46' },
  { label: '暖阳淡橙', hex: '#FFEDD5', textHex: '#9A3412' },
] as const;

const TYPOGRAPHY_GEAR_KEYS: readonly TypographyGear[] = [
  'gear_1',
  'gear_2',
  'gear_3',
  'gear_4',
  'gear_5',
] as const;

const TYPOGRAPHY_GLOBAL_GEAR_META: Record<
  TypographyGear,
  { label: string; sub: string }
> = {
  gear_1: { label: '紧致', sub: '13.5px' },
  gear_2: { label: '标准', sub: '15px·默认' },
  gear_3: { label: '适中', sub: '16px' },
  gear_4: { label: '舒适', sub: '17.5px' },
  gear_5: { label: '宽裕', sub: '19px' },
};

const GEAR_LABELS: Record<TypographyGear, string> = {
  gear_1: '1档',
  gear_2: '2档·默认',
  gear_3: '3档',
  gear_4: '4档',
  gear_5: '5档',
};

/** 触控滑杆组件 */
function TouchSlider({
  min,
  max,
  value,
  onChange,
  landmarks,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
  landmarks: { value: number; label: string }[];
}) {
  const [trackWidth, setTrackWidth] = useState(240);
  const trackRef = useRef<View>(null);

  const calculateValueFromPageX = useCallback(
    (pageX: number) => {
      trackRef.current?.measure((_x, _y, width, _height, pageXOffset) => {
        if (width <= 0) return;
        const relativeX = Math.max(0, Math.min(width, pageX - pageXOffset));
        const ratio = relativeX / width;
        const nextVal = Math.round(min + ratio * (max - min));
        onChange(nextVal);
      });
    },
    [min, max, onChange]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          calculateValueFromPageX(evt.nativeEvent.pageX);
        },
        onPanResponderMove: (evt) => {
          calculateValueFromPageX(evt.nativeEvent.pageX);
        },
      }),
    [calculateValueFromPageX]
  );

  const fillPercentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <View style={styles.sliderContainer}>
      <View
        ref={trackRef}
        style={styles.sliderTrack}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={[styles.sliderFill, { width: `${fillPercentage}%` }]} />
        <View
          style={[
            styles.sliderThumb,
            { left: Math.max(0, Math.min(trackWidth - 24, (fillPercentage / 100) * trackWidth - 12)) },
          ]}
        />
      </View>

      {/* 地标快捷选择 */}
      <View style={styles.landmarkRow}>
        {landmarks.map((mark) => {
          const isSelected = value === mark.value;
          return (
            <Pressable
              key={mark.value}
              onPress={() => onChange(mark.value)}
              style={[
                styles.landmarkPill,
                isSelected ? styles.landmarkPillActive : styles.landmarkPillInactive,
              ]}
            >
              <Text
                style={[
                  styles.landmarkPillText,
                  isSelected && styles.landmarkPillTextActive,
                ]}
              >
                {mark.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ChatAppearanceSettingsScreen({
  onBack,
  space,
}: ChatAppearanceSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { avatarUri: profileAvatarUri } = useProfileInfoPreferences(space);
  const {
    avatarRadius,
    bubbleRadius,
    userBubbleColor,
    setChatAvatarRadius,
    setChatBubbleRadius,
    setChatUserBubbleColor,
  } = useChatAppearancePreferences(space);

  const {
    fontSizeGear,
    letterSpacingGear,
    lineHeightGear,
    paragraphSpacingGear,
    fontSize,
    letterSpacing,
    lineHeight,
    paragraphSpacing,
    updateTypographyGear,
    applyMasterTypographyGear,
  } = useChatTypographyPreferences(space);

  const [customHexInput, setCustomHexInput] = useState(userBubbleColor);
  const [isAppearanceExpanded, setIsAppearanceExpanded] = useState(true);
  const [isFineTuneExpanded, setIsFineTuneExpanded] = useState(false);

  // 判定当前是否所有排版项处于同一全局档位
  const currentGlobalGear: TypographyGear | null = useMemo(() => {
    if (
      fontSizeGear === lineHeightGear &&
      fontSizeGear === letterSpacingGear &&
      fontSizeGear === paragraphSpacingGear
    ) {
      return fontSizeGear;
    }
    return null;
  }, [fontSizeGear, letterSpacingGear, lineHeightGear, paragraphSpacingGear]);

  const handleApplyGlobalGear = (gear: TypographyGear) => {
    applyMasterTypographyGear(gear);
  };

  const handleResetTypography = () => {
    applyMasterTypographyGear('gear_2');
  };

  // 气泡圆角地标提示
  const getBubbleRadiusHint = (r: number) => {
    if (r === 14) return '14dp · 微信风格';
    if (r === 8) return '8dp · 利落微弧';
    if (r === 18) return '18dp · 饱满圆润';
    if (r === 24) return '24dp · 胶囊曲率';
    return `${r}dp`;
  };

  // 头像圆角地标提示
  const getAvatarRadiusHint = (r: number) => {
    if (r === 6) return '6dp · 微信风格';
    if (r === 0) return '0dp · 方形硬朗';
    if (r === 12) return '12dp · 柔和圆角';
    if (r === 20) return '20dp · 纯圆';
    return `${r}dp`;
  };

  return (
    <ScreenScaffold
      backgroundColor="#F9F9F9"
      contentContainerStyle={styles.scrollContent}
      fullScreen
      onBack={onBack}
      scrollable
      showHeader={false}
    >
      {/* 紧凑型内联导航栏（与状态栏同色一体，收窄高度） */}
      <View style={[styles.compactHeader, { paddingTop: insets.top + 4 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.compactBackBtn}
        >
          <Ionicons color={colors.text.primary} name="chevron-back" size={24} />
        </Pressable>
        <Text style={styles.compactHeaderTitle}>聊天视觉定制</Text>
        <View style={styles.compactHeaderSpacer} />
      </View>

      <View style={styles.container}>
        {/* 顶部自适应纯白拟真聊天视口（用户在上、AI在下，免滚动看全） */}
        <View style={styles.previewSection}>
          <View style={styles.previewHeaderRow}>
            <Text style={styles.sectionHeader}>拟真聊天预览视口</Text>
            <Text style={styles.previewSubtitle}>实时反映气泡颜色、圆角与排版尺寸</Text>
          </View>
          <View style={styles.previewCard}>
            {/* 消息 1：用户在上（只发 1 行，右侧展示用户真实头像） */}
            <View style={styles.previewUserRow}>
              <View
                style={[
                  styles.previewUserBubble,
                  {
                    backgroundColor: userBubbleColor,
                    borderRadius: bubbleRadius,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.previewUserText,
                    {
                      fontSize,
                      lineHeight,
                      letterSpacing,
                      color:
                        userBubbleColor.toLowerCase() === '#95ec69'
                          ? '#000000'
                          : userBubbleColor.toLowerCase() === '#ffffff'
                          ? '#0F172A'
                          : '#0F172A',
                    },
                  ]}
                >
                  帮我整理今天新导入的照片素材。
                </Text>
              </View>
              <View style={[styles.previewUserAvatar, { borderRadius: avatarRadius }]}>
                {profileAvatarUri ? (
                  <Image
                    source={{ uri: profileAvatarUri }}
                    style={[styles.previewAvatarImage, { borderRadius: avatarRadius }]}
                  />
                ) : (
                  <Ionicons color="#FFFFFF" name="person" size={17} />
                )}
              </View>
            </View>

            {/* 消息 2：系统管家在下（回复 2 行，左侧展示管家头像） */}
            <View style={styles.previewAssistantRow}>
              <Image
                source={require('../../assets/ai_system_avatar.png')}
                style={[
                  styles.previewAvatar,
                  { borderRadius: avatarRadius },
                ]}
              />
              <View style={styles.previewAssistantBody}>
                <Text style={styles.previewSenderName}>系统管家</Text>
                <View style={styles.previewAssistantBubble}>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.previewAssistantText,
                      {
                        fontSize,
                        lineHeight,
                        letterSpacing,
                      },
                    ]}
                  >
                    {"已为你按拍摄时间整理完毕，\n你可以随时在画板中查看或引用。"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 气泡与头像风格定制（支持一键整体收起/展开） */}
        <View style={styles.categorySection}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionHeader}>气泡与头像外观定制</Text>
            <Pressable
              hitSlop={8}
              onPress={() => setIsAppearanceExpanded((prev) => !prev)}
              style={styles.expandToggleBtn}
            >
              <Text style={styles.expandToggleText}>
                {isAppearanceExpanded ? '收起外观' : '展开外观'}
              </Text>
              <Ionicons
                color="#2563EB"
                name={isAppearanceExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
              />
            </Pressable>
          </View>

          {isAppearanceExpanded ? (
            <View style={styles.insetCard}>
              {/* 1. 用户气泡颜色 */}
              <Text style={styles.subItemTitle}>用户气泡颜色</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.swatchesScroll}
              >
                {PRESET_COLOR_SWATCHES.map((swatch) => {
                  const isSelected =
                    userBubbleColor.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <Pressable
                      key={swatch.hex}
                      onPress={() => {
                        setChatUserBubbleColor(swatch.hex);
                        setCustomHexInput(swatch.hex);
                      }}
                      style={[
                        styles.swatchItem,
                        isSelected && styles.swatchItemActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.swatchCircle,
                          { backgroundColor: swatch.hex },
                          swatch.hex === '#FFFFFF' && styles.swatchCircleBorder,
                        ]}
                      >
                        {isSelected ? (
                          <Ionicons
                            color={swatch.textHex}
                            name="checkmark"
                            size={18}
                          />
                        ) : null}
                      </View>
                      <Text style={styles.swatchLabel}>{swatch.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.customColorRow}>
                <Text style={styles.customColorLabel}>自定义 Hex 色值：</Text>
                <TextInput
                  autoCapitalize="characters"
                  maxLength={9}
                  onChangeText={(text) => {
                    setCustomHexInput(text);
                    if (/^#[0-9A-Fa-f]{6}$/.test(text)) {
                      setChatUserBubbleColor(text);
                    }
                  }}
                  placeholder="#95EC69"
                  style={styles.customColorInput}
                  textAlignVertical="center"
                  value={customHexInput}
                />
              </View>

              <View style={styles.innerDivider} />

              {/* 2. 气泡圆角 */}
              <View style={styles.subHeaderRow}>
                <Text style={styles.subItemTitle}>气泡圆角</Text>
                <Text style={styles.currentSpecValue}>
                  {getBubbleRadiusHint(bubbleRadius)}
                </Text>
              </View>
              <TouchSlider
                landmarks={[
                  { value: 8, label: '利落 8dp' },
                  { value: 14, label: '微信 14dp' },
                  { value: 18, label: '饱满 18dp' },
                  { value: 24, label: '胶囊 24dp' },
                ]}
                max={28}
                min={4}
                onChange={(val) => setChatBubbleRadius(val)}
                value={bubbleRadius}
              />

              <View style={styles.innerDivider} />

              {/* 3. 聊天头像圆角 */}
              <View style={styles.subHeaderRow}>
                <Text style={styles.subItemTitle}>聊天头像圆角</Text>
                <Text style={styles.currentSpecValue}>
                  {getAvatarRadiusHint(avatarRadius)}
                </Text>
              </View>
              <TouchSlider
                landmarks={[
                  { value: 0, label: '方形 0dp' },
                  { value: 6, label: '微信 6dp' },
                  { value: 12, label: '柔和 12dp' },
                  { value: 20, label: '纯圆 20dp' },
                ]}
                max={20}
                min={0}
                onChange={(val) => setChatAvatarRadius(val)}
                value={avatarRadius}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setIsAppearanceExpanded(true)}
              style={[styles.insetCard, styles.collapsedBar]}
            >
              <View style={styles.collapsedBarLeft}>
                <View style={[styles.miniColorDot, { backgroundColor: userBubbleColor }]} />
                <Text style={styles.collapsedBarText}>
                  气泡 {bubbleRadius}dp · 头像 {avatarRadius}dp
                </Text>
              </View>
              <View style={styles.collapsedBarRight}>
                <Text style={styles.collapsedBarHint}>轻触展开微调</Text>
                <Ionicons color="#64748B" name="chevron-down" size={14} />
              </View>
            </Pressable>
          )}
        </View>

        {/* 模块 4：文本排版定制 (默认第 2 档标准) */}
        <View style={styles.categorySection}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionHeader}>聊天正文排版（5档切换）</Text>
            <Pressable
              hitSlop={8}
              onPress={handleResetTypography}
              style={styles.resetButton}
            >
              <RegenerateIcon color="#3B82F6" size={13} />
              <Text style={styles.resetButtonText}>恢复默认标准</Text>
            </Pressable>
          </View>

          {/* 一键全局档位选择器 */}
          <View style={styles.insetCard}>
            <View style={styles.globalGearRow}>
              {TYPOGRAPHY_GEAR_KEYS.map((gearKey) => {
                const isSelected = currentGlobalGear === gearKey;
                const meta = TYPOGRAPHY_GLOBAL_GEAR_META[gearKey];
                return (
                  <Pressable
                    key={gearKey}
                    onPress={() => handleApplyGlobalGear(gearKey)}
                    style={[
                      styles.globalGearTile,
                      isSelected
                        ? styles.globalGearTileActive
                        : styles.globalGearTileInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.globalGearLabel,
                        isSelected && styles.globalGearTextActive,
                      ]}
                    >
                      {meta.label}
                    </Text>
                    <Text
                      style={[
                        styles.globalGearSub,
                        isSelected && styles.globalGearTextActive,
                      ]}
                    >
                      {meta.sub}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 展开独立微调 */}
            <Pressable
              onPress={() => setIsFineTuneExpanded((prev) => !prev)}
              style={styles.fineTuneExpandRow}
            >
              <Text style={styles.fineTuneExpandTitle}>字号、行距、字距与段间距单项微调</Text>
              <Ionicons
                color="#64748B"
                name={isFineTuneExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
              />
            </Pressable>

            {isFineTuneExpanded ? (
              <View style={styles.fineTuneDetails}>
                {/* 1. 字号 */}
                <View style={styles.dimensionSection}>
                  <View style={styles.dimensionHeader}>
                    <Text style={styles.dimensionTitle}>正文字号 (Font Size)</Text>
                    <Text style={styles.dimensionCurrent}>
                      {`${AI_CHAT_FONT_SIZE_CONFIGS[fontSizeGear]}px`}
                    </Text>
                  </View>
                  <View style={styles.gearPillRow}>
                    {TYPOGRAPHY_GEAR_KEYS.map((k) => {
                      const active = fontSizeGear === k;
                      return (
                        <Pressable
                          key={k}
                          onPress={() => updateTypographyGear('fontSizeGear', k)}
                          style={[
                            styles.subGearPill,
                            active && styles.subGearPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subGearPillText,
                              active && styles.subGearPillTextActive,
                            ]}
                          >
                            {GEAR_LABELS[k]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* 2. 行距 */}
                <View style={styles.dimensionSection}>
                  <View style={styles.dimensionHeader}>
                    <Text style={styles.dimensionTitle}>正文行距 (Line Height)</Text>
                    <Text style={styles.dimensionCurrent}>
                      {`${AI_CHAT_LINE_HEIGHT_CONFIGS[lineHeightGear]}px`}
                    </Text>
                  </View>
                  <View style={styles.gearPillRow}>
                    {TYPOGRAPHY_GEAR_KEYS.map((k) => {
                      const active = lineHeightGear === k;
                      return (
                        <Pressable
                          key={k}
                          onPress={() => updateTypographyGear('lineHeightGear', k)}
                          style={[
                            styles.subGearPill,
                            active && styles.subGearPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subGearPillText,
                              active && styles.subGearPillTextActive,
                            ]}
                          >
                            {GEAR_LABELS[k]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* 3. 字距 */}
                <View style={styles.dimensionSection}>
                  <View style={styles.dimensionHeader}>
                    <Text style={styles.dimensionTitle}>字符间距 (Letter Spacing)</Text>
                    <Text style={styles.dimensionCurrent}>
                      {`${AI_CHAT_LETTER_SPACING_CONFIGS[letterSpacingGear]}px`}
                    </Text>
                  </View>
                  <View style={styles.gearPillRow}>
                    {TYPOGRAPHY_GEAR_KEYS.map((k) => {
                      const active = letterSpacingGear === k;
                      return (
                        <Pressable
                          key={k}
                          onPress={() => updateTypographyGear('letterSpacingGear', k)}
                          style={[
                            styles.subGearPill,
                            active && styles.subGearPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subGearPillText,
                              active && styles.subGearPillTextActive,
                            ]}
                          >
                            {GEAR_LABELS[k]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* 4. 段间距 */}
                <View style={styles.dimensionSection}>
                  <View style={styles.dimensionHeader}>
                    <Text style={styles.dimensionTitle}>段落间距 (Paragraph Gap)</Text>
                    <Text style={styles.dimensionCurrent}>
                      {`${AI_CHAT_PARAGRAPH_SPACING_CONFIGS[paragraphSpacingGear]}dp`}
                    </Text>
                  </View>
                  <View style={styles.gearPillRow}>
                    {TYPOGRAPHY_GEAR_KEYS.map((k) => {
                      const active = paragraphSpacingGear === k;
                      return (
                        <Pressable
                          key={k}
                          onPress={() => updateTypographyGear('paragraphSpacingGear', k)}
                          style={[
                            styles.subGearPill,
                            active && styles.subGearPillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subGearPillText,
                              active && styles.subGearPillTextActive,
                            ]}
                          >
                            {GEAR_LABELS[k]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
  },
  // ── 紧凑型顶部导航栏 ──
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  compactBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  compactHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  compactHeaderSpacer: {
    width: 36,
  },
  container: {
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    gap: rhythm.listCardGap,
  },
  sectionHeader: {
    ...typography.textStyles.caption,
    fontWeight: '600',
    color: colors.text.secondary,
    paddingHorizontal: spacing[3],
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[3],
  },
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  expandToggleText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  currentSpecValue: {
    ...typography.textStyles.caption,
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  categorySection: {
    gap: 6,
  },
  insetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 8,
    padding: spacing[3],
    gap: spacing[2],
  },
  // ── 顶部纯白拟真聊天视口（用户在上、AI在下） ──
  previewSection: {
    gap: 6,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[3],
  },
  previewSubtitle: {
    ...typography.textStyles.micro,
    fontSize: 11,
    color: colors.text.tertiary,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginHorizontal: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  previewUserRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 10,
  },
  previewUserBubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewUserText: {
    fontFamily: typography.family.base,
    fontWeight: '400',
  },
  previewUserAvatar: {
    width: 34,
    height: 34,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAvatarImage: {
    width: 34,
    height: 34,
  },
  previewAssistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  previewAvatar: {
    width: 34,
    height: 34,
    backgroundColor: '#F1F5F9',
  },
  previewAssistantBody: {
    flex: 1,
  },
  previewSenderName: {
    ...typography.textStyles.micro,
    fontSize: 11,
    color: '#64748B',
    marginBottom: 3,
  },
  previewAssistantBubble: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  previewAssistantText: {
    color: '#1E293B',
    fontFamily: typography.family.base,
  },
  // ── 外观子项样式 ──
  subItemTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  innerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  collapsedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  collapsedBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  collapsedBarText: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '500',
  },
  collapsedBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collapsedBarHint: {
    fontSize: 12,
    color: '#64748B',
  },
  // ── 色卡滚动区 ──
  swatchesScroll: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  swatchItem: {
    alignItems: 'center',
    gap: 4,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  swatchItemActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#F0F9FF',
  },
  swatchCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  swatchCircleBorder: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  swatchLabel: {
    ...typography.textStyles.micro,
    fontSize: 11,
    color: colors.text.primary,
  },
  wechatBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  wechatBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#15803D',
  },
  customColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  customColorLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontSize: 12.5,
  },
  customColorInput: {
    width: 96,
    height: 32,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontSize: 12,
    fontFamily: typography.family.mono,
    color: colors.text.primary,
  },
  // ── 滑杆组件 ──
  sliderContainer: {
    gap: 10,
    paddingVertical: 4,
  },
  sliderTrack: {
    height: 28,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    position: 'relative',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  sliderFill: {
    height: 28,
    backgroundColor: '#DBEAFE',
    borderRadius: 14,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  landmarkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  landmarkPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  landmarkPillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#3B82F6',
  },
  landmarkPillInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  landmarkPillText: {
    ...typography.textStyles.micro,
    fontSize: 10.5,
    color: colors.text.secondary,
  },
  landmarkPillTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  // ── 排版 5 档与联动 ──
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  resetButtonText: {
    ...typography.textStyles.caption,
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  globalGearRow: {
    flexDirection: 'row',
    gap: 6,
  },
  globalGearTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 2,
  },
  globalGearTileActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#3B82F6',
  },
  globalGearTileInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  globalGearLabel: {
    ...typography.textStyles.body,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text.primary,
  },
  globalGearSub: {
    ...typography.textStyles.micro,
    fontSize: 9.5,
    color: colors.text.tertiary,
  },
  globalGearTextActive: {
    color: '#2563EB',
  },
  fineTuneExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  fineTuneExpandTitle: {
    ...typography.textStyles.caption,
    fontSize: 12,
    color: '#64748B',
  },
  fineTuneDetails: {
    gap: 12,
    paddingTop: 8,
  },
  dimensionSection: {
    gap: 6,
  },
  dimensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dimensionTitle: {
    ...typography.textStyles.caption,
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: '500',
  },
  dimensionCurrent: {
    ...typography.textStyles.caption,
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '600',
  },
  gearPillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  subGearPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subGearPillActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  subGearPillText: {
    fontSize: 10.5,
    color: colors.text.secondary,
  },
  subGearPillTextActive: {
    color: '#1E40AF',
    fontWeight: '700',
  },
});

import { useCallback, useEffect, useState } from 'react';
import {
  runWithDatabaseSpace,
  settingsRepository,
  type AiSidebarSpatialPreset,
  type AiSidebarStyleMode,
  type AiStreamingPacingMode,
  type PixorySpace,
  type ProfilePageStyleMode,
  type TypographyGear,
} from '../database';

export interface AiSidebarSpatialPresetConfig {
  key: AiSidebarSpatialPreset;
  shortLabel: string;
  title: string;
  badge?: string;
  description: string;
  scale: number;
  perspective: number;
  tiltDeg: number;
  liftY: number;
  previewScale: number;
  previewPerspective: number;
  previewTiltDeg: number;
  previewLiftY: number;
}

export const AI_SIDEBAR_SPATIAL_PRESET_CONFIGS: Record<
  AiSidebarSpatialPreset,
  AiSidebarSpatialPresetConfig
> = {
  level_1: {
    key: 'level_1',
    shortLabel: '1档 · 平面',
    title: '0° 纯平悬浮',
    description: '完全无 3D 透视倾角，纯 2D 平面等比缩放卡片',
    scale: 0.92,
    perspective: 0,
    tiltDeg: 0,
    liftY: -2,
    previewScale: 0.91,
    previewPerspective: 0,
    previewTiltDeg: 0,
    previewLiftY: -1,
  },
  level_2: {
    key: 'level_2',
    shortLabel: '2档 · 微倾',
    title: '2.6° 微透视',
    description: '黄金微倾角与 90% 悬浮比例，兼顾空间感与阅读舒适度',
    scale: 0.9,
    perspective: 1300,
    tiltDeg: 2.6,
    liftY: -4,
    previewScale: 0.87,
    previewPerspective: 520,
    previewTiltDeg: 6,
    previewLiftY: -2.5,
  },
  level_3: {
    key: 'level_3',
    shortLabel: '3档 · 台前',
    title: '6.5° 台前调度',
    description: '明显书页侧倾折角，主卡片向景深处后退',
    scale: 0.86,
    perspective: 1000,
    tiltDeg: 6.5,
    liftY: -6,
    previewScale: 0.82,
    previewPerspective: 380,
    previewTiltDeg: 13,
    previewLiftY: -4,
  },
  level_4: {
    key: 'level_4',
    shortLabel: '4档 · 深景',
    title: '11° 深度画廊',
    description: '强烈的近大远小梯形透视，三维纵深感显著拉开',
    scale: 0.82,
    perspective: 780,
    tiltDeg: 11,
    liftY: -8,
    previewScale: 0.77,
    previewPerspective: 280,
    previewTiltDeg: 20,
    previewLiftY: -5.5,
  },
  level_5: {
    key: 'level_5',
    shortLabel: '5档 · 全景',
    title: '16° 超广角舞台',
    description: '戏剧化大倾角 3D 侧翼折页，空间景深张力拉满',
    scale: 0.78,
    perspective: 620,
    tiltDeg: 16,
    liftY: -10,
    previewScale: 0.72,
    previewPerspective: 210,
    previewTiltDeg: 28,
    previewLiftY: -7,
  },
};

export const AI_SIDEBAR_SPATIAL_PRESET_LIST: AiSidebarSpatialPresetConfig[] = [
  AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_1,
  AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_2,
  AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_3,
  AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_4,
  AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_5,
];

let cachedFoldingEnabled: boolean | null = null;
const foldingListeners = new Set<(enabled: boolean) => void>();

let cachedStreamingPacingMode: AiStreamingPacingMode | null = null;
const pacingListeners = new Set<(mode: AiStreamingPacingMode) => void>();

let cachedSidebarStyleMode: AiSidebarStyleMode | null = null;
const sidebarStyleListeners = new Set<(mode: AiSidebarStyleMode) => void>();

let cachedSidebarSpatialPreset: AiSidebarSpatialPreset | null = null;
const sidebarSpatialPresetListeners = new Set<(preset: AiSidebarSpatialPreset) => void>();

/**
 * Synchronous snapshot getter for long message folding preference.
 * Defaults to true.
 */
export function getCachedAiHistoryLongMessageFoldingEnabled(): boolean {
  return cachedFoldingEnabled ?? true;
}

/**
 * Synchronous snapshot getter for streaming pacing mode.
 * Defaults to 'continuous' (Option B).
 */
export function getCachedAiStreamingPacingMode(): AiStreamingPacingMode {
  return cachedStreamingPacingMode ?? 'continuous';
}

/**
 * Synchronous snapshot getter for AI sidebar style mode.
 * Defaults to 'push_scale'.
 */
export function getCachedAiSidebarStyleMode(): AiSidebarStyleMode {
  return cachedSidebarStyleMode ?? 'push_scale';
}

/**
 * Synchronous snapshot getter for AI sidebar 3D spatial preset.
 * Defaults to 'level_2' (recommended current default).
 */
export function getCachedAiSidebarSpatialPreset(): AiSidebarSpatialPreset {
  return cachedSidebarSpatialPreset ?? 'level_2';
}

/**
 * Reactive hook for AI chat performance preferences (folding toggle).
 */
export function useAiHistoryLongMessageFoldingPreference(space: PixorySpace = 'normal') {
  const [foldingEnabled, setFoldingEnabledState] = useState<boolean>(() => cachedFoldingEnabled ?? true);

  useEffect(() => {
    let isMounted = true;
    const listener = (val: boolean) => {
      if (isMounted) setFoldingEnabledState(val);
    };
    foldingListeners.add(listener);

    if (cachedFoldingEnabled !== null) {
      return () => {
        isMounted = false;
        foldingListeners.delete(listener);
      };
    }

    void runWithDatabaseSpace(space, async (db) => {
      const enabled = await settingsRepository.getAiHistoryLongMessageFoldingEnabled(db);
      cachedFoldingEnabled = enabled;
      if (isMounted) {
        setFoldingEnabledState(enabled);
      }
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      foldingListeners.delete(listener);
    };
  }, [space]);

  const setFoldingEnabled = useCallback(
    (enabled: boolean) => {
      cachedFoldingEnabled = enabled;
      setFoldingEnabledState(enabled);
      foldingListeners.forEach((fn) => fn(enabled));
      void runWithDatabaseSpace(space, (db) =>
        settingsRepository.setAiHistoryLongMessageFoldingEnabled(db, enabled)
      ).catch(() => undefined);
    },
    [space]
  );

  return [foldingEnabled, setFoldingEnabled] as const;
}

/**
 * Reactive hook for streaming pacing mode preference ('continuous' vs 'typewriter').
 * Defaults to 'continuous'.
 */
export function useAiStreamingPacingPreference(space: PixorySpace = 'normal') {
  const [pacingMode, setPacingModeState] = useState<AiStreamingPacingMode>(
    () => cachedStreamingPacingMode ?? 'continuous'
  );

  useEffect(() => {
    let isMounted = true;
    const listener = (val: AiStreamingPacingMode) => {
      if (isMounted) setPacingModeState(val);
    };
    pacingListeners.add(listener);

    if (cachedStreamingPacingMode !== null) {
      return () => {
        isMounted = false;
        pacingListeners.delete(listener);
      };
    }

    void runWithDatabaseSpace(space, async (db) => {
      const mode = await settingsRepository.getAiStreamingPacingMode(db);
      cachedStreamingPacingMode = mode;
      if (isMounted) {
        setPacingModeState(mode);
      }
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      pacingListeners.delete(listener);
    };
  }, [space]);

  const setPacingMode = useCallback(
    (mode: AiStreamingPacingMode) => {
      cachedStreamingPacingMode = mode;
      setPacingModeState(mode);
      pacingListeners.forEach((fn) => fn(mode));
      void runWithDatabaseSpace(space, (db) =>
        settingsRepository.setAiStreamingPacingMode(db, mode)
      ).catch(() => undefined);
    },
    [space]
  );

  return [pacingMode, setPacingMode] as const;
}

/**
 * Reactive hook for AI sidebar style mode preference ('push_scale' vs 'classic').
 * Defaults to 'push_scale'.
 */
export function useAiSidebarStylePreference(space: PixorySpace = 'normal') {
  const [sidebarStyleMode, setSidebarStyleModeState] = useState<AiSidebarStyleMode>(
    () => cachedSidebarStyleMode ?? 'push_scale'
  );

  useEffect(() => {
    let isMounted = true;
    const listener = (val: AiSidebarStyleMode) => {
      if (isMounted) setSidebarStyleModeState(val);
    };
    sidebarStyleListeners.add(listener);

    if (cachedSidebarStyleMode !== null) {
      return () => {
        isMounted = false;
        sidebarStyleListeners.delete(listener);
      };
    }

    void runWithDatabaseSpace(space, async (db) => {
      const mode = await settingsRepository.getAiSidebarStyleMode(db);
      cachedSidebarStyleMode = mode;
      if (isMounted) {
        setSidebarStyleModeState(mode);
      }
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      sidebarStyleListeners.delete(listener);
    };
  }, [space]);

  const setSidebarStyleMode = useCallback(
    (mode: AiSidebarStyleMode) => {
      const nextMode: AiSidebarStyleMode = mode === 'classic' ? 'classic' : 'push_scale';
      cachedSidebarStyleMode = nextMode;
      setSidebarStyleModeState(nextMode);
      sidebarStyleListeners.forEach((fn) => fn(nextMode));
      void runWithDatabaseSpace(space, (db) =>
        settingsRepository.setAiSidebarStyleMode(db, nextMode)
      ).catch(() => undefined);
    },
    [space]
  );

  return [sidebarStyleMode, setSidebarStyleMode] as const;
}

/**
 * Reactive hook for AI sidebar 3D spatial angle preset ('level_1' ~ 'level_5').
 * Defaults to 'level_2' (recommended current default).
 */
export function useAiSidebarSpatialPresetPreference(space: PixorySpace = 'normal') {
  const [spatialPreset, setSpatialPresetState] = useState<AiSidebarSpatialPreset>(
    () => cachedSidebarSpatialPreset ?? 'level_2'
  );

  useEffect(() => {
    let isMounted = true;
    const listener = (val: AiSidebarSpatialPreset) => {
      if (isMounted) setSpatialPresetState(val);
    };
    sidebarSpatialPresetListeners.add(listener);

    if (cachedSidebarSpatialPreset !== null) {
      return () => {
        isMounted = false;
        sidebarSpatialPresetListeners.delete(listener);
      };
    }

    void runWithDatabaseSpace(space, async (db) => {
      const preset = await settingsRepository.getAiSidebarSpatialPreset(db);
      cachedSidebarSpatialPreset = preset;
      if (isMounted) {
        setSpatialPresetState(preset);
      }
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      sidebarSpatialPresetListeners.delete(listener);
    };
  }, [space]);

  const setSpatialPreset = useCallback(
    (preset: AiSidebarSpatialPreset) => {
      const nextPreset: AiSidebarSpatialPreset =
        preset in AI_SIDEBAR_SPATIAL_PRESET_CONFIGS ? preset : 'level_2';
      cachedSidebarSpatialPreset = nextPreset;
      setSpatialPresetState(nextPreset);
      sidebarSpatialPresetListeners.forEach((fn) => fn(nextPreset));
      void runWithDatabaseSpace(space, (db) =>
        settingsRepository.setAiSidebarSpatialPreset(db, nextPreset)
      ).catch(() => undefined);
    },
    [space]
  );

  return [spatialPreset, setSpatialPreset] as const;
}

// ─────────────────────────────────────────────────────────────
// 聊天排版参数配置与偏好（字号、字距、行距、段间距 5 档）
// 默认严格处于第 2 档（gear_2）
// ─────────────────────────────────────────────────────────────

export const AI_CHAT_FONT_SIZE_CONFIGS: Record<TypographyGear, number> = {
  gear_1: 13.5,
  gear_2: 15,
  gear_3: 16,
  gear_4: 17.5,
  gear_5: 19,
};

export const AI_CHAT_LETTER_SPACING_CONFIGS: Record<TypographyGear, number> = {
  gear_1: -0.2,
  gear_2: 0,
  gear_3: 0.2,
  gear_4: 0.45,
  gear_5: 0.7,
};

export const AI_CHAT_LINE_HEIGHT_CONFIGS: Record<TypographyGear, number> = {
  gear_1: 20,
  gear_2: 24,
  gear_3: 26,
  gear_4: 28,
  gear_5: 31,
};

export const AI_CHAT_PARAGRAPH_SPACING_CONFIGS: Record<TypographyGear, number> = {
  gear_1: 8,
  gear_2: 10,
  gear_3: 13,
  gear_4: 16,
  gear_5: 20,
};

export interface ChatTypographyResolvedValues {
  fontSizeGear: TypographyGear;
  letterSpacingGear: TypographyGear;
  lineHeightGear: TypographyGear;
  paragraphSpacingGear: TypographyGear;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  paragraphSpacing: number;
}

let cachedChatTypography: ChatTypographyResolvedValues = {
  fontSizeGear: 'gear_2',
  letterSpacingGear: 'gear_2',
  lineHeightGear: 'gear_2',
  paragraphSpacingGear: 'gear_2',
  fontSize: 15,
  letterSpacing: 0,
  lineHeight: 24,
  paragraphSpacing: 10,
};
const chatTypographyListeners = new Set<(values: ChatTypographyResolvedValues) => void>();

export function getCachedChatTypographyPreferences(): ChatTypographyResolvedValues {
  return cachedChatTypography;
}

export function useChatTypographyPreferences(space: PixorySpace = 'normal') {
  const [typographyState, setTypographyState] = useState<ChatTypographyResolvedValues>(cachedChatTypography);

  useEffect(() => {
    let isMounted = true;
    const listener = (vals: ChatTypographyResolvedValues) => {
      if (isMounted) setTypographyState(vals);
    };
    chatTypographyListeners.add(listener);

    void runWithDatabaseSpace(space, async (db) => {
      const [fontSizeGear, letterSpacingGear, lineHeightGear, paragraphSpacingGear] = await Promise.all([
        settingsRepository.getChatFontSizeGear(db),
        settingsRepository.getChatLetterSpacingGear(db),
        settingsRepository.getChatLineHeightGear(db),
        settingsRepository.getChatParagraphSpacingGear(db),
      ]);
      const nextVals: ChatTypographyResolvedValues = {
        fontSizeGear,
        letterSpacingGear,
        lineHeightGear,
        paragraphSpacingGear,
        fontSize: AI_CHAT_FONT_SIZE_CONFIGS[fontSizeGear] ?? 15,
        letterSpacing: AI_CHAT_LETTER_SPACING_CONFIGS[letterSpacingGear] ?? 0,
        lineHeight: AI_CHAT_LINE_HEIGHT_CONFIGS[lineHeightGear] ?? 24,
        paragraphSpacing: AI_CHAT_PARAGRAPH_SPACING_CONFIGS[paragraphSpacingGear] ?? 10,
      };
      cachedChatTypography = nextVals;
      if (isMounted) setTypographyState(nextVals);
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      chatTypographyListeners.delete(listener);
    };
  }, [space]);

  const updateTypographyGear = useCallback(
    (param: 'fontSizeGear' | 'letterSpacingGear' | 'lineHeightGear' | 'paragraphSpacingGear', gear: TypographyGear) => {
      const nextVals: ChatTypographyResolvedValues = {
        ...cachedChatTypography,
        [param]: gear,
      };
      nextVals.fontSize = AI_CHAT_FONT_SIZE_CONFIGS[nextVals.fontSizeGear] ?? 15;
      nextVals.letterSpacing = AI_CHAT_LETTER_SPACING_CONFIGS[nextVals.letterSpacingGear] ?? 0;
      nextVals.lineHeight = AI_CHAT_LINE_HEIGHT_CONFIGS[nextVals.lineHeightGear] ?? 24;
      nextVals.paragraphSpacing = AI_CHAT_PARAGRAPH_SPACING_CONFIGS[nextVals.paragraphSpacingGear] ?? 10;
      cachedChatTypography = nextVals;
      setTypographyState(nextVals);
      chatTypographyListeners.forEach((fn) => fn(nextVals));

      void runWithDatabaseSpace(space, async (db) => {
        if (param === 'fontSizeGear') await settingsRepository.setChatFontSizeGear(db, gear);
        else if (param === 'letterSpacingGear') await settingsRepository.setChatLetterSpacingGear(db, gear);
        else if (param === 'lineHeightGear') await settingsRepository.setChatLineHeightGear(db, gear);
        else if (param === 'paragraphSpacingGear') await settingsRepository.setChatParagraphSpacingGear(db, gear);
      }).catch(() => undefined);
    },
    [space]
  );

  const applyMasterTypographyGear = useCallback(
    (gear: TypographyGear) => {
      const nextVals: ChatTypographyResolvedValues = {
        fontSizeGear: gear,
        letterSpacingGear: gear,
        lineHeightGear: gear,
        paragraphSpacingGear: gear,
        fontSize: AI_CHAT_FONT_SIZE_CONFIGS[gear] ?? 15,
        letterSpacing: AI_CHAT_LETTER_SPACING_CONFIGS[gear] ?? 0,
        lineHeight: AI_CHAT_LINE_HEIGHT_CONFIGS[gear] ?? 24,
        paragraphSpacing: AI_CHAT_PARAGRAPH_SPACING_CONFIGS[gear] ?? 10,
      };
      cachedChatTypography = nextVals;
      setTypographyState(nextVals);
      chatTypographyListeners.forEach((fn) => fn(nextVals));

      void runWithDatabaseSpace(space, async (db) => {
        await Promise.all([
          settingsRepository.setChatFontSizeGear(db, gear),
          settingsRepository.setChatLetterSpacingGear(db, gear),
          settingsRepository.setChatLineHeightGear(db, gear),
          settingsRepository.setChatParagraphSpacingGear(db, gear),
        ]);
      }).catch(() => undefined);
    },
    [space]
  );

  return {
    ...typographyState,
    updateTypographyGear,
    applyMasterTypographyGear,
  };
}

// ─────────────────────────────────────────────────────────────
// 聊天视觉配置偏好（气泡圆角、头像圆角、用户气泡颜色）
// ─────────────────────────────────────────────────────────────

export interface ChatAppearanceValues {
  avatarRadius: number;
  bubbleRadius: number;
  userBubbleColor: string;
  assistantBubbleColor: string;
}

let cachedChatAppearance: ChatAppearanceValues = {
  avatarRadius: 6,
  bubbleRadius: 16,
  userBubbleColor: '#95EC69',
  assistantBubbleColor: 'transparent',
};
const chatAppearanceListeners = new Set<(values: ChatAppearanceValues) => void>();

export function getCachedChatAppearancePreferences(): ChatAppearanceValues {
  return cachedChatAppearance;
}

export function useChatAppearancePreferences(space: PixorySpace = 'normal') {
  const [appearanceState, setAppearanceState] = useState<ChatAppearanceValues>(cachedChatAppearance);

  useEffect(() => {
    let isMounted = true;
    const listener = (vals: ChatAppearanceValues) => {
      if (isMounted) setAppearanceState(vals);
    };
    chatAppearanceListeners.add(listener);

    void runWithDatabaseSpace(space, async (db) => {
      const [avatarRadius, bubbleRadius, userBubbleColor, assistantBubbleColor] = await Promise.all([
        settingsRepository.getChatAvatarRadius(db),
        settingsRepository.getChatBubbleRadius(db),
        settingsRepository.getChatUserBubbleColor(db),
        settingsRepository.getChatAssistantBubbleColor(db),
      ]);
      const nextVals: ChatAppearanceValues = {
        avatarRadius,
        bubbleRadius,
        userBubbleColor,
        assistantBubbleColor,
      };
      cachedChatAppearance = nextVals;
      if (isMounted) setAppearanceState(nextVals);
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      chatAppearanceListeners.delete(listener);
    };
  }, [space]);

  const setChatAvatarRadius = useCallback(
    (radius: number) => {
      const nextVals = { ...cachedChatAppearance, avatarRadius: radius };
      cachedChatAppearance = nextVals;
      setAppearanceState(nextVals);
      chatAppearanceListeners.forEach((fn) => fn(nextVals));
      void runWithDatabaseSpace(space, (db) => settingsRepository.setChatAvatarRadius(db, radius)).catch(() => undefined);
    },
    [space]
  );

  const setChatBubbleRadius = useCallback(
    (radius: number) => {
      const nextVals = { ...cachedChatAppearance, bubbleRadius: radius };
      cachedChatAppearance = nextVals;
      setAppearanceState(nextVals);
      chatAppearanceListeners.forEach((fn) => fn(nextVals));
      void runWithDatabaseSpace(space, (db) => settingsRepository.setChatBubbleRadius(db, radius)).catch(() => undefined);
    },
    [space]
  );

  const setChatUserBubbleColor = useCallback(
    (color: string) => {
      const nextVals = { ...cachedChatAppearance, userBubbleColor: color };
      cachedChatAppearance = nextVals;
      setAppearanceState(nextVals);
      chatAppearanceListeners.forEach((fn) => fn(nextVals));
      void runWithDatabaseSpace(space, (db) => settingsRepository.setChatUserBubbleColor(db, color)).catch(() => undefined);
    },
    [space]
  );

  return {
    ...appearanceState,
    setChatAvatarRadius,
    setChatBubbleRadius,
    setChatUserBubbleColor,
  };
}

// ─────────────────────────────────────────────────────────────
// 「我的」页面风格偏好（默认极简模式 minimalist）
// ─────────────────────────────────────────────────────────────

let cachedProfilePageStyle: ProfilePageStyleMode = 'minimalist';
const profilePageStyleListeners = new Set<(mode: ProfilePageStyleMode) => void>();

export function getCachedProfilePageStyleMode(): ProfilePageStyleMode {
  return cachedProfilePageStyle;
}

export function useProfilePageStylePreference(space: PixorySpace = 'normal') {
  const [styleMode, setStyleModeState] = useState<ProfilePageStyleMode>(cachedProfilePageStyle);

  useEffect(() => {
    let isMounted = true;
    const listener = (val: ProfilePageStyleMode) => {
      if (isMounted) setStyleModeState(val);
    };
    profilePageStyleListeners.add(listener);

    void runWithDatabaseSpace(space, async (db) => {
      const mode = await settingsRepository.getProfilePageStyleMode(db);
      cachedProfilePageStyle = mode;
      if (isMounted) setStyleModeState(mode);
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      profilePageStyleListeners.delete(listener);
    };
  }, [space]);

  const setProfilePageStyleMode = useCallback(
    (mode: ProfilePageStyleMode) => {
      cachedProfilePageStyle = mode;
      setStyleModeState(mode);
      profilePageStyleListeners.forEach((fn) => fn(mode));
      void runWithDatabaseSpace(space, (db) => settingsRepository.setProfilePageStyleMode(db, mode)).catch(() => undefined);
    },
    [space]
  );

  return [styleMode, setProfilePageStyleMode] as const;
}

// ─────────────────────────────────────────────────────────────
// 个人信息偏好（头像圆角大小、是否佩戴头像框）
// ─────────────────────────────────────────────────────────────

export interface ProfileInfoValues {
  avatarRadius: number;
  avatarFrameEnabled: boolean;
  avatarUri: string | null;
}

let cachedProfileInfo: ProfileInfoValues = {
  avatarRadius: 34,
  avatarFrameEnabled: false,
  avatarUri: null,
};
const profileInfoListeners = new Set<(values: ProfileInfoValues) => void>();

export function getCachedProfileInfoPreferences(): ProfileInfoValues {
  return cachedProfileInfo;
}

export function useProfileInfoPreferences(space: PixorySpace = 'normal') {
  const [infoState, setInfoState] = useState<ProfileInfoValues>(cachedProfileInfo);

  useEffect(() => {
    let isMounted = true;
    const listener = (vals: ProfileInfoValues) => {
      if (isMounted) setInfoState(vals);
    };
    profileInfoListeners.add(listener);

    void runWithDatabaseSpace(space, async (db) => {
      const [avatarRadius, avatarFrameEnabled, avatarUri] = await Promise.all([
        settingsRepository.getProfileAvatarRadius(db),
        settingsRepository.getProfileAvatarFrameEnabled(db),
        settingsRepository.getProfileAvatarUri(db),
      ]);
      const nextVals: ProfileInfoValues = { avatarRadius, avatarFrameEnabled, avatarUri };
      cachedProfileInfo = nextVals;
      if (isMounted) setInfoState(nextVals);
    }).catch(() => undefined);

    return () => {
      isMounted = false;
      profileInfoListeners.delete(listener);
    };
  }, [space]);

  const setProfileAvatarRadius = useCallback(
    (radius: number) => {
      const nextVals = { ...cachedProfileInfo, avatarRadius: radius };
      cachedProfileInfo = nextVals;
      setInfoState(nextVals);
      profileInfoListeners.forEach((fn) => fn(nextVals));
      void runWithDatabaseSpace(space, (db) => settingsRepository.setProfileAvatarRadius(db, radius)).catch(() => undefined);
    },
    [space]
  );

  const setProfileAvatarFrameEnabled = useCallback(
    (enabled: boolean) => {
      const nextVals = { ...cachedProfileInfo, avatarFrameEnabled: enabled };
      cachedProfileInfo = nextVals;
      setInfoState(nextVals);
      profileInfoListeners.forEach((fn) => fn(nextVals));
      void runWithDatabaseSpace(space, (db) => settingsRepository.setProfileAvatarFrameEnabled(db, enabled)).catch(() => undefined);
    },
    [space]
  );

  return {
    ...infoState,
    setProfileAvatarRadius,
    setProfileAvatarFrameEnabled,
  };
}

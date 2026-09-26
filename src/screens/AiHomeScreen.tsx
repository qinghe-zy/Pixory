import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withSequence, withTiming, withDelay, interpolateColor, Easing, type SharedValue } from 'react-native-reanimated';
import { listAiHomeThreads, deleteAiThreads, moveAiThreadsBetweenSpaces, renameAiThread, type AiHomeThreadItem } from '../ai/aiChatService';
import { AppDialog } from '../components/AppDialog';
import { AnchoredContextMenu } from '../components/AnchoredContextMenu';
import { prefetchThreadMessages } from '../ai/aiThreadMessagePrefetch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { listRoleCards } from '../ai/aiRoleCardService';
import type { AiRoleCardRecord } from '../ai/types';
import { AiLightScaffold } from '../components/ai/AiLightScaffold';
import { AiActiveSpectrum } from '../components/ai/AiActiveSpectrum';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { SecureImage } from '../components/SecureImage';
import { LiquidGlassBezel } from '../components/LiquidGlassBezel';
import { colors, layout, metrics, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';
import { formatAiFullMinute } from '../utils/aiTimeFormatters';
import { recordDiagnosticEvent } from '../diagnostics/diagnosticLogger';

const primaryCardPatternImage = require('../../assets/backgrounds/japanese-fresh/elements/botanical-branch.png');

const HOME_THREAD_LIMIT = 30;
const RECENT_CHAT_ROW_HEIGHT = 72;
const homeThreadCache: Partial<Record<PixorySpace, AiHomeThreadItem[]>> = {};
const homeRoleCardCache: Partial<Record<PixorySpace, AiRoleCardRecord[]>> = {};

function getCachedHomeThreads(space: PixorySpace): AiHomeThreadItem[] {
  return homeThreadCache[space] ?? [];
}

function getCachedHomeRoleCards(space: PixorySpace): AiRoleCardRecord[] {
  return homeRoleCardCache[space] ?? [];
}

interface AiHomeScreenProps {
  footer?: ReactNode;
  isActive?: boolean;
  space: PixorySpace;
  /** Increment to trigger a fresh data reload without unmounting the screen. */
  refreshToken?: number;
  onStartNormalChat: () => void;
  onOpenRoleLibrary: () => void;
  onOpenProviderSettings: () => void;
  onOpenKnowledgeBase: () => void;
  onOpenGlobalMaterials: () => void;
  onOpenHistory: () => void;
  onOpenSearch: () => void;
  onOpenThread: (thread: AiHomeThreadItem) => void;
  onStartChatWithRole: (roleCardId: string) => void;
}

interface RoleShortcut {
  avatarUri: string;
  name: string;
  roleCardId: string;
}

export function AiHomeScreen({
  footer,
  isActive = true,
  space,
  refreshToken,
  onStartNormalChat,
  onOpenRoleLibrary,
  onOpenProviderSettings,
  onOpenKnowledgeBase,
  onOpenGlobalMaterials,
  onOpenHistory,
  onOpenSearch,
  onOpenThread,
  onStartChatWithRole,
}: AiHomeScreenProps) {
  const insets = useSafeAreaInsets();
  const primaryCardScale = useSharedValue(1);
  const primaryCardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: primaryCardScale.value }],
  }));

  const [loadedThreads, setLoadedThreads] = useState<{ space: PixorySpace; threads: AiHomeThreadItem[] }>(() => ({ space, threads: getCachedHomeThreads(space) }));
  const [loadedRoleCards, setLoadedRoleCards] = useState<{ space: PixorySpace; roleCards: AiRoleCardRecord[] }>(() => ({ space, roleCards: getCachedHomeRoleCards(space) }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const threads = loadedThreads.space === space ? loadedThreads.threads : [];
  const roleCards = loadedRoleCards.space === space ? loadedRoleCards.roleCards : [];
  const spaceLabel = space === 'personal' ? '私密空间 · 本地保存对话、资料与角色' : '普通空间 · 本地保存对话、资料与角色';

  const [actionMenuState, setActionMenuState] = useState<{ thread: AiHomeThreadItem; anchorX: number; anchorY: number } | null>(null);
  const [renameThread, setRenameThread] = useState<AiHomeThreadItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteThread, setDeleteThread] = useState<AiHomeThreadItem | null>(null);
  const [moveThread, setMoveThread] = useState<AiHomeThreadItem | null>(null);
  const [pendingAction, setPendingAction] = useState<'delete' | 'move' | null>(null);
  const [personalPassword, setPersonalPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const targetSpace: PixorySpace = space === 'normal' ? 'personal' : 'normal';

  async function reloadThreads() {
    try {
      const nextThreads = await listAiHomeThreads({ limit: HOME_THREAD_LIMIT, space });
      homeThreadCache[space] = nextThreads;
      setLoadedThreads({ space, threads: nextThreads });
    } catch (e) {
      // ignore
    }
  }

  async function confirmRenameThread() {
    if (!renameThread) return;
    setBusy(true);
    try {
      await renameAiThread(space, renameThread.id, renameValue);
      setRenameThread(null);
      setRenameValue('');
      await reloadThreads();
    } catch (error) {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function confirmMoveThread() {
    if (!moveThread) return;
    setBusy(true);
    try {
      await moveAiThreadsBetweenSpaces({
        personalPassword,
        sourceSpace: space,
        targetSpace,
        threadIds: [moveThread.id],
      });
      setMoveThread(null);
      setPendingAction(null);
      setPersonalPassword('');
      await reloadThreads();
    } catch (error) {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteThread() {
    if (!deleteThread) return;
    setBusy(true);
    try {
      await deleteAiThreads(space, [deleteThread.id]);
      setDeleteThread(null);
      setPendingAction(null);
      await reloadThreads();
    } catch (error) {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const startedAt = Date.now();
    const traceId = 'ai-home-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    recordDiagnosticEvent({ eventType: 'home_load_started', space, traceId, payload: { refresh: refreshToken ?? 0 } });
    let isMounted = true;
    setErrorMessage(null);
    setLoadedThreads({ space, threads: getCachedHomeThreads(space) });
    void listAiHomeThreads({ limit: HOME_THREAD_LIMIT, space })
      .then((nextThreads) => {
        homeThreadCache[space] = nextThreads;
        if (isMounted) {
          setLoadedThreads({ space, threads: nextThreads });
          recordDiagnosticEvent({ eventType: 'home_threads_load_completed', space, traceId, durationMs: Date.now() - startedAt, payload: { count: nextThreads.length } });
        }
      })
      .catch((error) => {
        if (isMounted) {
          recordDiagnosticEvent({ eventType: 'home_threads_load_failed', space, traceId, durationMs: Date.now() - startedAt, payload: { errorType: error instanceof Error ? error.name : 'unknown' } });
          setErrorMessage(error instanceof Error ? error.message : '读取 AI 工作台失败');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [space, refreshToken]);

  useEffect(() => {
    const startedAt = Date.now();
    const traceId = 'ai-home-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    recordDiagnosticEvent({ eventType: 'home_roles_load_started', space, traceId });
    let isMounted = true;
    setLoadedRoleCards({ space, roleCards: getCachedHomeRoleCards(space) });
    void listRoleCards(space)
      .then((nextRoleCards) => {
        homeRoleCardCache[space] = nextRoleCards;
        if (isMounted) {
          setLoadedRoleCards({ space, roleCards: nextRoleCards });
          recordDiagnosticEvent({ eventType: 'home_roles_load_completed', space, traceId, durationMs: Date.now() - startedAt, payload: { count: nextRoleCards.length } });
        }
      })
      .catch((error) => {
        if (isMounted) {
          recordDiagnosticEvent({ eventType: 'home_roles_load_failed', space, traceId, durationMs: Date.now() - startedAt, payload: { errorType: error instanceof Error ? error.name : 'unknown' } });
          setErrorMessage(error instanceof Error ? error.message : '读取角色库失败');
        }
      });
    return () => {
      isMounted = false;
    };
  }, [space, refreshToken]);

  const roleShortcuts = useMemo(() => buildRoleLibraryShortcuts(roleCards), [roleCards]);

  return (
    <View style={{ flex: 1 }}>
      <AiLightScaffold
      backgroundColor="#f9f9f9"
      bodyStyle={styles.homeBody}
      contentContainerStyle={styles.screenContent}
      customTopPadding={insets.top + spacing[2]}
      errorMessage={errorMessage}
      footer={footer}
      headerDividerVisible={false}
      scrollable
      showHeader={false}
      title=""
    >
      <View style={styles.mainStack}>
        <Animated.View style={[styles.primaryChatCardWrapper, primaryCardAnimatedStyle]}>
          <Pressable 
            accessibilityRole="button" 
            onPress={onStartNormalChat} 
            onPressIn={() => { primaryCardScale.value = withSpring(0.95, { damping: 14, stiffness: 300 }); }}
            onPressOut={() => { primaryCardScale.value = withSpring(1, { damping: 14, stiffness: 300 }); }}
            style={({ pressed }) => [styles.primaryChatCard, pressed && styles.pressed]}
          >
            <Image resizeMode="contain" source={primaryCardPatternImage} style={styles.primaryCardPattern} />
            <View style={styles.primaryIcon}>
              <Ionicons color={aiLightColors.primary} name="chatbubble-ellipses-outline" size={26} />
            </View>
            <View style={styles.primaryCopy}>
              <Text style={styles.primaryTitle}>开始聊天</Text>
              <Text style={styles.primaryDescription}>直接开始一次新的对话</Text>
            </View>
            <AiActiveSpectrum active={isActive} />
            <View style={styles.primaryArrow}>
              <Ionicons color={aiLightColors.onDark} name="chevron-forward" size={22} />
            </View>
          </Pressable>
        </Animated.View>

        <View style={styles.roleRailWrap}>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.roleRailScroll} contentContainerStyle={styles.roleRailContent}>
            {roleShortcuts.length ? (
              roleShortcuts.map((role) => (
                <Pressable
                  accessibilityLabel={`使用角色 ${role.name} 开始聊天`}
                  accessibilityRole="button"
                  key={role.roleCardId}
                  onPress={() => onStartChatWithRole(role.roleCardId)}
                  style={({ pressed }) => [styles.roleShortcut, pressed && styles.pressed]}
                >
                  <View style={styles.roleAvatarContainer}>
                    <SecureImage contentFit="cover" space={space} style={styles.roleAvatarImage} uri={role.avatarUri} />
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.sm, overflow: 'hidden' }]}>
                      <LiquidGlassBezel contentIntensity="none" radius={radius.sm} />
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.roleName}>{role.name}</Text>
                </Pressable>
              ))
            ) : (
              <View style={styles.emptyRoleHint}>
                <Ionicons color={aiLightColors.primaryActive} name="person-circle-outline" size={metrics.iconSizeMd} />
                <Text style={styles.emptyRoleText}>有头像的角色会显示在这里</Text>
              </View>
            )}
          </ScrollView>
          <Pressable accessibilityLabel="打开角色库" accessibilityRole="button" onPress={onOpenRoleLibrary} style={({ pressed }) => [styles.roleLibraryButton, pressed && styles.pressed]}>
            <Ionicons color={aiLightColors.primaryActive} name="ellipsis-vertical" size={20} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionInner}>
          <View style={styles.searchHeader}>
            <Pressable style={styles.searchContainer} onPress={onOpenSearch}>
              <Ionicons name="search" size={17} color="#5e5e5e" />
              <Text style={styles.searchInputPlaceholder}>搜索聊天记录 / 角色 / 设定...</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onOpenHistory} style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
              <Text style={styles.sectionActionText}>全部</Text>
              <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={metrics.iconSizeSm} />
            </Pressable>
          </View>
        </View>
        <View style={styles.recentChatList}>
          {threads.length ? (
            threads.map((thread, index) => (
              <Pressable
                accessibilityLabel={`打开最近聊天 ${thread.title}`}
                accessibilityRole="button"
                key={thread.id}
                onLongPress={(e) => setActionMenuState({ thread, anchorX: e.nativeEvent.pageX, anchorY: e.nativeEvent.pageY })}
                onPress={() => { prefetchThreadMessages(space, thread.id); onOpenThread(thread); }}
                style={({ pressed }) => [styles.threadRow, index > 0 && styles.threadDivider, pressed && styles.pressed]}
              >
                <ThreadAvatar thread={thread} space={space} />
                <View style={styles.threadCopy}>
                  <View style={styles.threadTitleRow}>
                    <Text numberOfLines={1} style={styles.threadTitle}>{thread.title}</Text>
                    <Text numberOfLines={1} style={styles.threadTime}>
                      {formatAiHomeFullMinute(thread.lastMessageAt ?? thread.updatedAt)}
                    </Text>
                  </View>
                  <View style={styles.threadMetaRow}>
                    <Text numberOfLines={1} style={styles.threadDescription}>
                      {thread.lastMessagePreview || labelForContext(thread)}
                    </Text>
                  </View>
                </View>
                <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={metrics.iconSizeSm} />
              </Pressable>
            ))
          ) : (
            <Pressable accessibilityRole="button" onPress={onStartNormalChat} style={({ pressed }) => [styles.emptyRecentRow, pressed && styles.pressed]}>
              <View style={styles.threadIcon}>
                <Ionicons color={aiLightColors.primaryActive} name="chatbubble-ellipses-outline" size={metrics.iconSizeMd} />
              </View>
              <View style={styles.threadCopy}>
                <Text style={styles.threadTitle}>还没有最近聊天</Text>
                <Text style={styles.threadDescription}>开始一次普通聊天后，这里会显示记录。</Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>


        <AppDialog appearance="opaqueMonochrome" message="修改后会作为自定义聊天名称显示在最近继续和历史列表。"
          onClose={() => {
            if (!busy) {
              setRenameThread(null);
              setRenameValue('');
            }
          }}
          onPrimary={() => void confirmRenameThread()}
          primaryDisabled={busy || !renameValue.trim()}
          primaryLabel={busy ? '正在保存' : '保存'}
          title="重命名聊天"
          visible={Boolean(renameThread)}
        >
          <TextInput
            editable={!busy}
            onChangeText={setRenameValue}
            placeholder="聊天名称"
            placeholderTextColor="#747878" selectionColor="#000000" style={[{ backgroundColor: '#ffffff', borderColor: '#1a1c1c', borderRadius: 4, borderWidth: 1, color: '#1a1c1c', fontSize: 16, padding: 12, marginTop: 12 }]}
            value={renameValue}
          />
        </AppDialog>

        <AppDialog
          accent="ai"
          danger
          message="将聊天记录移入回收站。之后可在回收站中恢复或永久删除。"
          onClose={() => {
            if (!busy) {
              setPendingAction(null);
              setDeleteThread(null);
            }
          }}
          onPrimary={() => void confirmDeleteThread()}
          primaryLabel={busy ? '正在移入' : '移入回收站'}
          title="移入回收站"
          visible={pendingAction === 'delete'}
        />

        <AppDialog
          accent="ai"
          message={`${space === 'normal' ? '移入' : '移出'}隐私空间。`}
          onClose={() => {
            if (!busy) {
              setPendingAction(null);
              setPersonalPassword('');
            }
          }}
          onPrimary={() => void confirmMoveThread()}
          primaryDisabled={busy || (targetSpace === 'personal' && !personalPassword.trim())}
          primaryLabel={busy ? '正在移动' : space === 'normal' ? '移入隐私空间' : '移出隐私空间'}
          title={space === 'normal' ? '移入隐私空间' : '移出隐私空间'}
          visible={pendingAction === 'move'}
        >
          {targetSpace === 'personal' ? (
            <TextInput
              editable={!busy}
              onChangeText={setPersonalPassword}
              placeholder="隐私密码"
              placeholderTextColor={aiLightColors.mutedSoft}
              secureTextEntry
              selectionColor={aiLightColors.primary}
              style={[{
                backgroundColor: aiLightColors.surface,
                borderColor: aiLightColors.hairline,
                borderRadius: radius.md,
                borderWidth: 1,
                color: aiLightColors.ink,
                fontSize: 16,
                padding: 12,
                marginTop: 12,
              }]}
              value={personalPassword}
            />
          ) : null}
        </AppDialog>

        <AnchoredContextMenu
          actions={actionMenuState ? [
            {
              key: 'rename',
              label: '重命名',
              icon: 'create-outline',
              onPress: () => {
                setRenameThread(actionMenuState.thread);
                setRenameValue(actionMenuState.thread.title);
              },
            },
            {
              key: 'space',
              label: space === 'normal' ? '移入隐私空间' : '移出隐私空间',
              icon: space === 'normal' ? 'lock-closed-outline' : 'lock-open-outline',
              onPress: () => {
                setMoveThread(actionMenuState.thread);
                setPendingAction('move');
              },
            },
            {
              key: 'delete',
              label: '移入回收站',
              icon: 'trash-outline',
              danger: true,
              onPress: () => {
                setDeleteThread(actionMenuState.thread);
                setPendingAction('delete');
              },
            },
          ] : []}
          anchorX={actionMenuState?.anchorX ?? 0}
          anchorY={actionMenuState?.anchorY ?? 0}
          dismissAccessibilityLabel="关闭菜单"
          onClose={() => setActionMenuState(null)}
          visible={Boolean(actionMenuState)}
        />
      </AiLightScaffold>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: '#f9f9f9', zIndex: 99 }} pointerEvents="none" />
    </View>
  );
}



function buildRoleLibraryShortcuts(roleCards: AiRoleCardRecord[]): RoleShortcut[] {
  return roleCards
    .filter((roleCard): roleCard is AiRoleCardRecord & { avatarUri: string } => Boolean(roleCard.avatarUri))
    .map((roleCard) => ({
      avatarUri: roleCard.avatarUri,
      name: roleCard.name,
      roleCardId: roleCard.id,
    }));
}

function formatAiHomeFullMinute(value: string | null | undefined): string {
  return formatAiFullMinute(value);
}

function labelForContext(thread: AiHomeThreadItem): string {
  if (thread.contextType === 'ip') {
    return 'IP 对话';
  }
  if (thread.contextType === 'knowledge_base') {
    return thread.knowledgeCategory === 'customer_project' ? '项目资料对话' : '资料库对话';
  }
  return thread.roleCardName ? `${thread.roleCardName} 对话` : '普通聊天';
}

function ThreadAvatar({ thread, space }: { thread: AiHomeThreadItem; space: PixorySpace }) {
  if (thread.avatar.avatarEnabled && thread.avatar.avatarUri) {
    return <SecureImage contentFit="cover" space={space} style={styles.threadAvatarImage} uri={thread.avatar.avatarUri} />;
  }
  const iconName = thread.contextType === 'ip' ? 'albums-outline' : thread.contextType === 'knowledge_base' ? 'library-outline' : 'chatbubble-ellipses-outline';
  return (
    <View style={styles.threadIcon}>
      <Ionicons color={aiLightColors.primaryActive} name={iconName} size={metrics.iconSizeMd} />
    </View>
  );
}

interface SectionTitleProps {
  actionLabel?: string;
  isActive?: boolean;
  title: string;
  onPress?: () => void;
  showDecoration?: boolean;
}

function SectionTitle({ actionLabel, isActive = true, title, onPress, showDecoration }: SectionTitleProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleBlock}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {showDecoration && <AiActiveSpectrum active={isActive} mini />}
        </View>
        {!showDecoration && <View style={styles.sectionUnderline} />}
      </View>
      {actionLabel && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons color={aiLightColors.mutedSoft} name="chevron-forward" size={metrics.iconSizeSm} />
        </Pressable>
      ) : null}
    </View>
  );
}



const styles = StyleSheet.create({
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.inlineGap,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: '#f3f3f4',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  searchInputPlaceholder: {
    flex: 1,
    ...typography.textStyles.body,
    fontSize: 14,
    color: '#8e8e93',
  },
  screenContent: {
    gap: rhythm.screenSectionGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  homeBody: {
    gap: rhythm.screenSectionGap,
  },
  topAction: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  pressed: {
    opacity: 0.78,
  },
  mainStack: {
    gap: rhythm.cardContentGap,
  },
  primaryChatCardWrapper: {
    ...shadows.sm,
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.sm,
  },
  primaryChatCard: {
    alignItems: 'center',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 72,
    overflow: 'hidden',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    position: 'relative',
  },
  primaryCardPattern: {
    height: 124,
    opacity: 0.15,
    position: 'absolute',
    right: -spacing[4],
    top: -spacing[2],
    width: 96,
  },
  primaryIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primarySoft,
    borderRadius: radius.pill,
    height: spacing[12],
    justifyContent: 'center',
    width: spacing[12],
  },
  primaryCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  primaryTitle: {
    ...typography.textStyles.cardTitle,
    color: aiLightColors.ink,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 27,
  },
  primaryDescription: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  primaryArrow: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  roleRailWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  roleRailScroll: {
    flex: 1,
  },
  roleRailContent: {
    gap: rhythm.inlineGap,
    paddingRight: spacing[1],
  },
  roleShortcut: {
    alignItems: 'center',
    gap: rhythm.microGap,
    width: 54,
  },
  roleAvatarContainer: {
    borderRadius: radius.sm,
    ...shadows.md,
    backgroundColor: colors.background.empty,
    shadowColor: '#2C2318',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleAvatarImage: {
    borderRadius: radius.sm,
    height: 48,
    width: 48,
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  roleName: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    maxWidth: 54,
    textAlign: 'center',
  },
  emptyRoleHint: {
    alignItems: 'center',
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 46,
    paddingHorizontal: spacing[3],
  },
  emptyRoleText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  roleLibraryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    width: 32,
    ...shadows.sm,
  },
  roleLibraryText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: '600',
  },
  section: {
    gap: rhythm.cardContentGap,
    marginHorizontal: -layout.pagePaddingHorizontal,
  },
  sectionInner: {
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitleBlock: {
    gap: rhythm.microGap,
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  sectionUnderline: {
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    height: 3,
    width: 24,
  },
  sectionAction: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingLeft: spacing[2],
    paddingVertical: spacing[1],
  },
  sectionActionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  recentChatList: {
    backgroundColor: aiLightColors.surface,
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  threadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: RECENT_CHAT_ROW_HEIGHT,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingVertical: spacing[2],
  },
  emptyRecentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 72,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingVertical: spacing[2],
  },
  threadDivider: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  threadIcon: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.sm,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  threadAvatarImage: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    width: 42,
  },
  threadCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  threadTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  threadTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  threadDescription: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    flex: 1,
    minWidth: 0,
  },
  threadMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  threadTime: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedSoft,
    flexShrink: 0,
  },

});




import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import type { PixorySpace } from '../../database';
import {
  useAiSidebarStylePreference,
  useAiSidebarSpatialPresetPreference,
  useChatTypographyPreferences,
  useChatAppearancePreferences,
} from '../../services/aiChatPreferences';
import { ImThemeProvider } from '../theme/ImThemeProvider';
import { buildImThemeFromPreferences } from '../theme/imTheme';
import { ImChatHeader } from '../components/ImChatHeader';
import { ImChatList } from '../components/ImChatList';
import { ImInputBar } from '../components/ImInputBar';
import { ImPushScaleDrawerStage } from '../components/drawer/ImPushScaleDrawerStage';
import { ImContactDrawer } from '../components/drawer/ImContactDrawer';
import { ImChatSettingsDrawer } from '../components/drawer/ImChatSettingsDrawer';
import { ImIpAssetPickerModal } from '../components/modals/ImIpAssetPickerModal';
import { ImMessageSearchModal } from '../components/modals/ImMessageSearchModal';
import { ImModelPickerModal } from '../components/modals/ImModelPickerModal';
import { ImMessageActionMenu } from '../components/modals/ImMessageActionMenu';
import { ImImageViewerModal } from '../components/modals/ImImageViewerModal';
import { ImDiaryBookModal } from '../diary/ImDiaryBookModal';
import { AiSandboxViewerModal } from '../../components/common/AiSandboxViewerModal';
import { MessageTextSelectionModal } from '../../components/common/MessageTextSelectionModal';
import { useImChatSession } from '../hooks/useImChatSession';
import type { ImMessage } from '../types';

export interface ImChatScreenProps {
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  roleName: string;
  roleAvatarUri?: string | null;
  initialLeftOpen?: boolean;
  initialRightOpen?: boolean;
  onBack: () => void;
  onOpenRoleDetail?: (roleCardId: string) => void;
  onNewRole?: () => void;
  onImportRole?: () => void;
  onSwitchCompanion?: (roleCardId: string, roleName: string, avatarUri?: string | null) => void;
}

/**
 * 伴侣短聊天主屏幕 (ImChatScreen - 纯装配胶水层)
 * 架构铁律：代码行数永久控制在 150 行以内。
 */
export function ImChatScreen({
  space,
  threadId,
  roleCardId,
  roleName,
  roleAvatarUri,
  initialLeftOpen,
  initialRightOpen,
  onBack,
  onOpenRoleDetail,
  onNewRole,
  onImportRole,
  onSwitchCompanion,
}: ImChatScreenProps) {
  const [leftOpen, setLeftOpen] = useState(initialLeftOpen ?? false);
  const [rightOpen, setRightOpen] = useState(initialRightOpen ?? false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [viewerImageUri, setViewerImageUri] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [ipTarget, setIpTarget] = useState<'chat' | 'avatar' | 'background' | null>(null);
  const [activeSandbox, setActiveSandbox] = useState<{ code: string; language?: string; title?: string } | null>(null);
  const [selectedTextMessage, setSelectedTextMessage] = useState<ImMessage | null>(null);
  const [spatialPreset] = useAiSidebarSpatialPresetPreference(space);
  const typographyPrefs = useChatTypographyPreferences(space);
  const appearancePrefs = useChatAppearancePreferences(space);

  const {
    messages, isInitialLoading, initialUnreadCount, subText, livingState, userAvatarUri, companionName, companionAvatarUri,
    threadSettings, actionMenuVisible, activeMessageForMenu, menuAnchor, handleActionMenuClose,
    handleDeleteMessage, handleEditResend, handleRetryMessage, handleSend, handleCamera, handlePhoto,
    handleFile, handleIpSend, handleLongPress, handleClear, handleNudge, handleNudgeSelf,
    handleUpdateSettings, handleSetAvatarUri, handleSetBackgroundUri,
    handlePickAvatarFromAlbum, handleClearAvatar, handlePickBackgroundFromAlbum,
    handleClearBackground, handleExportHistory, handleImportHistory, handleDraftChange,
    handleStartDiaryResonance, fillDraftText, reloadMessages,
  } = useImChatSession({ space, threadId, roleCardId, initialRoleName: roleName, initialRoleAvatarUri: roleAvatarUri });

  const activeTheme = buildImThemeFromPreferences(
    undefined,
    typographyPrefs,
    appearancePrefs,
    threadSettings.personalization?.bubbleSkinPreset || undefined,
    Boolean(threadSettings.backgroundImageUri)
  );

  useEffect(() => {
    if (highlightedMessageId) {
      const t = setTimeout(() => setHighlightedMessageId(null), 3500);
      return () => clearTimeout(t);
    }
  }, [highlightedMessageId]);

  const cleanSelectedContent = useMemo(() => {
    if (!selectedTextMessage?.content) return '';
    return selectedTextMessage.content
      .replace(/\[(STATUS|MOOD|STICKER|HEARTBEAT|VOICE|NUDGE|PING):[^\]]+\]/gi, '')
      .replace(/\[BR\]/g, '\n')
      .trim();
  }, [selectedTextMessage]);

  return (
    <ImThemeProvider theme={activeTheme}>
      <ImPushScaleDrawerStage
        leftDrawerVisible={leftOpen} rightDrawerVisible={rightOpen} sidebarMode="push_scale" spatialPreset={spatialPreset}
        onOpenLeftDrawer={() => setLeftOpen(true)} onOpenRightDrawer={() => setRightOpen(true)}
        onCloseLeftDrawer={() => setLeftOpen(false)} onCloseRightDrawer={() => setRightOpen(false)}
        leftDrawer={<ImContactDrawer activeRoleCardId={roleCardId} onImportRole={() => { setLeftOpen(false); onImportRole?.(); }} onNewRole={() => { setLeftOpen(false); onNewRole?.(); }} onSelectCompanion={(id, name, avatar) => onSwitchCompanion?.(id, name, avatar)} refreshTrigger={leftOpen ? 1 : 0} space={space} />}
        rightDrawer={<ImChatSettingsDrawer companionAvatarUri={companionAvatarUri} companionName={companionName} onClearAvatar={handleClearAvatar} onClearBackground={handleClearBackground} onClearHistory={handleClear} onExportHistory={handleExportHistory} onImportHistory={handleImportHistory} onNudge={handleNudge} onOpenDiary={() => setDiaryOpen(true)} onOpenModelPicker={() => setModelOpen(true)} onOpenRoleDetail={(id) => onOpenRoleDetail?.(id)} onOpenSearch={() => setSearchOpen(true)} onPickAvatarFromAlbum={handlePickAvatarFromAlbum} onPickAvatarFromIp={() => setIpTarget('avatar')} onPickBackgroundFromAlbum={handlePickBackgroundFromAlbum} onPickBackgroundFromIp={() => setIpTarget('background')} onUpdateSettings={handleUpdateSettings} roleCardId={roleCardId} settings={threadSettings} space={space} threadId={threadId} />}
      >
        <KeyboardAvoidingView behavior="padding" enabled={!leftOpen && !rightOpen} style={styles.screen}>
          <ImChatHeader onBack={onBack} onOpenDetails={() => setRightOpen(true)} subText={subText || (livingState?.statusText ? `• ${livingState.statusText}` : null)} title={companionName} />
          <ImChatList backgroundImageUri={threadSettings.backgroundImageUri} bubbleSkinPreset={threadSettings.personalization?.bubbleSkinPreset || undefined} companionAvatarUri={companionAvatarUri} companionName={companionName} highlightedMessageId={highlightedMessageId} isInitialLoading={isInitialLoading} messages={messages} onLongPressMessage={(m, px, py) => handleLongPress(m, px, py)} onNudge={handleNudge} onNudgeSelf={handleNudgeSelf} onOpenDiary={() => setDiaryOpen(true)} onOpenSandbox={(s) => setActiveSandbox(s)} onPressMessage={(m) => { if (m.type === 'image' && m.imageUri) setViewerImageUri(m.imageUri); }} onQuickIcebreak={(prompt) => void handleSend(prompt)} onRetryMessage={handleRetryMessage} space={space} unreadCount={initialUnreadCount} userAvatarUri={userAvatarUri} />
          <ImInputBar fillDraftText={fillDraftText} onCameraPress={() => void handleCamera()} onSelectFile={() => void handleFile()} onSelectImage={() => void handlePhoto()} onSelectIp={() => setIpTarget('chat')} onSend={handleSend} onTextChange={handleDraftChange} />
        </KeyboardAvoidingView>
      </ImPushScaleDrawerStage>
      <ImImageViewerModal imageUri={viewerImageUri} onClose={() => setViewerImageUri(null)} space={space} visible={Boolean(viewerImageUri)} />
      <ImDiaryBookModal companionAvatarUri={companionAvatarUri} companionName={companionName} onChatWithDiary={handleStartDiaryResonance} onClose={() => { setDiaryOpen(false); void reloadMessages(); }} onDiaryGenerated={reloadMessages} roleCardId={roleCardId} space={space} threadId={threadId} visible={diaryOpen} />
      <ImIpAssetPickerModal onClose={() => setIpTarget(null)} onConfirmSend={(asset) => { if (ipTarget === 'chat') void handleIpSend(asset); else if (ipTarget === 'avatar') void handleSetAvatarUri(asset.images[0]?.uri || null); else if (ipTarget === 'background') void handleSetBackgroundUri(asset.images[0]?.uri || null); setIpTarget(null); }} space={space} visible={Boolean(ipTarget)} />
      <ImModelPickerModal currentModelId={threadSettings.modelId} currentProviderId={threadSettings.providerId} onClose={() => setModelOpen(false)} onSelect={(pId, mId) => { void handleUpdateSettings({ providerId: pId, modelId: mId }); setModelOpen(false); }} space={space} visible={modelOpen} />
      <ImMessageSearchModal companionAvatarUri={companionAvatarUri} companionName={companionName} onClose={() => setSearchOpen(false)} onSelectMessage={(id) => setHighlightedMessageId(id)} space={space} threadId={threadId} userAvatarUri={userAvatarUri} visible={searchOpen} />
      <ImMessageActionMenu anchorX={menuAnchor.x} anchorY={menuAnchor.y} message={activeMessageForMenu} onClose={handleActionMenuClose} onDelete={(m) => void handleDeleteMessage(m)} onEditResend={(m) => void handleEditResend(m)} onSelectText={(m) => setSelectedTextMessage(m)} visible={actionMenuVisible} />
      <MessageTextSelectionModal content={cleanSelectedContent} onClose={() => setSelectedTextMessage(null)} onOpenSandbox={(s) => setActiveSandbox(s)} visible={Boolean(selectedTextMessage)} />
      <AiSandboxViewerModal code={activeSandbox?.code || ''} language={activeSandbox?.language} onClose={() => setActiveSandbox(null)} title={activeSandbox?.title} visible={Boolean(activeSandbox)} />
    </ImThemeProvider>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#EDEDED' } });

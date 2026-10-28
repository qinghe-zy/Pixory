import React, { useState, useEffect } from 'react';
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
import { ImDiaryBookModal } from '../diary/ImDiaryBookModal';
import { useImChatSession } from '../hooks/useImChatSession';

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
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [ipTarget, setIpTarget] = useState<'chat' | 'avatar' | 'background' | null>(null);
  const [spatialPreset] = useAiSidebarSpatialPresetPreference(space);
  const typographyPrefs = useChatTypographyPreferences(space);
  const appearancePrefs = useChatAppearancePreferences(space);
  const activeTheme = buildImThemeFromPreferences(undefined, typographyPrefs, appearancePrefs);

  const {
    messages, subText, livingState, userAvatarUri, companionName, companionAvatarUri,
    threadSettings, actionMenuVisible, activeMessageForMenu, menuAnchor, handleActionMenuClose,
    handleDeleteMessage, handleEditResend, handleSend, handleCamera, handlePhoto,
    handleFile, handleIpSend, handleLongPress, handleClear, handleNudge,
    handleUpdateSettings, handleSetAvatarUri, handleSetBackgroundUri,
    handlePickAvatarFromAlbum, handleClearAvatar, handlePickBackgroundFromAlbum,
    handleClearBackground, handleExportHistory, handleImportHistory, handleDraftChange,
    fillDraftText, reloadMessages,
  } = useImChatSession({ space, threadId, roleCardId, initialRoleName: roleName, initialRoleAvatarUri: roleAvatarUri });

  useEffect(() => {
    if (highlightedMessageId) {
      const t = setTimeout(() => setHighlightedMessageId(null), 3500);
      return () => clearTimeout(t);
    }
  }, [highlightedMessageId]);

  return (
    <ImThemeProvider theme={activeTheme}>
      <ImPushScaleDrawerStage
        leftDrawerVisible={leftOpen} rightDrawerVisible={rightOpen} sidebarMode="push_scale" spatialPreset={spatialPreset}
        onOpenLeftDrawer={() => setLeftOpen(true)} onOpenRightDrawer={() => setRightOpen(true)}
        onCloseLeftDrawer={() => setLeftOpen(false)} onCloseRightDrawer={() => setRightOpen(false)}
        leftDrawer={<ImContactDrawer activeRoleCardId={roleCardId} onImportRole={() => { setLeftOpen(false); onImportRole?.(); }} onNewRole={() => { setLeftOpen(false); onNewRole?.(); }} onSelectCompanion={(id, name, avatar) => onSwitchCompanion?.(id, name, avatar)} space={space} />}
        rightDrawer={<ImChatSettingsDrawer companionAvatarUri={companionAvatarUri} companionName={companionName} onClearAvatar={handleClearAvatar} onClearBackground={handleClearBackground} onClearHistory={handleClear} onEditNudgeText={() => {}} onExportHistory={handleExportHistory} onImportHistory={handleImportHistory} onNudge={handleNudge} onOpenDiary={() => setDiaryOpen(true)} onOpenModelPicker={() => setModelOpen(true)} onOpenRoleDetail={(id) => onOpenRoleDetail?.(id)} onOpenSearch={() => setSearchOpen(true)} onPickAvatarFromAlbum={handlePickAvatarFromAlbum} onPickAvatarFromIp={() => setIpTarget('avatar')} onPickBackgroundFromAlbum={handlePickBackgroundFromAlbum} onPickBackgroundFromIp={() => setIpTarget('background')} onUpdateSettings={handleUpdateSettings} roleCardId={roleCardId} settings={threadSettings} />}
      >
        <KeyboardAvoidingView behavior="padding" enabled={!leftOpen && !rightOpen} style={styles.screen}>
          <ImChatHeader onBack={onBack} onOpenContacts={() => setLeftOpen(true)} onOpenDetails={() => setRightOpen(true)} subText={subText || (livingState?.statusText ? `• ${livingState.statusText}` : null)} title={companionName} />
          <ImChatList backgroundImageUri={threadSettings.backgroundImageUri} companionAvatarUri={companionAvatarUri} companionName={companionName} highlightedMessageId={highlightedMessageId} messages={messages} onLongPressMessage={(m, px, py) => handleLongPress(m, px, py)} onNudge={handleNudge} onOpenDiary={() => setDiaryOpen(true)} userAvatarUri={userAvatarUri} />
          <ImInputBar fillDraftText={fillDraftText} onCameraPress={() => void handleCamera()} onSelectFile={() => void handleFile()} onSelectImage={() => void handlePhoto()} onSelectIp={() => setIpTarget('chat')} onSend={handleSend} onTextChange={handleDraftChange} />
        </KeyboardAvoidingView>
      </ImPushScaleDrawerStage>
      <ImDiaryBookModal companionAvatarUri={companionAvatarUri} companionName={companionName} onClose={() => { setDiaryOpen(false); void reloadMessages(); }} onDiaryGenerated={reloadMessages} roleCardId={roleCardId} space={space} threadId={threadId} visible={diaryOpen} />
      <ImIpAssetPickerModal onClose={() => setIpTarget(null)} onConfirmSend={(asset) => { if (ipTarget === 'chat') void handleIpSend(asset); else if (ipTarget === 'avatar') void handleSetAvatarUri(asset.images[0]?.uri || null); else if (ipTarget === 'background') void handleSetBackgroundUri(asset.images[0]?.uri || null); setIpTarget(null); }} space={space} visible={Boolean(ipTarget)} />
      <ImModelPickerModal currentModelId={threadSettings.modelId} currentProviderId={threadSettings.providerId} onClose={() => setModelOpen(false)} onSelect={(pId, mId) => { void handleUpdateSettings({ providerId: pId, modelId: mId }); setModelOpen(false); }} space={space} visible={modelOpen} />
      <ImMessageSearchModal companionAvatarUri={companionAvatarUri} companionName={companionName} onClose={() => setSearchOpen(false)} onSelectMessage={(id) => setHighlightedMessageId(id)} space={space} threadId={threadId} userAvatarUri={userAvatarUri} visible={searchOpen} />
      <ImMessageActionMenu anchorX={menuAnchor.x} anchorY={menuAnchor.y} message={activeMessageForMenu} onClose={handleActionMenuClose} onDelete={(m) => void handleDeleteMessage(m)} onEditResend={(m) => void handleEditResend(m)} visible={actionMenuVisible} />
    </ImThemeProvider>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#EDEDED' } });

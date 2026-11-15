import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { PixorySpace } from '../../database';
import { colors, metrics, radius, spacing, typography } from '../../design/tokens';
import { SecureImage } from '../SecureImage';
import { aiLightColors } from './aiLightTheme';
import type { AiComposerAttachment } from './AiChatComposer';

interface AiComposerAttachmentBarProps {
  attachments: AiComposerAttachment[];
  onRemoveAttachment?: (id: string) => void;
  space?: PixorySpace;
}

export function AiComposerAttachmentBar({
  attachments,
  onRemoveAttachment,
  space = 'normal',
}: AiComposerAttachmentBarProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {attachments.map((attachment, index) => {
          const isImage = attachment.kind === 'image';

          return (
            <View
              key={attachment.id || `attachment-${index}`}
              style={styles.tileWrap}
            >
              {isImage ? (
                <SecureImage
                  contentFit="cover"
                  space={space}
                  style={styles.imageTile}
                  uri={attachment.uri}
                />
              ) : (
                <View style={styles.documentTileContent}>
                  <Ionicons
                    color={aiLightColors.primary}
                    name="document-text"
                    size={metrics.iconSizeMd}
                  />
                  <Text numberOfLines={2} style={styles.documentTileName}>
                    {attachment.name}
                  </Text>
                </View>
              )}
              <Pressable
                accessibilityLabel={
                  isImage
                    ? '从输入框删除该图片'
                    : `从输入框删除文档 ${attachment.name}`
                }
                accessibilityRole="button"
                hitSlop={14}
                onPress={() => onRemoveAttachment?.(attachment.id)}
                style={({ pressed }) => [styles.imageRemoveButton, pressed && styles.pressed]}
              >
                <Ionicons color={colors.text.inverse} name="close" size={typography.size.micro} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[2],
  },
  scroll: {
    maxHeight: 64, // Accommodates 56dp attachment tile plus vertical scroll padding
  },
  scrollContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: 2, // Keeps attachment tile border crisp inside scroll bounds
    paddingVertical: spacing[1],
  },
  tileWrap: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56, // Compact square thumbnail tile inside attachment strip
    overflow: 'hidden',
    position: 'relative',
    width: 56, // Compact square thumbnail tile inside attachment strip
  },
  imageTile: {
    borderRadius: radius.md,
    height: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  documentTileContent: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.md,
    height: '100%',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingBottom: spacing[1],
    paddingHorizontal: spacing[1],
    paddingTop: spacing[1.5],
    width: '100%',
  },
  documentTileName: {
    color: aiLightColors.ink,
    fontSize: 9, // Compact 2-line filename caption inside 56dp attachment tile
    lineHeight: 11, // Matches 9sp compact filename line height
    marginTop: 2, // Micro gap below document tile icon inside 56dp tile
    textAlign: 'center',
  },
  imageRemoveButton: {
    alignItems: 'center',
    backgroundColor: colors.overlay.iconMuted,
    borderRadius: radius.pill,
    height: spacing[4],
    justifyContent: 'center',
    position: 'absolute',
    right: 3, // Corner optical inset matching remove badge visual size
    top: 3, // Corner optical inset matching remove badge visual size
    width: spacing[4],
    zIndex: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});

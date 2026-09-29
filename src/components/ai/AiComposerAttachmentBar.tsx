import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, spacing } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import type { AiComposerAttachment } from './AiChatComposer';

interface AiComposerAttachmentBarProps {
  attachments: AiComposerAttachment[];
  onRemoveAttachment?: (id: string) => void;
}

export function AiComposerAttachmentBar({
  attachments,
  onRemoveAttachment,
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
              style={[styles.tileWrap, !isImage && styles.documentTileWrap]}
            >
              {isImage ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: attachment.uri }}
                  style={styles.imageTile}
                />
              ) : (
                <View style={styles.documentTileContent}>
                  <Ionicons
                    color={aiLightColors.primary}
                    name="document-text"
                    size={20}
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
                hitSlop={8}
                onPress={() => onRemoveAttachment?.(attachment.id)}
                style={({ pressed }) => [styles.imageRemoveButton, pressed && styles.pressed]}
              >
                <Ionicons color="#FFFFFF" name="close" size={11} />
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
    maxHeight: 64,
  },
  scrollContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: 1,
    paddingVertical: 2,
  },
  tileWrap: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56,
    overflow: 'hidden',
    position: 'relative',
    width: 56,
  },
  documentTileWrap: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
  },
  imageTile: {
    height: '100%',
    width: '100%',
  },
  documentTileContent: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    paddingBottom: 3,
    paddingHorizontal: 3,
    paddingTop: 6,
    width: '100%',
  },
  documentTileName: {
    color: aiLightColors.ink,
    fontSize: 9,
    lineHeight: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  imageRemoveButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 30, 40, 0.72)',
    borderRadius: radius.pill,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 3,
    top: 3,
    width: 16,
    zIndex: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});

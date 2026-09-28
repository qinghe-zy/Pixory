import { MaterialIcons } from '@expo/vector-icons';
import type { ImageProps } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { IpListItem, PixorySpace } from '../database';
import { resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { getIpInitials, formatFileSize, formatUpdatedLabel } from '../utils/formatters';
import { SecureImage } from './SecureImage';
import { typography } from '../design/tokens';

interface IPCardProps {
  index?: number;
  ip: IpListItem;
  imagePriority?: ImageProps['priority'];
  space?: PixorySpace;
  onOptionsPress?: (ip: IpListItem, pageX: number, pageY: number) => void;
  onPress: (ipId: number) => void;
  onImportPress?: (ipId: number) => void;
  onEditPress?: (ipId: number) => void;
  layoutVariant?: 'hero' | 'standard' | 'grid';
  useGyroEffect?: boolean;
}

export function IPCard({
  index = 0,
  ip,
  imagePriority = 'normal',
  space = 'normal',
  onOptionsPress,
  onPress,
  onImportPress,
  onEditPress,
  layoutVariant,
  useGyroEffect = false,
}: IPCardProps) {
  const coverBlurRadius = space === 'personal' && (ip.coverBlurEnabled ?? true) ? resolvePersonalCoverBlurRadius(ip.coverBlurRadius) : undefined;
  const variant = layoutVariant ?? (useGyroEffect ? 'hero' : 'standard');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const delay = Math.min(index * 100, 500); 
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 450,
        delay,
        useNativeDriver: true,
      })
    ]).start();
  }, [index, fadeAnim, translateYAnim]);

  const renderContent = () => {
    if (variant === 'hero') {
      return (
        <View style={styles.heroWrapper}>
          <View style={styles.heroCard}>
            {ip.isPinned && (
              <View style={styles.pinBadge}>
                <MaterialIcons name="push-pin" size={12} color="#747878" />
              </View>
            )}
            <Pressable style={styles.heroImageContainer} onPress={() => onPress(ip.id)}>
              {ip.coverThumbnailFileUri ? (
                <SecureImage
                  blurRadius={coverBlurRadius}
                  contentFit="cover"
                  priority={imagePriority}
                  recyclingKey={`${space}:ip:${ip.id}:${ip.coverThumbnailFileUri}`}
                  space={space}
                  style={StyleSheet.absoluteFill}
                  uri={ip.coverThumbnailFileUri}
                />
              ) : (
                <View style={styles.fallbackCover}>
                  <Text style={styles.initialsText}>{getIpInitials(ip.name)}</Text>
                </View>
              )}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.85)']} style={styles.heroGradient}>
                <View style={styles.heroTitleRow}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', flex: 1, columnGap: 8, paddingRight: 16, overflow: 'hidden' }}>
                    <Text style={[styles.heroTitleMain, { flexShrink: 0, maxWidth: '100%' }]} numberOfLines={1}>{ip.name}</Text>
                    {ip.description ? (
                      <Text style={[styles.heroDescriptionMain, { flexShrink: 1, minWidth: '45%', flexGrow: 1, paddingBottom: 4 }]} numberOfLines={2}>{ip.description}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    hitSlop={12}
                    onPress={(e) => onOptionsPress?.(ip, e.nativeEvent.pageX, e.nativeEvent.pageY)}
                    style={styles.moreBtn}
                  >
                    <MaterialIcons name="more-horiz" size={18} color="#ffffff" />
                  </Pressable>
                </View>
                <View style={styles.heroMetaRow}>
                  <View style={styles.heroMetaItem}>
                    <MaterialIcons name="photo-library" size={13} color="#fff" />
                    <Text style={styles.heroMetaText}>{ip.imageCount} 张图片</Text>
                  </View>
                  {ip.videoCount > 0 && (
                    <View style={styles.heroMetaItem}>
                      <MaterialIcons name="movie" size={13} color="#fff" />
                      <Text style={styles.heroMetaText}>{ip.videoCount} 个视频</Text>
                    </View>
                  )}
                  <View style={styles.heroMetaItem}>
                    <MaterialIcons name="storage" size={13} color="#e2e2e2" />
                    <Text style={[styles.heroMetaText, { color: '#e2e2e2' }]}>{formatFileSize(ip.totalBytes)}</Text>
                  </View>
                  <Text style={styles.heroMetaTime}>刚更新</Text>
                </View>
              </LinearGradient>
            </Pressable>
            <View style={styles.heroFooter}>
              <Pressable style={styles.btnSecondaryRounded} onPress={() => onImportPress?.(ip.id)}>
                <MaterialIcons name="add-photo-alternate" size={16} color="#1a1c1c" />
                <Text style={styles.btnSecondaryText}>导入</Text>
              </Pressable>
              <Pressable style={styles.btnSecondaryRounded} onPress={() => onEditPress?.(ip.id)}>
                <MaterialIcons name="edit" size={16} color="#1a1c1c" />
                <Text style={styles.btnSecondaryText}>编辑</Text>
              </Pressable>
              <Pressable style={styles.btnPrimaryRounded} onPress={() => onPress(ip.id)}>
                <Text style={styles.btnPrimaryText}>进入画廊</Text>
                <MaterialIcons name="arrow-forward" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      );
    }
    
    if (variant === 'grid') {
      return (
        <View style={styles.gridCard}>
          {ip.isPinned && (
            <View style={styles.pinBadge}>
              <MaterialIcons name="push-pin" size={12} color="#747878" />
            </View>
          )}
          <Pressable style={styles.gridImageContainer} onPress={() => onPress(ip.id)}>
            {ip.coverThumbnailFileUri ? (
              <SecureImage
                blurRadius={coverBlurRadius}
                contentFit="cover"
                priority={imagePriority}
                recyclingKey={`${space}:ip:${ip.id}:${ip.coverThumbnailFileUri}`}
                space={space}
                style={StyleSheet.absoluteFill}
                uri={ip.coverThumbnailFileUri}
              />
            ) : (
              <View style={styles.fallbackCover}>
                <Text style={[styles.initialsText, { fontSize: 24 }]}>{getIpInitials(ip.name)}</Text>
              </View>
            )}
            
          </Pressable>
          <View style={styles.gridBody}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 4 }}>
                  <Text style={styles.gridTitle} numberOfLines={1}>{ip.name}</Text>
                  <Text style={styles.gridSubMeta} numberOfLines={1}>{ip.imageCount} 图 · {formatFileSize(ip.totalBytes)}</Text>
                </View>
                <Pressable
                  hitSlop={12}
                  onPress={(e) => onOptionsPress?.(ip, e.nativeEvent.pageX, e.nativeEvent.pageY)}
                  style={styles.moreBtn}
                >
                  <MaterialIcons name="more-horiz" size={18} color="#747878" />
                </Pressable>
              </View>
            <View style={styles.gridFooterRow}>
              <View style={styles.gridTimeBadge}>
                <MaterialIcons name="schedule" size={12} color="#747878" />
                <Text style={styles.gridTimeText}>{formatUpdatedLabel(ip.updatedAt)}</Text>
              </View>
              <Pressable hitSlop={8} style={styles.gridForwardBtn} onPress={() => onPress(ip.id)}>
                <MaterialIcons name="arrow-forward" size={14} color="#ffffff" />
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stdWrapper}>
        <View style={styles.stdCard}>
          {ip.isPinned && (
            <View style={styles.pinBadge}>
              <MaterialIcons name="push-pin" size={12} color="#747878" />
            </View>
          )}
          <Pressable style={styles.stdImageContainer} onPress={() => onPress(ip.id)}>
            {ip.coverThumbnailFileUri ? (
              <SecureImage
                blurRadius={coverBlurRadius}
                contentFit="cover"
                priority={imagePriority}
                recyclingKey={`${space}:ip:${ip.id}:${ip.coverThumbnailFileUri}`}
                space={space}
                style={StyleSheet.absoluteFill}
                uri={ip.coverThumbnailFileUri}
              />
            ) : (
              <View style={styles.fallbackCover}>
                <Text style={styles.initialsText}>{getIpInitials(ip.name)}</Text>
              </View>
            )}
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.stdImageGradient}>
              <Text style={styles.stdImageTime}>{formatUpdatedLabel(ip.updatedAt)}</Text>
            </LinearGradient>
          </Pressable>
          <View style={styles.stdBody}>
            <View style={styles.stdHeaderRow}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', flex: 1, columnGap: 8, paddingRight: 8, overflow: 'hidden' }}>
                <Text style={[styles.stdTitleMain, { flexShrink: 0, maxWidth: '100%' }]} numberOfLines={1}>{ip.name}</Text>
                {ip.description ? (
                  <Text style={[styles.stdDescriptionMain, { flexShrink: 1, minWidth: '45%', flexGrow: 1, paddingBottom: 2 }]} numberOfLines={2}>{ip.description}</Text>
                ) : null}
              </View>
              <Pressable
                hitSlop={12}
                onPress={(e) => onOptionsPress?.(ip, e.nativeEvent.pageX, e.nativeEvent.pageY)}
                style={styles.moreBtn}
              >
                <MaterialIcons name="more-horiz" size={18} color="#747878" />
              </Pressable>
            </View>
            <View style={styles.stdFooterRow}>
              <View style={styles.stdMetaItems}>
                <View style={styles.stdMetaItem}>
                  <MaterialIcons name="photo-library" size={13} color="#5e5e5e" />
                  <Text style={styles.stdMetaText}>{ip.imageCount}</Text>
                </View>
                {ip.videoCount > 0 && (
                  <View style={styles.stdMetaItem}>
                    <MaterialIcons name="movie" size={13} color="#5e5e5e" />
                    <Text style={styles.stdMetaText}>{ip.videoCount}</Text>
                  </View>
                )}
                <Text style={styles.stdMetaText}>{formatFileSize(ip.totalBytes)}</Text>
              </View>
              <View style={styles.stdActions}>
                <Pressable style={styles.btnSmall} onPress={() => onImportPress?.(ip.id)}>
                  <MaterialIcons name="add-photo-alternate" size={14} color="#1a1c1c" />
                  <Text style={styles.btnSmallText}>导入</Text>
                </Pressable>
                <Pressable style={styles.btnSmallDark} onPress={() => onPress(ip.id)}>
                  <Text style={styles.btnSmallTextWhite}>进入画廊</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateYAnim }], flex: variant === 'grid' ? 1 : undefined }}>
      {renderContent()}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pinBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  heroWrapper: {
    
    paddingTop: 8,
    paddingBottom: 12,
  },
  heroCard: {
    width: '100%',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  heroImageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f1f3f4',
    overflow: 'hidden',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 12,
    justifyContent: 'flex-end',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  heroTitleMain: {
    fontSize: 32,
    color: '#ffffff',
    lineHeight: 36,
    fontFamily: typography.family.serifItalic,
    letterSpacing: -0.5,
    fontWeight: '400',
  },
  heroDescriptionMain: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: typography.family.base,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroMetaText: {
    fontSize: 10,
    color: '#ffffff',
    fontFamily: typography.family.mono,
  },
  heroMetaTime: {
    fontSize: 10,
    color: '#e2e2e2',
    fontFamily: typography.family.mono,
    marginLeft: 'auto',
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  btnSecondaryRounded: {
    height: 36,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  btnPrimaryRounded: {
    flex: 1,
    height: 36,
    backgroundColor: '#1a1c1c',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1c1c',
  },
  btnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  stdWrapper: {
    
    paddingBottom: 16,
  },
  stdCard: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stdImageContainer: {
    width: '100%',
    aspectRatio: 21 / 9,
    backgroundColor: '#f1f3f4',
    overflow: 'hidden',
  },
  stdImageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    padding: 8,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  stdImageTime: {
    fontSize: 10,
    color: '#ffffff',
    fontFamily: typography.family.mono,
  },
  stdBody: {
    padding: 12,
    flexDirection: 'column',
    gap: 6,
  },
  stdHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stdTitleMain: {
    fontSize: 20,
    color: '#1a1c1c',
    lineHeight: 26,
    fontFamily: typography.family.display,
    letterSpacing: -0.2,
    fontWeight: '500',
  },
  stdDescriptionMain: {
    fontSize: 12,
    color: '#747878',
    fontFamily: typography.family.base,
  },
  moreBtn: {
    padding: 4,
  },
  stdFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  stdMetaItems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stdMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stdMetaText: {
    fontSize: 10,
    color: '#5e5e5e',
    fontFamily: typography.family.mono,
  },
  stdActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnSmall: {
    height: 28,
    paddingHorizontal: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnSmallDark: {
    height: 28,
    paddingHorizontal: 10,
    backgroundColor: '#1a1c1c',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  btnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1c1c',
  },
  btnSmallTextWhite: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  gridCard: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    flex: 1,
  },
  gridImageContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#f1f3f4',
    overflow: 'hidden',
  },
  gridTopBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    
    paddingVertical: 2,
    borderRadius: 4,
  },
  gridTopBadgeText: {
    fontSize: 9,
    fontFamily: typography.family.mono,
    color: '#ffffff',
  },
  gridBody: {
    padding: 10,
    flexDirection: 'column',
    justifyContent: 'space-between',
    flex: 1,
  },
  gridTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1c1c',
    marginBottom: 2,
  },
  gridSubMeta: {
    fontSize: 10,
    color: '#5e5e5e',
    fontFamily: typography.family.mono,
  },
  gridFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  gridTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gridTimeText: {
    fontSize: 10,
    fontFamily: typography.family.mono,
    color: '#747878',
  },
  gridForwardBtn: {
    width: 24,
    height: 24,
    backgroundColor: '#1a1c1c',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackCover: {
    flex: 1,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 32,
    color: '#c4c7c7',
    fontWeight: 'bold',
  },
});






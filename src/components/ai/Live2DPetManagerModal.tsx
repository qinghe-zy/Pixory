import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, Alert } from 'react-native';

import { PET_MODELS, type PetModel } from '../../config/petModels';
import { radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import { live2dManagerService } from '../../services/live2dManagerService';

interface Live2DPetManagerModalProps {
  visible: boolean;
  currentModelId: string | null;
  onClose: () => void;
  onSelect: (modelId: string | null) => void;
}

export function Live2DPetManagerModal({
  visible,
  currentModelId,
  onClose,
  onSelect,
}: Live2DPetManagerModalProps) {
  const [downloadedMap, setDownloadedMap] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('全部');

  const refreshStatus = async () => {
    const map: Record<string, boolean> = {};
    for (const model of PET_MODELS) {
      map[model.id] = await live2dManagerService.isModelDownloaded(model.id);
    }
    setDownloadedMap(map);
  };

  useEffect(() => {
    if (visible) {
      void refreshStatus();
    }
  }, [visible]);

  const handleDownload = async (model: PetModel) => {
    if (!model.zipUrl) {
      Alert.alert('错误', '该模型不支持下载');
      return;
    }
    setDownloadingId(model.id);
    setProgress(0);
    try {
      await live2dManagerService.downloadAndUnzipModel(model.id, model.zipUrl, (p) => {
        setProgress(Math.round(p * 100));
      });
      await refreshStatus();
    } catch (e: any) {
      console.error(e);
      Alert.alert('下载失败', e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = (model: PetModel) => {
    Alert.alert('删除模型', `确定要删除 ${model.name} 的本地文件吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await live2dManagerService.deleteModel(model.id);
          if (currentModelId === model.id) {
            onSelect(null);
          }
          await refreshStatus();
        },
      },
    ]);
  };

  // Derive categories dynamically
  const categories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('全部');
    PET_MODELS.forEach(m => {
      if (m.category) cats.add(m.category);
    });
    return Array.from(cats);
  }, []);

  const filteredModels = useMemo(() => {
    if (activeCategory === '全部') return PET_MODELS;
    return PET_MODELS.filter(m => m.category === activeCategory);
  }, [activeCategory]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>2D 模型管理</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={aiLightColors.ink} />
            </Pressable>
          </View>

          <View style={styles.categoryTabsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryTabs}>
              {categories.map((cat) => {
                const isActive = activeCategory === cat;
                return (
                  <Pressable 
                    key={cat} 
                    style={[styles.catTab, isActive && styles.catTabActive]}
                    onPress={() => setActiveCategory(cat)}
                  >
                    <Text style={[styles.catTabText, isActive && styles.catTabTextActive]}>{cat}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {filteredModels.map((model) => {
              const isDownloaded = downloadedMap[model.id];
              const isDownloading = downloadingId === model.id;
              const isSelected = currentModelId === model.id;

              return (
                <View key={model.id} style={[styles.item, isSelected && styles.itemSelected]}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {model.name}
                    </Text>
                  </View>

                  <View style={styles.actions}>
                    {isDownloading ? (
                      <View style={styles.downloading}>
                        <ActivityIndicator size="small" color={aiLightColors.primary} />
                        <Text style={styles.progressText}>{progress}%</Text>
                      </View>
                    ) : isDownloaded ? (
                      <>
                        <Pressable
                          style={[styles.btn, styles.btnSelect, isSelected && styles.btnSelected]}
                          onPress={() => onSelect(isSelected ? null : model.id)}
                        >
                          <Text style={[styles.btnText, isSelected && styles.btnTextSelected]}>
                            {isSelected ? '已开启' : '开启'}
                          </Text>
                        </Pressable>
                        <Pressable style={styles.iconBtn} onPress={() => handleDelete(model)}>
                          <Ionicons name="trash-outline" size={20} color={aiLightColors.ink} />
                        </Pressable>
                      </>
                    ) : (
                      <Pressable style={[styles.btn, styles.btnDownload]} onPress={() => handleDownload(model)}>
                        <Ionicons name="cloud-download-outline" size={16} color={aiLightColors.surface} style={{ marginRight: 4 }} />
                        <Text style={styles.btnTextDownload}>下载</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: aiLightColors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    height: '80%',
    padding: spacing[4],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  title: {
    ...typography.textStyles.cardTitle,
    color: aiLightColors.ink,
  },
  closeBtn: {
    padding: spacing[1],
  },
  categoryTabsContainer: {
    marginBottom: spacing[3],
    marginHorizontal: -spacing[4], // Extend to edges
  },
  categoryTabs: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  catTab: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: aiLightColors.hairline,
  },
  catTabActive: {
    backgroundColor: aiLightColors.primary,
  },
  catTabText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  catTabTextActive: {
    color: aiLightColors.surface,
  },
  list: {
    paddingBottom: spacing[6],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: aiLightColors.hairline,
  },
  itemSelected: {
    backgroundColor: aiLightColors.primarySoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing[2],
    borderBottomWidth: 0,
  },
  itemInfo: {
    flex: 1,
    paddingRight: spacing[2],
  },
  itemName: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  downloading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressText: {
    ...typography.textStyles.micro,
    color: aiLightColors.primary,
    marginLeft: spacing[1],
    width: 32,
  },
  btn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  btnSelect: {
    backgroundColor: aiLightColors.hairline,
  },
  btnSelected: {
    backgroundColor: aiLightColors.primary,
  },
  btnText: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  btnTextSelected: {
    color: aiLightColors.surface,
  },
  btnDownload: {
    backgroundColor: aiLightColors.primary,
  },
  btnTextDownload: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.surface,
  },
  iconBtn: {
    padding: spacing[2],
    marginLeft: spacing[2],
  },
});

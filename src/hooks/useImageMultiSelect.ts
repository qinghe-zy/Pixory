import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

export function useImageMultiSelect(visibleImageIds: number[]) {
  const [selectedImageIds, setSelectedImageIds] = useState<number[]>([]);
  const selectedCount = selectedImageIds.length;
  const isSelectionMode = selectedCount > 0;
  const visibleIdSet = useMemo(() => new Set(visibleImageIds), [visibleImageIds]);
  const allSelected = visibleImageIds.length > 0 && selectedCount === visibleImageIds.length;

  useEffect(() => {
    setSelectedImageIds((current) => current.filter((imageId) => visibleIdSet.has(imageId)));
  }, [visibleIdSet]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isSelectionMode) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedImageIds([]);
      return true;
    });

    return () => subscription.remove();
  }, [isSelectionMode]);

  function enterSelection(imageId: number) {
    setSelectedImageIds([imageId]);
  }

  function toggleSelection(imageId: number) {
    setSelectedImageIds((current) =>
      current.includes(imageId) ? current.filter((item) => item !== imageId) : [...current, imageId]
    );
  }

  function toggleSelectAll() {
    setSelectedImageIds(allSelected ? [] : visibleImageIds);
  }

  function applyRuleSelection(imageIds: number[]) {
    const nextIds = imageIds.filter((imageId) => visibleIdSet.has(imageId));
    setSelectedImageIds([...new Set(nextIds)]);
  }

  function clearSelection() {
    setSelectedImageIds([]);
  }

  return {
    applyRuleSelection,
    allSelected,
    clearSelection,
    enterSelection,
    isSelectionMode,
    selectedCount,
    selectedImageIds,
    setSelectedImageIds,
    toggleSelectAll,
    toggleSelection,
  };
}

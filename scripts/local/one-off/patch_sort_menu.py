import re

with open('src/components/SortMenuButton.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Modal and Dimensions to imports
if 'Dimensions' not in content:
    content = content.replace("import { Pressable, StyleSheet, Text, View } from 'react-native';", "import { Pressable, StyleSheet, Text, View, Modal, Dimensions } from 'react-native';\nimport { useRef } from 'react';")
elif 'useRef' not in content:
    content = content.replace("import { useState } from 'react';", "import { useState, useRef } from 'react';")

old_comp = """export function SortMenuButton({
  orderBy,
  onChange,
  onFilterPress,
  hasActiveFilters,
  filterIcon,
}: {
  orderBy: ImageSortOrder;
  onChange: (orderBy: ImageSortOrder) => void;
  onFilterPress?: () => void;
  hasActiveFilters?: boolean;
  filterIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.pillContainer}>
        <Pressable
          accessibilityLabel="选择素材排序"
          onPress={() => setSortMenuVisible((visible) => !visible)}
          style={({ pressed }) => [
            styles.sortButton,
            sortMenuVisible && styles.buttonActive,
            pressed && styles.pressed,
          ]}
        >"""

new_comp = """export function SortMenuButton({
  orderBy,
  onChange,
  onFilterPress,
  hasActiveFilters,
  filterIcon,
}: {
  orderBy: ImageSortOrder;
  onChange: (orderBy: ImageSortOrder) => void;
  onFilterPress?: () => void;
  hasActiveFilters?: boolean;
  filterIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<View>(null);

  const handleOpen = () => {
    if (sortMenuVisible) {
      setSortMenuVisible(false);
      return;
    }
    buttonRef.current?.measure((x, y, w, h, px, py) => {
      const windowWidth = Dimensions.get('window').width;
      setMenuPos({ top: py + h + 6, right: windowWidth - px - w });
      setSortMenuVisible(true);
    });
  };

  return (
    <View style={styles.wrap} ref={buttonRef}>
      <View style={styles.pillContainer}>
        <Pressable
          accessibilityLabel="选择素材排序"
          onPress={handleOpen}
          style={({ pressed }) => [
            styles.sortButton,
            sortMenuVisible && styles.buttonActive,
            pressed && styles.pressed,
          ]}
        >"""

content = content.replace(old_comp, new_comp)

old_menu = """      {sortMenuVisible ? (
        <>
          <Pressable accessibilityLabel="关闭排序选择" onPress={() => setSortMenuVisible(false)} style={styles.dismissLayer} />
          <View style={styles.menu}>
            {IMAGE_SORT_OPTIONS.map((option) => {
              const selected = option.value === orderBy;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setSortMenuVisible(false);
                  }}
                  style={({ pressed }) => [styles.menuRow, selected ? styles.menuRowActive : null, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={[styles.menuText, selected ? styles.menuTextActive : null]}>{option.label}</Text>
                  <Ionicons color={selected ? colors.primary.active : colors.text.tertiary} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={15} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}"""

new_menu = """      <Modal
        visible={sortMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <Pressable accessibilityLabel="关闭排序选择" onPress={() => setSortMenuVisible(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.menu, { top: menuPos.top, right: menuPos.right }]}>
          {IMAGE_SORT_OPTIONS.map((option) => {
            const selected = option.value === orderBy;
            return (
              <Pressable
                accessibilityRole="button"
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setSortMenuVisible(false);
                }}
                style={({ pressed }) => [styles.menuRow, selected ? styles.menuRowActive : null, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={[styles.menuText, selected ? styles.menuTextActive : null]}>{option.label}</Text>
                <Ionicons color={selected ? colors.primary.active : colors.text.tertiary} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={15} />
              </Pressable>
            );
          })}
        </View>
      </Modal>"""

content = content.replace(old_menu, new_menu)

old_styles_menu = """  menu: {
    ...shadows.floating,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    minWidth: 156,
    padding: spacing[2],
    position: 'absolute',
    right: 0,
    top: 38,
    zIndex: 999,
    elevation: 99,
  },"""

new_styles_menu = """  menu: {
    ...shadows.floating,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    minWidth: 156,
    padding: spacing[2],
    position: 'absolute',
    zIndex: 999,
    elevation: 99,
  },"""

content = content.replace(old_styles_menu, new_styles_menu)

with open('src/components/SortMenuButton.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

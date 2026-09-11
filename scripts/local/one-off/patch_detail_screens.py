import re

def patch_screen(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add reanimated imports
    content = re.sub(
        r"import \{ (.*?) \} from 'react-native';",
        r"import { \1 } from 'react-native';\nimport Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';",
        content,
        count=1
    )

    # 2. Add scroll hooks inside component
    scroll_hooks = """  const scrollY = useSharedValue(0);
  const compactHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [10, 30], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [10, 30], [5, 0], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });
  const heroStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 20], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });
  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
      if (swipeSelection.onScroll) {
        runOnJS(swipeSelection.onScroll)(event);
      }
    },
  });
"""
    content = re.sub(
        r"(const swipeFilterDrawerPanResponder = useRef)",
        scroll_hooks + r"\n  \1",
        content,
        count=1
    )

    # 3. Create the compactRightAction
    right_action = """
  const selectAllButton = multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0 ? (
    <Pressable
      disabled={selectableAssets.length === 0}
      onPress={multiSelect.toggleSelectAll}
      style={({ pressed }) => [styles.selectAllButton, selectableAssets.length === 0 ? styles.disabled : null, pressed && selectableAssets.length > 0 ? styles.pressed : null]}
    >
      <Text style={styles.selectAllText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
    </Pressable>
  ) : null;

  const sortButton = (
    <SortMenuButton
      hasActiveFilters={hasActiveFilters}
      onChange={setSortOrder}
      onFilterPress={() => setIsFilterDrawerOpen(true)}
      orderBy={sortOrder}
    />
  );

  const compactRightAction = (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, compactHeaderStyle]} pointerEvents="box-none">
      <Text style={{ ...typography.textStyles.bodyStrong, color: colors.text.title }}>
        {images.length} 张
      </Text>
      {selectAllButton}
      {sortButton}
    </Animated.View>
  );
"""
    content = re.sub(
        r"(const footer = multiSelect.isSelectionMode \?)",
        right_action + r"\n  \1",
        content,
        count=1
    )

    # 4. Add rightAction to ScreenScaffold
    content = re.sub(
        r"(<ScreenScaffold[\s\S]*?)(>)",
        r"\1\n      rightAction={compactRightAction}\n    \2",
        content,
        count=1
    )

    # 5. Move galleryHeading into VirtualizedAssetCollection headerComponent
    gallery_heading_match = re.search(r"(<View style=\{styles\.galleryHeading\}>.*?</View>)\s*<VirtualizedAssetCollection", content, re.DOTALL)
    if gallery_heading_match:
        original_heading = gallery_heading_match.group(1)
        animated_heading = f"<Animated.View style={{heroStyle}}>\n{original_heading}\n</Animated.View>"
        
        content = content.replace(original_heading, "")
        content = re.sub(
            r"(<VirtualizedAssetCollection\s+)",
            r"\1headerComponent={" + animated_heading + r"}\n          ",
            content,
            count=1
        )

    # 6. Replace swipeSelection.onScroll with handleScroll
    content = re.sub(
        r"onScroll=\{swipeSelection\.onScroll\}",
        r"onScroll={handleScroll}",
        content,
        count=1
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

patch_screen('src/screens/GroupImagesScreen.tsx')
patch_screen('src/screens/TagResultScreen.tsx')

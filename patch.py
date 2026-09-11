import re

with open('src/screens/AllImagesScreen.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# I will replace the animation styles
styles_start = code.find('const heroFadeStyle = useAnimatedStyle')
styles_end = code.find('const scrollOffsetRef = useRef(0);')

new_styles = '''
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const EXPANDED_TOP = statusBarHeight + layout.pageTopOffset;
  const ROW_HEIGHT = 44;
  const EXPANDED_GAP = rhythm.screenSectionGap;
  const COUNT_TOP = EXPANDED_TOP + ROW_HEIGHT + EXPANDED_GAP;
  const COMPACT_TOP = statusBarHeight + 12;
  const SCROLL_RANGE = [0, 80];

  const headerBgStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [40, 80], [0, 1], Extrapolation.CLAMP);
    const height = interpolate(scrollY.value, SCROLL_RANGE, [COUNT_TOP + 40, statusBarHeight + 56], Extrapolation.CLAMP);
    return { opacity, height };
  });

  const titleStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, SCROLL_RANGE, [1, 0.75], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, SCROLL_RANGE, [EXPANDED_TOP, COMPACT_TOP], Extrapolation.CLAMP);
    const translateX = interpolate(scrollY.value, SCROLL_RANGE, [layout.pagePaddingHorizontal, layout.pagePaddingHorizontal - 15], Extrapolation.CLAMP);
    return { transform: [{ translateX }, { translateY }, { scale }] };
  });

  const countStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, SCROLL_RANGE, [1, 0.85], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, SCROLL_RANGE, [COUNT_TOP, COMPACT_TOP + 2], Extrapolation.CLAMP);
    // Move from left aligned to right of the title. Assume title width ~120px.
    const translateX = interpolate(scrollY.value, SCROLL_RANGE, [layout.pagePaddingHorizontal, layout.pagePaddingHorizontal + 110], Extrapolation.CLAMP);
    return { transform: [{ translateX }, { translateY }, { scale }] };
  });

  const addButtonStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, SCROLL_RANGE, [1, 0.8], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, SCROLL_RANGE, [EXPANDED_TOP - 4, COMPACT_TOP - 4], Extrapolation.CLAMP);
    // Starts at right edge, stays at right edge
    return { transform: [{ translateY }, { scale }] };
  });

  const sortFilterStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, SCROLL_RANGE, [1, 0.85], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, SCROLL_RANGE, [COUNT_TOP - 4, COMPACT_TOP - 4], Extrapolation.CLAMP);
    // Slides left to be next to add button
    const translateX = interpolate(scrollY.value, SCROLL_RANGE, [0, -40], Extrapolation.CLAMP);
    return { transform: [{ translateX }, { translateY }, { scale }] };
  });
'''

code = code[:styles_start] + new_styles + '\n  ' + code[styles_end:]

# Now replace the rendering
render_start = code.find('const headingNode = (')
render_end = code.find('<VirtualizedAssetCollection')

new_render = '''
  const spacerHeight = statusBarHeight + layout.pageTopOffset + 44 + rhythm.screenSectionGap + 40;
  const headingSpacer = <View style={{ height: spacerHeight }} />;

  return (
    <View style={styles.host} {...swipeFilterDrawerPanResponder.panHandlers}>
    <ScreenScaffold
      backgroundVariant="gallery"
      footer={footer}
      showHeader={false}
      fullScreen={true}
      scrollable={false}
      contentContainerStyle={{ padding: 0, gap: 0, flex: 1 }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, headerBgStyle, { zIndex: 10, backgroundColor: colors.background.elevated }]} pointerEvents="none">
        <BlurView intensity={80} style={StyleSheet.absoluteFill} tint={space === 'personal' ? 'dark' : 'light'} />
      </Animated.View>

      <View style={[StyleSheet.absoluteFill, { zIndex: 11 }]} pointerEvents="box-none">
        {/* Title */}
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, titleStyle, { transformOrigin: 'left center' as any }]} pointerEvents="none">
          <Text style={{ ...typography.textStyles.title, color: colors.text.title }}>{ip ? 全部素材 ·  : '全部素材'}</Text>
        </Animated.View>
        
        {/* Count */}
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, countStyle, { transformOrigin: 'left center' as any }]} pointerEvents="none">
          <Text style={styles.galleryTitle}>{hasActiveFilters ? '筛选结果' : '全部素材'} · {images.length} 张</Text>
        </Animated.View>

        {/* Add Button */}
        <Animated.View style={[{ position: 'absolute', top: 0, right: layout.pagePaddingHorizontal }, addButtonStyle, { transformOrigin: 'right center' as any }]}>
          <Pressable onPress={onImportImages} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
            <Ionicons color={colors.text.title} name="add" size={24} />
          </Pressable>
        </Animated.View>

        {/* Sort/Filter */}
        <Animated.View style={[{ position: 'absolute', top: 0, right: layout.pagePaddingHorizontal }, sortFilterStyle, { transformOrigin: 'right center' as any }]}>
          <View style={styles.galleryActions}>
            {multiSelect.isSelectionMode || multiSelect.selectedImageIds.length > 0 ? (
              <Pressable
                disabled={selectableAssets.length === 0}
                onPress={multiSelect.toggleSelectAll}
                style={({ pressed }) => [styles.selectAllButton, selectableAssets.length === 0 ? styles.disabled : null, pressed && selectableAssets.length > 0 ? styles.pressed : null]}
              >
                <Text style={styles.selectAllText}>{multiSelect.allSelected ? '取消全选' : '全选'}</Text>
              </Pressable>
            ) : null}
            <SortMenuButton
              hasActiveFilters={hasActiveFilters}
              onChange={setSortOrder}
              onFilterPress={() => setIsFilterDrawerOpen(true)}
              orderBy={sortOrder}
            />
          </View>
        </Animated.View>
      </View>

      '''

code = code[:render_start] + new_render + code[render_end:]

with open('src/screens/AllImagesScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

import re

with open('src/screens/AllImagesScreen.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

styles_start = code.find('const statusBarHeight = Platform.OS')
styles_end = code.find('const scrollOffsetRef = useRef(0);')

new_styles = '''
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  
  // iOS-style large title fade interpolation
  const compactHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [40, 80], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [40, 80], [10, 0], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateY }] };
  });

  const heroStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [20, 70], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });
'''

code = code[:styles_start] + new_styles + '\n  ' + code[styles_end:]

render_start = code.find('const spacerHeight =')
if render_start == -1:
    render_start = code.find('return (')

render_end = code.find('<VirtualizedAssetCollection')

new_render = '''
  const rightAction = (
    <Pressable
      accessibilityLabel={commonButtonCopy.importImages}
      onPress={onImportImages}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <Ionicons color={colors.text.title} name="add" size={24} />
    </Pressable>
  );

  const headingNode = (
    <Animated.View style={[{ paddingBottom: rhythm.microGap, marginHorizontal: -layout.pagePaddingHorizontal }, heroStyle]}>
      <Header
        decorativeTitle="Gallery"
        rightSlot={rightAction}
        title={ip ? 全部素材 ·  : '全部素材'}
      />
      <View style={[styles.galleryHeading, { paddingHorizontal: layout.pagePaddingHorizontal, paddingTop: rhythm.screenSectionGap }]}>
        <Text style={{ ...typography.textStyles.bodyStrong, color: colors.text.title, marginBottom: 4 }}>
          {hasActiveFilters ? '筛选结果' : '全部素材'} · {images.length} 张
        </Text>
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
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.host} {...swipeFilterDrawerPanResponder.panHandlers}>
    <ScreenScaffold
      backgroundVariant="gallery"
      footer={footer}
      showHeader={false}
      scrollable={false}
      contentContainerStyle={{ padding: 0, gap: 0, flex: 1 }}
    >
      {/* Compact Sticky Header */}
      <Animated.View style={[
        { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: statusBarHeight, height: statusBarHeight + 56 },
        compactHeaderStyle
      ]} pointerEvents="box-none">
        <BlurView intensity={space === 'personal' ? 80 : 30} style={StyleSheet.absoluteFill} tint={space === 'personal' ? 'dark' : 'light'} />
        
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.pagePaddingHorizontal }}>
          <Text style={{ ...typography.textStyles.bodyStrong, color: colors.text.title }}>
            {images.length} 张
          </Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SortMenuButton
              hasActiveFilters={hasActiveFilters}
              onChange={setSortOrder}
              onFilterPress={() => setIsFilterDrawerOpen(true)}
              orderBy={sortOrder}
            />
            <Pressable onPress={onImportImages} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed, { width: 32, height: 32 }]}>
              <Ionicons color={colors.text.title} name="add" size={20} />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <PageStateBlock
        loadingComponent={<GallerySkeleton />}
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription={
          !hasActiveFilters
            ? '上传第一张图片后，就可以在这里按分组和标签进行管理'
            : '这个筛选条件下暂时没有素材。'
        }
        emptyTitle={!hasActiveFilters ? '您的个人素材库' : commonEmptyStateCopy.noSearchResultTitle}
        onEmptyAction={onImportImages}
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地索引加载完成后，这里会展示当前 IP 下的全部素材。"
        loadingTitle="正在读取素材库"
      >
      '''

code = code[:render_start] + new_render + code[render_end:]

with open('src/screens/AllImagesScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

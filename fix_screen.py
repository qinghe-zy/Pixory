import re

with open('src/screens/AllImagesScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix the worklet crash
old_handle_scroll = '''  const scrollOffsetRef = useRef(0);
  const scrollY = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const updateScrollY = swipeSelection.updateScrollY;

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const offsetY = event.contentOffset.y;
      scrollOffsetRef.current = offsetY;
      scrollY.value = offsetY;
      runOnJS(updateScrollY)(offsetY);
    },
  });'''

new_handle_scroll = '''  const scrollOffsetRef = useRef(0);
  const scrollY = useSharedValue(0);
  const insets = useSafeAreaInsets();

  const syncScrollJS = (y: number) => {
    scrollOffsetRef.current = y;
    swipeSelection.updateScrollY(y);
  };

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
      runOnJS(syncScrollJS)(event.contentOffset.y);
    },
  });'''
content = content.replace(old_handle_scroll, new_handle_scroll)

# 2. Fix the JSX structure
# We need to remove:
# title={ip ? \全部素材 · \\ : '全部素材'}
# rightAction={rightAction}
# from ScreenScaffold
content = re.sub(r'rightAction=\{rightAction\}\s*title=\{[^\}]+\}', 'showHeader={false}', content)

# We need to insert {animatedOverlay} right after ScreenScaffold opening tag, and remove the old galleryHeading
# The old gallery heading starts with <View style={styles.galleryHeading}> and ends before <VirtualizedAssetCollection
old_gallery_heading = r'<View style=\{styles\.galleryHeading\}>.*?</View>\s*(?=<VirtualizedAssetCollection)'
content = re.sub(old_gallery_heading, '', content, flags=re.DOTALL)

# Insert {animatedOverlay} right after <ScreenScaffold ...>
# Wait, it's easier to insert it right before <ScreenScaffold> in the host View.
content = content.replace('<ScreenScaffold', '{animatedOverlay}\n      <ScreenScaffold')

with open('src/screens/AllImagesScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

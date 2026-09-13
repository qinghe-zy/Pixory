import re

def rewrite(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add BlurView import if not exists
    if 'from \'expo-blur\'' not in content:
        content = re.sub(
            r"import \{ (.*?) \} from 'react-native';",
            r"import { \1 } from 'react-native';\nimport { BlurView } from 'expo-blur';\nimport { useSafeAreaInsets } from 'react-native-safe-area-context';\nimport { Header } from '../components/Header';",
            content,
            count=1
        )
    
    # 2. Add statusBarHeight
    if 'const insets = useSafeAreaInsets();' not in content:
        content = re.sub(
            r"(const scrollY = useSharedValue\(0\);)",
            r"const insets = useSafeAreaInsets();\n  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;\n  \1",
            content,
            count=1
        )

    # 3. Modify ScreenScaffold props
    content = re.sub(
        r"(<ScreenScaffold\b[^>]*?)(>)",
        r"\1\n      showHeader={false}\n      fullScreen={true}\n    \2",
        content,
        count=1
    )
    
    content = re.sub(r"\n\s*rightAction=\{compactRightAction\}", "", content)
    content = re.sub(r"\n\s*title=\{.*?\}", "", content)
    content = re.sub(r"\n\s*onBack=\{onBack\}", "", content)

    # 4. Inject the floating Header inside ScreenScaffold
    title_prop = "group ? group.name : '分组图片'" if "GroupImagesScreen" in file_path else "tag ? `#${tag.name}` : '标签结果'"
    
    floating_header = f"""
      <View style={{{{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}}} pointerEvents="box-none">
        <Animated.View style={{[StyleSheet.absoluteFill, compactHeaderStyle]}} pointerEvents="none">
          <BlurView intensity={{{{'space' in content and 'space === \\'personal\\'' or '30'}}}} style={{StyleSheet.absoluteFill}} tint={{{{'space' in content and 'space === \\'personal\\'' or '\\'light\\''}}}} />
        </Animated.View>
        <Header
          title={{{title_prop}}}
          onBack={{onBack}}
          rightSlot={{compactRightAction}}
        />
      </View>"""
    
    # Let's fix the intensity/tint logic
    intensity_logic = "space === 'personal' ? 60 : 30" if "space" in content else "30"
    tint_logic = "space === 'personal' ? 'dark' : 'light'" if "space" in content else "'light'"
    floating_header = f"""
      <View style={{{{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}}} pointerEvents="box-none">
        <Animated.View style={{[StyleSheet.absoluteFill, compactHeaderStyle]}} pointerEvents="none">
          <BlurView intensity={{{intensity_logic}}} style={{StyleSheet.absoluteFill}} tint={{{tint_logic}}} />
        </Animated.View>
        <Header
          title={{{title_prop}}}
          onBack={{onBack}}
          rightSlot={{compactRightAction}}
        />
      </View>"""

    content = re.sub(
        r"(<ScreenScaffold[^>]*>)",
        r"\1\n" + floating_header,
        content,
        count=1
    )

    # 5. Add paddingTop to the headerComponent
    content = re.sub(
        r"headerComponent=\{<Animated\.View style=\{heroStyle\}>",
        r"headerComponent={<Animated.View style={[{ paddingTop: statusBarHeight + 56 }, heroStyle]}>",
        content,
        count=1
    )

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

rewrite('src/screens/GroupImagesScreen.tsx')
rewrite('src/screens/TagResultScreen.tsx')

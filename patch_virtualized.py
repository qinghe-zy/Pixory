import re

with open('src/components/VirtualizedAssetCollection.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_stmt = "import { Dimensions, FlatList, StyleSheet, View } from 'react-native';"
if 'Dimensions' not in content:
    content = content.replace("import { FlatList, StyleSheet, View } from 'react-native';", import_stmt)
    content = content.replace("import { type GestureResponderHandlers, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';", "import { Dimensions, FlatList, StyleSheet, View, type GestureResponderHandlers, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';")

# Find the FlatList opening tag
# Add getItemLayout
get_item_layout_code = """
      getItemLayout={(data, index) => {
        const windowWidth = Dimensions.get('window').width;
        const contentWidth = windowWidth - 40; // spacing[5] * 2 padding in ScreenScaffold
        const itemHeight = isGrid ? (contentWidth * 0.318) : 86;
        const gap = 12; // rhythm.listCardGap
        const rowHeight = itemHeight + gap;
        return {
          length: rowHeight,
          offset: rowHeight * (isGrid ? Math.floor(index / 3) : index),
          index,
        };
      }}
"""

if 'getItemLayout=' not in content:
    content = content.replace('initialScrollIndex={initialIndex.current !== -1 ? initialIndex.current : undefined}', 'initialScrollIndex={initialIndex.current !== -1 ? initialIndex.current : undefined}' + get_item_layout_code)

with open('src/components/VirtualizedAssetCollection.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

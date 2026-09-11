const fs = require('fs');
let content = fs.readFileSync('src/screens/AllImagesScreen.tsx', 'utf-8');

// 1. Add runOnJS and useAnimatedScrollHandler to reanimated imports
content = content.replace(
  /import Animated, {[^}]+} from 'react-native-reanimated';/,
  "import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';"
);

// 2. Add BlurView import if not exists
if (!content.includes('BlurView')) {
  content = content.replace(
    /import { Animated as RNAnimated[^}]*} from 'react-native';/,
    "import { Animated as RNAnimated, Dimensions, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';\nimport { BlurView } from 'expo-blur';"
  );
}

fs.writeFileSync('src/screens/AllImagesScreen.tsx', content);

import { useMemo, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { dreamAssets } from '../../ai/dream/dreamAssets';
import type { DiaryPageContent } from '../../ai/diary/diaryPaginationService';
import { colors, metrics, spacing, typography } from '../../design/tokens';
const spring={damping:20,stiffness:220,mass:.8};
// The 360dp cap is the physical reader width; these ink colors belong to the generated dream asset.
const dreamInk={body:'#222B40',meta:'#53617F',action:'#526890'} as const;
export function DreamDeckPager({createdAt,pages,contextOptIn,onContextChoice}:{createdAt:string;pages:DiaryPageContent[];contextOptIn:boolean|null;onContextChoice:(accepted:boolean)=>void}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const tx = useSharedValue(0);
  const opacity = useSharedValue(1);
  const pageWidth = Math.min(width - spacing[8], 360);
  const visible = useMemo(
    () => [0, 1, 2].map((offset) => pages[index + offset]).filter(Boolean),
    [index, pages],
  );
  const advance = (direction: 1 | -1) => {
    setIndex((current) => Math.max(0, Math.min(pages.length - 1, current + direction)));
    tx.value = 0;
    opacity.value = 1;
  };
  const pan = Gesture.Pan().activeOffsetX([-16,16]).failOffsetY([-14,14]).onUpdate((event) => {
    tx.value = event.translationX;
  }).onEnd((event) => {
    const direction = event.translationX < -pageWidth * .18 || event.velocityX < -560
      ? 1
      : event.translationX > pageWidth * .18 || event.velocityX > 560 ? -1 : 0;
    const atBoundary = direction === 1 ? index >= pages.length - 1 : direction === -1 ? index <= 0 : true;
    if (atBoundary || pages.length < 2) {
      tx.value = withSpring(0, spring);
      return;
    }
    opacity.value = withTiming(0, { duration: 120 });
    tx.value = withTiming(direction * -pageWidth * 1.05, { duration: 170 }, () => runOnJS(advance)(direction as 1|-1));
  });
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: tx.value }] }));
  if (pages.length === 0) return null;
  return <View style={styles.host}><GestureDetector gesture={pan}><View style={{height:pageWidth/(9/13),width:pageWidth}}>{visible.slice().reverse().map((page,reverseIndex)=>{const slot=visible.length-1-reverseIndex;const front=slot===0;const last=page.index===pages.length-1;return <Animated.View key={`${page.index}:${slot}`} style={[styles.page,{top:slot*8},front&&animated]}><ImageBackground source={dreamAssets.moonlitBotanical} style={styles.background}><View style={styles.veil}><Text style={styles.header}>{page.index===0?'DREAM · '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(createdAt)):'DREAM · CONTINUED'}</Text><Text style={styles.body}>{page.body}</Text>{last?<View style={styles.context}><Text style={styles.contextText}>是否影响后续对话？</Text><Pressable accessibilityRole="button" accessibilityState={{selected:contextOptIn===true}} onPress={()=>onContextChoice(true)} style={styles.touch}><Text style={[styles.action,contextOptIn===true&&styles.selected]}>是</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{selected:contextOptIn===false}} onPress={()=>onContextChoice(false)} style={styles.touch}><Text style={[styles.action,contextOptIn===false&&styles.selected]}>否</Text></Pressable></View>:null}</View></ImageBackground></Animated.View>})}</View></GestureDetector><Text style={styles.count}>{index+1} / {pages.length}</Text></View>;
}
const styles=StyleSheet.create({host:{alignItems:'center',flex:1,justifyContent:'center',paddingTop:spacing[6]},page:{bottom:0,left:0,position:'absolute',right:0,top:0},background:{aspectRatio:9/13,overflow:'hidden'},veil:{backgroundColor:'rgba(240,243,250,0.44)',flex:1,paddingBottom:spacing[5],paddingHorizontal:spacing[6],paddingTop:spacing[7]},header:{...typography.textStyles.caption,color:dreamInk.meta,fontWeight:'600'},body:{...typography.textStyles.body,color:dreamInk.body,flex:1,fontFamily:typography.family.serif,fontSize:16,lineHeight:29,marginTop:spacing[7]},context:{alignItems:'center',alignSelf:'flex-end',flexDirection:'row',marginTop:spacing[3]},contextText:{...typography.textStyles.caption,color:dreamInk.meta},touch:{alignItems:'center',height:metrics.minTouchSize,justifyContent:'center',paddingHorizontal:spacing[2]},action:{...typography.textStyles.caption,color:dreamInk.action},selected:{color:colors.text.secondary,fontWeight:'600'},count:{...typography.textStyles.bodyStrong,color:colors.text.secondary,marginTop:spacing[5]}});

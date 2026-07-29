import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { dreamAssets } from '../../ai/dream/dreamAssets';
import { colors, radius, shadows, spacing, typography } from '../../design/tokens';

// Asset-specific ink colors preserve contrast against the generated moonlit background.
const dreamInk = { title: '#283149', action: '#586A96' } as const;

function label(value:string):string{const date=new Date(value);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(t:string)=>parts.find(p=>p.type===t)?.value??'';const key=`${get('year')}-${get('month')}-${get('day')}`;const nowParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const today=`${nowParts.find(p=>p.type==='year')?.value}-${nowParts.find(p=>p.type==='month')?.value}-${nowParts.find(p=>p.type==='day')?.value}`;return key===today?`TODAY · ${get('hour')}:${get('minute')}`:`${key.replaceAll('-','.')} · ${get('hour')}:${get('minute')}`}

export function DreamChatCard({createdAt,title,onOpen,status,onRetry}:{createdAt:string;title:string;onOpen?:()=>void;status?:'generating'|'failed'|'completed';onRetry?:()=>void}){
  return (
    <View style={styles.host}>
      <Pressable accessibilityLabel={status==='failed'?'重试梦境制作':'查看梦境'} accessibilityRole="button" onPress={status==='failed'?onRetry:onOpen} disabled={status==='generating'} style={({pressed})=>[styles.card,pressed&&styles.pressed]}>
        <ImageBackground imageStyle={styles.image} source={dreamAssets.moonlitBotanical} style={styles.background}>
          <View style={styles.veil}>
            <Text style={styles.meta}>{label(createdAt)}</Text>
            <Text numberOfLines={1} style={styles.title}>{status==='generating'?'梦境制作中...':status==='failed'?'制作失败':title}</Text>
            {status==='generating' ? (
              <View style={styles.spinnerWrapper}><ActivityIndicator color={dreamInk.action} size="small" /></View>
            ) : status==='failed' ? (
              <Text style={styles.open}>点击重试</Text>
            ) : (
              <Text style={styles.open}>查看梦境</Text>
            )}
          </View>
        </ImageBackground>
      </Pressable>
    </View>
  );
}

const styles=StyleSheet.create({host:{paddingHorizontal:spacing[4],paddingVertical:spacing[2]},card:{borderRadius:radius.sm,overflow:'hidden',...shadows.sm},pressed:{opacity:.88},background:{aspectRatio:2.6,justifyContent:'flex-end'},image:{borderRadius:radius.sm},veil:{backgroundColor:'rgba(238,241,248,0.70)',paddingHorizontal:spacing[3],paddingVertical:spacing[2]},meta:{...typography.textStyles.micro,color:colors.text.secondary,letterSpacing:0},title:{...typography.textStyles.caption,color:dreamInk.title,marginTop:1,paddingRight:96},open:{...typography.textStyles.caption,color:dreamInk.action,position:'absolute',right:spacing[3],top:spacing[3]},spinnerWrapper:{position:'absolute',right:spacing[3],top:spacing[3]}});

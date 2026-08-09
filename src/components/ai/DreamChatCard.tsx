import { ActivityIndicator, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { dreamAssets } from '../../ai/dream/dreamAssets';
import { colors, radius, shadows, spacing, typography } from '../../design/tokens';

// Asset-specific ink colors preserve contrast against the generated moonlit background.
const dreamInk = { title: '#283149', action: '#586A96' } as const;

function label(value:string):string{const date=new Date(value);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const get=(t:string)=>parts.find(p=>p.type===t)?.value??'';const key=`${get('year')}-${get('month')}-${get('day')}`;const nowParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const today=`${nowParts.find(p=>p.type==='year')?.value}-${nowParts.find(p=>p.type==='month')?.value}-${nowParts.find(p=>p.type==='day')?.value}`;return key===today?`TODAY · ${get('hour')}:${get('minute')}`:`${key.replaceAll('-','.')} · ${get('hour')}:${get('minute')}`}

export function DreamChatCard({actionLabel,createdAt,failureMessage,title,onCancel,onOpen,status,onRetry}:{actionLabel?:string;createdAt:string;failureMessage?:string;title:string;onCancel?:()=>void;onOpen?:()=>void;status?:'generating'|'failed'|'waiting_model'|'completed';onRetry?:()=>void}){
  const failed = status === 'failed' || status === 'waiting_model';
  const content = (
    <ImageBackground imageStyle={styles.image} source={dreamAssets.moonlitBotanical} style={styles.background}>
      <View style={styles.veil}>
        <Text style={styles.meta}>{label(createdAt)}</Text>
        <View style={styles.actionRow}>
          <Text numberOfLines={1} style={styles.title}>{status==='generating'?'梦境制作中...':failed?(failureMessage??'梦境生成失败，请稍后重试。'):title}</Text>
          {status==='generating' ? (
            <View style={styles.generatingActions}>
              <ActivityIndicator color={dreamInk.action} size="small" />
              <Pressable accessibilityLabel="取消梦境制作" accessibilityRole="button" hitSlop={spacing[2]} onPress={onCancel} style={({pressed})=>pressed&&styles.pressed}>
                <Text style={styles.open}>取消</Text>
              </Pressable>
            </View>
          ) : failed ? (
            <Text numberOfLines={1} style={styles.open}>{actionLabel??'重试'}</Text>
          ) : (
            <Text numberOfLines={1} style={styles.open}>查看梦境</Text>
          )}
        </View>
      </View>
    </ImageBackground>
  );
  return (
    <View style={styles.host}>
      {status === 'generating' ? (
        <View style={styles.card}>{content}</View>
      ) : (
        <Pressable accessibilityLabel={failed?(actionLabel??'重试梦境制作'):'查看梦境'} accessibilityRole="button" onPress={failed?onRetry:onOpen} style={({pressed})=>[styles.card,pressed&&styles.pressed]}>
          {content}
        </Pressable>
      )}
    </View>
  );
}

const styles=StyleSheet.create({host:{paddingHorizontal:spacing[4],paddingVertical:spacing[2]},card:{borderRadius:radius.sm,overflow:'hidden',...shadows.sm},pressed:{opacity:.88},background:{aspectRatio:2.6,justifyContent:'flex-end'},image:{borderRadius:radius.sm},veil:{backgroundColor:'rgba(238,241,248,0.70)',paddingHorizontal:spacing[3],paddingVertical:spacing[2]},meta:{...typography.textStyles.micro,color:colors.text.secondary,letterSpacing:0},actionRow:{alignItems:'center',flexDirection:'row',gap:spacing[2],marginTop:1},generatingActions:{alignItems:'center',flexDirection:'row',gap:spacing[2]},title:{...typography.textStyles.caption,color:dreamInk.title,flex:1},open:{...typography.textStyles.caption,color:dreamInk.action,flexShrink:0}});

import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { aiLightColors } from './aiLightTheme';
import { typography, radius, spacing } from '../../design/tokens';

export function AiLinkPreviewCard({ url }: { url: string }) {
  const [meta, setMeta] = useState<{ title?: string; description?: string; image?: string; domain?: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const timeoutId = setTimeout(() => {
      if (active) setFailed(true);
    }, 8000);

    async function fetchOg() {
      try {
        const res = await fetch(url);
        clearTimeout(timeoutId);
        const text = await res.text();
        const titleMatch = text.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i) || text.match(/<title>([^<]+)<\/title>/i);
        const descMatch = text.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i) || text.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
        const imgMatch = text.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i);
        
        if (active) {
          try {
            const domain = new URL(url).hostname;
            if (titleMatch || descMatch) {
              setMeta({
                title: titleMatch ? titleMatch[1] : undefined,
                description: descMatch ? descMatch[1] : undefined,
                image: imgMatch ? imgMatch[1] : undefined,
                domain,
              });
            } else {
              setFailed(true);
            }
          } catch (e) {
            setFailed(true);
          }
        }
      } catch (err) {
        if (active) setFailed(true);
      }
    }
    fetchOg();
    return () => { 
      active = false; 
      clearTimeout(timeoutId);
    };
  }, [url]);

  if (failed) {
    return (
      <Pressable onPress={() => Linking.openURL(url)} style={styles.fallback}>
        <Text style={styles.fallbackText} numberOfLines={1}>{url}</Text>
      </Pressable>
    );
  }

  if (!meta) {
    return (
      <View style={styles.card}>
        <Text style={styles.loadingText}>解析链接中...</Text>
      </View>
    );
  }

  return (
    <Pressable style={styles.card} onPress={() => Linking.openURL(url)}>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{meta.title || meta.domain}</Text>
        {meta.description ? <Text style={styles.description} numberOfLines={2}>{meta.description}</Text> : null}
        <Text style={styles.domain} numberOfLines={1}>{meta.domain}</Text>
      </View>
      {meta.image ? <Image source={{ uri: meta.image }} style={styles.image} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fallback: {
    paddingVertical: spacing[1],
  },
  fallbackText: {
    color: aiLightColors.coral,
    textDecorationLine: 'underline',
  },
  card: {
    flexDirection: 'row',
    backgroundColor: aiLightColors.surface,
    borderWidth: 1,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginVertical: spacing[2],
  },
  content: {
    flex: 1,
    padding: spacing[2],
    justifyContent: 'center',
  },
  title: {
    ...typography.textStyles.body,
    fontWeight: 'bold',
    color: aiLightColors.ink,
  },
  description: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    marginTop: spacing[1],
  },
  domain: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedSoft,
    marginTop: spacing[1],
  },
  image: {
    width: 80,
    height: 80,
    backgroundColor: aiLightColors.card,
    alignSelf: 'center',
  },
  loadingText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    padding: spacing[2],
  },
});

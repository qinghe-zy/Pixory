import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

const LINK_PREVIEW_TIMEOUT_MS = 8000;
const LINK_PREVIEW_MAX_BYTES = 160_000;
const LINK_PREVIEW_ALLOWED_CONTENT_TYPE = /^(?:text\/html\b|application\/xhtml\+xml\b)/i;

type LinkPreviewMeta = {
  description?: string;
  domain: string;
  image?: string;
  title?: string;
};

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pickMetaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return undefined;
}

function pickTitle(html: string): string | undefined {
  const title = pickMetaContent(html, 'og:title') ?? pickMetaContent(html, 'twitter:title');
  if (title) return title;
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}

function resolveOgImageUrl(rawImageUrl: string | undefined, pageUrl: string): string | undefined {
  if (!rawImageUrl) return undefined;
  try {
    const resolved = new URL(rawImageUrl, pageUrl);
    return /^https?:$/i.test(resolved.protocol) ? resolved.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function readBoundedHtml(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let html = '';
    while (html.length < LINK_PREVIEW_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    return html.slice(0, LINK_PREVIEW_MAX_BYTES);
  }
  const text = await response.text();
  return text.length > LINK_PREVIEW_MAX_BYTES ? text.slice(0, LINK_PREVIEW_MAX_BYTES) : text;
}

async function fetchLinkPreviewMeta(url: string, signal: AbortSignal): Promise<LinkPreviewMeta> {
  const response = await fetch(url, {
    headers: { Accept: 'text/html,application/xhtml+xml;q=0.9' },
    signal,
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !LINK_PREVIEW_ALLOWED_CONTENT_TYPE.test(contentType)) {
    throw new Error('Unsupported link preview response');
  }

  const html = await readBoundedHtml(response);
  const title = pickTitle(html);
  const description = pickMetaContent(html, 'og:description') ?? pickMetaContent(html, 'description') ?? pickMetaContent(html, 'twitter:description');
  const image = resolveOgImageUrl(pickMetaContent(html, 'og:image') ?? pickMetaContent(html, 'twitter:image'), url);
  const domain = getDomain(url);
  if (!title && !description) {
    throw new Error('Missing preview metadata');
  }
  return { description, domain, image, title };
}

export function AiLinkPreviewCard({ url }: { url: string }) {
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [meta, setMeta] = useState<LinkPreviewMeta | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const domain = meta?.domain ?? getDomain(url);

  function resetPreviewState() {
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    setMeta(null);
    setLoadState('idle');
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    resetPreviewState();
  }, [url]);

  async function loadPreview() {
    if (loadState === 'loading') return;
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current?.abort();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), LINK_PREVIEW_TIMEOUT_MS);
    setLoadState('loading');
    try {
      const nextMeta = await fetchLinkPreviewMeta(url, controller.signal);
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      setMeta(nextMeta);
      setLoadState('ready');
    } catch {
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      setLoadState('failed');
    } finally {
      clearTimeout(timeoutId);
      if (mountedRef.current && requestIdRef.current === requestId && abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }

  async function openUrl() {
    try {
      await Linking.openURL(url);
    } catch {
      setLoadState('failed');
    }
  }

  const isReady = loadState === 'ready' && meta;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={loadState === 'ready' ? openUrl : loadPreview}
      onLongPress={openUrl}
      style={styles.card}
    >
      <View style={styles.iconWrap}>
        <Ionicons color={aiLightColors.coralActive} name={isReady ? 'open-outline' : 'link-outline'} size={18} />
      </View>
      <View style={styles.content}>
        <Text numberOfLines={2} style={styles.title}>
          {isReady ? meta.title || domain : domain}
        </Text>
        <Text numberOfLines={2} style={styles.description}>
          {isReady
            ? meta.description
            : loadState === 'loading'
              ? '正在读取网页预览...'
              : loadState === 'failed'
                ? '预览不可用，长按可直接打开'
                : '点按读取预览，长按直接打开'}
        </Text>
        <Text numberOfLines={1} style={styles.domain}>{url}</Text>
      </View>
      {isReady && meta.image ? <Image resizeMode="cover" source={{ uri: meta.image }} style={styles.image} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    marginVertical: rhythm.microGap,
    maxWidth: '100%',
    overflow: 'hidden',
    padding: spacing[2],
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  description: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    marginTop: rhythm.microGap,
  },
  domain: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedSoft,
    marginTop: rhythm.microGap,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: aiLightColors.coralSoft,
    borderRadius: radius.sm,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  image: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.card,
    borderRadius: radius.sm,
    height: 80,
    width: 80,
  },
  title: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontWeight: '700',
  },
});

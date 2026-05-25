import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors, aiLightDisplayFont } from './aiLightTheme';
import { AiInlineFeedback } from './AiInlineFeedback';

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string; level: number }
  | { type: 'list'; items: Array<{ marker: string; text: string; checked?: boolean; nestLevel: number }> }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' };

interface AiMessageContentProps {
  content: string;
  trailingInline?: ReactNode;
  variant?: 'assistant' | 'user';
}

function isFence(line: string): boolean {
  return line.trim().startsWith('```');
}

function isHeading(line: string): boolean {
  return /^#{1,4}\s+\S/.test(line.trim());
}

function isListLine(line: string): boolean {
  return /^(\s*)([-*]|\d+\.)\s+\S/.test(line);
}

function isQuoteLine(line: string): boolean {
  return line.trim().startsWith('>');
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && trimmed.split('|').filter((cell) => cell.trim()).length >= 2;
}

function isHorizontalRule(line: string): boolean {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((cell) => cell.trim());
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isFence(line)) {
      const language = trimmed.replace(/^```/, '').trim() || undefined;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !isFence(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: 'code', text: codeLines.join('\n'), language });
      continue;
    }

    if (isHeading(line)) {
      const match = /^(#{1,4})\s+(.*)$/.exec(trimmed);
      blocks.push({ type: 'heading', level: match?.[1].length ?? 1, text: match?.[2] ?? trimmed });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (isListLine(line)) {
      const items: Array<{ marker: string; text: string; checked?: boolean; nestLevel: number }> = [];
      while (index < lines.length && isListLine(lines[index] ?? '')) {
        const item = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[index] ?? '');
        if (item) {
          const task = /^\[(x|X| )\]\s+(.*)$/.exec(item[3]);
          const indent = item[1].length;
          items.push({
            checked: task ? task[1].toLowerCase() === 'x' : undefined,
            marker: task ? (task[1].toLowerCase() === 'x' ? '☑' : '☐') : item[2].match(/\d+\./) ? item[2] : '•',
            nestLevel: Math.min(3, Math.floor(indent / 2)),
            text: task?.[2] ?? item[3],
          });
        }
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (isQuoteLine(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isQuoteLine(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    if (isTableLine(line) && isTableSeparator(lines[index + 1] ?? '')) {
      const rows: string[][] = [parseTableRow(line)];
      index += 2;
      while (index < lines.length && isTableLine(lines[index] ?? '')) {
        rows.push(parseTableRow(lines[index] ?? ''));
        index += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index] ?? '';
      if (!nextLine.trim() || isFence(nextLine) || isHeading(nextLine) || isHorizontalRule(nextLine) || isListLine(nextLine) || isQuoteLine(nextLine) || (isTableLine(nextLine) && isTableSeparator(lines[index + 1] ?? ''))) {
        break;
      }
      paragraphLines.push(nextLine);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks.length ? blocks : [{ type: 'paragraph', text: content }];
}

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function renderInlineText(text: string, style: StyleProp<TextStyle>, onLinkPress: (url: string) => void): ReactNode {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_)/g).map((part, index) => {
    if (!part) {
      return null;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <Text key={`${index}-${part}`} onPress={() => onLinkPress(link[2])} style={[style, styles.linkText]}>
          {link[1]}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      return <Text key={`${index}-${part}`} style={styles.inlineCode}>{part.slice(1, -1)}</Text>;
    }
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <Text key={`${index}-${part}`} style={[style, styles.boldText]}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('~~') && part.endsWith('~~')) {
      return <Text key={`${index}-${part}`} style={[style, styles.strikeText]}>{part.slice(2, -2)}</Text>;
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <Text key={`${index}-${part}`} style={[style, styles.italicText]}>{part.slice(1, -1)}</Text>;
    }
    return <Text key={`${index}-${part}`} style={style}>{part}</Text>;
  });
}

export function AiMessageContent({ content, trailingInline, variant = 'assistant' }: AiMessageContentProps) {
  const [copiedBlockKey, setCopiedBlockKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);

  if (variant === 'user') {
    return <Text selectable style={[styles.body, styles.userText]}>{content}</Text>;
  }

  const blocks = parseMarkdownBlocks(content);
  const trailingTargetIndex = trailingInline
    ? blocks.reduce((targetIndex, block, index) => (block.type === 'hr' ? targetIndex : index), -1)
    : -1;

  async function copyCodeBlock(blockKey: string, code: string) {
    try {
      await Clipboard.setStringAsync(code);
      setCopiedBlockKey(blockKey);
      setFeedback({ message: '代码已复制', tone: 'success' });
      setTimeout(() => setFeedback(null), 1600);
    } catch {
      setFeedback({ message: '复制失败', tone: 'error' });
    }
  }

  async function openSafeLink(url: string) {
    if (!isSafeHttpUrl(url)) {
      setFeedback({ message: '不支持打开该链接', tone: 'error' });
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setFeedback({ message: '链接打开失败', tone: 'error' });
    }
  }

  return (
    <View style={styles.wrap}>
      {feedback ? <AiInlineFeedback message={feedback.message} tone={feedback.tone} /> : null}
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        const appendTrailingInline = trailingInline && index === trailingTargetIndex;
        if (block.type === 'heading') {
          return (
            <Text selectable key={key} style={[styles.heading, block.level > 2 && styles.smallHeading]}>
              {renderInlineText(block.text, [styles.heading, block.level > 2 && styles.smallHeading], openSafeLink)}
              {appendTrailingInline ? trailingInline : null}
            </Text>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={key} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`${key}-${itemIndex}`} style={[styles.listItem, item.nestLevel > 0 && { paddingLeft: item.nestLevel * spacing[3] }]}>
                  <Text style={styles.listMarker}>{item.marker}</Text>
                  <Text selectable style={[styles.body, styles.assistantText, styles.listText]}>
                    {renderInlineText(item.text, [styles.body, styles.assistantText], openSafeLink)}
                    {appendTrailingInline && itemIndex === block.items.length - 1 ? trailingInline : null}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === 'quote') {
          return (
            <View key={key} style={styles.quote}>
              <Text selectable style={[styles.body, styles.quoteText]}>
                {renderInlineText(block.text, [styles.body, styles.quoteText], openSafeLink)}
                {appendTrailingInline ? trailingInline : null}
              </Text>
            </View>
          );
        }
        if (block.type === 'hr') {
          return <View key={key} style={styles.horizontalRule} />;
        }
        if (block.type === 'code') {
          return (
            <View key={key} style={styles.codeBlock}>
              <View style={styles.codeHeader}>
                <Text numberOfLines={1} style={styles.codeLanguage}>{block.language ?? 'code'}</Text>
                <Pressable
                  accessibilityLabel="复制代码块"
                  accessibilityRole="button"
                  hitSlop={spacing[2]}
                  onPress={() => void copyCodeBlock(key, block.text)}
                  style={({ pressed }) => [styles.codeCopyButton, pressed && styles.pressed]}
                >
                  <Ionicons color={aiLightColors.onDark} name={copiedBlockKey === key ? 'checkmark' : 'copy-outline'} size={14} />
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text selectable style={styles.codeText}>
                  {block.text || ' '}
                  {appendTrailingInline ? trailingInline : null}
                </Text>
              </ScrollView>
            </View>
          );
        }
        if (block.type === 'table') {
          return (
            <ScrollView key={key} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
              <View style={styles.table}>
                {block.rows.map((row, rowIndex) => (
                  <View key={`${key}-${rowIndex}`} style={[styles.tableRow, rowIndex === 0 && styles.tableHeaderRow]}>
                    {row.map((cell, cellIndex) => (
                      <Text key={`${key}-${rowIndex}-${cellIndex}`} style={[styles.tableCell, rowIndex === 0 && styles.tableHeaderCell]}>
                        {renderInlineText(cell, [styles.tableCell, rowIndex === 0 && styles.tableHeaderCell], openSafeLink)}
                        {appendTrailingInline && rowIndex === block.rows.length - 1 && cellIndex === row.length - 1 ? trailingInline : null}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }
        return (
          <Text selectable key={key} style={[styles.body, styles.assistantText]}>
            {renderInlineText(block.text, [styles.body, styles.assistantText], openSafeLink)}
            {appendTrailingInline ? trailingInline : null}
          </Text>
        );
      })}
      {trailingInline && trailingTargetIndex < 0 ? (
        <Text selectable style={[styles.body, styles.assistantText]}>
          {trailingInline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: rhythm.microGap,
  },
  body: {
    ...typography.textStyles.body,
    lineHeight: 22,
  },
  assistantText: {
    color: aiLightColors.ink,
  },
  userText: {
    color: aiLightColors.onDark,
  },
  heading: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  smallHeading: {
    fontSize: typography.size.body,
    lineHeight: 22,
  },
  inlineCode: {
    ...typography.textStyles.caption,
    backgroundColor: aiLightColors.surface,
    borderRadius: radius.sm,
    color: aiLightColors.coralActive,
    fontFamily: typography.family.mono,
    paddingHorizontal: spacing[1],
  },
  boldText: {
    fontWeight: '700',
  },
  italicText: {
    fontStyle: 'italic',
  },
  strikeText: {
    textDecorationLine: 'line-through',
  },
  linkText: {
    color: aiLightColors.coralActive,
  },
  list: {
    gap: rhythm.microGap,
  },
  listItem: {
    flexDirection: 'row',
    gap: rhythm.microGap,
  },
  listMarker: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    lineHeight: 22,
    minWidth: spacing[4],
  },
  listText: {
    flex: 1,
  },
  quote: {
    borderLeftColor: aiLightColors.coral,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing[2],
  },
  quoteText: {
    color: aiLightColors.muted,
  },
  horizontalRule: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing[2],
    width: '100%',
  },
  codeBlock: {
    backgroundColor: aiLightColors.dark,
    borderRadius: radius.md,
    gap: rhythm.microGap,
    overflow: 'hidden',
    padding: spacing[2],
  },
  codeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  codeLanguage: {
    ...typography.textStyles.micro,
    color: aiLightColors.onDark,
    fontFamily: typography.family.mono,
    opacity: 0.72,
  },
  codeCopyButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: spacing[6],
    justifyContent: 'center',
    width: spacing[6],
  },
  codeText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
    fontFamily: typography.family.mono,
    lineHeight: 20,
  },
  tableScroll: {
    maxWidth: '100%',
  },
  table: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableHeaderRow: {
    backgroundColor: aiLightColors.surface,
  },
  tableCell: {
    ...typography.textStyles.caption,
    borderColor: aiLightColors.hairline,
    borderRightWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minWidth: spacing[12] * 2,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  tableHeaderCell: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});

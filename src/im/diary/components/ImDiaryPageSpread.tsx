import React from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import type { DiaryPageContent, DiaryPaperTexture } from '../types';
import { imDiaryThemeAssets } from '../themeAssets';

export interface ImDiaryPageSpreadProps {
  leftPage: DiaryPageContent;
  rightPage?: DiaryPageContent;
  texture?: DiaryPaperTexture;
}

/**
 * 伴侣手账日记本单页视图 (Single Page Layout)
 * 物理铁律：装订线居左，单页全宽展示，严禁内部文字滚动！
 * 采用 5 款经典信纸原生材质，文字安全居中排版，彻底避让左上方花体 "Diary" 艺术墨迹。
 */
export function ImDiaryPageSpread({ leftPage }: ImDiaryPageSpreadProps) {
  const page = leftPage;
  const themeKey = page.themeKey || 'sage';
  const asset = imDiaryThemeAssets[themeKey] || imDiaryThemeAssets.sage;
  const isFirst = page.pageNumber === 1;

  return (
    <ImageBackground
      imageStyle={styles.paperImage}
      resizeMode="cover"
      source={asset.letter}
      style={styles.singlePageBase}
    >
      <View style={[styles.contentSafeArea, isFirst ? styles.firstPageSafeArea : styles.continuedPageSafeArea]}>
        {/* 顶部避让与元数据区 */}
        {isFirst ? (
          <FirstPageHeader page={page} />
        ) : (
          <ContinuedPageHeader pageNumber={page.pageNumber} />
        )}

        {/* 正文段落区 */}
        <View style={styles.textContent}>
          {page.paragraphs.map((p, idx) => (
            <Text key={idx} style={styles.paragraphText}>
              {p}
            </Text>
          ))}
        </View>

        {/* 页码 */}
        <Text style={styles.pageNumber}>{page.pageNumber}</Text>
      </View>
    </ImageBackground>
  );
}

function FirstPageHeader({ page }: { page: DiaryPageContent }) {
  return (
    <View style={styles.firstHeaderArea}>
      {/* 右上角展示日期与天气心情胶囊，左侧留空展露底图手绘花体 Diary */}
      <View style={styles.topMetaRightRow}>
        <Text style={styles.dateText}>{page.dateStr}</Text>
        {page.weather ? <Text style={styles.weatherText}>🌤 {page.weather}</Text> : null}
        {page.moodTag ? (
          <View style={styles.moodPill}>
            <Text style={styles.moodText}>{page.moodTag}</Text>
          </View>
        ) : null}
      </View>

      {/* 标题置于左上 Diary 艺术字下方 (Y ≈ 98px) */}
      {page.title ? (
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.titleText}>
            {page.title}
          </Text>
          <View style={styles.headerDivider} />
        </View>
      ) : null}
    </View>
  );
}

function ContinuedPageHeader({ pageNumber }: { pageNumber: number }) {
  return (
    <View style={styles.continuedHeaderArea}>
      <Text style={styles.continuedBadge}>第 {pageNumber} 页 · 续</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  singlePageBase: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  paperImage: {
    borderRadius: 14,
  },
  contentSafeArea: {
    flex: 1,
    paddingBottom: 26,
    paddingLeft: 38, // 为左侧活页装订线预留舒适呼吸空间
    paddingRight: 22,
    position: 'relative',
  },
  firstPageSafeArea: {
    paddingTop: 20,
  },
  continuedPageSafeArea: {
    paddingTop: 18,
  },
  firstHeaderArea: {
    marginBottom: 10,
  },
  topMetaRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 28,
  },
  continuedHeaderArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 78, // 预留 78px 避让左上方花体 Diary 艺术字
    paddingTop: 2,
    marginBottom: 8,
  },
  continuedBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  titleWrap: {
    marginTop: 48, // 安全避让左上方 40~90px 的 Diary 艺术字
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    marginTop: 8,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  weatherText: {
    fontSize: 11,
    color: '#64748B',
  },
  moodPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  moodText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  textContent: {
    flex: 1,
  },
  paragraphText: {
    fontSize: 14,
    lineHeight: 24,
    color: '#1E293B',
    marginBottom: 8,
    letterSpacing: 0.25,
  },
  pageNumber: {
    position: 'absolute',
    right: 20,
    bottom: 10,
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
});

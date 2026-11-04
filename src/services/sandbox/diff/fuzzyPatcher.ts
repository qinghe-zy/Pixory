/**
 * IndexPreservingFuzzyPatcher (纯算法内核 - 零宿主依赖)
 *
 * 核心特性:
 * 1. normToRaw (Int32Array): 追踪 NFKC 规范化、空白折叠与符号映射后，每一个字符在原始 Raw 串中的精确字节/字符坐标。
 * 2. UTF-16 代理对边界防护: 防止 Emoji (2 code units) 或生僻字被切成半个代理对。
 * 3. 三级容错匹配:
 *    - Tier 1: 精确子串匹配 (含二义性唯一性检测)
 *    - Tier 2: 基于 normToRaw 的规范化对齐映射
 *    - Tier 3: 锚点启发式 + 带预算上限的双向 Levenshtein 滑动窗口
 * 4. 批量逆序安全修补 (applyBatchSafely):
 *    - 原文一次性统一定位所有 hunk 区间
 *    - 拦截重叠区间并输出结构化诊断
 *    - 严格按 rawStart 降序逆向替换，彻底杜绝坐标漂移
 */

export interface PatchHunkInput {
  id: string;
  search: string;
  replace: string;
  contextBefore?: string;
  contextAfter?: string;
}

export type PatchStatus = 'applied' | 'ambiguous' | 'not_found' | 'overlapping' | 'invalid_range';

export interface HunkDiagnostic {
  hunkId: string;
  status: PatchStatus;
  tierUsed?: 1 | 2 | 3;
  rawRange?: [number, number];
  similarity?: number;
  message?: string;
}

export interface BatchPatchResult {
  success: boolean;
  resultText: string;
  appliedCount: number;
  diagnostics: HunkDiagnostic[];
}

export interface MatchResult {
  rawStart: number;
  rawEnd: number;
  tierUsed: 1 | 2 | 3;
  similarity: number;
}

/**
 * 常见零宽与格式化控制符黑名单 (规范化时剔除，但 mapping 精准记录跳过)
 */
const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF\u00AD]/;

/**
 * 全角与半角常用标点归一映射
 */
const PUNCTUATION_MAP: Record<string, string> = {
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '：': ':',
  '；': ';',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '《': '<',
  '》': '>',
  '、': ',',
  '—': '-',
  '～': '~',
  '\u3000': ' ', // 全角空格
};

/**
 * 构造 Raw 文本的规范化字符串及逆向坐标映射表 normToRaw (Int32Array)
 */
export function buildNormMapping(rawText: string): { normText: string; normToRaw: Int32Array } {
  const rawLen = rawText.length;
  // 预估初始容量: 单字符 NFKC 最多可能展开为 4 个字符 (例如 ㈱ -> (株))
  let capacity = Math.max(rawLen * 4, 32);
  const normChars: string[] = [];
  let normToRawBuffer = new Int32Array(capacity);

  let rawIdx = 0;
  let normIdx = 0;
  let lastWasSpace = false;

  const ensureCapacity = (required: number) => {
    if (required > capacity) {
      capacity = Math.max(capacity * 2, required + 64);
      const expanded = new Int32Array(capacity);
      expanded.set(normToRawBuffer);
      normToRawBuffer = expanded;
    }
  };

  while (rawIdx < rawLen) {
    const code = rawText.charCodeAt(rawIdx);
    const char = rawText[rawIdx];

    // 确保容量充足 (最少保留 4 个单元安全缓冲)
    ensureCapacity(normIdx + 8);

    // 1. 处理 UTF-16 代理对 (Emoji / CJK 扩展区)
    if (code >= 0xd800 && code <= 0xdbff && rawIdx + 1 < rawLen) {
      const nextCode = rawText.charCodeAt(rawIdx + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        // 完整的代理对 (2 个 UTF-16 code units)
        const surrogatePair = rawText.slice(rawIdx, rawIdx + 2);
        normChars.push(surrogatePair);
        normToRawBuffer[normIdx] = rawIdx;
        normToRawBuffer[normIdx + 1] = rawIdx; // 代理对次字符也指向该代理对起始
        normIdx += 2;
        rawIdx += 2;
        lastWasSpace = false;
        continue;
      }
    }

    // 2. 过滤零宽不可见字符
    if (ZERO_WIDTH_REGEX.test(char)) {
      rawIdx++;
      continue;
    }

    // 3. 空白字符归一化 (折叠连续空白，且折叠标点前后的冗余空格以对齐中英文输入习惯)
    if (/\s/.test(char) || char === '\u3000') {
      const prevNormChar = normChars.length > 0 ? normChars[normChars.length - 1] : '';
      const isAfterPunct = /[,.:;!?()\[\]<>-]/.test(prevNormChar);
      // 如果紧邻标点后出现空格，直接跳过 (消除中英文习惯差异)
      if (isAfterPunct) {
        rawIdx++;
        continue;
      }

      if (!lastWasSpace) {
        normChars.push(' ');
        normToRawBuffer[normIdx] = rawIdx;
        normIdx++;
        lastWasSpace = true;
      }
      rawIdx++;
      continue;
    }
    lastWasSpace = false;

    // 4. 全角标点映射
    if (PUNCTUATION_MAP[char]) {
      const mapped = PUNCTUATION_MAP[char];
      // 如果前面恰好是一个被推入的空格，移除该空格以避免 "word ," 形式
      if (normChars.length > 0 && normChars[normChars.length - 1] === ' ') {
        normChars.pop();
        normIdx--;
      }
      normChars.push(mapped);
      normToRawBuffer[normIdx] = rawIdx;
      normIdx++;
      rawIdx++;
      continue;
    }

    // 5. NFKC 兼容规范化 (如 ㈱, １２３, ａｂｃ)
    const normalized = char.normalize('NFKC');
    for (let i = 0; i < normalized.length; i++) {
      normChars.push(normalized[i]);
      normToRawBuffer[normIdx] = rawIdx;
      normIdx++;
    }
    rawIdx++;
  }

  // 结尾哨兵: 指向 rawText 的终点
  normToRawBuffer[normIdx] = rawLen;

  const normText = normChars.join('');
  const finalNormToRaw = new Int32Array(normIdx + 1);
  finalNormToRaw.set(normToRawBuffer.subarray(0, normIdx + 1));

  return { normText, normToRaw: finalNormToRaw };
}

/**
 * 校验并微调 raw 坐标，严禁切在 UTF-16 代理对中间
 */
function adjustSurrogateBoundaries(rawText: string, start: number, end: number): [number, number] {
  let s = Math.max(0, Math.min(start, rawText.length));
  let e = Math.max(s, Math.min(end, rawText.length));

  // 如果 s 落在 low surrogate (0xDC00 - 0xDFFF)，往前回退一位
  if (s > 0 && s < rawText.length) {
    const code = rawText.charCodeAt(s);
    if (code >= 0xdc00 && code <= 0xdfff) {
      s--;
    }
  }

  // 如果 e 落在 high surrogate (0xD800 - 0xDBFF)，往后推进一位
  if (e > 0 && e < rawText.length) {
    const code = rawText.charCodeAt(e - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      e++;
    }
  }

  return [s, e];
}

/**
 * 计算两个短字符串之间的 Levenshtein 编辑距离与相似度
 */
function computeLevenshteinSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 || l2 === 0) return 0.0;
  const maxL = Math.max(l1, l2);
  if (Math.abs(l1 - l2) > maxL * 0.5) return 0.0; // 长度偏差超过 50% 剪枝

  const d: number[] = new Array(l2 + 1);
  for (let j = 0; j <= l2; j++) d[j] = j;

  for (let i = 1; i <= l1; i++) {
    let prevDiag = d[0];
    d[0] = i;
    const c1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= l2; j++) {
      const temp = d[j];
      const cost = c1 === s2.charCodeAt(j - 1) ? 0 : 1;
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prevDiag + cost);
      prevDiag = temp;
    }
  }

  const dist = d[l2];
  return 1.0 - dist / maxL;
}

/**
 * 单 hunk 查找定位逻辑 (三级容错 + 唯一性检查)
 */
export function findMatchRange(
  rawText: string,
  search: string,
  normMapping?: { normText: string; normToRaw: Int32Array }
): { match?: MatchResult; error?: PatchStatus; message?: string } {
  if (!search) {
    return { error: 'not_found', message: '搜索词不能为空' };
  }

  // ================= Tier 1: Exact Match =================
  const firstExact = rawText.indexOf(search);
  if (firstExact !== -1) {
    const secondExact = rawText.indexOf(search, firstExact + 1);
    if (secondExact !== -1) {
      // 存在多处完全相同子串，属于二义性冲突
      return {
        error: 'ambiguous',
        message: `全文存在多处精确匹配 [${firstExact}, ${secondExact}...]，无法确定修补目标`,
      };
    }
    const [rawStart, rawEnd] = adjustSurrogateBoundaries(rawText, firstExact, firstExact + search.length);
    return {
      match: {
        rawStart,
        rawEnd,
        tierUsed: 1,
        similarity: 1.0,
      },
    };
  }

  // 构造或复用 normToRaw 映射
  const { normText, normToRaw } = normMapping || buildNormMapping(rawText);
  const normSearchMapping = buildNormMapping(search);
  const normSearch = normSearchMapping.normText;

  if (!normSearch) {
    return { error: 'not_found', message: '规范化后搜索词为空' };
  }

  // ================= Tier 2: Normalized Match =================
  const firstNorm = normText.indexOf(normSearch);
  if (firstNorm !== -1) {
    const secondNorm = normText.indexOf(normSearch, firstNorm + 1);
    if (secondNorm !== -1) {
      return {
        error: 'ambiguous',
        message: '规范化后全文存在多处相同匹配，存在二义性冲突',
      };
    }

    const normStart = firstNorm;
    const normEnd = firstNorm + normSearch.length;
    const rawStartCandidate = normToRaw[normStart];
    const rawEndCandidate = normToRaw[normEnd];
    const [rawStart, rawEnd] = adjustSurrogateBoundaries(rawText, rawStartCandidate, rawEndCandidate);

    return {
      match: {
        rawStart,
        rawEnd,
        tierUsed: 2,
        similarity: 0.99,
      },
    };
  }

  // ================= Tier 3: Anchored Fuzzy Sliding Window =================
  // 提取前后锚点 (前 4~6 字符与后 4~6 字符)
  const anchorLen = Math.min(5, Math.floor(normSearch.length / 3));
  if (anchorLen < 2 || normSearch.length < 6) {
    return { error: 'not_found', message: '文本过短且无法进行容错锚点定位' };
  }

  const prefixAnchor = normSearch.slice(0, anchorLen);
  const suffixAnchor = normSearch.slice(-anchorLen);

  interface CandidateWindow {
    normStart: number;
    normEnd: number;
    score: number;
  }

  const candidates: CandidateWindow[] = [];
  const searchLen = normSearch.length;
  const windowRadius = Math.max(Math.floor(searchLen * 0.3), 3);

  // 寻找所有前缀锚点出现位置 (最多探测前 8 个候选，防止 O(n*m) 爆炸)
  let pIdx = normText.indexOf(prefixAnchor);
  let scanCount = 0;
  while (pIdx !== -1 && scanCount < 8) {
    scanCount++;
    const minLen = Math.max(anchorLen, searchLen - windowRadius);
    const maxLen = Math.min(normText.length - pIdx, searchLen + windowRadius);

    let bestScoreForPIdx = 0;
    let bestEndForPIdx = pIdx + searchLen;

    for (let candidateLen = minLen; candidateLen <= maxLen; candidateLen++) {
      const windowSub = normText.slice(pIdx, pIdx + candidateLen);
      const score = computeLevenshteinSimilarity(normSearch, windowSub);
      if (score > bestScoreForPIdx) {
        bestScoreForPIdx = score;
        bestEndForPIdx = pIdx + candidateLen;
      }
    }

    if (bestScoreForPIdx >= 0.72) {
      candidates.push({ normStart: pIdx, normEnd: bestEndForPIdx, score: bestScoreForPIdx });
    }
    pIdx = normText.indexOf(prefixAnchor, pIdx + 1);
  }

  // 若前缀锚点未找到，尝试探测后缀锚点
  if (candidates.length === 0) {
    let sIdx = normText.indexOf(suffixAnchor);
    let sCount = 0;
    while (sIdx !== -1 && sCount < 8) {
      sCount++;
      const fixedEnd = sIdx + anchorLen;
      const minStart = Math.max(0, fixedEnd - searchLen - windowRadius);
      const maxStart = Math.min(fixedEnd - anchorLen, fixedEnd - searchLen + windowRadius);

      let bestScoreForSIdx = 0;
      let bestStartForSIdx = minStart;

      for (let candStart = minStart; candStart <= maxStart; candStart++) {
        const windowSub = normText.slice(candStart, fixedEnd);
        const score = computeLevenshteinSimilarity(normSearch, windowSub);
        if (score > bestScoreForSIdx) {
          bestScoreForSIdx = score;
          bestStartForSIdx = candStart;
        }
      }

      if (bestScoreForSIdx >= 0.72) {
        candidates.push({ normStart: bestStartForSIdx, normEnd: fixedEnd, score: bestScoreForSIdx });
      }
      sIdx = normText.indexOf(suffixAnchor, sIdx + 1);
    }
  }

  if (candidates.length === 0) {
    return { error: 'not_found', message: '未找到满足相似度阈值的文本片段' };
  }

  // 按相似度降序排序
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // 审查发现 #4: 唯一性检验 (最优与次优相似度差须 >= 0.05，否则二义性拒绝)
  if (candidates.length > 1) {
    const second = candidates[1];
    if (best.score - second.score < 0.05) {
      return {
        error: 'ambiguous',
        message: `模糊匹配存在多处高度近似候选 (相似度 ${best.score.toFixed(2)} vs ${second.score.toFixed(2)})，触发二义性保护`,
      };
    }
  }

  const rawStartCandidate = normToRaw[best.normStart];
  const rawEndCandidate = normToRaw[best.normEnd];
  const [rawStart, rawEnd] = adjustSurrogateBoundaries(rawText, rawStartCandidate, rawEndCandidate);

  return {
    match: {
      rawStart,
      rawEnd,
      tierUsed: 3,
      similarity: best.score,
    },
  };
}

/**
 * 批量安全修补算法 (applyBatchSafely)
 *
 * 核心机制:
 * 1. 在原串 rawText 上统一进行定位，生成所有 hunk 的 raw 区间与诊断；
 * 2. 检查各 hunk 区间是否交叠 (Overlapping)，发现交叠立刻拦截该对 hunk；
 * 3. 严格按 rawStart 从大到小降序修补 (从后往前)，确保前面区间的下标绝对不发生位移。
 */
export function applyBatchSafely(rawText: string, hunks: PatchHunkInput[]): BatchPatchResult {
  if (!hunks || hunks.length === 0) {
    return {
      success: true,
      resultText: rawText,
      appliedCount: 0,
      diagnostics: [],
    };
  }

  // 1. 全局构建一次 normToRaw 映射，所有 hunk 共享复用
  const normMapping = buildNormMapping(rawText);

  interface ResolvedHunk {
    input: PatchHunkInput;
    match: MatchResult;
  }

  const resolved: ResolvedHunk[] = [];
  const diagnostics: HunkDiagnostic[] = [];

  // 2. 逐一在原始文本中定位
  for (const hunk of hunks) {
    const res = findMatchRange(rawText, hunk.search, normMapping);
    if (res.match) {
      resolved.push({ input: hunk, match: res.match });
    } else {
      diagnostics.push({
        hunkId: hunk.id,
        status: res.error || 'not_found',
        message: res.message,
      });
    }
  }

  // 3. 区间交叠检查 (按 rawStart 升序排序比对)
  resolved.sort((a, b) => a.match.rawStart - b.match.rawStart);

  const overlappedIds = new Set<string>();

  for (let i = 0; i < resolved.length; i++) {
    const cur = resolved[i];
    for (let j = 0; j < i; j++) {
      const prev = resolved[j];
      if (cur.match.rawStart < prev.match.rawEnd) {
        overlappedIds.add(cur.input.id);
        overlappedIds.add(prev.input.id);
      }
    }
  }

  // 记录被交叠剔除的 hunk 诊断
  for (const item of resolved) {
    if (overlappedIds.has(item.input.id)) {
      diagnostics.push({
        hunkId: item.input.id,
        status: 'overlapping',
        rawRange: [item.match.rawStart, item.match.rawEnd],
        message: '该修改区间与另一处修改发生交叠冲突，已安全跳过',
      });
    }
  }

  // 4. 逆序替换 (严格按 rawStart 降序，从后向前应用)
  // 过滤掉所有存在交叠冲突的项
  const finalHunks = resolved.filter((item) => !overlappedIds.has(item.input.id));
  finalHunks.sort((a, b) => b.match.rawStart - a.match.rawStart);

  let currentText = rawText;
  for (const item of finalHunks) {
    const { rawStart, rawEnd } = item.match;
    currentText = currentText.slice(0, rawStart) + item.input.replace + currentText.slice(rawEnd);

    diagnostics.push({
      hunkId: item.input.id,
      status: 'applied',
      tierUsed: item.match.tierUsed,
      rawRange: [rawStart, rawEnd],
      similarity: item.match.similarity,
    });
  }

  return {
    success: finalHunks.length > 0 && finalHunks.length === hunks.length,
    resultText: currentText,
    appliedCount: finalHunks.length,
    diagnostics,
  };
}

/**
 * CJK FTS5 引擎 (纯算法内核 - 零宿主依赖)
 *
 * 核心特性:
 * 1. 数字量词/金额原子粘合: 识别 "500万元"、"2026年"、"30天" 等模式，保证金额与周期在 FTS5 索引中不被切散；
 * 2. CJK Overlapping Bigram (重叠双字切分): 覆盖常用汉字 (\u4e00-\u9fa5)、扩展 A 区 (\u3400-\u4dbf) 与兼容汉字 (\uf900-\ufaff)；
 * 3. 英文与数字 Token 提取: 保持英文单词、型号、代码下划线标识符完整；
 * 4. FTS5 MATCH 查询编译与防注入: 过滤保留操作符，消除空词元，针对 CJK 单字提供安全前缀与 LIKE 兜底模式。
 */

/**
 * CJK 汉字检测正则 (涵盖基本汉字、扩展 A 区、兼容汉字)
 */
const CJK_CHAR_REGEX = /[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/;

/**
 * 常见中文数字量词/单位后缀 (不贪婪，仅粘合紧随数字后的合法量词)
 */
const QUANTIFIER_SUFFIX_REGEX = /^(?:万(?:元)?|亿(?:元)?|元|角|分|年|月|日|号|天|周|小时|条|款|项|页|张|件|套|倍|%|‰)/;

/**
 * FTS5 语法保留特殊字符 (MATCH 表达式中严禁裸露)
 */
const FTS5_SPECIAL_CHARS_REGEX = /["*()^:\-\\/{}\[\]~]/g;

export interface FtsMatchQueryResult {
  matchQuery: string;
  isSingleCjk: boolean;
  fallbackLikePattern: string;
  tokens: string[];
}

/**
 * 针对索引写入的 CJK + 英文 + 数量词混合编码器
 * 输出以单空格分隔的 FTS5 Token 序列
 */
export function encodeForIndex(rawText: string): string {
  if (!rawText) return '';

  const tokens: string[] = [];
  const len = rawText.length;
  let i = 0;

  while (i < len) {
    const char = rawText[i];

    // 1. 忽略空白与常见中英文停顿标点
    if (/\s/.test(char) || /[，。！？：；、“”‘’（）【】《》、—～,\.!\?:;\(\)\[\]<>]/.test(char)) {
      i++;
      continue;
    }

    // 2. 匹配数字及其粘合量词 (例如 "500万元", "2026年", "30天", "15.5%")
    if (/[0-9]/.test(char)) {
      let numEnd = i + 1;
      while (numEnd < len && /[0-9.,]/.test(rawText[numEnd])) {
        numEnd++;
      }
      const numStr = rawText.slice(i, numEnd);
      i = numEnd;

      // 探测紧随其后的量词后缀
      const rest = rawText.slice(i, i + 4);
      const matchQuant = rest.match(QUANTIFIER_SUFFIX_REGEX);
      if (matchQuant) {
        const fullToken = numStr + matchQuant[0];
        tokens.push(fullToken.toLowerCase());
        // 同时单独保留量词部分参与索引，以便搜索 "万元" 也能搜到
        if (matchQuant[0].length >= 2) {
          tokens.push(matchQuant[0]);
        }
        i += matchQuant[0].length;
      } else {
        tokens.push(numStr);
      }
      continue;
    }

    // 3. 匹配连续的英文字符/下划线 (如 "pixory", "react_native", "ISO8601")
    if (/[a-zA-Z_]/.test(char)) {
      let wordEnd = i + 1;
      while (wordEnd < len && /[a-zA-Z0-9_\-]/.test(rawText[wordEnd])) {
        wordEnd++;
      }
      const word = rawText.slice(i, wordEnd).toLowerCase();
      tokens.push(word);
      i = wordEnd;
      continue;
    }

    // 4. 匹配连续 CJK 汉字序列并生成 Overlapping Bigram
    if (CJK_CHAR_REGEX.test(char)) {
      let cjkEnd = i + 1;
      while (cjkEnd < len && CJK_CHAR_REGEX.test(rawText[cjkEnd])) {
        cjkEnd++;
      }
      const cjkSegment = rawText.slice(i, cjkEnd);
      i = cjkEnd;

      if (cjkSegment.length === 1) {
        // 孤立单字汉字
        tokens.push(cjkSegment);
      } else {
        // 重叠双字切分 (例如 "违约责任" -> "违约", "约责", "责任")
        for (let j = 0; j < cjkSegment.length - 1; j++) {
          tokens.push(cjkSegment.slice(j, j + 2));
        }
      }
      continue;
    }

    // 其余字符跳过
    i++;
  }

  return tokens.join(' ');
}

/**
 * 编译用户搜索词为安全的 SQLite FTS5 MATCH 表达式
 * 包含保留字符转义、CJK 双字与单字安全降级
 */
export function buildFtsMatchQuery(rawQuery: string): FtsMatchQueryResult {
  const fallback = {
    matchQuery: '',
    isSingleCjk: false,
    fallbackLikePattern: '%',
    tokens: [],
  };

  if (!rawQuery || !rawQuery.trim()) {
    return fallback;
  }

  // 1. 去除 FTS5 保留字符与高风险布尔运算符，防止注入
  const sanitized = rawQuery
    .replace(FTS5_SPECIAL_CHARS_REGEX, ' ')
    .replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ')
    .trim();

  if (!sanitized) {
    return fallback;
  }

  // 2. 检查是否为单一纯 CJK 汉字 (审查发现 #5 特殊处理)
  const trimmedClean = sanitized.replace(/\s+/g, '');
  if (trimmedClean.length === 1 && CJK_CHAR_REGEX.test(trimmedClean)) {
    return {
      // 在 FTS5 中使用前缀通配符 "违*" 查询以命中以该字开头的 bigram
      matchQuery: `"${trimmedClean}*"`,
      isSingleCjk: true,
      fallbackLikePattern: `%${trimmedClean}%`,
      tokens: [trimmedClean],
    };
  }

  // 3. 使用与索引完全对称的编码规则切分
  const encoded = encodeForIndex(sanitized);
  const rawTokens = encoded.split(/\s+/).filter(Boolean);

  if (rawTokens.length === 0) {
    return fallback;
  }

  // 去重但保留顺序
  const uniqueTokens = Array.from(new Set(rawTokens));

  // 4. 构建标准的 FTS5 组合查询: ("违约" AND "约金")
  // 用双引号包裹每一个 token，以 AND 逻辑连接
  const matchExpressions = uniqueTokens.map((token) => `"${token}"`);
  const matchQuery = matchExpressions.join(' AND ');

  return {
    matchQuery,
    isSingleCjk: false,
    fallbackLikePattern: `%${sanitized.replace(/\s+/g, '%')}%`,
    tokens: uniqueTokens,
  };
}

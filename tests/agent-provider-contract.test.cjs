const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

// 加载模块
const {
  StreamToolAccumulator,
  tryHealJson,
} = loadTsModule('src/services/agent/transport/streamToolAccumulator.ts');

const {
  parseOpenAiAgentStreamLine,
  buildOpenAiAgentPayload,
} = loadTsModule('src/services/agent/transport/openAiAgentAdapter.ts');

const {
  parseClaudeAgentStreamLine,
  buildClaudeAgentPayload,
} = loadTsModule('src/services/agent/transport/claudeAgentAdapter.ts');

const {
  parseGeminiAgentStreamLine,
  buildGeminiAgentPayload,
} = loadTsModule('src/services/agent/transport/geminiAgentAdapter.ts');

function readFixture(fileName) {
  return fs.readFileSync(path.resolve(__dirname, 'fixtures/sse', fileName), 'utf8');
}

test('S3-01 [DeepSeek 真实 SSE 回放]: 捕获 reasoning_content 思考流与切片拼接的 tool_calls', () => {
  const rawSse = readFixture('deepseek-tool-turn.txt');
  const lines = rawSse.split(/\r?\n/);
  const accumulator = new StreamToolAccumulator();

  for (const line of lines) {
    const events = parseOpenAiAgentStreamLine(line);
    for (const ev of events) {
      accumulator.processEvent(ev);
    }
  }

  const output = accumulator.finalize();

  // 1. 思考链捕获
  assert.ok(output.thinking, '必须成功捕获思考链');
  assert.ok(
    output.thinking.thinking.includes('用户需要阅读文档前 3 个段落') &&
    output.thinking.thinking.includes('检查参数：blockIds 数组包含 BLK_001'),
    '思考链文本必须完整拼接'
  );

  // 2. 回答文本捕获
  assert.strictEqual(output.answerText, '我将为您检索前 3 个段落的内容。');

  // 3. 工具调用与参数切片拼接
  assert.strictEqual(output.toolCalls.length, 1);
  const tc = output.toolCalls[0];
  assert.strictEqual(tc.name, 'doc_read_blocks');
  assert.strictEqual(tc.id, 'call_deepseek_991');
  assert.deepStrictEqual(tc.parsedArguments, {
    docUri: 'vfs://work/contract.docx',
    blockIds: ['BLK_001', 'BLK_002', 'BLK_003'],
  });

  // 4. Token 消耗捕获
  assert.deepStrictEqual(output.usage, {
    prompt_tokens: 120,
    completion_tokens: 85,
    total_tokens: 205,
  });

  // 5. 组装为 Assistant 历史消息
  const asstMsg = accumulator.toAssistantMessage('msg_asst_1');
  assert.strictEqual(asstMsg.role, 'assistant');
  assert.strictEqual(asstMsg.toolCalls.length, 1);
  assert.strictEqual(asstMsg.toolCalls[0].name, 'doc_read_blocks');
});

test('S3-02 [Claude 3.7+ 真实 SSE 回放]: 捕获 thinking 块、加密 signature 与 tool_use', () => {
  const rawSse = readFixture('claude-thinking-tool-turn.txt');
  const lines = rawSse.split(/\r?\n/);
  const accumulator = new StreamToolAccumulator();

  for (const line of lines) {
    const events = parseClaudeAgentStreamLine(line);
    for (const ev of events) {
      accumulator.processEvent(ev);
    }
  }

  const output = accumulator.finalize();

  // 1. 捕获思考链与加密签名
  assert.ok(output.thinking, '必须捕获 Claude 思考块');
  assert.strictEqual(
    output.thinking.thinking,
    'The user asks to search for liquidated damages clause in the contract.'
  );
  assert.strictEqual(
    output.thinking.signature,
    'EqQBCgIQAxICCAISAggDEgIIBBoEZG9jeCIDYXNk'
  );

  // 2. 捕获文本回答
  assert.strictEqual(output.answerText, '正在检索违约金相关条款...');

  // 3. 捕获 tool_use 与分片 JSON
  assert.strictEqual(output.toolCalls.length, 1);
  const tc = output.toolCalls[0];
  assert.strictEqual(tc.id, 'toolu_claude_042');
  assert.strictEqual(tc.name, 'doc_grep');
  assert.deepStrictEqual(tc.parsedArguments, {
    pattern: '违约金',
    maxMatches: 5,
  });
  assert.strictEqual(output.finishReason, 'tool_use');
});

test('S3-03 [Gemini 真实 SSE 回放]: 捕获 thoughtSignature 与结构化 functionCall', () => {
  const rawSse = readFixture('gemini-function-turn.txt');
  const lines = rawSse.split(/\r?\n/);
  const accumulator = new StreamToolAccumulator();

  for (const line of lines) {
    const events = parseGeminiAgentStreamLine(line);
    for (const ev of events) {
      accumulator.processEvent(ev);
    }
  }

  const output = accumulator.finalize();

  // 1. 思考链与签名
  assert.ok(output.thinking, '必须捕获 Gemini 思考信息');
  assert.strictEqual(output.thinking.thinking, '分析文档需求，执行章节结构检查。');
  assert.strictEqual(output.thinking.signature, 'G94aFkLms79xZqW210_gemini_sig');

  // 2. 文本回答
  assert.strictEqual(output.answerText, '正在分析文档结构并准备读取块。');

  // 3. 函数调用
  assert.strictEqual(output.toolCalls.length, 1);
  const tc = output.toolCalls[0];
  assert.strictEqual(tc.id, 'call_gem_001');
  assert.strictEqual(tc.name, 'doc_inspect_skeleton');
  assert.deepStrictEqual(tc.parsedArguments, {
    docUri: 'vfs://work/report.docx',
  });
  assert.strictEqual(output.finishReason, 'STOP');
});

test('S3-04 [OpenAI 兼容中转并行工具调用]: 多个 tool_calls index 交叠切片拼接与参数归并', () => {
  const rawSse = readFixture('openai-tool-turn.txt');
  const lines = rawSse.split(/\r?\n/);
  const accumulator = new StreamToolAccumulator();

  for (const line of lines) {
    const events = parseOpenAiAgentStreamLine(line);
    for (const ev of events) {
      accumulator.processEvent(ev);
    }
  }

  const output = accumulator.finalize();

  assert.strictEqual(output.answerText, '我将同时读取两个区块以加速对比。');
  assert.strictEqual(output.toolCalls.length, 2, '必须完整归并 2 个并行工具调用');

  // index 0: doc_read_blocks
  const callA = output.toolCalls[0];
  assert.strictEqual(callA.id, 'call_para_A');
  assert.strictEqual(callA.name, 'doc_read_blocks');
  assert.deepStrictEqual(callA.parsedArguments, {
    blockIds: ['BLK_0010'],
  });

  // index 1: doc_grep
  const callB = output.toolCalls[1];
  assert.strictEqual(callB.id, 'call_para_B');
  assert.strictEqual(callB.name, 'doc_grep');
  assert.deepStrictEqual(callB.parsedArguments, {
    pattern: '争议解决',
  });

  assert.strictEqual(output.finishReason, 'tool_calls');
});

test('S3-05 [多轮往返请求体重构断言]: Claude / OpenAI / Gemini 历史回传协议合规性', () => {
  // 模拟由 accumulator 产出的 assistant 消息（含 thinking 与 signature 与 toolCall）
  const asstMessage = {
    id: 'msg_asst_99',
    role: 'assistant',
    content: [
      {
        type: 'thinking',
        thinking: 'Let me inspect the document.',
        signature: 'TEST_CLAUDE_SIGNATURE_HASH_99',
      },
      {
        type: 'text',
        text: 'Starting file inspection.',
      },
      {
        type: 'tool_call',
        toolCall: {
          id: 'tool_001',
          name: 'doc_read_blocks',
          arguments: '{"blockIds":["BLK_01"]}',
        },
      },
    ],
    toolCalls: [
      {
        id: 'tool_001',
        name: 'doc_read_blocks',
        arguments: '{"blockIds":["BLK_01"]}',
      },
    ],
  };

  const toolResultMessage = {
    id: 'msg_tool_100',
    role: 'tool',
    toolCallId: 'tool_001',
    content: '{"BLK_01": "Section 1: General Provisions"}',
  };

  const requestInput = {
    apiKey: 'sk-test',
    baseUrl: 'https://api.example.com',
    modelId: 'claude-3-7-sonnet',
    systemPrompt: 'You are an expert contract analyst.',
    messages: [
      { id: 'msg_user_1', role: 'user', content: 'Inspect the contract.' },
      asstMessage,
      toolResultMessage,
    ],
    tools: [
      {
        name: 'doc_read_blocks',
        description: 'Read specific document blocks',
        parameters: { type: 'object', properties: { blockIds: { type: 'array' } } },
      },
    ],
  };

  // 1. Claude 请求体重构断言
  const claudePayload = buildClaudeAgentPayload(requestInput);
  assert.strictEqual(claudePayload.system, 'You are an expert contract analyst.');
  assert.strictEqual(claudePayload.messages.length, 3);
  // Assistant 消息中必须保留完整的 thinking 与 signature 块（逐字节原样回传）
  const claudeAsst = claudePayload.messages[1];
  assert.strictEqual(claudeAsst.role, 'assistant');
  assert.deepStrictEqual(claudeAsst.content[0], {
    type: 'thinking',
    thinking: 'Let me inspect the document.',
    signature: 'TEST_CLAUDE_SIGNATURE_HASH_99',
  });
  assert.strictEqual(claudeAsst.content[2].type, 'tool_use');
  assert.strictEqual(claudeAsst.content[2].id, 'tool_001');

  // Tool 结果必须转为 role: 'user' 的 tool_result 块
  const claudeUserTool = claudePayload.messages[2];
  assert.strictEqual(claudeUserTool.role, 'user');
  assert.strictEqual(claudeUserTool.content[0].type, 'tool_result');
  assert.strictEqual(claudeUserTool.content[0].tool_use_id, 'tool_001');

  // 2. OpenAI / DeepSeek 请求体重构断言
  const openAiPayload = buildOpenAiAgentPayload(requestInput);
  assert.strictEqual(openAiPayload.messages[0].role, 'system');
  assert.strictEqual(openAiPayload.messages[2].role, 'assistant');
  assert.strictEqual(openAiPayload.messages[2].tool_calls[0].id, 'tool_001');
  assert.strictEqual(openAiPayload.messages[3].role, 'tool');
  assert.strictEqual(openAiPayload.messages[3].tool_call_id, 'tool_001');

  // 3. Gemini 请求体重构断言
  const geminiPayload = buildGeminiAgentPayload(requestInput);
  assert.strictEqual(geminiPayload.systemInstruction.parts[0].text, 'You are an expert contract analyst.');
  assert.strictEqual(geminiPayload.contents[1].role, 'model');
  assert.strictEqual(geminiPayload.contents[1].parts[0].thoughtSignature, 'TEST_CLAUDE_SIGNATURE_HASH_99');
  assert.strictEqual(geminiPayload.contents[1].parts[2].functionCall.name, 'doc_read_blocks');
  assert.strictEqual(geminiPayload.contents[2].role, 'user');
  assert.ok(geminiPayload.contents[2].parts[0].functionResponse);
  // functionResponse.name 必须精准对齐 declared function name，而不是内部 call id
  assert.strictEqual(geminiPayload.contents[2].parts[0].functionResponse.name, 'doc_read_blocks');
});

test('S3-06 [JSON 自愈与容错机制]: 截断未闭合的 JSON 参数安全修复与非崩自愈', () => {
  // 1. 截断未闭合双引号与括号
  const truncated1 = '{"blockIds": ["BLK_001", "BLK_002';
  const res1 = tryHealJson(truncated1);
  assert.strictEqual(res1.ok, true);
  assert.deepStrictEqual(res1.parsed, {
    blockIds: ['BLK_001', 'BLK_002'],
  });

  // 2. 多层嵌套截断且带悬空逗号
  const truncated2 = '{"config": {"depth": 3, "filters": ["pdf", "docx"], ';
  const res2 = tryHealJson(truncated2);
  assert.strictEqual(res2.ok, true);
  assert.deepStrictEqual(res2.parsed, {
    config: { depth: 3, filters: ['pdf', 'docx'] },
  });

  // 3. 悬空冒号（无值截断）
  const truncated3 = '{"query": "contract", "limit": ';
  const res3 = tryHealJson(truncated3);
  assert.strictEqual(res3.ok, true);
  assert.deepStrictEqual(res3.parsed, {
    query: 'contract',
    limit: null,
  });

  // 4. 彻底无法修复的乱码 -> 安全标记 parseError，绝不抛出未捕获异常
  const unfixable = '<<<ILLEGAL BINARY GARBAGE>>>';
  const res4 = tryHealJson(unfixable);
  assert.strictEqual(res4.ok, false);
  assert.ok(typeof res4.error === 'string');

  const accumulator = new StreamToolAccumulator();
  accumulator.processEvent({
    type: 'tool_call_delta',
    index: 0,
    toolCallId: 'call_broken',
    name: 'test_tool',
    argumentsDelta: unfixable,
  });

  const output = accumulator.finalize();
  assert.strictEqual(output.toolCalls.length, 1);
  assert.ok(output.toolCalls[0].parseError, '必须附带 parseError 便于上层自愈');
});

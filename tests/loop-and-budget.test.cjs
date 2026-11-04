const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

const loopAndBudget = loadTsModule(
  path.resolve(__dirname, '../src/services/agent/kernel/loopAndBudgetAlgorithms.ts')
);

test('LB-01: canonicalJsonStringify 键序规范化与边界容错', () => {
  const obj1 = { z: 1, a: 'test', m: { b: 2, a: 1 } };
  const obj2 = { a: 'test', m: { a: 1, b: 2 }, z: 1 };

  const s1 = loopAndBudget.canonicalJsonStringify(obj1);
  const s2 = loopAndBudget.canonicalJsonStringify(obj2);
  assert.strictEqual(s1, s2, '不同键序的对象序列化后必须逐字相同');

  // 边界容错: NaN, Infinity, undefined, Circular Reference
  const weirdObj = { n: NaN, inf: Infinity, u: undefined };
  assert.doesNotThrow(() => {
    const res = loopAndBudget.canonicalJsonStringify(weirdObj);
    assert.ok(res.includes('"n":null'));
  });

  // 循环引用防御验证
  const circularObj = { name: 'cycle' };
  circularObj.self = circularObj;
  assert.doesNotThrow(() => {
    const res = loopAndBudget.canonicalJsonStringify(circularObj);
    assert.ok(res.includes('"[Circular]"'));
  });
});

test('LB-02 [审查发现 #9]: 指纹计算与合法重试防误判', () => {
  const fp1 = loopAndBudget.calculateInvocationFingerprint({
    toolName: 'doc_read_blocks',
    args: { blockIds: ['BLK_001', 'BLK_002'] },
    vfsTreeHash: 'vfs_v1',
    resultSummaryHash: 'res_hash_1',
  });

  const fp2 = loopAndBudget.calculateInvocationFingerprint({
    toolName: 'doc_read_blocks',
    args: { blockIds: ['BLK_002', 'BLK_001'] }, // 顺序不同，但 canonical 化后相同
    vfsTreeHash: 'vfs_v1',
    resultSummaryHash: 'res_hash_1',
  });
  // 注意: 数组元素通常保留顺序，若显式传对象:
  const fp3 = loopAndBudget.calculateInvocationFingerprint({
    toolName: 'doc_patch',
    args: { hunkId: 'h1', replace: 'newText' },
    vfsTreeHash: 'vfs_v1',
    resultSummaryHash: 'err_hash',
  });

  // 合法重试 1: 同参数，但文件系统状态变了 (vfsTreeHash 变化)
  const fp4_vfs_changed = loopAndBudget.calculateInvocationFingerprint({
    toolName: 'doc_patch',
    args: { hunkId: 'h1', replace: 'newText' },
    vfsTreeHash: 'vfs_v2', // 世界状态已变
    resultSummaryHash: 'err_hash',
  });
  assert.notStrictEqual(fp3, fp4_vfs_changed, '世界状态发生变化时，指纹必须不同，不得判为重复');

  // 合法重试 2: 之前失败报错，这次重试成功 (resultSummaryHash 变化)
  const fp5_result_changed = loopAndBudget.calculateInvocationFingerprint({
    toolName: 'doc_patch',
    args: { hunkId: 'h1', replace: 'newText' },
    vfsTreeHash: 'vfs_v1',
    resultSummaryHash: 'success_hash',
  });
  assert.notStrictEqual(fp3, fp5_result_changed, '执行结果不同时，指纹必须不同');
});

test('LB-03 [审查发现 #9]: 周期性死循环检测 (p=1, p=2, p=3)', () => {
  // 1. p=1 连续 3 次全同指纹触发熔断
  const h1 = ['fp_a', 'fp_b', 'fp_c', 'fp_c', 'fp_c'];
  const res1 = loopAndBudget.detectCyclePeriod(h1);
  assert.strictEqual(res1.hasCycle, true);
  assert.strictEqual(res1.period, 1);

  // 连续两次不触发熔断 (允许正常重试 1 次)
  const h1_safe = ['fp_a', 'fp_b', 'fp_c', 'fp_c'];
  assert.strictEqual(loopAndBudget.detectCyclePeriod(h1_safe).hasCycle, false);

  // 2. p=2 交替震荡 A-B-A-B-A-B
  const h2 = ['fp_x', 'fp_A', 'fp_B', 'fp_A', 'fp_B', 'fp_A', 'fp_B'];
  const res2 = loopAndBudget.detectCyclePeriod(h2);
  assert.strictEqual(res2.hasCycle, true);
  assert.strictEqual(res2.period, 2);

  // 3. p=3 循环 A-B-C-A-B-C
  const h3 = ['fp_A', 'fp_B', 'fp_C', 'fp_A', 'fp_B', 'fp_C'];
  const res3 = loopAndBudget.detectCyclePeriod(h3);
  assert.strictEqual(res3.hasCycle, true);
  assert.strictEqual(res3.period, 3);
});

test('LB-04 [审查发现 #8 前缀不可变铁律与水位线滞回]: 未超高水位前缀哈希恒定，越水位批量脱水降至低水位', () => {
  const config = {
    highWatermarkTokens: 1000,
    lowWatermarkTokens: 500,
    recentProtectedTurns: 2,
    heuristicCharsPerToken: 2.0,
  };

  const systemMsg = { id: 's1', role: 'system', content: 'You are a document editing agent.' };
  const userMsg1 = { id: 'u1', role: 'user', content: 'Please review and patch paragraph 1.' };
  const assistantMsg1 = {
    id: 'a1',
    role: 'assistant',
    content: 'Inspecting blocks...',
    toolCalls: [{ id: 'call_1', name: 'doc_read_blocks', arguments: '{"ids":["B1"]}' }],
  };
  const toolMsg1 = {
    id: 't1',
    role: 'tool',
    toolCallId: 'call_1',
    content: 'A'.repeat(800), // 800 chars 约 400 tokens
  };

  // 轮次 1: 总 token 约 400+，远低于 highWatermark (1000)
  const turn1Msgs = [systemMsg, userMsg1, assistantMsg1, toolMsg1];
  const pack1 = loopAndBudget.packContextSafely(turn1Msgs, config);
  assert.strictEqual(pack1.wasDehydrated, false);

  // 记录此时前缀的序列化字符串
  const serializedPrefix1 = loopAndBudget.canonicalJsonStringify(pack1.messages);

  // 轮次 2: 用户继续对话，总 token 仍未超 1000
  const userMsg2 = { id: 'u2', role: 'user', content: 'Looks good, now check block 2.' };
  const assistantMsg2 = {
    id: 'a2',
    role: 'assistant',
    content: 'Checking block 2...',
    toolCalls: [{ id: 'call_2', name: 'doc_read_blocks', arguments: '{"ids":["B2"]}' }],
  };
  const toolMsg2 = {
    id: 't2',
    role: 'tool',
    toolCallId: 'call_2',
    content: 'Short output 2',
  };

  const turn2Msgs = [...turn1Msgs, userMsg2, assistantMsg2, toolMsg2];
  const pack2 = loopAndBudget.packContextSafely(turn2Msgs, config);
  assert.strictEqual(pack2.wasDehydrated, false);

  // 验证审查发现 #8 核心断言: 前 4 条历史消息必须逐字 100% 恒定不变！
  const prefixSlice = pack2.messages.slice(0, 4);
  assert.strictEqual(
    loopAndBudget.canonicalJsonStringify(prefixSlice),
    serializedPrefix1,
    '在未跨越水位线之前，历史前缀必须保持逐字节恒定，以确保 100% Prompt Cache 命中'
  );

  // 轮次 3: 注入一个 3000 chars (约 1500 tokens) 的巨型输出，瞬间冲破 1000 高水位
  const bigToolMsg3 = {
    id: 't3',
    role: 'tool',
    toolCallId: 'call_3',
    content: 'B'.repeat(3000),
  };
  const assistantMsg3 = {
    id: 'a3',
    role: 'assistant',
    content: 'Reading massive block...',
    toolCalls: [{ id: 'call_3', name: 'doc_read_blocks', arguments: '{"ids":["B3"]}' }],
  };

  const turn3Msgs = [...turn2Msgs, assistantMsg3, bigToolMsg3];
  const pack3 = loopAndBudget.packContextSafely(turn3Msgs, config);

  // 此时应当触发滞回脱水
  assert.strictEqual(pack3.wasDehydrated, true);
  assert.ok(pack3.dehydratedGroupCount >= 1, '应至少有 1 个历史工具组被脱水压缩');

  // 验证最早的 toolMsg1 内容被脱水为简要快照
  const dehydratedTool1 = pack3.messages.find((m) => m.id === 't1');
  assert.ok(dehydratedTool1.content.includes('[Pixory Kernel Dehydrated Snapshot:'));

  // 验证脱水压缩率: 800 字符脱水后压缩至约 136 字符 (体积下降 >= 80%)
  assert.ok(dehydratedTool1.content.length < 160);
  const compressionRatio = (800 - dehydratedTool1.content.length) / 800;
  assert.ok(compressionRatio >= 0.8, '体积压缩比必须 >= 80%');

  // 验证幂等性: 再次 pack 结果与字节完全一致
  const pack4 = loopAndBudget.packContextSafely(pack3.messages, config);
  assert.strictEqual(
    loopAndBudget.canonicalJsonStringify(pack4.messages),
    loopAndBudget.canonicalJsonStringify(pack3.messages),
    '脱水算法必须是严格幂等的'
  );
});

test('LB-05 [原子组守恒与孤儿保护]: 并行工具调用成组绑定，缺失结果自动合成防 400 崩溃', () => {
  // 一个 assistant 同时发起 call_A 与 call_B
  const assistantMulti = {
    id: 'a_multi',
    role: 'assistant',
    content: 'Calling two tools...',
    toolCalls: [
      { id: 'call_A', name: 'doc_read', arguments: '{}' },
      { id: 'call_B', name: 'doc_patch', arguments: '{}' },
    ],
  };
  const toolA = { id: 't_A', role: 'tool', toolCallId: 'call_A', content: 'Result A' };
  // 故意丢失了 call_B 的 tool_result (模拟进程崩溃中断或部分丢失)

  const messages = [assistantMulti, toolA];
  const groups = loopAndBudget.buildAtomicMessageGroups(messages);

  assert.strictEqual(groups.length, 1, 'assistant 与其工具结果必须属于同一个原子组');
  const groupMsgs = groups[0].messages;

  // 校验: 丢失的 call_B 必须被内核安全合成占位，总消息数应为 3 (assistant + toolA + synth_B)
  assert.strictEqual(groupMsgs.length, 3);
  const synthB = groupMsgs.find((m) => m.toolCallId === 'call_B');
  assert.ok(synthB, '缺失的 tool_result 必须被自动合成');
  assert.strictEqual(synthB.isError, true);
  assert.ok(synthB.content.includes('interrupted'));
});

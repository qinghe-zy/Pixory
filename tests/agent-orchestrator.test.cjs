const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

// 加载 Stage 7 编排模块
const telemetryModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/agent/orchestrator/agentTelemetryBus.ts')
);
const orchestratorModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/agent/orchestrator/agentOrchestrator.ts')
);

const { AgentTelemetryBus } = telemetryModule;
const { AgentOrchestrator } = orchestratorModule;

test('S7-01 [AgentTelemetryBus 响应式可观测总线]: 发布订阅、按 runId 隔离过滤与事件历史回放', () => {
  const bus = new AgentTelemetryBus();
  const run1Events = [];
  const run2Events = [];

  // 1. 订阅 run_101
  const unsub1 = bus.subscribeRun('run_101', (ev) => {
    run1Events.push(ev);
  });

  // 2. 发送 run_101 与 run_102 事件
  bus.emit('run:start', {
    runId: 'run_101',
    documentUri: 'report.docx',
    userPrompt: '修正标题与表格',
    timestamp: 1000,
  });

  bus.emit('run:start', {
    runId: 'run_102',
    documentUri: 'notes.md',
    userPrompt: '删除无用段落',
    timestamp: 1050,
  });

  bus.emit('thought:chunk', {
    runId: 'run_101',
    chunk: '正在分析段落...',
    fullThought: '正在分析段落...',
    timestamp: 1100,
  });

  // 断言 run_101 收到 2 个事件，未混入 run_102 事件
  assert.strictEqual(run1Events.length, 2);
  assert.strictEqual(run1Events[0].type, 'run:start');
  assert.strictEqual(run1Events[1].type, 'thought:chunk');

  // 3. 晚期挂载订阅 run_102 (测试历史回放)
  bus.subscribeRun('run_102', (ev) => {
    run2Events.push(ev);
  }, true);

  assert.strictEqual(run2Events.length, 1);
  assert.strictEqual(run2Events[0].payload.documentUri, 'notes.md');

  // 4. 退订
  unsub1();
  bus.emit('run:finish', {
    runId: 'run_101',
    status: 'success',
    durationMs: 500,
    checkpointsCount: 1,
    timestamp: 1500,
  });
  // unsub1 之后不应再收到新事件
  assert.strictEqual(run1Events.length, 2);
});

test('S7-02 [AgentOrchestrator 四大工具执行链路]: doc_inspect, doc_read_blocks, doc_batch_patch, doc_undo', async () => {
  const orchestrator = new AgentOrchestrator();

  const sampleMd = [
    '# 2026年年度财务决算报告',
    '',
    '第一季度公司总营收为 1200 万元。',
    '',
    '| 季度 | 营收 (万元) | 净利润 |',
    '| --- | --- | --- |',
    '| Q1 | 1200 | 300 |',
    '',
    '第二季度由于市场拓展，总支出有所增加。',
  ].join('\n');

  // 1. 测试 doc_inspect
  const context = {
    runId: 'run_test_tools',
    stepIndex: 1,
    documentUri: 'report.md',
    currentContent: sampleMd,
    skeletons: [],
  };

  const inspectRes = await orchestrator.executeTool(context, 'doc_inspect', {});
  assert.ok(inspectRes.result);
  assert.ok(inspectRes.result.totalBlocks >= 4);
  assert.ok(inspectRes.newSkeletons && inspectRes.newSkeletons.length >= 4);

  const headingBlock = inspectRes.newSkeletons.find((s) => s.kind === 'heading');
  const tableBlock = inspectRes.newSkeletons.find((s) => s.kind === 'table');
  assert.ok(headingBlock);
  assert.ok(tableBlock);

  // 2. 测试 doc_read_blocks (O(1) 局部按需读取)
  const readRes = await orchestrator.executeTool(
    { ...context, skeletons: inspectRes.newSkeletons },
    'doc_read_blocks',
    { blockIds: [headingBlock.blockId, tableBlock.blockId] }
  );

  assert.strictEqual(readRes.result.foundCount, 2);
  assert.ok(readRes.result.blocks[headingBlock.blockId].includes('2026年年度财务决算报告'));
  assert.ok(readRes.result.blocks[tableBlock.blockId].includes('营收'));

  // 3. 测试 doc_batch_patch (带修订留痕 trackChanges)
  const patchRes = await orchestrator.executeTool(
    { ...context, skeletons: inspectRes.newSkeletons },
    'doc_batch_patch',
    {
      hunks: [
        {
          targetBlockId: headingBlock.blockId,
          search: '2026年年度财务决算报告',
          replace: '2026年年度经审计财务决算总报告',
          trackChanges: true,
        },
      ],
      atomic: true,
    }
  );

  assert.ok(patchRes.result.success);
  assert.strictEqual(patchRes.result.appliedCount, 1);
  assert.ok(patchRes.newContent);
  assert.ok(patchRes.newContent.includes('<ins>2026年年度经审计财务决算总报告</ins>'));
  assert.ok(patchRes.newContent.includes('<del>2026年年度财务决算报告</del>'));

  // 4. 测试 doc_undo (检查点回滚异常安全防护)
  // 未配置真实 VfsWorkspace 时必须抛出明确异常而非静默忽略
  await assert.rejects(
    async () => {
      await orchestrator.executeTool(context, 'doc_undo', { checkpointId: 'ckpt_fake' });
    },
    /未配置 VfsWorkspace/
  );
});

test('S7-03 [AgentOrchestrator 循环熔断控制器]: 拦截同状态死循环调用 (p=1, 2, 3 安全断开)', async () => {
  const orchestrator = new AgentOrchestrator({ maxSteps: 8 });

  const sampleMd = '# 任务清单\n\n- [ ] 第一项任务\n- [ ] 第二项任务';

  // 模拟一个发生死循环的决策执行器：不断发起相同的 doc_read_blocks
  let stepCounter = 0;
  const loopMockExecutor = async (action, data) => {
    stepCounter++;
    return {
      action: 'tool_call',
      toolName: 'doc_read_blocks',
      args: { blockIds: ['[[BLK_SAME]]'] },
      lastResultSummary: 'no_diff',
    };
  };

  const runRes = await orchestrator.runTask(
    'todo.md',
    sampleMd,
    '请帮我处理任务',
    loopMockExecutor
  );

  // 断言任务状态标记为 failed，且明确提示检测到死循环触发自动熔断
  assert.strictEqual(runRes.status, 'failed');
  assert.strictEqual(runRes.state, 'ERROR');
  assert.ok(runRes.error.includes('死循环'));
  assert.ok(stepCounter < 6, '死循环熔断应迅速介入，绝不空转至 maxSteps 耗尽');
});

test('S7-04 [端到端任务状态机推进全流程]: IDLE -> INSPECTING -> PLANNING -> PATCHING -> COMMITTED', async () => {
  const telemetryBus = new AgentTelemetryBus();
  const orchestrator = new AgentOrchestrator({ telemetryBus, trackChangesDefault: true });

  const capturedEvents = [];
  const unsub = telemetryBus.subscribe((ev) => {
    capturedEvents.push(ev.type);
  });

  const initialMd = [
    '# 战略规划',
    '',
    '目标是提升产品稳定性与用户满意度。',
  ].join('\n');

  // 模拟正常三步走：inspect -> read -> patch -> finish
  let stepIndex = 0;
  const normalExecutor = async (action, data) => {
    stepIndex++;
    if (stepIndex === 1) {
      const heading = data.skeletons[0];
      return {
        toolName: 'doc_batch_patch',
        args: {
          hunks: [
            {
              targetBlockId: heading.blockId,
              search: '战略规划',
              replace: '2026核心战略规划纲要',
              trackChanges: true,
            },
          ],
        },
      };
    }
    return { action: 'finish' };
  };

  const result = await orchestrator.runTask(
    'strategy.md',
    initialMd,
    '修改主标题为2026核心战略规划纲要',
    normalExecutor
  );

  unsub();

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.state, 'COMMITTED');
  assert.ok(result.finalContent.includes('<ins>2026核心战略规划纲要</ins>'));

  // 验证遥测生命周期事件全量触发
  assert.ok(capturedEvents.includes('run:start'));
  assert.ok(capturedEvents.includes('step:start'));
  assert.ok(capturedEvents.includes('tool:call'));
  assert.ok(capturedEvents.includes('tool:result'));
  assert.ok(capturedEvents.includes('run:finish'));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');

function loadModule(relativePath, mockRequire = {}) {
  let targetPath = path.resolve(__dirname, relativePath);
  if (!targetPath.endsWith('.ts') && !targetPath.endsWith('.js')) {
    if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
    else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
  }
  const code = fs.readFileSync(targetPath, 'utf8');
  const transpiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  const customRequire = (reqPath) => {
    if (mockRequire[reqPath]) return mockRequire[reqPath];
    if (reqPath.startsWith('.')) {
      return loadModule(path.join(path.dirname(targetPath), reqPath), mockRequire);
    }
    return require(reqPath);
  };
  new Function('module', 'exports', 'require', transpiled)(m, m.exports, customRequire);
  return m.exports;
}

test('Two-Tier Proactive Clock: Sleep period detection and morning clamping', () => {
  const { isTimeInSleepPeriod, getNextMorning730 } = loadModule('../src/im/engine/naturalTimeParser.ts');

  // 23:45 -> in sleep period
  const lateNight = new Date('2026-10-28T23:45:00').getTime();
  assert.equal(isTimeInSleepPeriod(lateNight), true);

  // 03:15 -> in sleep period
  const earlyHours = new Date('2026-10-28T03:15:00').getTime();
  assert.equal(isTimeInSleepPeriod(earlyHours), true);

  // 14:30 -> not in sleep period
  const afternoon = new Date('2026-10-28T14:30:00').getTime();
  assert.equal(isTimeInSleepPeriod(afternoon), false);

  // Next morning 07:30 test
  const clamped = getNextMorning730(lateNight);
  const clampedDate = new Date(clamped);
  assert.equal(clampedDate.getHours(), 7);
  assert.equal(clampedDate.getMinutes(), 30);
});

test('Two-Tier Proactive Clock: executeWakeupGeneration clamps sleep periods to 07:30', async () => {
  const postponed = [];
  const scheduledAlarms = [];

  const mockDb = {
    getFirstAsync: async () => null,
    runAsync: async () => {},
  };

  const mockRepo = {
    getPendingPing: async (space, threadId) => ({
      pendingPingAt: new Date('2026-10-28T02:00:00').getTime(),
      intent: '夜聊问候',
      retryCount: 0,
    }),
    postponePendingPing: async (space, threadId, ts) => {
      postponed.push({ threadId, ts });
    },
    clearPendingPing: async () => {},
    savePendingPing: async () => {},
    getVisibleImMessages: async () => [],
    insertImMessage: async () => {},
    updateThreadLivingState: async () => {},
  };

  const mockNotification = {
    scheduleProactivePingAlarm: async (threadId, ts) => {
      scheduledAlarms.push({ threadId, ts });
    },
  };

  const { executeWakeupGeneration } = loadModule('../src/im/services/imWakeupGenerationService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imThreadRepository': mockRepo,
    './imNotificationManager': mockNotification,
    '../../core/llm-transport/streamClient': { streamClient: {} },
    '../../core/llm-transport/secureApiKey': { getActiveProviderConfig: async () => null },
    '../heartbeat/globalHeartbeatEngine': { GlobalHeartbeatEngine: { shared: { notifyListeners: () => {} } } },
  });

  // Execute at 02:00 AM (during sleep period)
  const simulatedNight = new Date('2026-10-28T02:00:00').getTime();
  const result = await executeWakeupGeneration('normal', 'test_thread_1', { now: simulatedNight });
  assert.equal(result, false);
  assert.equal(postponed.length, 1);
  assert.equal(scheduledAlarms.length, 1);
  const nextDate = new Date(postponed[0].ts);
  assert.equal(nextDate.getHours(), 7);
  assert.equal(nextDate.getMinutes(), 30);
});

test('Two-Tier Proactive Clock: executeWakeupGeneration enters hibernation if user inactive >= 72h', async () => {
  let cleared = false;
  const afternoonNow = new Date('2026-10-28T14:00:00').getTime();

  const mockDb = {
    getFirstAsync: async () => ({
      id: 'test_thread_1',
      roleCardId: null,
      context_window_n: 20,
      living_state_json: null,
      last_user_interaction_at: afternoonNow - 73 * 3600 * 1000, // Inactive > 72h
      consecutive_unreplied_count: 3,
      proactive_enabled: 1,
    }),
    runAsync: async () => {},
  };

  const mockRepo = {
    getPendingPing: async () => ({
      pendingPingAt: afternoonNow - 60000,
      intent: '日常问候',
      retryCount: 0,
    }),
    clearPendingPing: async () => {
      cleared = true;
    },
    postponePendingPing: async () => {},
  };

  const { executeWakeupGeneration } = loadModule('../src/im/services/imWakeupGenerationService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imThreadRepository': mockRepo,
    './imNotificationManager': { scheduleProactivePingAlarm: async () => {} },
    '../../core/llm-transport/streamClient': { streamClient: {} },
    '../../core/llm-transport/secureApiKey': { getActiveProviderConfig: async () => null },
    '../heartbeat/globalHeartbeatEngine': { GlobalHeartbeatEngine: { shared: { notifyListeners: () => {} } } },
  });

  const result = await executeWakeupGeneration('normal', 'test_thread_1', { now: afternoonNow });
  assert.equal(result, false);
  assert.equal(cleared, true);
});

test('Two-Tier Proactive Clock: Weak network retry postpones ping by 10 minutes when retryCount < 2', async () => {
  const postponed = [];
  const scheduled = [];
  const afternoonNow = new Date('2026-10-28T14:00:00').getTime();

  const mockDb = {
    getFirstAsync: async () => ({
      id: 'test_thread_1',
      roleCardId: null,
      context_window_n: 20,
      living_state_json: null,
      consecutive_unreplied_count: 0,
      proactive_enabled: 1,
    }),
    runAsync: async () => {},
  };

  const mockRepo = {
    getPendingPing: async () => ({
      pendingPingAt: afternoonNow - 60000,
      intent: '问回宿舍没',
      retryCount: 0,
    }),
    postponePendingPing: async (space, threadId, ts) => {
      postponed.push({ threadId, ts });
    },
    clearPendingPing: async () => {},
    getVisibleImMessages: async () => [],
  };

  const mockStreamClient = {
    streamText: () => {
      throw new Error('Network timeout');
    },
  };

  const { executeWakeupGeneration } = loadModule('../src/im/services/imWakeupGenerationService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imThreadRepository': mockRepo,
    './imNotificationManager': {
      scheduleProactivePingAlarm: async (tId, ts) => {
        scheduled.push({ tId, ts });
      },
    },
    '../../core/llm-transport/streamClient': { streamClient: mockStreamClient },
    '../../core/llm-transport/secureApiKey': { getActiveProviderConfig: async () => ({ providerId: 'test', apiKey: 'test' }) },
    '../heartbeat/globalHeartbeatEngine': { GlobalHeartbeatEngine: { shared: { notifyListeners: () => {} } } },
  });

  const result = await executeWakeupGeneration('normal', 'test_thread_1', { now: afternoonNow });
  assert.equal(result, false);
  assert.equal(postponed.length, 1);
  assert.equal(scheduled.length, 1);
  assert.ok(postponed[0].ts >= afternoonNow + 9 * 60 * 1000);
});

test('Two-Tier Proactive Clock: Successful generation writes delivered bubbles and broadcasts', async () => {
  const insertedMessages = [];
  let broadcastCalled = false;
  let clearedPing = false;
  const afternoonNow = new Date('2026-10-28T14:00:00').getTime();

  const mockDb = {
    getFirstAsync: async () => ({
      id: 'test_thread_1',
      roleCardId: null,
      context_window_n: 20,
      living_state_json: null,
      consecutive_unreplied_count: 0,
      proactive_enabled: 1,
    }),
    runAsync: async () => {},
  };

  const mockRepo = {
    getPendingPing: async () => ({
      pendingPingAt: afternoonNow - 60000,
      intent: '问回宿舍没',
      retryCount: 0,
    }),
    clearPendingPing: async () => {
      clearedPing = true;
    },
    postponePendingPing: async () => {},
    getVisibleImMessages: async () => [
      { id: '1', role: 'user', content: '去图书馆啦' },
    ],
    insertImMessage: async (space, msg) => {
      insertedMessages.push(msg);
    },
    updateThreadLivingState: async () => {},
  };

  const mockStreamClient = {
    streamText: async function* () {
      yield '图书馆闭馆了吧？[BR]';
      yield '到宿舍了没呀[STATUS: 在宿舍洗衣服 | load=free]';
    },
  };

  const { executeWakeupGeneration } = loadModule('../src/im/services/imWakeupGenerationService.ts', {
    '../../database': { initDatabase: async () => mockDb },
    '../repository/imThreadRepository': mockRepo,
    './imNotificationManager': { scheduleProactivePingAlarm: async () => {} },
    '../../core/llm-transport/streamClient': { streamClient: mockStreamClient },
    '../../core/llm-transport/secureApiKey': { getActiveProviderConfig: async () => ({ providerId: 'test', apiKey: 'test' }) },
    '../heartbeat/globalHeartbeatEngine': {
      GlobalHeartbeatEngine: {
        shared: {
          notifyListeners: () => {
            broadcastCalled = true;
          },
        },
      },
    },
  });

  const result = await executeWakeupGeneration('normal', 'test_thread_1', { now: afternoonNow });
  assert.equal(result, true);
  assert.equal(insertedMessages.length, 2);
  assert.equal(insertedMessages[0].content, '图书馆闭馆了吧？');
  assert.equal(insertedMessages[1].content, '到宿舍了没呀');
  assert.equal(insertedMessages[0].deliveryStatus, 'delivered');
  assert.equal(clearedPing, true);
  assert.equal(broadcastCalled, true);
});

# AI Provider Gateway Compatibility Design

日期：2026-06-22

## 背景

Pixory 的 AI 聊天需要兼容用户自带的第三方中转站和聚合网关，例如 One API、New API、CloseAI 以及其他 OpenAI-compatible 服务。此类服务通常能代理 `/chat/completions`，但 `/models` 可能很慢、失败、返回空列表、返回假列表，或使用非官方模型别名。

Pixory 的产品优先级是聊天连续性、可恢复生成、明确失败原因和 API Key 安全。因此中转站兼容不应以“成功读取模型列表”为前提，而应以“当前 baseUrl + API Key + modelId 能否完成一次真实聊天请求”为可用性判断。

## 目标

- 用户可以快速保存中转站配置，保存过程不访问网络。
- `/models` 同步失败不阻塞配置，也不清空用户填写的模型 ID。
- 用户始终可以手动输入模型 ID 或网关模型别名。
- 当前模型通过极短 `/chat/completions` 请求验证，验证成功后记录状态。
- 验证路径和正式聊天路径共用同一套错误归一化。
- 历史成功模型成为最可信的本地候选。
- 网络测试、同步和生成都具备超时、取消和可恢复语义。
- API Key 不进入 SQLite 普通字段、日志、错误提示、诊断快照或聊天记录。

## 非目标

- 不承诺自动识别所有中转站。
- 不承诺 `/models` 返回的模型一定真实可用。
- 不在 MVP 中开放普通用户可编辑 `extraHeaders`。
- 不在 MVP 中实现完整远程模型目录治理。
- 不把验证通过等同于流式传输一定正常；验证只证明 auth、路由和 modelId 基本可用。

## 核心原则

```txt
聊天接口是唯一真相。
/models 只是候选补全。
保存配置不碰网络。
模型 ID 永远可手动输入。
错误归一化是 verify 和 chat 的共享地基。
历史成功模型比远程目录更可信。
timeout 必须复用生成停止和恢复链路。
```

## 用户流程

设置页应从“保存并测试连接”改为三个独立动作：

```txt
保存配置
刷新模型列表
测试当前模型
```

推荐设置页结构：

```txt
模型账号

连接类型
[官方服务] [中转站 / OpenAI-compatible]

Base URL
https://example.com/v1
提示：通常填中转站提供的地址；如果失败，检查是否需要 /v1。

API Key
••••••••
提示：Key 仅保存在本机安全存储中。

连接信息导入（可选）
粘贴中转站提供的 JSON 连接信息
[导入连接信息]

全局默认模型
[可输入下拉：模型 ID]

操作
[保存配置]
[刷新模型列表]
[测试当前模型]

状态
模型列表：未同步 / 已同步 / 同步失败，不影响聊天
当前模型：未验证 / 已验证 / 配置已变更 / 测试失败
```

### 连接信息导入

部分中转站会提供可复制的连接 JSON，而不是分别给出 Base URL 和 API Key，例如：

```json
{
  "_type": "newapi_channel_conn",
  "key": "sk-...",
  "url": "https://www.moxin.online"
}
```

设置页应提供一个可选的“连接信息导入”输入框。用户粘贴后点击“导入连接信息”，Pixory 只做本地解析：

- 识别 JSON 对象中的 `url` 和 `key` 字段。
- 将 `url` 填入 Base URL 草稿。
- 将 `key` 填入 API Key 草稿。
- 不自动保存。
- 不自动测试连接。
- 不请求 `/models`。
- 不猜测或覆盖当前模型 ID。

如果导入的 `url` 是裸域名或没有路径，例如 `https://www.moxin.online`，不要自动补 `/v1`，但应在 Base URL 下方显示提示：“该连接未包含 `/v1`，如果测试失败，优先尝试在末尾加 `/v1`。”后续可提供一键补 `/v1`，但 MVP 不自动改写用户提供的地址。

解析成功后提示“已识别连接信息，请检查后先保存配置，再测试当前模型”。解析失败时提示“未识别到有效的 url 和 key”，并保留用户原始输入，方便修改后重试。

MVP 仅保证支持明确 JSON 形态，不做自然语言或任意文本提取。允许的字段名可保持很薄：

```txt
url -> Base URL
key -> API Key
```

输入必须是 JSON 对象。数组、嵌套对象、代码块、自然语言说明、URL 查询参数和任意混合文本都不在 MVP 中解析。

解析失败不得改写已有 Base URL、API Key、模型 ID 或其他草稿字段。导入行为只有在同时识别到有效 `url` 和 `key` 后，才允许覆盖 Base URL 与 API Key 草稿。

后续若真实样本需要，再增加 `base_url`、`api_key` 等别名。导入框中的原始内容不得写入 SQLite、SecureStore、日志、错误提示、诊断快照或聊天记录；只有用户点击保存后，拆分出的 API Key 才进入 SecureStore。

### 保存配置

保存配置只做本地校验：

- Base URL 非空，并可被 `URL()` 解析。
- API Key 非空。
- Base URL 做清洗和标准化，但不强行补 `/v1`。

保存 provider 账号配置不要求 Model ID 非空。Model ID 的非空校验只发生在“保存模型 ID”或“测试当前模型”动作中。这样用户可以先保存中转站账号，再通过手动输入、历史成功模型或模型列表选择当前模型。

保存配置不发 `/models`，不发 `/chat/completions`。保存成功后如果验证指纹变化，将模型状态降级为“配置已变更”，但绝不清空模型 ID。

### 刷新模型列表

刷新模型列表仅作为候选补全：

- 请求 `/models`。
- 超时建议 8 秒。
- 可取消。
- 失败时提示“未能读取模型列表，仍可手动输入模型并测试当前模型”。
- 失败不影响已保存配置，不清空 `knownModels` 或当前 `modelId`。

### 测试当前模型

测试当前模型用真实聊天接口：

```json
{
  "model": "<current modelId>",
  "messages": [{ "role": "user", "content": "ping" }],
  "max_tokens": 1,
  "stream": false,
  "temperature": 0
}
```

成功判定应宽松：

- HTTP 2xx；
- 且可以解析出 `choices` 或 `id` 等 Chat Completion 形态；
- 不要求 `message.content` 非空。

测试超时建议 15 秒，可取消。测试成功后写入验证状态，并将 `modelId` 加入历史成功模型候选。

## 数据模型

MVP 可尽量复用现有 `ai_providers` 和 `ai_provider_models`，必要时新增少量 settings 字段。

建议字段：

```ts
interface ProviderVerificationState {
  lastVerifiedAt: string | null;
  lastVerifyStatus: 'ready' | 'changed' | 'failed' | 'untested';
  lastVerifyMessage: string | null;
  verifyFingerprint: string | null;
}
```

验证指纹用于判断“配置已变更”。建议输入：

```txt
hash(normalizedBaseUrl + providerId + modelId + keyUpdatedAt)
```

不要把 API Key 内容写入普通存储。每次保存 Key 时，记录一个非敏感 `keyUpdatedAt` 或 `keyVersion`，用于参与指纹。

模型候选优先级：

```txt
历史成功模型
> /models 返回
> Pixory 远程模型目录
> App 内置薄 fallback
```

手动输入不是最后一级候选来源，而是始终可用的输入能力。即使候选列表为空、同步失败或远程目录不可用，用户也必须能直接输入当前中转站的模型 ID 或网关别名。

历史成功模型写入条件：

- 测试当前模型成功；
- 正式聊天成功完成；
- 可选：生成被用户停止但已有有效 assistant 内容。

## Base URL 标准化

规则：

- trim 空白。
- 去除末尾多余 `/`。
- 如果用户误填到 `/chat/completions`、`/completions` 或 `/models`，回退到 base 路径。
- 不自动追加 `/v1`。
- 若用户输入裸域名或没有路径，在 UI 中提示“如果连接失败，检查中转站是否要求以 `/v1` 结尾”。

请求拼接统一走 helper：

```txt
endpoint(baseUrl, '/chat/completions')
endpoint(baseUrl, '/models')
endpoint(baseUrl, '/embeddings')
```

避免出现 `//chat/completions` 或重复路径。

## 错误归一化

新增共享模块，例如：

```txt
src/ai/aiProviderErrorClassifier.ts
```

验证路径、聊天路径、模型同步路径都使用同一套分类。

建议分类：

| Code | 用户提示 |
| --- | --- |
| `auth` | API Key 无效或已过期，请检查是否复制完整。 |
| `model` | 该模型 ID 在此中转站不可用，请换一个或填写网关别名。 |
| `billing` | 中转站余额或额度不足，请到中转站后台查看。 |
| `rate_limit` | 请求过快或触发限流，请稍后重试。 |
| `timeout` | 响应太慢，已超时；配置未被清空。 |
| `network` | 网络连接失败，请检查网络或服务地址。 |
| `upstream` | 中转站或上游模型暂时异常。 |
| `bad_shape` | 中转站返回格式不兼容，已保留配置，可稍后重试。 |
| `empty_response` | AI 没有返回可用内容，可能是模型或中转站响应异常。 |
| `unknown` | 请求失败，请检查配置或稍后重试。 |

错误详情可以折叠显示，但必须脱敏：

- Authorization header 永不显示。
- API Key 永不显示。
- URL query 中的 key 类参数必须打码。
- provider 原始错误不进入聊天内容或 prompt snapshot。

## 响应兼容

OpenAI-compatible provider 应兼容：

- 标准 SSE：`data: {...}` / `data: [DONE]`。
- 不规范 `content-type` 的 SSE。
- 一次性非流式 Chat Completion JSON。
- `choices[0].delta.content`。
- `choices[0].message.content`。
- `reasoning_content`、`reasoning`、`reasoningText`。
- provider usage 元数据。

已知后续增强：

- 无 `data:` 前缀的逐行 JSON 流。
- 流内 error object。
- 空 `choices`。
- 只有 reasoning 没有 content。

这些应以真实中转站样本驱动，不在 MVP 中猜测实现。

## 超时与取消

建议超时：

```txt
/models: 8s
verify /chat/completions: 15s
正式聊天首字节: 20s
正式聊天流空闲: 30-45s
```

要求：

- `/models` 超时不影响配置。
- verify 超时只更新验证状态，不清空模型。
- 正式聊天 timeout 不应直接丢弃消息。
- timeout 应复用现有 generation stop / recoverability 路径，带稳定 reason。

推荐统一语义：

```txt
stop(reason: 'user' | 'timeout' | 'error')
  -> 保留已生成文本
  -> background flush
  -> 写 generation metrics
  -> 标记 stopped 或 failed
```

## 安全边界

- API Key 继续存 SecureStore。
- SQLite 只存 provider 配置、非敏感状态、key 更新时间或版本号。
- 连接信息导入框原文只存在当前页面内存状态，离开页面或切换 provider 后应清空。
- 不将 Key 写入日志、analytics、generation metrics、prompt snapshot、error message、diagnostic JSON。
- UI 默认掩码展示 Key。
- 中转站错误原文必须经过脱敏后才能显示或记录。

## MVP 实施顺序

1. 本地保存与校验：保存配置不访问网络。
2. 连接信息导入：可选输入框，本地解析 `url` / `key` 到草稿字段。
3. 共享错误归一化模块：verify 和 chat 共用。
4. 设置页拆分按钮：保存配置、刷新模型列表、测试当前模型。
5. 当前模型真实验证：`stream:false`、`max_tokens:1`、宽松成功判定。
6. 配置已变更状态：基于验证指纹。
7. 历史成功模型候选：verify/chat 成功后记录。
8. 聊天失败接入共享错误分类。
9. timeout 与 stop/recoverability 通路统一。
10. 响应兼容继续按真实样本补齐。

## 验收标准

- 用户可以在不等待网络的情况下保存中转站配置。
- 用户可以粘贴 New API 连接 JSON，点击导入后自动填入 Base URL 和 API Key 草稿。
- 连接信息导入不会自动保存、自动测试、同步模型或覆盖模型 ID。
- 无效 JSON、数组、嵌套对象或缺少 `url` / `key` 时，不会改写已有 Base URL、API Key 或模型 ID 草稿。
- `/models` 失败或超时不会阻止用户手动填写模型 ID。
- “测试当前模型”能独立验证当前 baseUrl + Key + modelId。
- 验证成功后设置页显示“已验证”。
- 修改 baseUrl、Key 或 modelId 后显示“配置已变更”。
- 历史成功模型优先展示，不因同步失败消失。
- 聊天失败和验证失败使用一致的错误分类和文案。
- API Key 不出现在 SQLite 普通字段、日志、错误提示、prompt snapshot 或 metrics 中。
- 中转站返回普通 Chat Completion JSON 时不会再显示“AI 没有返回可用内容”。
- 不规范 content-type 的 SSE 仍保持流式输出。

## 后续增强

- 官网远程模型目录 `ai-model-catalog.json`。
- 模型提供商筛选：OpenAI / DeepSeek / Claude / Gemini / 混合。
- 中转站诊断面板：baseUrl、`/models` 状态、chat 状态、响应格式。
- 高级 `extraHeaders`，禁止覆盖安全关键 header。
- 无 `data:` 前缀逐行 JSON 流兼容。
- 按 provider/baseUrl/modelId 聚合中转站质量指标。

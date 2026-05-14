import { assertOkResponse, normalizeBaseUrl, type AiChatRequest, type AiProviderAdapter } from './base';

interface ClaudeModelsResponse {
  data?: Array<{ id?: string }>;
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
}

export const claudeProvider: AiProviderAdapter = {
  async testConnection(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1/models`, {
      headers: anthropicHeaders(input.apiKey),
    });
    await assertOkResponse(response, 'Claude connection failed');
  },

  async listModels(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1/models`, {
      headers: anthropicHeaders(input.apiKey),
    });
    await assertOkResponse(response, 'Claude model list sync failed');
    const json = (await response.json()) as ClaudeModelsResponse;
    return (json.data ?? []).map((model) => model.id).filter((modelId): modelId is string => Boolean(modelId));
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1/messages`, {
        method: 'POST',
        headers: anthropicHeaders(input.apiKey),
        body: JSON.stringify({
          model: input.modelId,
          max_tokens: 2048,
          system: input.systemPrompt,
          messages: [
            ...input.history,
            { role: 'user', content: input.userPrompt },
          ],
        }),
      });
      await assertOkResponse(response, 'Claude chat request failed');
      const json = await response.json();
      const text = json.content?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';
      if (text) {
        onEvent({ type: 'answer_delta', text });
      }
      onEvent({ type: 'completed' });
    } catch (error) {
      onEvent({ type: 'error', message: error instanceof Error ? error.message : 'Claude chat request failed' });
    }
  },
};

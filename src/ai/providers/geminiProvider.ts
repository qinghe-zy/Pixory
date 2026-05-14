import { assertOkResponse, normalizeBaseUrl, type AiChatRequest, type AiProviderAdapter } from './base';

interface GeminiModelsResponse {
  models?: Array<{ name?: string }>;
}

export const geminiProvider: AiProviderAdapter = {
  async testConnection(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1beta/models?key=${encodeURIComponent(input.apiKey)}`);
    await assertOkResponse(response, 'Gemini connection failed');
  },

  async listModels(input) {
    const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/v1beta/models?key=${encodeURIComponent(input.apiKey)}`);
    await assertOkResponse(response, 'Gemini model list sync failed');
    const json = (await response.json()) as GeminiModelsResponse;
    return (json.models ?? [])
      .map((model) => model.name?.replace(/^models\//, ''))
      .filter((modelId): modelId is string => Boolean(modelId));
  },

  async streamChat(input: AiChatRequest, onEvent) {
    try {
      const response = await fetch(
        `${normalizeBaseUrl(input.baseUrl)}/v1beta/models/${encodeURIComponent(input.modelId)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.systemPrompt }] },
            contents: [
              ...input.history.map((message) => ({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }],
              })),
              { role: 'user', parts: [{ text: input.userPrompt }] },
            ],
          }),
        }
      );
      await assertOkResponse(response, 'Gemini chat request failed');
      const json = await response.json();
      const text = json.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('') ?? '';
      if (text) {
        onEvent({ type: 'answer_delta', text });
      }
      onEvent({ type: 'completed' });
    } catch (error) {
      onEvent({ type: 'error', message: error instanceof Error ? error.message : 'Gemini chat request failed' });
    }
  },
};

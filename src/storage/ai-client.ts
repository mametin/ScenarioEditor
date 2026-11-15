export type AssistantRequest = { task: string; selection: string; currentScene: string; references: { name: string; content: string }[] };

export async function askAssistant(endpoint: string, accessToken: string, payload: AssistantRequest, signal: AbortSignal) {
  const base = endpoint.replace(/\/+$/, '');
  const response = await fetch(`${base}/v1/assist`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), signal, cache: 'no-store',
  });
  const data = await response.json().catch(() => ({})) as { text?: string; error?: string; usage?: { inputTokens?: number | null; outputTokens?: number | null } };
  if (!response.ok) throw new Error(data.error || `AIサーバーへ接続できませんでした（${response.status}）。`);
  if (!data.text) throw new Error('AIサーバーから空の返答が届きました。');
  return { text: data.text, usage: data.usage };
}

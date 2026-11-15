import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAssistant } from '../storage/ai-client';

afterEach(() => vi.unstubAllGlobals());

describe('AIクライアント', () => {
  it('選択された送信対象をそのままサーバーへ渡し、APIキーを要求しない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: '提案', usage: { inputTokens: 12, outputTokens: 4 } }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = { task: '推敲', selection: '選択文', currentScene: '', references: [{ name: 'NPC', content: '選んだ資料' }] };
    const result = await askAssistant('https://ai.example/', 'short-lived-google-token', payload, new AbortController().signal);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ai.example/v1/assist');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer short-lived-google-token');
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(init.body).not.toContain('OPENAI_API_KEY');
    expect(result.text).toBe('提案');
  });

  it('サーバーの認証・制限エラーを画面用メッセージとして返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: '許可されたアカウントではありません。' }, { status: 403 })));
    await expect(askAssistant('https://ai.example', 'token', { task: 'x', selection: 'y', currentScene: '', references: [] }, new AbortController().signal)).rejects.toThrow('許可されたアカウントではありません');
  });

  it('AbortSignalによるキャンセルをサーバーへ伝える', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))));
    const controller = new AbortController();
    const request = askAssistant('https://ai.example', 'token', { task: '要約', selection: 'text', currentScene: '', references: [] }, controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});

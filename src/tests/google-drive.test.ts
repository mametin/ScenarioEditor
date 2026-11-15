import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../domain/project';
import { createGoogleDriveFile, loadGoogleDriveSnapshot, updateGoogleDriveFile } from '../storage/google-drive';

afterEach(() => vi.unstubAllGlobals());

describe('Google Drive手動保存境界', () => {
  it('有効なJSONと同じ版を確認してから作品を開く', async () => {
    const snapshot = createProject('Drive作品');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'file-1', name: 'test.json', version: '8', mimeType: 'application/json' }))
      .mockResolvedValueOnce(Response.json(snapshot))
      .mockResolvedValueOnce(Response.json({ id: 'file-1', name: 'test.json', version: '8', mimeType: 'application/json' }));
    vi.stubGlobal('fetch', fetchMock);
    const loaded = await loadGoogleDriveSnapshot('file-1', 'memory-token');
    expect(loaded.snapshot.project.title).toBe('Drive作品');
    expect(loaded.file.version).toBe('8');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(call => new Headers(call[1]?.headers).get('Authorization') === 'Bearer memory-token')).toBe(true);
  });

  it('旧schemaVersionも既存マイグレーションを通して読む', async () => {
    const oldSnapshot = { ...createProject('旧形式'), schemaVersion: 4 as const, nodes: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'old-file', name: 'old.json', version: '2' }))
      .mockResolvedValueOnce(Response.json(oldSnapshot))
      .mockResolvedValueOnce(Response.json({ id: 'old-file', name: 'old.json', version: '2' }));
    vi.stubGlobal('fetch', fetchMock);
    const loaded = await loadGoogleDriveSnapshot('old-file', 'memory-token');
    expect(loaded.snapshot.schemaVersion).toBe(5);
    expect(loaded.snapshot.project.title).toBe('旧形式');
  });

  it('無効JSONや読み込み中のDrive更新を拒否する', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'file-1', version: '8' }))
      .mockResolvedValueOnce(new Response('{bad json', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadGoogleDriveSnapshot('file-1', 'token')).rejects.toThrow('有効なJSON');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset()
      .mockResolvedValueOnce(Response.json({ id: 'file-1', version: '8' }))
      .mockResolvedValueOnce(Response.json(createProject('読み込み時更新')))
      .mockResolvedValueOnce(Response.json({ id: 'file-1', version: '9' }));
    await expect(loadGoogleDriveSnapshot('file-1', 'token')).rejects.toThrow('読み込み中にDriveファイルが更新');
  });

  it('別端末が先に更新したDriveファイルへ上書きしない', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'file-1', name: 'test.json', version: '9' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(updateGoogleDriveFile(createProject(), { fileId: 'file-1', fileName: 'test.json', version: '8', email: 'writer@example.com' }, 'token')).rejects.toThrow('別の場所・端末で変更');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('別ファイル作成では検証済みSnapshotだけを送る', async () => {
    const snapshot = createProject('作品');
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: 'new-file', name: '作品.json', version: '1' }));
    vi.stubGlobal('fetch', fetchMock);
    const file = await createGoogleDriveFile(snapshot, '作品', 'token');
    expect(file.id).toBe('new-file');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('uploadType=multipart');
    expect(init.method).toBe('POST');
    expect(init.body).toContain(snapshot.project.id);
    expect(init.body).toContain('"schemaVersion":5');
    expect(init.body).not.toContain('accessToken');
  });
});

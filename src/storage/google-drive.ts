import { parseSnapshot, type Snapshot } from '../domain/schema';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export type DriveConfig = { clientId: string; apiKey: string; appId: string };
export type DriveCredential = { accessToken: string; expiresAt: number; email: string };
export type DriveFile = { id: string; name: string; version: string; modifiedTime?: string; mimeType?: string; trashed?: boolean };
export type DriveBinding = { fileId: string; fileName: string; version: string; email: string };
type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string };

declare global {
  interface Window {
    google?: {
      accounts?: { oauth2?: { initTokenClient(options: { client_id: string; scope: string; callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void }): { requestAccessToken(options?: { prompt?: string }): void }; revoke(token: string, callback?: () => void): void } };
      picker?: {
        DocsView: new () => { setIncludeFolders(value: boolean): unknown; setMimeTypes(value: string): unknown };
        PickerBuilder: new () => {
          setDeveloperKey(key: string): unknown; setAppId(id: string): unknown; setOAuthToken(token: string): unknown;
          addView(view: unknown): unknown; setTitle(title: string): unknown; setSelectableMimeTypes(types: string): unknown;
          setCallback(callback: (data: { action: string; docs?: { id: string; name?: string }[] }) => void): unknown;
          build(): { setVisible(value: boolean): void };
        };
        Action: { PICKED: string; CANCEL: string };
      };
    };
    gapi?: { load(name: string, callback: () => void): void };
  }
}

let scriptsPromise: Promise<void> | undefined;

export function googleDriveConfig(): DriveConfig | undefined {
  // Next.js only inlines direct process.env.NEXT_PUBLIC_* references into browser bundles.
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID;
  return clientId && apiKey && appId ? { clientId, apiKey, appId } : undefined;
}

async function loadGoogleLibraries() {
  if (!scriptsPromise) scriptsPromise = new Promise<void>((resolve, reject) => {
    const load = (id: string, src: string, ready: () => boolean) => new Promise<void>((ok, fail) => {
      if (ready()) { ok(); return; }
      const existing = document.getElementById(id) as HTMLScriptElement | null;
      const script = existing ?? document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => ok();
      script.onerror = () => fail(new Error('Googleの接続ライブラリを読み込めませんでした。ネットワークを確認してください。'));
      if (!existing) document.head.append(script);
    });
    void (async () => {
      try {
        await load('google-gis', 'https://accounts.google.com/gsi/client', () => !!window.google?.accounts?.oauth2);
        await load('google-picker-api', 'https://apis.google.com/js/api.js', () => !!window.gapi);
        const timeout = window.setTimeout(() => reject(new Error('Google Driveのファイル選択画面が時間内に読み込めませんでした。ネットワークを確認してください。')), 15_000);
        window.gapi?.load('picker', () => { window.clearTimeout(timeout); resolve(); });
      } catch (error) { reject(error); }
    })();
  }).catch(error => { scriptsPromise = undefined; throw error; });
  await scriptsPromise;
}

export async function prepareGoogleDrive() { await loadGoogleLibraries(); }

export function waitForGoogleToken(
  start: (callback: (response: GoogleTokenResponse) => void) => void,
  timeoutMs = 120_000,
): Promise<GoogleTokenResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      complete();
    };
    const timeout = setTimeout(() => finish(() => reject(new Error('Google認証から応答がありませんでした。接続を確認して、もう一度お試しください。'))), timeoutMs);
    try {
      start(response => finish(() => {
        if (!response.access_token) {
          const message = response.error === 'access_denied'
            ? 'Google Driveへのアクセスが許可されませんでした。'
            : response.error ? `Google認証が完了しませんでした（${response.error}）。` : 'Google認証に失敗しました。';
          reject(new Error(message));
          return;
        }
        resolve(response);
      }));
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export async function connectGoogleDrive(config: DriveConfig): Promise<DriveCredential> {
  await loadGoogleLibraries();
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) throw new Error('Google認証を初期化できませんでした。ページを再読み込みしてください。');
  const response = await waitForGoogleToken(callback => {
    const client = oauth.initTokenClient({ client_id: config.clientId, scope: `${DRIVE_SCOPE} ${USERINFO_SCOPE}`, callback });
    client.requestAccessToken({ prompt: 'select_account' });
  });
  const accessToken = response.access_token!;
  let userResponse: Response;
  try {
    userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new Error('Googleアカウントの確認が時間内に終わりませんでした。通信を確認して、もう一度お試しください。');
    throw new Error('Googleアカウントを確認できませんでした。通信を確認して、もう一度お試しください。');
  }
  if (!userResponse.ok) throw new Error('Googleアカウント情報を取得できませんでした。再接続してください。');
  const user = await userResponse.json() as { email?: string };
  if (!user.email) throw new Error('Googleアカウントのメールアドレスを確認できませんでした。');
  return { accessToken, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000, email: user.email };
}

export function disconnectGoogleDrive(credential?: DriveCredential) {
  if (credential?.accessToken) window.google?.accounts?.oauth2?.revoke(credential.accessToken);
}

export async function pickGoogleDriveFile(config: DriveConfig, credential: DriveCredential): Promise<{ id: string; name: string } | undefined> {
  if (credential.expiresAt <= Date.now()) throw new Error('Google Driveへの接続期限が切れました。再接続してください。');
  await loadGoogleLibraries();
  const picker = window.google?.picker;
  if (!picker) throw new Error('Google Driveのファイル選択画面を初期化できませんでした。');
  return new Promise(resolve => {
    const view = new picker.DocsView();
    view.setIncludeFolders(false);
    view.setMimeTypes('application/json');
    const builder = new picker.PickerBuilder();
    builder.setDeveloperKey(config.apiKey);
    builder.setAppId(config.appId);
    builder.setOAuthToken(credential.accessToken);
    builder.setTitle('シナリオJSONを開く');
    builder.setSelectableMimeTypes('application/json');
    builder.addView(view);
    builder.setCallback(data => {
      const document = data.docs?.[0];
      resolve(data.action === picker.Action.PICKED && document ? { id: document.id, name: document.name ?? 'シナリオ.json' } : undefined);
    });
    builder.build().setVisible(true);
  });
}

async function driveRequest<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) }, cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Google Driveへの接続期限が切れました。再接続してください。');
    if (response.status === 403) throw new Error('Google Driveの権限がありません。接続アカウントとファイル共有を確認してください。');
    if (response.status === 404) throw new Error('Driveファイルが削除されたか、アクセスできなくなりました。ローカル原稿は保持されています。');
    throw new Error(`Google Driveへのアクセスに失敗しました（${response.status}）。ローカル原稿は保持されています。`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function loadGoogleDriveSnapshot(fileId: string, token: string): Promise<{ snapshot: Snapshot; file: DriveFile }> {
  const query = 'fields=id,name,version,modifiedTime,mimeType,trashed';
  const url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${query}`;
  const before = await driveRequest<DriveFile>(url, token);
  if (before.trashed) throw new Error('このDriveファイルはゴミ箱にあります。ローカル原稿は変更していません。');
  const content = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!content.ok) throw new Error(content.status === 401 ? 'Google Driveへの接続期限が切れました。再接続してください。' : 'Driveファイルの内容を読み込めませんでした。ローカル原稿は変更していません。');
  let parsed: unknown;
  try { parsed = await content.json(); } catch { throw new Error('選択したファイルは有効なJSONではありません。現在の作品は変更していません。'); }
  const snapshot = parseSnapshot(parsed);
  const after = await driveRequest<DriveFile>(url, token);
  if (before.version !== after.version) throw new Error('読み込み中にDriveファイルが更新されました。もう一度開いてください。現在の作品は変更していません。');
  return { snapshot, file: after };
}

function multipart(snapshot: Snapshot, metadata: { name: string }) {
  const boundary = `scenario_editor_${crypto.randomUUID().replaceAll('-', '')}`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(snapshot)}\r\n--${boundary}--`;
  return { boundary, body };
}

export async function createGoogleDriveFile(snapshot: Snapshot, name: string, token: string) {
  const { boundary, body } = multipart(parseSnapshot(snapshot), { name: name.endsWith('.json') ? name : `${name}.json` });
  return driveRequest<DriveFile>(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,version,modifiedTime,mimeType`, token, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
}

export async function updateGoogleDriveFile(snapshot: Snapshot, binding: DriveBinding, token: string) {
  const current = await driveRequest<DriveFile>(`${DRIVE_API}/files/${encodeURIComponent(binding.fileId)}?fields=id,name,version,modifiedTime,trashed`, token);
  if (current.trashed || current.version !== binding.version) throw new Error('Drive上のファイルが別の場所・端末で変更された可能性があります。上書きせず、別ファイルとして保存してください。');
  const { boundary, body } = multipart(parseSnapshot(snapshot), { name: binding.fileName });
  return driveRequest<DriveFile>(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(binding.fileId)}?uploadType=multipart&fields=id,name,version,modifiedTime,mimeType`, token, { method: 'PATCH', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
}

export function readDriveBinding(projectId: string): DriveBinding | undefined {
  try {
    const raw = localStorage.getItem(`scenario-editor-drive-link:${projectId}`);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as DriveBinding;
    return typeof value.fileId === 'string' && typeof value.fileName === 'string' && typeof value.version === 'string' && typeof value.email === 'string' ? value : undefined;
  } catch { return undefined; }
}

export function writeDriveBinding(projectId: string, binding: DriveBinding) {
  try { localStorage.setItem(`scenario-editor-drive-link:${projectId}`, JSON.stringify(binding)); }
  catch { throw new Error('Driveとの紐付けをこの端末へ保存できませんでした。作品JSONは保存済みです。再読み込み前にJSONも退避してください。'); }
}

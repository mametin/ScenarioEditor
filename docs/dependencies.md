# 依存関係確認

確認日: 2026-11-09。npm公式レジストリのlatest/engines/licenseを確認し、package-lock.jsonに解決結果を固定した。Node.js 24.14.0 / npm 11.9.0でインストール、テスト、ビルドを検証。

| ライブラリ | 導入版 | ライセンス |
| --- | --- | --- |
| Next.js | 16.4.5 | MIT |
| React / React DOM | 19.3.1 | MIT |
| Zod | 4.6.7 | MIT |
| Dexie | 4.4.7 | Apache-2.0 |
| TypeScript | 7.0.2 | Apache-2.0 |
| Vitest | 5.1.0 | MIT |
| fake-indexeddb | 6.2.7 | Apache-2.0 |
| @types/node | 26.6.6 | MIT |
| @types/react / react-dom | 19.3.0 | MIT |

Next.jsはNode >=20.9、Vitestは^22.12 / ^24 / >=26を要求。実行環境のNode 24で双方を満たす。npm install時のauditは脆弱性0件。これは確認時点の結果であり、継続監視の代替ではない。

参照元:

- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://zod.dev/v4
- https://dexie.org/docs/Dexie/Dexie.transaction()
- https://registry.npmjs.org/ （各パッケージのversion、engines、license）

React Flow、Tiptap、Tailwind、shadcn/ui、Zustand、Octokit、Playwrightは未導入。利用フェーズで最新版・互換性・ライセンスを改めて確認する。

Phase 2: @xyflow/react 12.12.1（MIT）を使用。2026-11-09にnpm公式レジストリでlatestとpeerDependenciesを確認。React/React DOM >=17を要求し、導入済み19.3.1を満たす。

Phase 3: @tiptap/core、pm、react、starter-kit 3.33.0。公式npmレジストリで安定版・MIT・React 19互換を確認して導入。インストール時auditは0件。

2026-11-15 外部連携: npm依存は追加していない。Google Identity ServicesとGoogle PickerはGoogle公式ホストのブラウザーライブラリを使用。Drive API・Google userinfo・OpenAI Responses APIはFetchで呼び出す。AIサーバーはNode.js組み込み`http`のみを使う。AI APIキーやGoogle client ID/API keyはコードへ含めない。

確認した公式仕様:

- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports): 動的Requestを使うRoute Handlerは静的書き出しで実行できないため、AI APIを分離。
- [Google Picker Web App](https://developers.google.com/workspace/drive/picker/guides/web-picker): Google Cloud project、Picker API、API key、Web OAuth client、JavaScript origins、App ID（project number）が必要。
- [Google OAuth token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model): ユーザー操作で短期access tokenを取得する。オフライン用のrefresh tokenは保持しない。
- [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth): 利用者が選択したファイルだけに制限する`drive.file`を採用。
- [Google OAuth verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification): 公開範囲・scope分類・ブランド設定に応じて検証要件を確認する。
- [OpenAI API key safety](https://developers.openai.com/api/docs/guides/api-keys): 本番キーはサーバー側のSecret Manager等で保管。
- [OpenAI Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create)と[Data controls](https://developers.openai.com/api/docs/guides/your-data): `store:false`およびデータ保持上の制限を確認。
- [OpenAI models](https://developers.openai.com/api/docs/models)と[pricing](https://developers.openai.com/api/docs/pricing): 初期モデルを`gpt-6-luna`に設定。料金・モデル提供状況は本番利用時に再確認。

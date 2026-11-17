# Google Drive・AI連携 実装記録

日付: 2026-11-15

## 調査結果

- 現行公開はNext.js `output: 'export'`のGitHub Pages静的サイト。作品の正本はIndexedDB、JSONバックアップと検証済み別プロジェクト復元が既存機能。サーバー同期は未実装。
- `Snapshot` schemaVersion 5、本文は独立Document、各ノード・参照・アウトライン・整理フォルダーは既存のIDモデルである。追加連携に伴う作品形式変更は不要。
- グラフUndoが過去のdocumentsまで復元するコード上の不具合を発見。クラウド保存開始前に修正し、Undo/Redo中も最新本文が保持される回帰テストを追加。
- Next.js公式ローカルガイドの静的書き出し、Route Handler、環境変数を確認。静的exportは要求時のRoute Handlerを配信できないため、アプリをサーバー移行せずAI APIだけ別Node.jsサービスとした。
- Google公式ガイドでGIS token model、Picker、`drive.file`権限、OAuth公開時の検証要件を確認。OpenAI公式ガイドでResponses API、`store:false`、データ保持、モデル・価格を確認。

## 実装した範囲

### Google Drive

- ファイルメニューへGoogle接続／切断、Driveから開く、Drive新規保存、既存ファイル保存、別ファイル保存を追加。
- Pickerで選んだJSONを既存`parseSnapshot`で検証し、新Project IDを割り当てて新しいIndexedDBプロジェクトへ保存。現在のプロジェクトを入れ替えない。
- Drive開封時に前後の版を読み、読み込み中の変更を検出。既知の競合ではDrive保存を拒否し、別ファイル保存へ案内。
- 更新前にDrive `version`を比較するが、確認とアップロード間の原子的比較更新は保証できない。Driveの自動同期・自動統合は追加していない。
- Drive file ID・version等はプロジェクト別localStorage、OAuth access tokenはメモリーのみ。作品JSONはSnapshot v5を維持。

### AIアシスタント

- 右側パネルに依頼文、選択範囲、現在のシーン、追加設定資料の明示選択を設け、送信前に対象と文字数を表示。
- 別Node.jsサービスはGoogle userinfoに問い合わせ、検証済みメールを許可リスト照合。厳密なOrigin許可、Bearer必須、192 KiB本文上限、48,000文字、参照12件、出力1,200 token、時間・日次・概算token上限、60秒タイムアウト、キャンセルを実装。プロンプトや本文をログへ出さない。
- OpenAI Responses APIへ`store:false`を指定。生成結果はセッション内だけで、本文を自動上書きしない。返答前後に対象本文が変更された場合、古い選択範囲には適用しない。
- 参照・書式・段落構造を壊さないよう、プレーンな同一段落の範囲だけ通常のTiptap編集へ適用し、Undoで戻せるようにした。他の提案は変更前確認・コピー・破棄で扱う。
- 初期モデルは2026-11-15に公式モデル一覧と料金を確認し`gpt-6-luna`に設定。環境変数で変更可能。

## 主要ファイル

- `src/storage/google-drive.ts`: Google OAuth、Picker、Drive API、プロジェクト別紐付け
- `src/app/page.tsx`: ファイルメニューとDrive/AI状態
- `src/components/AIAssistantPanel.tsx`, `src/components/ai-assistant.css`: 送信確認と提案UI
- `src/storage/ai-client.ts`: AI APIクライアント
- `services/ai-api/server.mjs`: 認証・検証・制限・Responses API呼び出し
- `services/ai-api/Dockerfile`: 独立サービス用イメージ
- `src/domain/graph.ts`: graph historyからDocumentを除外し、本文巻き戻りを防止
- `docs/google-drive-and-ai.md`: Google Cloud、GitHub Pages、OpenAI、APIデプロイ手順と制限
- `docs/architecture.md`, `docs/roadmap.md`, `README.md`, `docs/dependencies.md`: 現状・設計・進捗を反映

## 検証結果

- `npm run typecheck`: 成功
- `npm test`: 10ファイル・90件成功
- `npm run test:ai`: 6件成功（Origin、許可アカウント、送信対象、store:false、文字数・リクエスト上限、上流タイムアウト）
- `npm run build`: 成功。Next.js出力が静的ページのみであることを確認
- `node --check services/ai-api/server.mjs`: 成功
- APIサーバー起動確認: `AI assistant API listening on 8787`を確認後に停止
- `git diff --check`: 空白エラーなし
- 生成済み静的JavaScriptに`OPENAI_API_KEY`が含まれないことを検索して確認
- 実ブラウザー・Google Drive実アカウント・OpenAI実API・Cloud Run本番公開は未実施。外部設定が必要なため、モックテスト結果を実サービス成功とは扱わない。

## 次段階

1. Google Cloudの開発用OAuth/Pickers設定を行い、検証専用Drive JSONで保存→再読込を確認。
2. AI APIを低い利用上限で一つの外部環境へ公開し、許可アカウント、キャンセル、実際の料金表示、送信内容を確認。
3. Driveの手動保存が安定した後に、ローカル世代、複数端末競合、削除・権限変更時の復旧を含む自動同期を設計。Driveのversion事前比較を原子性がある仕組みと見なさない。
4. AIの永続利用量台帳、複数インスタンス制限、正確な差分・複数段落採用は、実測と構造保持テストの後に追加。

## 2026-11-17 Google OAuth client_id修正

- GitHub ActionsのRepository VariablesとPages再実行は正常でしたが、`googleDriveConfig()`が`process.env`を分割代入していたため、Next.jsのブラウザー向けビルドで`NEXT_PUBLIC_*`値が埋め込まれていませんでした。
- `process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID`等への直接参照に変更し、回帰テストを追加。
- 型チェック、本番ビルド、既存テスト91件成功。テスト用OAuth IDが静的JavaScriptへ埋め込まれることを確認。

## 2026-11-17 OAuth応答待ちの固まり対策

- Google Identity Servicesの応答が返らない場合に接続Promiseが終わらず、操作中表示が解除されない経路があった。
- OAuth応答を120秒、Google userinfo確認を15秒で打ち切り、拒否・タイムアウト理由を画面へ返す。
- 回帰テストを追加。型チェック、本番ビルド、テスト94件、AI APIテスト6件が成功。

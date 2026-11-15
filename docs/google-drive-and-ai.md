# Google Drive保存とAIアシスタント

更新日: 2026-11-15

## 現在の構成と実装範囲

このアプリはGitHub Pagesへ静的公開するNext.jsアプリです。本文・ノード・設定資料など作品全体の正本は従来どおりIndexedDBに保存され、JSONバックアップも維持されます。Google Driveはその上に追加される手動の外部保存先です。Next.jsの静的書き出しでは要求時のRoute Handlerやサーバー処理を実行できないため、Drive接続はブラウザーからGoogle APIへ直接行い、OpenAI呼び出しだけを別のNode.jsサービスへ分離します。公開サイトは引き続きGitHub Pagesです。

作品JSONのschemaVersionは5のままで、Google認証・DriveファイルID・Drive版番号は含めません。Driveと作品の結び付けはプロジェクトIDごとのブラウザーlocalStorageに保存し、アクセストークンはメモリーだけに保持します。再読み込み後は再接続が必要です。接続解除・期限切れ・通信失敗でもIndexedDB原稿とJSONバックアップには影響しません。

### Drive操作

- 「ファイル」からGoogleアカウントへ接続し、Drive PickerでJSONファイルを選びます。権限は`drive.file`とアカウントメール確認用の`userinfo.email`です。Drive全体を一覧・走査する権限は要求しません。
- Driveから開いた作品は検証後、現在の作品を置き換えず、新しいローカルプロジェクトとして取り込みます。旧schemaVersionは既存の`parseSnapshot`移行で検証します。不正JSON・削除・読込中の版変更では現プロジェクトを変更しません。
- 新規保存・別ファイル保存はDriveにJSONファイルを作ります。開いているDriveファイルに保存するときは、最後に見た`version`と現在の`version`を比較し、異なる場合は上書きを止めます。
- Drive APIの版番号取得とアップロードを単一の原子的比較更新にできる保証は確認できないため、版確認直後に他端末が書き込む競合窓が残ります。双方の同時保存を完全に防げるとは主張しません。競合表示時は別ファイル保存し、内容を比較してから整理してください。Drive側の変更が見つかった場合に自動同期で押し戻す処理はありません。
- 端末への自動保存はこれまでどおり続きます。Driveへの自動同期、バックグラウンド再試行、複数端末の自動統合は未実装です。

### AI操作

- 右側AIパネルで依頼文、選択文字、現在のシーン、利用者が選んだ設定資料を確認します。作品全体やDriveの中身を自動で送信しません。確認ダイアログを通った項目だけが送られます。
- 返答と会話は現在のブラウザー画面だけに置き、IndexedDB・作品JSON・サーバーログへ保存しません。
- 選択範囲への適用は、その文書が返答待ちの間に変更されておらず、内部リンク・設定資料参照を含まない場合だけ有効です。変更は本文エディタの通常のUndoに入ります。参照を含む範囲や全文提案は自動置換せず、コピーして人が確認する方式です。
- AI APIはGoogleのアクセストークンをGoogle userinfoへ問い合わせ、設定したメールアドレスと照合します。CORSの許可だけに認証を頼りません。OpenAIキーはAPIサーバー環境にのみ置きます。
- APIは要求本文192 KiB、本文・資料合計48,000文字、参照資料12件、出力1,200トークン、毎時10回・日40回・推定日60,000トークンの上限を設けます。使用トークンと制限カウンターはAPIプロセスのメモリー上にのみ保持され、再起動や複数インスタンス間では共有されません。公開運用で強い利用量制御が必要な場合は、永続カウンター（Cloud SQL/Redis等）へ置き換えてください。OpenAIプロジェクトの支出上限も設定してください。
- OpenAI Responses APIは`store:false`を送ります。これはAPIレスポンスのアプリケーション保存を無効にする設定ですが、OpenAIのデータ管理文書では、別途の不正利用監視ログが通常最大30日保持されると説明されています。送信前に最新の契約・データ管理条件を確認してください。

## Google Cloud設定

1. Google Cloud Consoleで検証用プロジェクトを作ります。Google Drive APIとGoogle Picker APIを有効にします。
2. OAuth同意画面／Google Auth Platformでアプリ名、サポートメール、開発者連絡先を設定します。まずはTestingで自分のGoogleアカウントをテストユーザーとして登録します。
3. OAuth Client IDを「Web application」で作ります。Authorized JavaScript originsへ、開発用`http://localhost:3000`と本番の**originだけ**（例: `https://mametin.github.io`。リポジトリのパスは含めない）を登録します。GIS token modelを使うためクライアントシークレットやリダイレクトURIは使用しません。
4. API keyを作り、Website restrictionへ本番サイトoriginとGoogle Picker iframe用`https://docs.google.com/*`、開発用localhostを登録します。API restrictionはGoogle Picker APIとDrive APIだけにします。このキーは静的サイトに公開される識別用キーであり秘密ではありません。必ずリファラー/API制限を設定します。
5. Google Cloudプロジェクト番号を`GOOGLE_APP_ID`として使います。OAuth client ID、API key、プロジェクト番号はGitHub repository Variables（Secretsではなく公開値）へ次の名前で登録します。

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_API_KEY`
   - `GOOGLE_APP_ID`

6. GitHub Pages workflowを再実行します。ビルド時に`NEXT_PUBLIC_*`設定が静的サイトへ埋め込まれます。変更のたびに再ビルドが必要です。ローカル確認ではルートの`.env.local`に同名の`NEXT_PUBLIC_`設定を書き、リポジトリへコミットしないでください。

`drive.file`は利用者がPickerで選んだファイル、またはアプリが作成したファイルに限る最小権限です。Drive全体を列挙する権限は要求しません。Testingでは自分のアカウントをテストユーザーとして追加します。個人利用の例外条件を満たす場合でも、アプリがTesting状態のときはテストユーザー制限や再認証条件を確認してください。

本番で広く公開する場合は、Googleの現行ポリシー上、同意画面のホームページ・プライバシーポリシー・JavaScript origin等に関連するドメインの所有確認やブランド審査が必要です。GitHub Pagesの共有ドメイン`github.io`は利用者自身が所有するドメインではないため、Googleによる本番検証で問題になる可能性があります。公開前に独自ドメイン（例: `editor.example.jp`）をGitHub Pagesへ割り当て、そのドメインのホームページとプライバシーポリシーを登録・Search Consoleで所有確認してください。アプリには[プライバシーポリシー](/privacy/)を追加しています。OAuth同意画面のホームページ、プライバシーポリシー、サポート連絡先も設定してください。

スコープの分類・ブランド審査・検証要件は公開範囲と設定内容で変わるため、Testingから本番へ切り替えるときにCloud ConsoleのVerification Centerで再確認してください。Sensitive/Restricted scopeが必要になった場合は、理由を再検討してから追加・申請してください。

## AIサーバー設定

### 開発環境

Node.js 24を使います。`services/ai-api/.env.example`を同じ場所の`.env`へコピーし、値をローカルで設定してください。APIキーをチャットへ貼り付けたり、`.env`をコミットしたりしないでください。

```powershell
Copy-Item services/ai-api/.env.example services/ai-api/.env
```

`.env`には最低限、OpenAI APIキー、利用を許可するGoogleアカウントのメール、`AI_ALLOWED_ORIGINS=http://localhost:3000`、`AI_MODEL=gpt-6-luna`を設定します。ルート`.env.local`の`NEXT_PUBLIC_AI_API_URL`には`http://127.0.0.1:8787`を設定します。別々のターミナルで`npm run ai:dev`と`npm run dev`を起動します。

### 本番環境

静的GitHub Pagesを維持し、Node.js 24サービスだけをCloud Run等のHTTPS対応ランタイムに別途公開する設計です。`services/ai-api/Dockerfile`でビルドし、環境変数は`AI_ALLOWED_GOOGLE_EMAIL`、本番サイトのoriginだけを列挙した`AI_ALLOWED_ORIGINS`、`AI_MODEL`を設定します。`OPENAI_API_KEY`はSecret Manager等から注入してください。公開URLはルートGitHub Actions Variableの`AI_API_URL`に設定し、Pagesを再ビルドします。サービスをインターネットから到達可能にする場合も、Googleアカウント許可リスト、Bearer token検証、本文・生成量・レート制限を有効にします。CORSは認証の代わりになりません。

Cloud Runで公開する場合の設定手順:

1. OpenAI Platformに専用ProjectとAPI keyを作り、Usage limitsでアラートと支出上限を設定します。API keyはGoogle Cloud Secret Managerへ保存し、Cloud Run実行サービスアカウントにそのsecretの読み取り権限だけを付けます。
2. Cloud Runの「サービスを作成」でこのリポジトリの`services/ai-api`をDockerfileからビルドします。コンテナは`PORT`を読み、Cloud Run向けに`0.0.0.0`で待ち受けます。
3. 認証設定はアプリ側でGoogle userinfoを検証するため、Cloud RunのHTTP呼び出し自体は公開到達可能にします。Google bearer token + `AI_ALLOWED_GOOGLE_EMAIL`一致が必須です。誰でも生成APIを使える構成ではありません。サービス URLを知られにくくすることやCORSだけを認証扱いにしません。
4. 環境変数に`AI_ALLOWED_GOOGLE_EMAIL`（自分のGoogleメール）、`AI_ALLOWED_ORIGINS=https://mametin.github.io`（公開サイトのoriginだけ）、`AI_MODEL=gpt-6-luna`を設定し、`OPENAI_API_KEY`はSecret Managerから注入します。初期は最大インスタンス数を1に制限できますが、メモリー内の上限は再起動・スケール停止でリセットされます。
5. 発行されたHTTPSサービスURLをGitHub repository Variable `AI_API_URL`へ登録し、Pagesのworkflowを再実行します。Google設定も使う場合は先の3つの`GOOGLE_*` Variablesも必要です。

公開URLへの実アクセス前に、サービス上限を低く設定し、許可したアカウントでのみ少量の検証を行ってください。Cloud RunとOpenAI APIに料金が発生する場合があります。

Cloud Run等のデプロイ、Google Cloudプロジェクト、OpenAI課金契約はこのリポジトリから自動作成していません。現時点で実サービスの認証・API呼び出し・本番公開は未確認です。永続的な利用量記録や複数インスタンス間の制限が必要になった場合、APIサービスへ永続ストアを追加してください。

## OpenAIのモデル・料金

`AI_MODEL`でモデルを変更できます。2026-11-15に公式モデル一覧と料金表を確認し、初期値を短文の校正・推敲向けの`gpt-6-luna`にしています。確認時点の標準短文料金は入力100万tokenあたり$0.10、出力100万tokenあたり$0.50でした。価格は変わり得ます。OpenAI APIの課金はChatGPTの有料プランと別です。OpenAI Platformで専用Project/API keyを作り、使用量アラートと支出上限を設定してください。

## 検証・残課題

- Drive APIとPickerはモックテストでJSON検証、版変更、別ファイル作成、OAuth bearerの扱いを確認します。実Googleアカウント接続、実Drive往復は未確認です（ユーザーのGoogle Cloud設定が必要です）。
- AIサーバーはNodeのHTTPテストでorigin制限、Google account許可リスト、明示コンテキスト送信、`store:false`、入力上限、応答抽出を確認します。実OpenAI呼び出し・API料金・Cloud Runデプロイは未確認です（APIキーと外部環境設定が必要です）。
- Driveの複数端末競合を原子的に防ぐこと、自動同期、バックグラウンド再試行、タブ間Drive同期、削除・権限変更の復旧UI、Drive上の旧版選択は未実装です。
- AIの複数行全文置換、内部参照を含む範囲への適用、差分表示、会話履歴、永続的な利用量台帳は未実装です。選択したプレーンテキストの提案適用のみUndo対応です。
- AIサービスはResponses APIへ`store:false`を送りますが、OpenAI側の不正利用監視ログ保持がなくなることを意味しません。送信前に対象を選び、個人情報・未公開情報の送信は利用者が判断してください。

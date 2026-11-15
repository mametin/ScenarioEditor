import './privacy.css';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function PrivacyPage() {
  return <main className="privacy-page">
    <a href={`${basePath}/`}>← Scenario Editorへ戻る</a>
    <h1>プライバシーポリシー</h1>
    <p>更新日: 2026年11月15日</p>
    <p>TRPG Scenario Editor（以下「本アプリ」）は、シナリオの執筆・整理を行う個人向けWebアプリです。</p>
    <h2>作品データの保存</h2>
    <p>作品本文、ノード、接続、設定資料、タグ、アウトライン等は、通常の編集では利用者のブラウザー内IndexedDBへ保存します。開発元のサーバーへ自動送信しません。利用者はJSONファイルへバックアップできます。</p>
    <h2>Google Drive連携</h2>
    <p>利用者がGoogleアカウントへ接続し、Drive Pickerで選択したJSONファイル、または本アプリが作成したファイルだけをGoogle Drive APIで読み書きします。要求する権限は選択ファイル用のdrive.fileと、接続アカウント確認用のuserinfo.emailです。Googleの短期アクセストークンはブラウザーのメモリー内だけで使い、作品JSONやブラウザーの永続保存領域へ保存しません。Driveから開いた作品は現在の作品を置換せず、新しいローカルプロジェクトとして取り込みます。</p>
    <h2>AIアシスタント</h2>
    <p>AI機能を利用する場合、利用者が画面で選択し送信を確認した依頼文、本文範囲、現在のシーン、設定資料だけを別のAI APIサーバー経由でOpenAIへ送信します。作品全体やDriveの他ファイルを自動送信しません。Googleのアクセストークンはサーバーで利用者アカウントを確認するために使います。サーバーは許可メールの確認と利用上限の処理を行い、本文・依頼文・アクセストークンをログや永続データへ記録しません。</p>
    <p>OpenAI APIのResponses APIへ応答保存を無効にするstore:falseを指定します。それでもOpenAIのデータ管理条件上、不正利用監視ログが一定期間保持される場合があります。送信前に対象内容を確認してください。AIの応答は自動で作品本文へ反映せず、利用者が明示操作した場合に限り、一部の安全な選択範囲へ適用します。</p>
    <h2>第三者サービス</h2>
    <p>Google DriveおよびOpenAI APIの利用には、各サービスの利用規約・プライバシー条件が適用されます。APIキーやOAuth設定値の一部はサイト公開設定に必要ですが、OpenAIの秘密APIキーはブラウザーへ公開しません。</p>
    <ul>
      <li><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Googleプライバシーポリシー</a></li>
      <li><a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAI APIデータ管理</a></li>
    </ul>
    <h2>データの削除・問い合わせ</h2>
    <p>ブラウザー内の作品は、端末のサイトデータ削除または本アプリのプロジェクト削除で管理します。Drive上のファイルはGoogle Driveから利用者自身が管理します。お問い合わせ先はGoogle OAuth同意画面に表示されるサポート連絡先です。</p>
  </main>;
}

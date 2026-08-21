# GitHub Updaterテスト計画

## 構文・配布検査

1. `my-favorite-blocks.php`を`php -l`で検査する
2. `includes/updater/class-github-release-updater.php`を`php -l`で検査する
3. `build-release.ps1`をPowerShell Parserで検査する
4. 配布ZIP生成時の自動検証がすべて成功することを確認する

## 正常系

テストサイトには1つ前のVersionをインストールします。

例:

```text
Installed: 1.4.15
Release: v1.4.16
Asset: My-Blocks-Launcher-1.4.16.zip
```

確認項目:

1. 管理画面の「ダッシュボード → 更新」で「もう一度確認する」を実行する
2. My Blocks Launcherの更新通知が表示される
3. 表示VersionがRelease Versionと一致する
4. WordPress標準画面から更新できる
5. 更新後もプラグインが有効である
6. インストール先が`wp-content/plugins/My-Blocks-Launcher/`のままである
7. `My-Blocks-Launcher-1.4.16/`などの別フォルダが作られない
8. Versionが新しい値になっている
9. 設定画面、ブロックエディター、お気に入りブロック挿入が正常に動く

## 更新通知を出さないテスト

条件を1つずつ変え、通知が出ないことを確認します。

- ReleaseがDraft
- ReleaseがPre-release
- Tagが`1.4.16`、`release-1.4.16`、`v1.4`など不正
- Tagが`v1.4.16`だがAssetがない
- AssetがGitHub Source code ZIPだけ
- Asset名のVersionがTagと異なる
- Asset名の大文字・小文字がslugと異なる
- 同名Assetが複数ある
- Release Versionがインストール済みVersion以下

## 障害系

- GitHub APIへ接続できない
- HTTP 403
- HTTP 429
- HTTP 500
- タイムアウト
- 空または不正なJSON
- `assets`が存在しない

いずれの場合も更新通知を出さず、フロント表示、管理画面、プラグイン機能が継続することを確認します。失敗後1時間程度はGitHub APIへ即時再試行しないことも確認します。

## キャッシュ

1. 正常取得後の通常アクセスでGitHub APIへ再問い合わせしない
2. 12時間経過後に再問い合わせする
3. 失敗後の通常アクセスで1時間再問い合わせしない
4. 更新権限を持つ管理者がWordPress標準の「もう一度確認する」を実行した場合、再確認される
5. 通常の管理画面表示だけではキャッシュを破棄しない

## 複数Updater共存

別のCniWorks製プラグインまたは子テーマと同時に有効化し、次を確認します。

- Class再宣言によるFatal Errorが発生しない
- 片方のRelease情報が別製品へ表示されない
- Repositoryごとにキャッシュが分離される
- 各製品が自分のAssetだけを選択する

## 初版の制限確認

- My Blocks Launcherを無効化すると自己更新通知を供給しない
- 別のUpdaterを持つ子テーマは、その子テーマが有効な場合だけ自己更新通知を供給する

これらは初版の想定どおりの挙動です。
## 更新通知が出ない場合

次の順で確認します。

1. プラグインが有効か
2. WordPressが6.1以上か
3. Update URI、owner、Repository、slugが一致しているか
4. Releaseが公開済みで、Draft／Pre-releaseではないか
5. Tagが厳密な`vX.Y.Z`か
6. 専用Asset名がTag Versionと一致しているか
7. Release Versionがインストール済みVersionより新しいか
8. サーバーから`api.github.com`と`github.com`へHTTPS接続できるか
9. GitHub APIのレート制限を受けていないか
10. 失敗キャッシュの有効期間中ではないか

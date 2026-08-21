# My Blocks Launcher

My Blocks Launcherは、ブロックエディターの「最近使ったブロック」領域を、管理者が選んだお気に入りブロックへ置き換えるWordPressプラグインです。

## 動作要件

- WordPress 6.1以上
- GitHubへHTTPS接続できるサーバー環境

## GitHub Updater

このプラグインは、PublicなGitHub Repositoryの公開済みReleaseを確認し、WordPress標準のプラグイン更新画面へ更新情報を渡します。Personal Access Tokenは使用しません。WordPress標準の「自動更新を有効化／無効化」に対応し、独自の自動更新UIは追加しません。

Updaterは次のReleaseだけを更新対象として扱います。

- Draftではない
- Pre-releaseではない
- Tagが厳密な`vX.Y.Z`形式
- TagのVersionと一致する専用Release Assetが1個だけ存在する
- Assetの状態が`uploaded`
- Release Versionがインストール済みVersionより新しい

このプラグインの正式な配布名は次の形式です。

```text
My-Blocks-Launcher-{version}.zip
```

Version 1.4.17の場合は、次の組み合わせになります。

```text
Plugin header: 1.4.17
GitHub tag:    v1.4.17
Release asset: My-Blocks-Launcher-1.4.17.zip
ZIP root:      My-Blocks-Launcher/
```

GitHubが自動生成するSource code ZIPは更新用に使用しません。

詳細は次の文書を参照してください。

- [他のPlugin・Child Themeへ横展開するための再利用仕様書](docs/GITHUB-UPDATER-REUSE-SPEC.md)
- [Updater仕様](docs/UPDATER-SPEC.md)
- [Release手順](docs/RELEASE-PROCEDURE.md)
- [テスト手順](docs/TEST-PLAN.md)

## Pluginへの組み込み

Updater本体は次に配置しています。

```text
includes/updater/class-github-release-updater.php
```

プラグインヘッダーには`Update URI`と最低WordPressバージョンを設定します。

```php
/**
 * Requires at least: 6.1
 * Update URI: https://github.com/cni-works/My-Blocks-Launcher
 */
```

メインファイルから、Version、Update URI、Repository、slugなどをUpdaterへ渡します。VersionとUpdate URIはヘッダーから取得し、同じ値を複数箇所で手入力しません。

別のプラグインへ再利用する場合は、最低限次を製品固有の値へ変更します。

- PHP namespace
- Repository ownerとRepository名
- slug
- メインプラグインファイル
- Update URI

複数製品を同じサイトで安全に使えるよう、各製品は固有namespaceを持たせます。

```text
CniWorks\MyBlocksLauncher\Updater
CniWorks\AccessAnalytics\Updater
```

## Child Themeへの組み込み

同じUpdaterクラスは`type`を`theme`にし、`stylesheet`へ子テーマのディレクトリ名を渡すことでテーマ更新にも利用できます。

子テーマの`style.css`には次のようなヘッダーが必要です。

```css
/*
Theme Name: Example Child Theme
Template: parent-theme
Version: 1.2.0
Requires at least: 6.1
Update URI: https://github.com/cni-works/example-child-theme
*/
```

各子テーマへコピーするときは、そのテーマ固有のnamespaceへ変更します。初版では現在有効な子テーマだけが自身のUpdaterを読み込めます。

## Repositoryとslug

このプラグインの設定は次のとおりです。

```text
Owner:      cni-works
Repository: My-Blocks-Launcher
Slug:       My-Blocks-Launcher
Main file:  my-favorite-blocks.php
Update URI: https://github.com/cni-works/My-Blocks-Launcher
```

slugはインストール先フォルダ名、Release Asset名、ZIP最上位フォルダ名で完全一致させます。大文字・小文字も変更しません。

## Version管理

Versionは`my-favorite-blocks.php`の`Version`ヘッダーを正とします。Tagには先頭の`v`を付け、ZIP名には付けません。

```text
Version: 1.4.17
Tag: v1.4.17
ZIP: My-Blocks-Launcher-1.4.17.zip
```

## 配布ZIPの作成

PowerShellでプロジェクト直下から実行します。

```powershell
.\build-release.ps1
```

同じVersionのZIPがすでに存在する場合は停止します。意図的に置き換える場合だけ次を使用します。

```powershell
.\build-release.ps1 -Force
```

生成先は`release/`です。`release/`とZIPはGit管理しません。

## キャッシュと障害時の挙動

- 正常なRelease情報: 12時間
- 通信失敗または不正なRelease情報: 1時間
- HTTP timeout: 5秒
- WordPress標準画面の「もう一度確認する」操作: 当該Repositoryのキャッシュを破棄して再確認

HTTPエラー、タイムアウト、JSON異常、Tag不正、Asset不在などの場合、UpdaterはPackage URLを含まない安全な「更新なし」メタデータを返します。プラグイン本体の通常動作とWordPress標準の自動更新ON／OFF UIを維持します。

## 初版で対応しないもの

- Private Repositoryと認証Token
- ETag / If-None-Match
- SHA-256 digest検証
- 独立Updater PluginまたはMU Plugin
- GitHub Actionsによる完全自動Release
- 無効化中プラグインの自己更新
- 現在有効でないテーマの自己更新

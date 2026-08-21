# CNI Works GitHub Updater 再利用仕様書

## 1. この文書の目的

この文書は、My Blocks Launcherで実装・検証したGitHub Updaterを基準として、CNI Blocks、独自子テーマ、今後制作する独自WordPressプラグインへ同じ更新方式を安全に横展開するための基準資料です。

別のCodexセッションには、次の2つを渡すことを想定しています。

1. この仕様書
2. Updaterを導入する対象Repository

Codexは対象Repositoryの構成を先に確認し、この文書の「共通部分」を維持しながら、「製品固有部分」だけを対象製品に合わせて実装します。

この文書は一般的なGitHub Updaterの解説ではありません。My Blocks Launcher Version 1.4.16で実際に採用したファイル、設定形式、検証、キャッシュ、配布ZIP生成方法を基準にしています。

---

## 2. Updaterの目的

クライアントサイトへ導入した独自PluginまたはChild Themeについて、制作側がクライアントのWordPress管理画面へログインしなくても、GitHub Releaseを通じて更新版を配布できるようにします。

前提は次のとおりです。

- WordPress 6.1以上
- WordPress.org公式ディレクトリには登録しない
- GitHub RepositoryはPublic
- Personal Access Tokenは使用しない
- GitHub Releaseを正式な配布元とする
- WordPress標準の更新通知・更新画面・更新処理を使用する
- GitHub API障害時もPlugin／Theme本体の動作を継続する
- 初版ではUpdaterを各製品へ内包する
- 無効化中Pluginおよび現在有効でないThemeの自己更新は初版の対象外

## 3. 全体の更新フロー

```text
制作PC
  │
  ├─ コード修正
  ├─ 構文検査・動作確認
  ├─ build-release.ps1
  └─ release/{slug}-{version}.zip
          │
          ├─ Commit / Push
          ├─ Tag v{version}                   正式配布時のみ
          ├─ GitHub Release                   正式配布時のみ
          └─ 専用ZIPをRelease Assetへ添付     正式配布時のみ
                                                   │
                                                   ▼
WordPress
  │
  ├─ Plugin／有効なChild Theme内のUpdaterが起動
  ├─ Update URI用WordPressフィルターへ登録
  ├─ GitHub releases/latest APIを確認
  ├─ Tag・Asset・Versionを検証
  ├─ 新Versionの場合だけWordPressへ更新情報を返す
  ├─ WordPress標準画面に更新通知を表示
  └─ 利用者が更新すると専用Release Asset ZIPを取得・展開
```

GitHubが自動生成するSource code ZIPは更新パッケージとして使用しません。`build-release.ps1`相当の処理で生成したWordPress専用ZIPだけを使用します。

---

## 4. My Blocks Launcherで採用した構成

### 4.1 開発Repository

```text
My-Blocks-Launcher/
├── .git/
├── docs/
├── includes/
│   └── updater/
│       └── class-github-release-updater.php
├── release/
│   └── My-Blocks-Launcher-1.4.16.zip
├── .gitattributes
├── .gitignore
├── AGENTS.md
├── README.md
├── build-release.ps1
├── admin.css
├── admin.js
├── editor.css
├── editor.js
└── my-favorite-blocks.php
```

### 4.2 WordPress配布ZIP

```text
My-Blocks-Launcher-1.4.16.zip
└── My-Blocks-Launcher/
    ├── admin.css
    ├── admin.js
    ├── editor.css
    ├── editor.js
    ├── my-favorite-blocks.php
    └── includes/
        └── updater/
            └── class-github-release-updater.php
```

開発Repositoryと配布ZIPは同じ構造ではありません。配布ZIPにはWordPressで実行するファイルだけを含めます。

## 5. Updater関連ファイルの役割

### `includes/updater/class-github-release-updater.php`

共通Updaterロジックです。

- Plugin／Theme用WordPress更新フィルターへの登録
- 設定値検証
- GitHub `releases/latest` APIへの問い合わせ
- Draft／Pre-release／Tag／Assetの検証
- Release Versionとインストール済みVersionの比較
- WordPress更新データの生成
- 成功・失敗キャッシュ
- 強制更新確認時のキャッシュ破棄
- HTTP・JSON・Release異常時のfail-safe処理

My Blocks Launcherでは次の製品固有namespaceを使用しています。

```php
namespace CniWorks\MyBlocksLauncher\Updater;
```

### メインPluginファイル

My Blocks Launcherでは`my-favorite-blocks.php`です。

- Plugin HeaderへVersion、Requires at least、Update URIを宣言
- Updaterファイルを`require_once`
- Plugin HeaderからVersionとUpdate URIを取得
- Repository、slug、plugin basename、キャッシュ設定をUpdaterへ渡す

### `build-release.ps1`

開発Repositoryから配布専用ZIPを生成します。

- Plugin HeaderからVersionを取得
- Plugin HeaderからUpdate URIを取得
- `release/`へ`{slug}-{version}.zip`を生成
- 一時ステージング領域へ実行用ファイルだけをコピー
- ZIP内パスを`/`区切りで生成
- 正しい最上位フォルダを検証
- 必須PluginファイルとUpdaterを検証
- ZIP内VersionとUpdate URIを検証
- 開発用ファイル不在を検証
- 二重フォルダ構造を検証
- 同Versionの既存ZIPがある場合は通常停止
- `-Force`指定時だけ、検証済み候補ZIPで既存ZIPを置換

---

## 6. 共通部分・製品固有部分・Plugin／Theme固有部分

| 区分 | 内容 |
|---|---|
| 共通部分 | API取得、Release検証、Tag解析、Asset選択、キャッシュ、fail-safe、WordPress更新データ生成 |
| 製品固有部分 | namespace、owner、Repository名、slug、Version取得元、Update URI、メインファイル、Asset名 |
| Plugin固有部分 | Plugin Header、`plugin_basename()`、`update_plugins_{hostname}`、更新データの`slug` |
| Theme固有部分 | `style.css` Header、stylesheet、`update_themes_{hostname}`、更新データの`theme` |

UpdaterクラスはPluginとThemeの両方を処理できます。対象製品から渡す`type`と識別情報が異なります。

---

## 7. Repositoryごとに必ず変更する設定

| 設定 | My Blocks Launcher | 変更内容 |
|---|---|---|
| repo owner | `cni-works` | GitHub Repository所有者 |
| repo name | `My-Blocks-Launcher` | GitHub Repository名 |
| slug | `My-Blocks-Launcher` | WordPressインストール先フォルダ名 |
| Version | `1.4.16` | Plugin HeaderまたはTheme Headerから取得 |
| namespace | `CniWorks\MyBlocksLauncher\Updater` | 製品ごとに一意にする |
| Release Asset名 | `My-Blocks-Launcher-1.4.16.zip` | `{slug}-{version}.zip` |
| Tag名 | `v1.4.16` | `v{version}` |
| Update URI | `https://github.com/cni-works/My-Blocks-Launcher` | 対象Repository URL |
| メインファイル | `my-favorite-blocks.php` | PluginのHeaderを持つPHP |
| type | `plugin` | Pluginは`plugin`、Themeは`theme` |

### slugの注意

slugは次のすべてで大文字・小文字を含めて完全一致させます。

- WordPressへ設置するディレクトリ名
- Updaterへ渡す`slug`
- Release Assetファイル名の先頭
- ZIP内部の最上位ディレクトリ名

My Blocks Launcherでは既存フォルダ名との後方互換性を優先し、一般的な小文字slugへ変更せず`My-Blocks-Launcher`を正式slugにしています。

---

## 8. Pluginへの組み込み方法

### 8.1 Header

```php
/**
 * Plugin Name: Example Plugin
 * Version: 1.2.3
 * Requires at least: 6.1
 * Update URI: https://github.com/cni-works/Example-Plugin
 */
```

`Update URI`はWordPress.org上の同名・類似Pluginによる誤更新を防ぎ、GitHub用の動的更新フィルターを利用する識別子になります。

### 8.2 Updaterファイル

My Blocks Launcherから次をコピーします。

```text
includes/updater/class-github-release-updater.php
```

コピー後、namespaceを製品固有名へ変更します。

```php
namespace CniWorks\ExamplePlugin\Updater;
```

### 8.3 Bootstrap例

```php
$example_updater_file = __DIR__ . '/includes/updater/class-github-release-updater.php';

if ( is_readable( $example_updater_file ) ) {
    require_once $example_updater_file;

    $example_headers = get_file_data(
        __FILE__,
        array(
            'version'    => 'Version',
            'update_uri' => 'Update URI',
        ),
        'plugin'
    );

    new \CniWorks\ExamplePlugin\Updater\GitHub_Release_Updater(
        array(
            'type'          => 'plugin',
            'owner'         => 'cni-works',
            'repository'    => 'Example-Plugin',
            'slug'          => 'Example-Plugin',
            'plugin_file'   => plugin_basename( __FILE__ ),
            'version'       => $example_headers['version'],
            'update_uri'    => $example_headers['update_uri'],
            'requires'      => '6.1',
            'cache_hours'   => 12,
            'failure_hours' => 1,
            'timeout'       => 5,
        )
    );
}
```

VersionとUpdate URIはHeaderから取得し、Bootstrapへ同じ値を重複記載しません。

Updaterは`plugin_file`のディレクトリ名と設定された`slug`が一致しない場合、更新フィルターを登録しません。意図しないフォルダ名でインストールされた製品が別名ディレクトリへ更新されることを防ぎます。

---

## 9. Child Themeへの適用

### 9.1 Theme Header

Child Themeでは`style.css`へ記載します。

```css
/*
Theme Name: Example Child Theme
Template: parent-theme
Version: 1.2.3
Requires at least: 6.1
Update URI: https://github.com/cni-works/Example-Child-Theme
*/
```

### 9.2 読み込み場所

初版ではChild ThemeへUpdaterを内包するため、有効なChild Themeの`functions.php`から読み込みます。

```php
$theme_updater_file = get_stylesheet_directory() . '/includes/updater/class-github-release-updater.php';

if ( is_readable( $theme_updater_file ) ) {
    require_once $theme_updater_file;

    $theme = wp_get_theme();

    new \CniWorks\ExampleChildTheme\Updater\GitHub_Release_Updater(
        array(
            'type'          => 'theme',
            'owner'         => 'cni-works',
            'repository'    => 'Example-Child-Theme',
            'slug'          => 'example-child-theme',
            'stylesheet'    => get_stylesheet(),
            'version'       => $theme->get( 'Version' ),
            'update_uri'    => $theme->get( 'UpdateURI' ),
            'requires'      => '6.1',
            'cache_hours'   => 12,
            'failure_hours' => 1,
            'timeout'       => 5,
        )
    );
}
```

### 9.3 Pluginとの違い

| Plugin | Child Theme |
|---|---|
| HeaderはメインPHP | Headerは`style.css` |
| `plugin_file`を渡す | `stylesheet`を渡す |
| `plugin_basename( __FILE__ )` | `get_stylesheet()` |
| `update_plugins_github.com` | `update_themes_github.com` |
| ZIP必須ファイルはメインPHP | ZIP必須ファイルは`style.css` |
| 更新データキーは`slug` | 更新データキーは`theme` |

Theme用`build-release.ps1`を作る場合は、Version／Update URI取得元を`style.css`へ変更し、`style.css`、`functions.php`など対象Themeの必須ファイルを検証します。

初版では現在有効なChild ThemeだけがUpdaterコードを実行します。非有効Themeの自己更新は行いません。

---

## 10. 変更してはいけない共通部分

別Repositoryへ移植するときも、明確な仕様変更がない限り次は維持します。

- GitHub APIは`/repos/{owner}/{repo}/releases/latest`
- Public RepositoryをTokenなしで取得
- `Accept: application/vnd.github+json`
- `X-GitHub-Api-Version: 2022-11-28`
- HTTP timeoutは3～5秒に制限
- Redirect上限は3
- `wp_safe_remote_get()`を使用
- 200以外は更新なし
- JSON解析異常は更新なし
- Draftは対象外
- Pre-releaseは対象外
- Tagは厳密な`vX.Y.Z`
- Asset名は`{slug}-{version}.zip`との完全一致
- 同名Assetは1個だけ
- Asset stateは`uploaded`
- Package URLは`https://github.com/`のみ
- Remote VersionがLocal Versionより新しい場合だけ通知
- 成功キャッシュ12時間
- 失敗キャッシュ1時間
- Repositoryごとに異なるsite transient key
- WordPress標準`force-check=1`時だけ権限確認後にキャッシュ破棄
- API異常をPlugin／Theme本体へ伝播させない
- Source code ZIPをPackageに使用しない

初版では次を追加しません。

- Personal Access Token
- ETag / If-None-Match
- SHA-256 digest検証
- 独立Updater Plugin／MU Plugin
- 無効化中Pluginの更新
- 非有効Themeの更新
- GitHub Actionsによる完全自動Release

これらを将来追加する場合も、既存設定形式とWordPress標準UI統合を可能な限り維持します。

---

## 11. GitHub Releaseの作成ルール

正常なReleaseは次をすべて満たします。

- Draftではない
- Pre-releaseではない
- Tagは`vX.Y.Z`
- 専用Release Asset ZIPが存在する
- Asset名は`{slug}-{version}.zip`
- Tag VersionとAsset名Versionが一致する
- ZIP内Versionも一致する
- ZIP最上位フォルダ名がslugと一致する
- ZIPにUpdaterを含む
- ZIPに開発用ファイルを含まない

例:

```text
Plugin Header Version: 1.4.16
GitHub Tag:            v1.4.16
Release Asset:         My-Blocks-Launcher-1.4.16.zip
ZIP root:              My-Blocks-Launcher/
```

UpdaterはGitHub Release一覧に自動表示されるSource code ZIPを無視し、名前が完全一致する専用Assetだけを選択します。

---

## 12. Version・Tag・ZIPの整合性

### 12.1 正式Release

次の3つを一致させます。

```text
製品ソース内Version = GitHub Tagからvを除いたVersion = Release Asset名Version
```

さらに配布ZIP内のHeader Versionも同じである必要があります。

### 12.2 WordPressサイトとの比較

インストール済みVersionと新Release Versionは、更新が存在する場合は一致しません。

```text
Installed: 1.4.15
Release:   1.4.16
```

Updaterは`version_compare()`でRelease Versionが大きい場合だけ通知します。

### 12.3 Versionを上げない通常変更

通常変更でも作業完了時に現在VersionのZIPを`-Force`で最新化します。ただし、そのZIPはローカル確認・バックアップ・次の正式Release準備用です。

同じVersionのまま既存GitHub Release Assetを差し替えても、WordPressは新Versionとして認識しません。クライアントへ正式配布する変更では必ずVersionを上げ、新しいTagとReleaseを作成します。

---

## 13. WordPress配布用ZIP

### 13.1 基本構造

```text
{slug}-{version}.zip
└── {slug}/
    ├── PluginメインPHP または Theme style.css
    ├── 実行用PHP
    ├── 実行用JavaScript／CSS／画像
    └── includes/updater/class-github-release-updater.php
```

### 13.2 原則として除外するもの

- `.git`
- `.github`
- `docs`
- `release`
- `node_modules`
- `dist`（WordPressで実際に使用しない場合）
- `.gitignore`
- `.gitattributes`
- `AGENTS.md`
- `PROJECT-BRIEF.md`
- `COPY-EXISTING-FILES-HERE.md`
- `README.md`（実行に不要な場合）
- `build-release.ps1`
- `.env`
- `.env.*`
- `desktop.ini`
- `Thumbs.db`
- `.DS_Store`
- `*.zip`
- `*.log`
- テスト専用ファイル
- 制作内部メモ
- WordPress実行時に不要な開発ツール設定

`dist`が実際の本番アセットを保持するプロジェクトでは除外してはいけません。対象Repositoryの実装を確認し、「実行に必要か」で判断します。

### 13.3 ビルド処理の必須動作

Repositoryフォルダを手動でそのままZIP化しません。My Blocks Launcherの`build-release.ps1`を雛形に、各Repository用ビルド処理を用意します。

ビルド処理は最低限次を行います。

1. HeaderからVersionを取得
2. HeaderからUpdate URIを取得
3. 同Version ZIPの存在を確認
4. 通常は既存ZIPがあれば停止
5. `-Force`時だけ置換を許可
6. 一時ステージング領域へ実行用ファイルだけをコピー
7. `{slug}/`を最上位にしてZIP生成
8. ZIP内パスを`/`区切りにする
9. 必須ファイルを検証
10. Updater同梱を検証
11. VersionとUpdate URIを検証
12. 開発用ファイル不在を検証
13. 二重`{slug}/{slug}/`構造がないことを検証
14. 検証成功後だけ`release/`の完成ZIPを置換
15. 一時ファイルを後片付け

---

## 14. キャッシュ仕様

My Blocks LauncherではRepositoryごとのsite transientを使用しています。

```text
正常取得:             12時間
通信・API・JSON失敗:   1時間
HTTP timeout:          5秒（実装上3～5秒へ制限）
```

キャッシュキーはowner／Repository名から生成するため、同一サイト上の複数Updaterで共有されません。

WordPress管理画面の「もう一度確認する」に相当する`force-check=1`要求では、対象Plugin／Themeの更新権限を確認したうえで、そのRepositoryのキャッシュだけを削除します。

通常の管理画面・フロント表示ではキャッシュを破棄しません。

---

## 15. GitHub API障害時の挙動

次はすべて「更新なし」として処理します。

- DNS／接続障害
- timeout
- `WP_Error`
- HTTP 403
- HTTP 429
- HTTP 404／500など200以外
- 空レスポンス
- JSON解析エラー
- 想定外のJSON型
- Release情報不足
- Tag不正
- Asset不在／重複／不正

失敗結果を約1時間キャッシュし、即時再試行を繰り返しません。Updater障害によってPlugin／Theme本体、WordPressフロント、管理画面を停止させません。

初版では利用者向けエラー通知や秘密情報を含むログ出力を追加していません。

---

## 16. namespace衝突対策

複数の独自Plugin／Themeが同一サイトに導入される前提で、各製品は固有namespaceを持ちます。

```text
CniWorks\MyBlocksLauncher\Updater
CniWorks\CniBlocks\Updater
CniWorks\ExampleChildTheme\Updater
CniWorks\AccessAnalytics\Updater
```

次の方式は禁止します。

- グローバル空間へ同名`GitHub_Updater`クラスを複数定義
- すべての製品で同じnamespaceを使用
- `class_exists()`だけで先に読み込まれた不明なVersionへ依存

クラスファイルのロジックは共通でも、namespace宣言とBootstrapで参照する完全修飾クラス名は製品ごとに変えます。

---

## 17. 他Repositoryへ移植する際にコピーするもの

### 必ずコピーするもの

```text
includes/updater/class-github-release-updater.php
```

### 雛形としてコピーするもの

```text
build-release.ps1
docs/GITHUB-UPDATER-REUSE-SPEC.md
docs/RELEASE-PROCEDURE.md
docs/TEST-PLAN.md
```

### 対象Repositoryで追加・変更するもの

- PluginメインPHPまたはTheme `style.css`のHeader
- PluginメインPHPまたはTheme `functions.php`のBootstrap
- 製品固有namespace
- owner／Repository／slug／メインファイル
- 配布対象と除外対象
- ZIP必須ファイル検証
- READMEの導入・Release説明
- `.gitignore`の`release/`除外

`build-release.ps1`を無変更で他製品へコピーしてはいけません。少なくともslug、Headerファイル、必須ファイル、Plugin／Theme種別を対象Repositoryに合わせます。

---

## 18. 通常変更時の共通運用

Plugin／Child Themeに変更を加えた場合は、原則として次の順で完了します。

1. コード修正
2. 対象に応じた構文検査・動作確認
3. `build-release.ps1`で配布用ZIP生成
4. ZIP内容の簡易確認
5. `git status`と差分確認
6. Commit
7. 現在の作業ブランチをPush

作業完了時点で、`release/`内の現在VersionのZIPも必ず最新状態にします。

同じVersionのZIPが存在する通常変更では、内容を最新化する目的で次を使用します。

```powershell
.\build-release.ps1 -Force
```

ZIPはGit管理しません。Commit／Pushされるのはソースとビルド処理であり、ZIP自体はローカル`release/`へ保持します。

通常変更ごとにTagやGitHub Releaseを作る必要はありません。

---

## 19. 正式Release時の共通運用

クライアントサイトへ正式配布する場合だけ次へ進みます。

1. 現在の変更と公開範囲を確認
2. 機密情報・個人情報・公開不可素材を確認
3. PHP／JavaScript／JSON／PowerShellなどの構文検査
4. WordPressで既存機能を確認
5. 新Versionを決定
6. Plugin／Theme Header Versionを更新
7. Versionを参照する実行用アセット値を更新
8. `build-release.ps1`で新Version ZIPを生成
9. ZIP構造と内容を検証
10. Commit
11. 作業ブランチをPush
12. Pull Requestを経由して安定ブランチへ統合
13. `vX.Y.Z` Tagを作成・Push
14. DraftでもPre-releaseでもないGitHub Releaseを作成
15. 専用ZIPをRelease Assetへ添付
16. Tag・Asset名・ZIP内Version・ZIP rootを再確認
17. 旧Versionを入れたテストサイトで更新通知を確認
18. WordPress標準画面から更新
19. 更新後のVersion、ディレクトリ名、設定、機能を確認

Tag作成、GitHub Release、Asset添付は通常変更では行いません。

---

## 20. 導入後のテスト

### 20.1 自動検査

- Plugin／Theme PHP構文
- Updater PHP構文
- JavaScript／JSON構文（対象がある場合）
- `build-release.ps1` PowerShell構文
- `git diff --check`
- 配布ZIPの自動構造検証

### 20.2 正常系

1. テストサイトへ1つ前のVersionをインストール
2. 新Versionの正式Releaseと専用Assetを公開
3. WordPressの「もう一度確認する」を実行
4. 標準更新通知が表示される
5. 表示VersionがRelease Versionと一致する
6. 標準画面から更新できる
7. 更新後もPlugin／Themeが有効
8. ディレクトリ名がslugのまま
9. Versionが更新済み
10. 設定が保持されている
11. 製品固有機能が正常

### 20.3 通知しないことを確認する異常系

- Draft
- Pre-release
- 不正Tag
- Assetなし
- Source code ZIPだけ
- TagとAsset Version不一致
- slug／Asset名の大文字・小文字不一致
- 同名Asset重複
- Release VersionがLocal Version以下
- Update URI不一致
- インストールディレクトリ名とslug不一致
- APIエラー／timeout／不正JSON

### 20.4 複数製品共存

- Class再宣言Fatalが発生しない
- 各製品が自分のRepositoryだけを確認
- 各製品が自分のAssetだけを選択
- キャッシュがRepositoryごとに分離
- Plugin用応答がThemeへ混入しない

---

## 21. 更新通知が表示されない場合

次の順で確認します。

1. PluginまたはChild Themeが有効か
2. WordPressが6.1以上か
3. サーバーから`api.github.com`と`github.com`へHTTPS接続できるか
4. HeaderにVersionとUpdate URIがあるか
5. BootstrapがUpdaterを読み込んでいるか
6. namespace宣言と完全修飾クラス名が一致しているか
7. typeがPlugin／Themeと一致しているか
8. ownerとRepository名が正しいか
9. slugと実インストールディレクトリ名が完全一致しているか
10. Pluginでは`plugin_file`、Themeでは`stylesheet`が正しいか
11. Releaseが公開済みでDraft／Pre-releaseではないか
12. Tagが厳密な`vX.Y.Z`か
13. 専用Assetが1個だけ存在するか
14. Asset名が`{slug}-{tag version}.zip`と完全一致するか
15. Release Versionがインストール済みVersionより新しいか
16. GitHub APIレート制限中ではないか
17. 失敗キャッシュの1時間以内ではないか
18. WordPressの「もう一度確認する」を実行したか

ZIPを更新できない場合は、さらに次を確認します。

- ZIP最上位フォルダがslugか
- 二重フォルダではないか
- PluginメインPHPまたはTheme `style.css`があるか
- Updaterファイルがあるか
- ZIP内VersionがTagと一致するか
- 開発用ファイルが混入していないか
- WebサーバーのWordPressディレクトリ書き込み権限があるか

---

## 22. Public Repository公開前の確認

次を絶対に含めません。

- APIキー
- Password
- Personal Access Token
- サーバー認証情報
- 秘密鍵
- クライアント固有の秘密情報
- 個人情報
- 外部サービスのアクセストークン

加えて次を確認します。

- クライアント名
- クライアントドメイン
- 制作内部メモ
- テスト用個人情報
- 再配布禁止素材
- 有料フォント
- 公開不可ライブラリ
- ライセンス表記

GitHub Repositoryが更新配布元になるため、運用上は2要素認証、最小限のRepository権限、不要Collaboratorの排除、Release権限の限定を前提とします。

---

## 23. 当初設計から実装時に確定・追加した仕様

My Blocks Launcherの実装過程で、当初の概念設計から次を具体化しました。

1. WordPress最低Versionを6.1へ固定
2. WordPressの`Update URI`動的フィルターを採用
3. API endpointを`releases/latest`へ固定
4. GitHub Source code ZIPを完全に不採用
5. Asset名を`{slug}-{version}.zip`へ固定
6. Asset名は大文字・小文字を含め完全一致
7. 同名Assetが複数ある場合も拒否
8. Asset stateが`uploaded`であることを検証
9. Package URLをHTTPSの`github.com`へ限定
10. Tagを先頭ゼロなしの厳密な`vX.Y.Z`へ限定
11. Local VersionとRemote Versionは一致条件ではなく、Remoteが大きいことを通知条件とした
12. Tag Version、Asset名Version、ZIP内Versionを正式Releaseの一致対象とした
13. 成功12時間、失敗1時間のsite transientを採用
14. `force-check=1`時に権限確認後、対象Repositoryキャッシュだけを削除
15. owner／Repositoryごとにキャッシュキーを分離
16. 製品固有namespaceを必須化
17. Plugin／Theme共通クラス内で処理を分岐
18. インストール先ディレクトリ名とslugの一致を設定検証へ追加
19. ビルド時にUpdater同梱、Version、Update URIを検証
20. ZIP内パスを`/`区切りへ固定
21. 検証済み候補ZIPを完成後に置換する`-Force`方式を採用
22. Windows PowerShell互換のためHeaderファイルをUTF-8として明示読み込み
23. 変更のたびに配布ZIPを最新化し、正式配布時だけVersion／Tag／Releaseを進める運用へ整理

---

## 24. Codexへ渡す実装依頼テンプレート

```text
このRepositoryへ、docs/GITHUB-UPDATER-REUSE-SPEC.mdに準拠した
CNI Works GitHub Updaterを導入してください。

最初に既存構成、Header、namespace、slug、Version取得元、配布対象を確認し、
推測で設定を決めないでください。

My Blocks Launcherの共通ロジックを維持し、製品固有namespace、owner、repo、
slug、Update URI、Plugin／Theme種別、build-release.ps1を対象Repositoryへ
合わせてください。

変更後は構文検査、Updaterの正常・異常系確認、配布ZIP生成、ZIP構造検証を
行ってください。TagとGitHub Releaseは、正式配布の指示がある場合だけ作成してください。
```

このテンプレートを使用する場合でも、対象Repositoryに未コミット変更があるときはそれを保持し、既存機能を壊さない配置を選択します。

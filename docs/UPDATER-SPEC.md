# GitHub Updater仕様

## 目的

GitHub Releaseを公開すると、My Blocks Launcherを有効化しているWordPressサイトの標準更新画面へ更新通知を表示し、標準の更新操作で専用Release Asset ZIPをインストールできるようにします。

## 配置

```text
My-Blocks-Launcher/
├── my-favorite-blocks.php
└── includes/
    └── updater/
        └── class-github-release-updater.php
```

namespaceは`CniWorks\MyBlocksLauncher\Updater`です。別製品へ共通ソースをコピーする場合は、その製品固有のnamespaceへ変更し、同じサイト上でのClass衝突を防止します。

## WordPressとの統合

プラグインでは、`Update URI`のhostnameからWordPress 6.1の動的フィルター`update_plugins_github.com`を使用します。

テーマでは、同様に`update_themes_github.com`を使用します。

Updaterが返す主なデータは次のとおりです。

- `id`: Update URI
- `slug`または`theme`: インストール先ディレクトリ名
- `version` / `new_version`: Release Tagから取得したVersion
- `url`: GitHub Release URL
- `package`: 専用Release AssetのダウンロードURL
- `requires`: 最低WordPressバージョン

## Release検証

GitHubの`releases/latest` APIから取得したデータについて、次をすべて検証します。

1. HTTPステータスが200である
2. JSONとして解析できる
3. Draftではない
4. Pre-releaseではない
5. Tagが厳密な`vX.Y.Z`形式である
6. Asset名が`{slug}-{tag version}.zip`と完全一致する
7. 同名Assetが1個だけである
8. Assetの状態が`uploaded`である
9. Asset URLが`https://github.com/`である
10. Release VersionがローカルVersionより新しい

どれか1つでも満たさない場合は更新情報を返しません。

ZIP内部のVersionと最上位フォルダは、更新確認のたびにZIPをダウンロードせず、`build-release.ps1`による生成時検証で保証します。

## Versionの意味

ローカルVersionとRelease Versionは、更新がある場合には一致しません。

```text
Installed Version: 1.4.15
Release Tag:       v1.4.16
Release Asset:     My-Blocks-Launcher-1.4.16.zip
```

厳格一致の対象は、Release TagのVersion、Asset名のVersion、配布ZIP内プラグインヘッダーのVersionです。ローカルVersionよりRelease Versionが大きい場合だけ通知します。

## キャッシュ

Repositoryごとに名前を分けたsite transientを使用します。

- 正常取得: 12時間
- 通信・API・JSON・Release検証失敗: 1時間

失敗も短時間キャッシュするため、GitHub障害やレート制限中に即時再試行を繰り返しません。

WordPress管理画面の標準的な`force-check=1`要求を、更新権限を持つユーザーが実行した場合だけ、そのRepositoryのキャッシュを破棄します。

## Fail-safe

次の場合はすべて`更新なし`として終了します。

- `WP_Error`
- HTTP 403、429を含む200以外の応答
- タイムアウト
- 不正なJSON
- 不正なRelease
- 不正な設定

例外をPlugin / Theme本体へ伝播させず、フロント画面や管理画面の通常動作を妨げません。

## 再利用

共通化するのはクラスのロジックです。配布物には各製品固有namespaceへ変更したコピーを内包します。

プラグイン設定例:

```php
new GitHub_Release_Updater(
    array(
        'type'        => 'plugin',
        'owner'       => 'cni-works',
        'repository'  => 'example-plugin',
        'slug'        => 'example-plugin',
        'plugin_file' => plugin_basename( __FILE__ ),
        'version'     => $headers['version'],
        'update_uri'  => $headers['update_uri'],
    )
);
```

子テーマ設定例:

```php
new GitHub_Release_Updater(
    array(
        'type'       => 'theme',
        'owner'      => 'cni-works',
        'repository' => 'example-child-theme',
        'slug'       => 'example-child-theme',
        'stylesheet' => get_stylesheet(),
        'version'    => wp_get_theme()->get( 'Version' ),
        'update_uri' => wp_get_theme()->get( 'UpdateURI' ),
    )
);
```

## 将来拡張

初版のAPI取得、Release正規化、キャッシュ、WordPress応答生成をメソッド単位で分離しています。ETag、digest検証、中央Updater化を追加するときも、公開設定形式を大きく変更せず拡張できます。

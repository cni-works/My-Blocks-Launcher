# Release手順

## 前提

- `main`は公開可能な安定版として扱う
- 通常の変更は作業ブランチで行う
- GitHubアカウントで2要素認証を有効にする
- RepositoryとRelease権限を必要なメンバーだけに限定する
- Public Repositoryへ機密情報や公開不可素材を含めない

## 公開前確認

次を検索・目視確認します。

- APIキー、Password、Token、秘密鍵、サーバー認証情報
- クライアント名、ドメイン、個人情報、内部メモ
- 再配布禁止素材、有料フォント、公開不可ライブラリ
- ZIP、ログ、バックアップ、`.env`などの不要ファイル

## 手順

1. 作業ブランチの変更内容と`git status`を確認する
2. PHP、JavaScript、PowerShellなど変更対象の構文検査を行う
3. WordPressテスト環境で既存機能を確認する
4. 次のVersionを決定する
5. `my-favorite-blocks.php`のVersionを更新する
6. `build-release.ps1`を実行する
7. `release/My-Blocks-Launcher-{version}.zip`を検証する
8. 変更をcommitして作業ブランチをpushする
9. Pull Requestを作成し、確認後に`main`へ統合する
10. `v{version}` Tagを作成してpushする
11. GitHub Releaseを作成する（Draft／Pre-releaseにしない）
12. 生成したZIPをRelease Assetとして添付する
13. Tag、Asset名、ZIP内部Version、ZIP最上位フォルダを再確認する
14. テストサイトでWordPressの「もう一度確認する」を実行する
15. 更新通知から更新を実行する
16. 更新後のVersion、ディレクトリ名、プラグイン機能を確認する

## 正常な組み合わせ

```text
Plugin Version: 1.4.16
GitHub Tag: v1.4.16
Release Asset: My-Blocks-Launcher-1.4.16.zip
ZIP root: My-Blocks-Launcher/
```

GitHubのSource code ZIPは添付・表示されても、Updaterは専用Asset名だけを選択します。

## ZIP生成

```powershell
.\build-release.ps1
```

同じVersionのZIPを意図的に再生成する場合だけ使用します。

```powershell
.\build-release.ps1 -Force
```

構造検証に失敗したZIPはReleaseへ添付しません。

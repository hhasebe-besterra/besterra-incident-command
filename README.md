# BESTERRA // INCIDENT COMMAND

ベステラIT サービスデスク / ITインシデント管理システム（ハッカー風ターミナルUI）
**準拠: ITIL 4 (2019) サービスマネジメント・プラクティス ＋ HDI（Help Desk Institute）サポートセンター実務指標**

## アクセス
- URL: **http://192.168.1.10/incident/** （社内LAN／VPN内のみ・社外非公開）
- 動作環境: QNAP NAS Web Server (Apache + PHP 8.2 + SQLite3)

## 準拠モデル（ITIL 4 / HDI）
ヘッダーの「ITIL 4 / HDI 準拠」バッジから詳細パネルを表示。
- **3つのレコード種別**（ITIL 4 の実務）: インシデント管理(INC) ／ サービス要求管理(REQ) ／ 問題管理(PRB)
- **優先度 P1〜P5**: 「影響度 × 緊急度」のITIL標準マトリクスで自動決定（P1緊急→P5計画。SLA目標時間を保持）
- **ステータス**: 新規 → 対応中 → 保留 → 解決済 → 完了（ITILライフサイクル）
- **問題管理**: 根本原因・ワークアラウンド・既知のエラー・関連チケット紐付け
- **HDI指標**: 問い合わせ経路、FCR(一次解決)、CSAT(満足度)、SLA遵守、MTTR をダッシュボード／レポートで可視化

## アカウント（ID＝メアドの@前／WindowsユーザーID・初期パスワード共通 `besterra`）
ベステラIT（operator/admin＝起票・対応・削除）:
| ID | 表示名 | ロール |
|----|--------|--------|
| `h.hasebe`   | 長谷部 | admin |
| `h.murano`   | 村野（宏樹） | operator |
| `m.takeuchi` | 竹内（真菜） | operator |
| `c.kato`     | 加藤（千尋） | operator |

経営層（auditor＝閲覧＋レポートのみ・編集削除不可。ダッシュボードで全体状況を確認）:
| ID | 表示名 |
|----|--------|
| `yhonda`     | 本田 |
| `cho`        | 長 |
| `s.ikeda`    | 池田 |
| `h.miyauchi` | 宮内 |
| `k.kido`     | 木戸 |

> 全員初期パスワード `besterra`。各自ログイン後、右上 ⚙ から **パスワード変更**可能。

## チュートリアル（初回ログイン）
- 初回ログイン時、ゲーム風ガイド「NAVI」がステップ式（スポットライト誘導・ミッション制）で操作を案内
- オペレーター向け（起票・対応・レポート）／経営層向け（閲覧・レポート）でツアー内容を出し分け
- 右上 ❓ ボタンでいつでも再生可能。完了状態はブラウザの localStorage に保持

## Slack通知
- インシデントの **起票・編集・削除** 時に Slack へ自動通知（オペレーター/管理者が通知先チャンネルで受信）
- 設定: `config.php` の `INC_SLACK_WEBHOOK` に Slack Incoming Webhook URL を貼る
  - 作成: Slack管理 → api.slack.com/apps → Incoming Webhooks ON → 通知先チャンネル(例 #it-incident)選択 → 生成URL
- 未設定でもアプリは正常動作。全通知は監査用に `/.incident_data/notify.log` へ常時追記

## 削除
- operator/admin はインシデント詳細の 🗑 から削除可能（理由を任意入力→Slack/ログ通知）。auditor（経営層）は不可

## 機能
- **ダッシュボード**: 未解決件数・要対応(P1-2)・SLA超過・種別/優先度/分類の内訳・アクティブ一覧
- **チケット**: インシデント/サービス要求/問題の起票・検索/絞り込み(種別/優先度/状態/分類/経路)・詳細・対応タイムライン
- **レポート**: 週次/月次の起票・解決・継続・MTTR・FCR・SLA遵守率・CSAT・種別/優先度/分類/経路別。`report.php` で印刷/PDF化（監査用）

## 優先度 / ステータス
- 優先度 P1緊急 → P5計画（影響度×緊急度で自動決定。P1はUI上で赤パルス点滅。SLA目標 P1=4h/P2=8h/P3=24h/P4=72h/P5=168h）
- ステータス: 新規 → 対応中 → 保留 → 解決済 → 完了

## ファイル構成（NAS: /share/CACHEDEV1_DATA/Web/incident/）
| ファイル | 役割 |
|----------|------|
| index.php | ログイン＋SPA本体 |
| app.css / app.js | UI / ロジック |
| api.php | JSON API（認証・CRUD・統計・レポート） |
| db.php | SQLite接続・スキーマ・ユーザーシード |
| report_lib.php | レポート集計（共用） |
| report.php | 印刷/PDF用 監査レポート |
| config.php | ユーザー・選択肢マスタ定義 |

## データ保管
- SQLite DB: `/share/CACHEDEV1_DATA/.incident_data/incidents.db`
  - **Web公開領域の外**に隔離 → ブラウザから直接ダウンロード不可（確認済 404）
  - バックアップは Box / 既存NASバックアップ運用に含めること

## メンテナンス
- ユーザー追加/初期化: `config.php` の `$INC_SEED_USERS` を編集 → DB削除で再シード
  （※既存インシデントも消えるため、運用後は users テーブルへ直接INSERT推奨）
- 分類・種別・優先度・経路・SLA時間の調整: `config.php` の各マスタを編集
- デプロイ: SFTP（paramiko）で同ディレクトリへ上書き。`administrator` / port22

## ホスティング構成
- **本番（稼働中）**: QNAP NAS `http://192.168.1.10/incident/` ← 引き続きここで運用
- **ソース正本**: GitHub `hhasebe-besterra/besterra-incident-command`（public）＋ ローカル `C:\Users\h.hasebe\ClaudeCode\incident_soc\`
- GitHub は「どこでも再デプロイできる」可搬性のためのソース管理用。PHP + SQLite が動くWebサーバーがあれば、リポジトリを配置するだけで動作する

## 別環境への再デプロイ手順
1. PHP 8.x（pdo_sqlite 有効）が動くWebサーバーを用意
2. リポジトリを公開ディレクトリに配置（`index.php` がトップ）
3. `config.php` の `INC_DB_PATH` / `INC_NOTIFY_LOG` / `INC_EMP_PATH` / `INC_ASSIGNEE_PATH` を、Web公開領域外の書き込み可能パスに調整
4. `employees.json` / `assignees.json` をそのデータ領域へ配置（`/emp` から再生成可能）
5. 初回アクセスで DB が自動作成・ユーザーがシードされる

## ランタイム生成物（リポジトリには含めない / .gitignore 済）
- `incidents.db*`（SQLite本体）, `notify.log`（通知ログ） … 各環境のデータ領域に生成される

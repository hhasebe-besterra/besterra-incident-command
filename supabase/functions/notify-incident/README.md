# notify-incident — 通知 Edge Function

incidents の **INSERT（起票）** と **UPDATE（CLOSED/CANCELLED へ変化）** で発火し、
メール・Teams 1:1・Slack へ通知する。起票と同時のクローズ/中止も INSERT 側で通知される。

## デプロイ
- Supabase ダッシュボード → Edge Functions → Via Editor で `notify-incident` として作成 or `supabase functions deploy notify-incident`
- DB Webhook: Database → Webhooks で incidents の INSERT/UPDATE → HTTP Request（このFunctionのURL）。
  認証用にヘッダ `x-webhook-secret: <WEBHOOK_SECRET>` を付与。

## Secrets（Edge Functions → Secrets に設定。コード/リポジトリには置かない）
| キー | 用途 | 例/既定 |
|---|---|---|
| `SMTP_USER` / `SMTP_PASS` | WebArena SMTP 認証 | h.hasebe@besterra.co.jp / ●● |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | 任意（既定: v1700-227.mailsecure.jp / 465 / SMTP_USER） | |
| `NOTIFY_EMAIL_TO` | 任意（既定: 村野/竹内/長谷部/加藤の4名） | カンマ区切り |
| `TEAMS_ROPC_USER` / `TEAMS_ROPC_PASS` | Teams 1:1 送信用（admin@ ROPC） | admin@besterra.onmicrosoft.com / ●● |
| `TEAMS_TENANT` / `TEAMS_CLIENT_ID` | 任意（既定: besterra.onmicrosoft.com / MS Graph PowerShell） | |
| `TEAMS_DM_EMAILS` | 任意（既定: NOTIFY_EMAIL_TO と同じ） | カンマ区切り |
| `SLACK_BOT_TOKEN` | Slack Bot Token（chat:write） | xoxb-… |
| `SLACK_CHANNEL` | #it_working のチャンネルID | C0xxxx |
| `SLACK_DM_USER_IDS` | 個別DM先の Slack ユーザーID | U…,U…（カンマ） |
| `SLACK_WEBHOOK` | 任意（#it_working Incoming Webhook。BOTの代替） | https://hooks.slack.com/… |
| `WEBHOOK_SECRET` | DB Webhook 認証用の共有シークレット | 任意の長い文字列 |

設定が無いチャネルは自動スキップ（他チャネルに影響しない）。

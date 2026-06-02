<?php
/**
 * BESTERRA // INCIDENT COMMAND
 * 情報システム部 サービスデスク / ITインシデント管理システム
 * 準拠: ITIL 4 (2019) サービスマネジメント・プラクティス
 *       ＋ HDI (Help Desk Institute) サポートセンター実務指標
 * 設定ファイル
 */

/**
 * データ保存先（DB・ログ）。環境ごとに自動切替。
 *  - 環境変数 INC_DATA_DIR があればそれを使う（クラウド: Render等で /var/data 等を指定）
 *  - NAS（/share/.../.incident_data が存在）ならそこ
 *  - それ以外は アプリ直下 .data/（汎用PHPホスト）
 */
$INC_DATA_DIR = getenv('INC_DATA_DIR');
if (!$INC_DATA_DIR) {
    $INC_DATA_DIR = is_dir('/share/CACHEDEV1_DATA/.incident_data')
        ? '/share/CACHEDEV1_DATA/.incident_data'
        : __DIR__ . '/.data';
}
define('INC_DB_PATH', $INC_DATA_DIR . '/incidents.db');

define('INC_APP_NAME', 'BESTERRA // INCIDENT COMMAND');
define('INC_APP_TAG',  '情報システム部 サービスデスク');
define('INC_TZ', 'Asia/Tokyo');
define('INC_BASE_URL', getenv('INC_BASE_URL') ?: 'http://192.168.1.10/incident/');

// 準拠モデル（UIの「準拠モデル」パネル・ヘッダーバッジで表示）
define('INC_STANDARDS', 'ITIL 4 / HDI 準拠');
$INC_MODEL = [
    'badge' => 'ITIL 4 / HDI 準拠',
    'intro' => 'このサービスデスクは、ITサービスマネジメントの国際的フレームワーク ITIL 4 (2019) と、サポートセンター実務の世界標準 HDI に準拠して設計されています。',
    'practices' => [
        ['name' => 'インシデント管理 / Incident Management', 'std' => 'ITIL 4', 'desc' => '計画外のサービス中断・品質低下を、可能な限り迅速に通常運用へ復旧する。'],
        ['name' => 'サービス要求管理 / Service Request Management', 'std' => 'ITIL 4', 'desc' => 'アカウント発行・権限・機器など、定型で低リスクな要求を確実に履行する。'],
        ['name' => '問題管理 / Problem Management', 'std' => 'ITIL 4', 'desc' => '複数インシデントの根本原因を特定し、ワークアラウンド・既知のエラーとして管理し再発を防ぐ。'],
        ['name' => 'サービスデスク / Service Desk', 'std' => 'ITIL 4 + HDI', 'desc' => '単一窓口(SPOC)として全ての連絡を受け、記録・分類・優先度付け・エスカレーションを行う。'],
        ['name' => 'サポート指標 / Support Metrics', 'std' => 'HDI', 'desc' => 'FCR(一次解決率)・CSAT(顧客満足度)・SLA遵守率・MTTR(平均解決時間)で品質を可視化する。'],
    ],
];

/**
 * 初期ユーザー（DB初回作成時にシード）。ID = メールアドレスの@前（WindowsユーザーID）。
 * role: operator=起票/対応 / admin=operator＋管理 / auditor=閲覧+レポートのみ（経営層監査）
 */
$INC_SEED_USERS = [
    // 情報システム部 サービスデスク
    ['username' => 'h.hasebe',   'display_name' => '長谷部', 'role' => 'admin',    'password' => 'besterra'],
    ['username' => 'h.murano',   'display_name' => '村野',   'role' => 'operator', 'password' => 'besterra'],
    ['username' => 'm.takeuchi', 'display_name' => '竹内',   'role' => 'operator', 'password' => 'besterra'],
    ['username' => 'c.kato',     'display_name' => '加藤',   'role' => 'operator', 'password' => 'besterra'],
    // 経営層（監査・閲覧専用）
    ['username' => 'yhonda',     'display_name' => '本田', 'role' => 'auditor', 'password' => 'besterra'],
    ['username' => 'cho',        'display_name' => '長',   'role' => 'auditor', 'password' => 'besterra'],
    ['username' => 's.ikeda',    'display_name' => '池田', 'role' => 'auditor', 'password' => 'besterra'],
    ['username' => 'h.miyauchi', 'display_name' => '宮内', 'role' => 'auditor', 'password' => 'besterra'],
    ['username' => 'k.kido',     'display_name' => '木戸', 'role' => 'auditor', 'password' => 'besterra'],
];

// ===== レコード種別（ITIL 4 の3プラクティス） =====
$INC_TYPES = [
    'incident' => ['label' => 'インシデント', 'short' => 'INC', 'icon' => '⚠', 'desc' => '計画外のサービス中断・品質低下（迅速な復旧が目的）'],
    'request'  => ['label' => 'サービス要求', 'short' => 'REQ', 'icon' => '✉', 'desc' => 'アカウント・権限・機器など定型サービスの要求'],
    'problem'  => ['label' => '問題',         'short' => 'PRB', 'icon' => '🧩', 'desc' => '複数インシデントの根本原因（再発防止が目的）'],
];

// ===== 影響度 × 緊急度 → 優先度（ITIL 標準マトリクス P1–P5） =====
$INC_IMPACT  = ['H' => '高 / 全社・基幹', 'M' => '中 / 部門・複数名', 'L' => '低 / 個人・軽微'];
$INC_URGENCY = ['H' => '高 / 即時',       'M' => '中 / 当日中',     'L' => '低 / 計画的'];

$INC_PRIORITIES = [
    'P1' => ['label' => 'P1 緊急',  'sla_hours' => 4,   'desc' => '重大・全社/基幹停止。最優先で対応'],
    'P2' => ['label' => 'P2 高',    'sla_hours' => 8,   'desc' => '部門業務停止・重要影響'],
    'P3' => ['label' => 'P3 中',    'sla_hours' => 24,  'desc' => '一部支障・回避策あり'],
    'P4' => ['label' => 'P4 低',    'sla_hours' => 72,  'desc' => '軽微・問い合わせ'],
    'P5' => ['label' => 'P5 計画',  'sla_hours' => 168, 'desc' => '計画的に対応'],
];

/** 影響度×緊急度から優先度を算出（ITIL 標準マトリクス） */
function inc_calc_priority(string $impact, string $urgency): string {
    $w = ['H' => 3, 'M' => 2, 'L' => 1];
    $s = ($w[$impact] ?? 2) + ($w[$urgency] ?? 2);
    return [6 => 'P1', 5 => 'P2', 4 => 'P3', 3 => 'P4', 2 => 'P5'][$s] ?? 'P3';
}

// ===== ステータス（ITIL ライフサイクル） =====
$INC_STATUSES = [
    'NEW'         => '新規',
    'IN_PROGRESS' => '対応中',
    'ON_HOLD'     => '保留',
    'RESOLVED'    => '解決済',
    'CLOSED'      => '完了',
];
$INC_OPEN_STATUSES = ['NEW', 'IN_PROGRESS', 'ON_HOLD'];

// ===== 分類 =====
$INC_CATEGORIES = [
    'NETWORK'  => 'ネットワーク',
    'SERVER'   => 'サーバー / NAS',
    'MAIL'     => 'メール',
    'PC'       => 'PC / 端末',
    'ACCOUNT'  => 'アカウント / 権限',
    'SAAS'     => 'SaaS / クラウド',
    'SECURITY' => 'セキュリティ',
    'PRINTER'  => '複合機 / 印刷',
    'OTHER'    => 'その他',
];

// ===== 問い合わせ経路（HDI: コンタクトチャネル記録） =====
$INC_CHANNELS = [
    'phone'      => '電話',
    'email'      => 'メール',
    'teams'      => 'Teams / チャット',
    'walkup'     => '口頭 / 来訪',
    'self'       => '自己起票',
    'monitoring' => '監視検知',
];

/**
 * Slack Incoming Webhook URL。
 * 作成: Slack管理 → api.slack.com/apps → Incoming Webhooks ON → 通知先チャンネル選択 → 生成URLを貼付。
 * 空なら通知スキップ（アプリは正常動作）。全通知は INC_NOTIFY_LOG に追記。
 */
// Slack Webhook は環境変数優先（クラウドでは Secret として設定）
define('INC_SLACK_WEBHOOK', getenv('INC_SLACK_WEBHOOK') ?: '');
define('INC_NOTIFY_LOG', $INC_DATA_DIR . '/notify.log');

// 社員名簿/担当候補。リポジトリ同梱のJSONを優先（クラウド配置時）、無ければデータ領域
define('INC_EMP_PATH', is_file(__DIR__ . '/employees.json') ? __DIR__ . '/employees.json' : $INC_DATA_DIR . '/employees.json');
define('INC_ASSIGNEE_PATH', is_file(__DIR__ . '/assignees.json') ? __DIR__ . '/assignees.json' : $INC_DATA_DIR . '/assignees.json');

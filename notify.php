<?php
/**
 * Slack 通知（起票/編集/削除）。Incoming Webhook へ Block Kit を送る。未設定時はログ追記のみ。
 */
require_once __DIR__ . '/config.php';

function inc_notify(string $event, array $t, string $actor, string $detail = ''): void {
    global $INC_TYPES, $INC_PRIORITIES, $INC_STATUSES, $INC_CATEGORIES, $INC_CHANNELS;

    $head = ['create' => '🆕 起票', 'update' => '✏️ 更新', 'delete' => '🗑️ 削除'];
    $prioEmoji = ['P1'=>'🔴','P2'=>'🟠','P3'=>'🟡','P4'=>'🟢','P5'=>'🔵'];
    $typeLabel = $INC_TYPES[$t['type'] ?? 'incident']['label'] ?? 'チケット';
    $pri = $t['priority'] ?? 'P3';
    $title = ($head[$event] ?? '通知') . "：{$typeLabel}";

    $priLabel = $INC_PRIORITIES[$pri]['label'] ?? $pri;
    $stLabel  = $INC_STATUSES[$t['status'] ?? ''] ?? ($t['status'] ?? '');
    $catLabel = $INC_CATEGORIES[$t['category'] ?? ''] ?? ($t['category'] ?? '');
    $chLabel  = $INC_CHANNELS[$t['channel'] ?? ''] ?? '';
    $code = $t['code'] ?? ''; $url = INC_BASE_URL;

    $lines = [];
    $lines[] = "*<{$url}|{$code}>* {$t['title']}";
    $lines[] = "{$prioEmoji[$pri]} {$priLabel}  ｜  状態: {$stLabel}  ｜  分類: {$catLabel}" . ($chLabel ? "  ｜  経路: {$chLabel}" : '');
    if (!empty($t['assignee'])) $lines[] = "担当: {$t['assignee']}";
    if (!empty($t['received_at'])) $lines[] = "受付: " . (new DateTime($t['received_at'], new DateTimeZone(INC_TZ)))->format('Y/m/d H:i');
    if ($detail !== '') $lines[] = "› {$detail}";
    $lines[] = "_操作: {$actor} ・ " . (new DateTime('now', new DateTimeZone(INC_TZ)))->format('Y/m/d H:i') . "_";
    $text = implode("\n", $lines);

    @file_put_contents(INC_NOTIFY_LOG,
        (new DateTime('now', new DateTimeZone(INC_TZ)))->format('c') . " [{$event}] {$code} by {$actor} :: " . str_replace("\n", ' / ', $text) . "\n",
        FILE_APPEND);

    $hook = INC_SLACK_WEBHOOK; if (!$hook) return;
    $color = ['P1'=>'#ff3b5c','P2'=>'#ff8a2b','P3'=>'#ffd400','P4'=>'#3dffab','P5'=>'#2b8fd0'][$pri] ?? '#3ee6ff';
    $payload = ['text' => "{$title}: {$code} {$t['title']}",
        'attachments' => [[ 'color' => $color, 'blocks' => [
            ['type'=>'header','text'=>['type'=>'plain_text','text'=>$title,'emoji'=>true]],
            ['type'=>'section','text'=>['type'=>'mrkdwn','text'=>$text]],
            ['type'=>'context','elements'=>[['type'=>'mrkdwn','text'=>'BESTERRA // INCIDENT COMMAND ・ ベステラIT ・ ITIL 4 / HDI']]],
        ]]]];
    $ch = curl_init($hook);
    curl_setopt_array($ch, [CURLOPT_POST=>true, CURLOPT_HTTPHEADER=>['Content-Type: application/json'],
        CURLOPT_POSTFIELDS=>json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
        CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>5, CURLOPT_CONNECTTIMEOUT=>4]);
    $r = curl_exec($ch); $e = curl_error($ch); curl_close($ch);
    if ($e) @file_put_contents(INC_NOTIFY_LOG, "  ! slack error: {$e}\n", FILE_APPEND);
}

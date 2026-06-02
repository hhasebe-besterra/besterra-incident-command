<?php
/** レポート集計・SLA/FCR/CSAT 指標（api.php / report.php 共用） */
require_once __DIR__ . '/db.php';

/** SLA目標時刻(ISO)。priority の sla_hours を created_at に加算 */
function inc_sla_target(array $t): ?string {
    global $INC_PRIORITIES;
    $h = $INC_PRIORITIES[$t['priority'] ?? '']['sla_hours'] ?? null;
    if ($h === null || empty($t['created_at'])) return null;
    return (new DateTime($t['created_at']))->modify("+{$h} hours")->format('c');
}

/** SLA違反か（resolved基準。未解決は現在時刻基準） */
function inc_sla_breached(array $t): bool {
    $target = inc_sla_target($t);
    if (!$target) return false;
    $end = !empty($t['resolved_at']) ? $t['resolved_at'] : (new DateTime('now', new DateTimeZone(INC_TZ)))->format('c');
    return strtotime($end) > strtotime($target);
}

function inc_dur_label($sec): string {
    if ($sec === null) return '—';
    if ($sec < 3600) return round($sec / 60) . '分';
    if ($sec < 86400) return number_format($sec / 3600, 1) . '時間';
    return number_format($sec / 86400, 1) . '日';
}
function inc_fmt_dt(?string $iso): string {
    return $iso ? (new DateTime($iso))->format('Y/m/d H:i') : '—';
}

function inc_build_report(PDO $pdo, string $period, ?string $ref): array {
    global $INC_TYPES, $INC_PRIORITIES, $INC_STATUSES, $INC_CATEGORIES, $INC_CHANNELS, $INC_OPEN_STATUSES;
    $tz = new DateTimeZone(INC_TZ);
    $base = $ref ? new DateTime($ref, $tz) : new DateTime('now', $tz);
    $base->setTime(0, 0, 0);

    if ($period === 'month') {
        $start = (clone $base)->modify('first day of this month');
        $end   = (clone $start)->modify('first day of next month');
        $label = $start->format('Y年n月');
    } else {
        $dow   = (int)$base->format('N');
        $start = (clone $base)->modify('-' . ($dow - 1) . ' days');
        $end   = (clone $start)->modify('+7 days');
        $label = $start->format('Y/m/d') . ' 〜 ' . (clone $end)->modify('-1 day')->format('Y/m/d');
    }
    $sIso = $start->format('c'); $eIso = $end->format('c');

    $opened = $pdo->prepare("SELECT * FROM incidents WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?) ORDER BY priority ASC, datetime(created_at) ASC");
    $opened->execute([$sIso, $eIso]); $openedRows = $opened->fetchAll();

    $resolved = $pdo->prepare("SELECT * FROM incidents WHERE resolved_at IS NOT NULL AND datetime(resolved_at) >= datetime(?) AND datetime(resolved_at) < datetime(?) ORDER BY datetime(resolved_at) ASC");
    $resolved->execute([$sIso, $eIso]); $resolvedRows = $resolved->fetchAll();

    $in = implode(',', array_fill(0, count($INC_OPEN_STATUSES), '?'));
    $carry = $pdo->prepare("SELECT * FROM incidents WHERE datetime(created_at) < datetime(?) AND (resolved_at IS NULL OR datetime(resolved_at) >= datetime(?)) AND status IN ($in) ORDER BY priority ASC, datetime(created_at) ASC");
    $carry->execute(array_merge([$eIso, $eIso], $INC_OPEN_STATUSES)); $carryRows = $carry->fetchAll();

    // MTTR
    $durs = [];
    foreach ($resolvedRows as $r) {
        if ($r['created_at'] && $r['resolved_at']) {
            $d = strtotime($r['resolved_at']) - strtotime($r['created_at']);
            if ($d >= 0) $durs[] = $d;
        }
    }
    $mttr = $durs ? array_sum($durs) / count($durs) : null;

    // HDI metrics on resolvedRows
    $fcrCnt = 0; $slaOk = 0; $csatVals = [];
    foreach ($resolvedRows as $r) {
        if ((int)$r['fcr'] === 1) $fcrCnt++;
        if (!inc_sla_breached($r)) $slaOk++;
        if ($r['csat'] !== null && $r['csat'] !== '') $csatVals[] = (int)$r['csat'];
    }
    $resN = count($resolvedRows);
    $fcrRate = $resN ? round($fcrCnt / $resN * 100) : null;
    $slaRate = $resN ? round($slaOk / $resN * 100) : null;
    $csatAvg = $csatVals ? round(array_sum($csatVals) / count($csatVals), 1) : null;

    $byType = []; foreach ($INC_TYPES as $k => $v) $byType[$k] = 0;
    $byPrio = []; foreach ($INC_PRIORITIES as $k => $v) $byPrio[$k] = 0;
    $byCat  = []; foreach ($INC_CATEGORIES as $k => $v) $byCat[$k] = 0;
    $byChan = []; foreach ($INC_CHANNELS as $k => $v) $byChan[$k] = 0;
    foreach ($openedRows as $r) {
        $byType[$r['type']] = ($byType[$r['type']] ?? 0) + 1;
        $byPrio[$r['priority']] = ($byPrio[$r['priority']] ?? 0) + 1;
        $byCat[$r['category']] = ($byCat[$r['category']] ?? 0) + 1;
        if (!empty($r['channel'])) $byChan[$r['channel']] = ($byChan[$r['channel']] ?? 0) + 1;
    }

    return [
        'period' => $period, 'label' => $label, 'start' => $sIso, 'end' => $eIso,
        'generated_at' => inc_now(),
        'summary' => [
            'opened' => count($openedRows), 'resolved' => $resN, 'carry_open' => count($carryRows),
            'mttr_seconds' => $mttr, 'fcr_rate' => $fcrRate, 'sla_rate' => $slaRate, 'csat_avg' => $csatAvg,
        ],
        'by_type' => $byType, 'by_priority' => $byPrio, 'by_category' => $byCat, 'by_channel' => $byChan,
        'opened' => $openedRows, 'resolved' => $resolvedRows, 'carry' => $carryRows,
    ];
}

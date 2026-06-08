<?php
/**
 * JSON API — 認証 / チケットCRUD(インシデント・サービス要求・問題) / タイムライン / 統計 / レポート
 * 準拠: ITIL 4 / HDI
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/report_lib.php';
require_once __DIR__ . '/notify.php';

date_default_timezone_set(INC_TZ);
session_name('INCSOC');
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($d, int $c = 200){ http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function err(string $m, int $c = 400){ out(['ok' => false, 'error' => $m], $c); }
function body(): array {
    $raw = file_get_contents('php://input');
    if ($raw) { $j = json_decode($raw, true); if (is_array($j)) return $j; }
    return $_POST + $_GET;
}
function current_user(): ?array {
    if (empty($_SESSION['uid'])) return null;
    $st = inc_db()->prepare("SELECT id,username,display_name,role,active FROM users WHERE id = ?");
    $st->execute([$_SESSION['uid']]); $u = $st->fetch();
    return ($u && (int)$u['active'] === 1) ? $u : null;
}
function require_user(): array { $u = current_user(); if (!$u) err('UNAUTHENTICATED', 401); return $u; }
function require_writer(): array { $u = require_user(); if ($u['role'] === 'auditor') err('FORBIDDEN: 監査ロールは閲覧専用です', 403); return $u; }

$req = body();
$action = $req['action'] ?? ($_GET['action'] ?? '');
global $INC_TYPES, $INC_IMPACT, $INC_URGENCY, $INC_PRIORITIES, $INC_STATUSES, $INC_CATEGORIES, $INC_CHANNELS, $INC_OPEN_STATUSES, $INC_MODEL;

try {
    $pdo = inc_db();
    switch ($action) {

    case 'login': {
        $username = trim((string)($req['username'] ?? ''));
        $password = (string)($req['password'] ?? '');
        if ($username === '' || $password === '') err('IDとパスワードを入力してください');
        $st = $pdo->prepare("SELECT * FROM users WHERE username = ? AND active = 1");
        $st->execute([$username]); $u = $st->fetch();
        if (!$u || !password_verify($password, $u['pw_hash'])) { usleep(400000); err('ACCESS DENIED — 認証失敗', 401); }
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];
        out(['ok' => true, 'user' => ['username'=>$u['username'],'display_name'=>$u['display_name'],'role'=>$u['role']]]);
    }

    case 'logout': $_SESSION = []; session_destroy(); out(['ok' => true]);

    case 'meta': out([
        'ok' => true,
        'app' => ['name'=>INC_APP_NAME, 'tag'=>INC_APP_TAG, 'standards'=>INC_STANDARDS],
        'model' => $INC_MODEL,
        'types' => $INC_TYPES, 'impact' => $INC_IMPACT, 'urgency' => $INC_URGENCY,
        'priorities' => $INC_PRIORITIES, 'statuses' => $INC_STATUSES,
        'categories' => $INC_CATEGORIES, 'channels' => $INC_CHANNELS, 'open_statuses' => $INC_OPEN_STATUSES,
    ]);

    case 'me': { $u = current_user(); out(['ok'=>true, 'user'=>$u ? ['username'=>$u['username'],'display_name'=>$u['display_name'],'role'=>$u['role']] : null]); }

    case 'users': { require_user();
        out(['ok'=>true, 'users'=>$pdo->query("SELECT username,display_name,role FROM users WHERE active=1 ORDER BY id")->fetchAll()]); }

    case 'employees': { require_user();
        $list = is_file(INC_EMP_PATH) ? json_decode(file_get_contents(INC_EMP_PATH), true) : [];
        out(['ok'=>true, 'employees'=>is_array($list) ? $list : []]); }

    case 'assignees': { require_user();
        $list = is_file(INC_ASSIGNEE_PATH) ? json_decode(file_get_contents(INC_ASSIGNEE_PATH), true) : [];
        out(['ok'=>true, 'assignees'=>is_array($list) ? $list : []]); }

    case 'list': {
        require_user();
        $where = []; $args = [];
        if (($req['scope'] ?? '') === 'open') { $in = implode(',', array_fill(0, count($INC_OPEN_STATUSES), '?'));
            $where[] = "status IN ($in)"; $args = array_merge($args, $INC_OPEN_STATUSES); }
        foreach (['type'=>$INC_TYPES,'status'=>$INC_STATUSES,'priority'=>$INC_PRIORITIES,'category'=>$INC_CATEGORIES,'channel'=>$INC_CHANNELS] as $f => $valid) {
            if (!empty($req[$f]) && isset($valid[$req[$f]])) { $where[] = "$f = ?"; $args[] = $req[$f]; }
        }
        $q = trim((string)($req['q'] ?? ''));
        if ($q !== '') { $where[] = "(title LIKE ? OR description LIKE ? OR code LIKE ? OR affected LIKE ?)";
            $like = "%$q%"; array_push($args, $like, $like, $like, $like); }
        $sql = "SELECT * FROM incidents" . ($where ? " WHERE " . implode(' AND ', $where) : '')
             . " ORDER BY CASE WHEN status IN ('RESOLVED','CLOSED','CANCELLED') THEN 1 ELSE 0 END, priority ASC, datetime(created_at) DESC LIMIT 500";
        $st = $pdo->prepare($sql); $st->execute($args);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) { $r['sla_target'] = inc_sla_target($r); $r['sla_breached'] = inc_sla_breached($r); }
        out(['ok'=>true, 'incidents'=>$rows]);
    }

    case 'get': {
        require_user();
        $st = $pdo->prepare("SELECT * FROM incidents WHERE id = ?"); $st->execute([(int)($req['id'] ?? 0)]);
        $inc = $st->fetch(); if (!$inc) err('NOT FOUND', 404);
        $inc['sla_target'] = inc_sla_target($inc); $inc['sla_breached'] = inc_sla_breached($inc);
        $ev = $pdo->prepare("SELECT * FROM events WHERE incident_id = ? ORDER BY id ASC"); $ev->execute([$inc['id']]);
        out(['ok'=>true, 'incident'=>$inc, 'events'=>$ev->fetchAll()]);
    }

    case 'create': {
        $u = require_writer();
        $title = trim((string)($req['title'] ?? ''));
        if ($title === '') err('件名は必須です');
        if (trim((string)($req['assignee'] ?? '')) === '') err('担当は必須です');
        if (trim((string)($req['received_at'] ?? '')) === '') err('受付日時は必須です');
        $type = $req['type'] ?? 'incident'; if (!isset($INC_TYPES[$type])) $type = 'incident';
        $impact = $req['impact'] ?? 'M'; if (!isset($INC_IMPACT[$impact])) $impact = 'M';
        $urgency = $req['urgency'] ?? 'M'; if (!isset($INC_URGENCY[$urgency])) $urgency = 'M';
        $priority = inc_calc_priority($impact, $urgency);
        $cat = $req['category'] ?? 'OTHER'; if (!isset($INC_CATEGORIES[$cat])) $cat = 'OTHER';
        $status = $req['status'] ?? 'NEW'; if (!isset($INC_STATUSES[$status])) $status = 'NEW';
        $channel = $req['channel'] ?? ''; if ($channel && !isset($INC_CHANNELS[$channel])) $channel = '';
        $now = inc_now();
        $code = inc_next_code($pdo, $type);
        $resolved_at = in_array($status, ['RESOLVED','CLOSED','CANCELLED'], true) ? $now : null;
        $notify = array_key_exists('notify', $req) ? (!empty($req['notify'])?1:0) : 1;
        $st = $pdo->prepare("INSERT INTO incidents
            (code,type,title,description,category,impact,urgency,priority,status,channel,affected,reporter,assignee,
             fcr,csat,workaround,root_cause,known_error,linked,created_by,received_at,due_date,notify,created_at,updated_at,resolved_at)
            VALUES (:code,:type,:title,:desc,:cat,:imp,:urg,:pri,:status,:ch,:aff,:rep,:asg,
             :fcr,:csat,:wa,:rc,:ke,:lnk,:by,:recv,:due,:notify,:ca,:ua,:ra)");
        $st->execute([
            ':code'=>$code, ':type'=>$type, ':title'=>$title, ':desc'=>trim((string)($req['description'] ?? '')),
            ':cat'=>$cat, ':imp'=>$impact, ':urg'=>$urgency, ':pri'=>$priority, ':status'=>$status, ':ch'=>$channel,
            ':aff'=>trim((string)($req['affected'] ?? '')), ':rep'=>trim((string)($req['reporter'] ?? '')),
            ':asg'=>trim((string)($req['assignee'] ?? '')),
            ':fcr'=>!empty($req['fcr'])?1:0, ':csat'=>($req['csat'] ?? '')!=='' ? (int)$req['csat'] : null,
            ':wa'=>trim((string)($req['workaround'] ?? '')), ':rc'=>trim((string)($req['root_cause'] ?? '')),
            ':ke'=>!empty($req['known_error'])?1:0, ':lnk'=>trim((string)($req['linked'] ?? '')),
            ':by'=>$u['display_name'], ':recv'=>trim((string)($req['received_at'] ?? '')) ?: null,
            ':due'=>trim((string)($req['due_date'] ?? '')) ?: null, ':notify'=>$notify,
            ':ca'=>$now, ':ua'=>$now, ':ra'=>$resolved_at,
        ]);
        $id = (int)$pdo->lastInsertId();
        $pdo->prepare("INSERT INTO events (incident_id,author,kind,body,created_at) VALUES (?,?,?,?,?)")
            ->execute([$id, $u['display_name'], 'create', "{$INC_TYPES[$type]['label']}を起票（{$priority} / {$INC_STATUSES[$status]}）", $now]);
        $row = $pdo->prepare("SELECT * FROM incidents WHERE id = ?"); $row->execute([$id]);
        if ($notify) inc_notify('create', $row->fetch(), $u['display_name'], trim((string)($req['description'] ?? '')) ?: '');
        out(['ok'=>true, 'id'=>$id, 'code'=>$code]);
    }

    case 'update': {
        $u = require_writer();
        $id = (int)($req['id'] ?? 0);
        $st = $pdo->prepare("SELECT * FROM incidents WHERE id = ?"); $st->execute([$id]);
        $cur = $st->fetch(); if (!$cur) err('NOT FOUND', 404);
        $now = inc_now(); $set = []; $args = []; $changes = [];

        foreach (['title','description','affected','reporter','assignee','workaround','root_cause','linked'] as $f) {
            if (array_key_exists($f, $req)) { $v = trim((string)$req[$f]);
                if ($v !== (string)$cur[$f]) { $set[]="$f = ?"; $args[]=$v;
                    if ($f==='assignee') $changes[]="担当 → ".($v ?: '未割当'); } }
        }
        // impact / urgency → priority 再計算
        $imp = (isset($req['impact']) && isset($INC_IMPACT[$req['impact']])) ? $req['impact'] : $cur['impact'];
        $urg = (isset($req['urgency']) && isset($INC_URGENCY[$req['urgency']])) ? $req['urgency'] : $cur['urgency'];
        if ($imp !== $cur['impact']) { $set[]="impact = ?"; $args[]=$imp; }
        if ($urg !== $cur['urgency']) { $set[]="urgency = ?"; $args[]=$urg; }
        $newPri = inc_calc_priority($imp, $urg);
        if ($newPri !== $cur['priority']) { $set[]="priority = ?"; $args[]=$newPri; $changes[]="優先度 {$cur['priority']} → {$newPri}"; }
        // HDI フラグ
        if (array_key_exists('fcr', $req)) { $v = !empty($req['fcr'])?1:0; if ($v!==(int)$cur['fcr']){ $set[]="fcr = ?"; $args[]=$v; } }
        if (array_key_exists('known_error', $req)) { $v = !empty($req['known_error'])?1:0; if ($v!==(int)$cur['known_error']){ $set[]="known_error = ?"; $args[]=$v; } }
        if (array_key_exists('csat', $req)) { $v = ($req['csat']!=='' && $req['csat']!==null) ? (int)$req['csat'] : null;
            if ((string)$v !== (string)$cur['csat']) { $set[]="csat = ?"; $args[]=$v; } }
        if (array_key_exists('received_at', $req)) { $v = trim((string)$req['received_at']) ?: null;
            $a = $v ? strtotime($v) : null; $b = $cur['received_at'] ? strtotime((string)$cur['received_at']) : null;
            if ($a !== $b) { $set[]="received_at = ?"; $args[]=$v; $changes[]="受付日時 → ".($v ?: '—'); } }
        if (array_key_exists('due_date', $req)) { $v = trim((string)$req['due_date']) ?: null;
            if ((string)$v !== (string)$cur['due_date']) { $set[]="due_date = ?"; $args[]=$v; $changes[]="クローズ予定日 → ".($v ?: '—'); } }
        // status
        if (isset($req['status']) && isset($INC_STATUSES[$req['status']]) && $req['status'] !== $cur['status']) {
            $new = $req['status']; $set[]="status = ?"; $args[]=$new;
            $changes[]="ステータス {$INC_STATUSES[$cur['status']]} → {$INC_STATUSES[$new]}";
            if (in_array($new, ['RESOLVED','CLOSED','CANCELLED'], true) && !$cur['resolved_at']) { $set[]="resolved_at = ?"; $args[]=$now; }
            elseif (!in_array($new, ['RESOLVED','CLOSED','CANCELLED'], true) && $cur['resolved_at']) { $set[]="resolved_at = NULL"; }
        }
        if ($set) { $set[]="updated_at = ?"; $args[]=$now; $args[]=$id;
            $pdo->prepare("UPDATE incidents SET ".implode(', ',$set)." WHERE id = ?")->execute($args); }

        $note = trim((string)($req['note'] ?? ''));
        $bodyTxt = trim(implode(' / ', $changes) . ($note ? ($changes ? "\n" : '') . $note : ''));
        if ($bodyTxt !== '' || $changes) {
            $pdo->prepare("INSERT INTO events (incident_id,author,kind,body,created_at) VALUES (?,?,?,?,?)")
                ->execute([$id, $u['display_name'], $changes ? 'update' : 'note', $bodyTxt, $now]);
        }
        $row = $pdo->prepare("SELECT * FROM incidents WHERE id = ?"); $row->execute([$id]);
        if (!empty($cur['notify'])) inc_notify('update', $row->fetch(), $u['display_name'], $bodyTxt ?: '内容を更新');
        out(['ok'=>true]);
    }

    case 'comment': {
        $u = require_writer();
        $id = (int)($req['id'] ?? 0); $b = trim((string)($req['body'] ?? ''));
        if ($b === '') err('コメントが空です');
        $ex = $pdo->prepare("SELECT * FROM incidents WHERE id = ?"); $ex->execute([$id]);
        $row = $ex->fetch(); if (!$row) err('NOT FOUND', 404);
        $now = inc_now();
        $pdo->prepare("INSERT INTO events (incident_id,author,kind,body,created_at) VALUES (?,?,'note',?,?)")->execute([$id,$u['display_name'],$b,$now]);
        $pdo->prepare("UPDATE incidents SET updated_at = ? WHERE id = ?")->execute([$now,$id]);
        inc_notify('update', $row, $u['display_name'], 'コメント追加: ' . $b);
        out(['ok'=>true]);
    }

    case 'delete': {
        $u = require_writer();
        $id = (int)($req['id'] ?? 0);
        $st = $pdo->prepare("SELECT * FROM incidents WHERE id = ?"); $st->execute([$id]);
        $inc = $st->fetch(); if (!$inc) err('NOT FOUND', 404);
        $reason = trim((string)($req['reason'] ?? ''));
        $pdo->prepare("DELETE FROM events WHERE incident_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM incidents WHERE id = ?")->execute([$id]);
        inc_notify('delete', $inc, $u['display_name'], $reason ? ('理由: '.$reason) : '');
        out(['ok'=>true]);
    }

    case 'stats': {
        require_user();
        $total = (int)$pdo->query("SELECT COUNT(*) FROM incidents")->fetchColumn();
        $in = implode(',', array_fill(0, count($INC_OPEN_STATUSES), '?'));
        $os = $pdo->prepare("SELECT COUNT(*) FROM incidents WHERE status IN ($in)"); $os->execute($INC_OPEN_STATUSES);
        $open = (int)$os->fetchColumn();
        $mk = function($col, $master) use ($pdo) {
            $r = []; foreach ($master as $k=>$v) $r[$k]=0;
            foreach ($pdo->query("SELECT $col k, COUNT(*) c FROM incidents GROUP BY $col") as $row) if($row['k']!==null && $row['k']!=='') $r[$row['k']]=(int)$row['c'];
            return $r;
        };
        $byType = $mk('type', $INC_TYPES); $byPrio = $mk('priority', $INC_PRIORITIES);
        $byStatus = $mk('status', $INC_STATUSES); $byCat = $mk('category', $INC_CATEGORIES);
        $crit = $pdo->prepare("SELECT COUNT(*) FROM incidents WHERE status IN ($in) AND priority IN ('P1','P2')"); $crit->execute($INC_OPEN_STATUSES);
        // SLA超過の未解決
        $opensRows = $pdo->prepare("SELECT * FROM incidents WHERE status IN ($in)"); $opensRows->execute($INC_OPEN_STATUSES);
        $slaRisk = 0; foreach ($opensRows->fetchAll() as $r) if (inc_sla_breached($r)) $slaRisk++;
        out(['ok'=>true, 'total'=>$total, 'open'=>$open, 'critical_open'=>(int)$crit->fetchColumn(),
             'sla_risk'=>$slaRisk, 'by_type'=>$byType, 'by_priority'=>$byPrio, 'by_status'=>$byStatus, 'by_category'=>$byCat]);
    }

    case 'report': { require_user();
        $period = ($req['period'] ?? 'week') === 'month' ? 'month' : 'week';
        out(['ok'=>true, 'report'=>inc_build_report($pdo, $period, $req['date'] ?? null)]); }

    case 'changepw': {
        $u = require_user(); $old=(string)($req['old']??''); $new=(string)($req['new']??'');
        if (strlen($new) < 6) err('新パスワードは6文字以上にしてください');
        $st=$pdo->prepare("SELECT pw_hash FROM users WHERE id=?"); $st->execute([$u['id']]);
        if (!password_verify($old, $st->fetchColumn())) err('現在のパスワードが違います', 403);
        $pdo->prepare("UPDATE users SET pw_hash=? WHERE id=?")->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        out(['ok'=>true]);
    }

    default: err('UNKNOWN ACTION: ' . $action, 404);
    }
} catch (Throwable $e) {
    err('SERVER ERROR: ' . $e->getMessage(), 500);
}

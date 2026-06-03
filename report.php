<?php
/** 経営層監査向け 週次/月次レポート（印刷/PDF・ITIL 4 / HDI 指標） */
require_once __DIR__ . '/report_lib.php';
date_default_timezone_set(INC_TZ);
session_name('INCSOC'); session_start();
$uid = $_SESSION['uid'] ?? 0;
if (!$uid) { header('Location: index.php'); exit; }
$pdo = inc_db();
$st = $pdo->prepare("SELECT display_name FROM users WHERE id = ? AND active = 1"); $st->execute([$uid]);
$me = $st->fetchColumn();
if (!$me) { header('Location: index.php'); exit; }

$period = ($_GET['period'] ?? 'week') === 'month' ? 'month' : 'week';
$date = $_GET['date'] ?? null; $auto = isset($_GET['print']);
$r = inc_build_report($pdo, $period, $date);
global $INC_TYPES, $INC_PRIORITIES, $INC_STATUSES, $INC_CATEGORIES, $INC_CHANNELS;
function h($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function pcell($p){ return '<span class="pri pri-'.h($p).'">'.h($p).'</span>'; }
function tcell($t){ global $INC_TYPES; return '<span class="ty ty-'.h($t).'">'.h($INC_TYPES[$t]['short'] ?? $t).'</span>'; }
function tbl($list){ global $INC_STATUSES;
  if(!$list) return '<div class="muted">該当なし</div>';
  $rows=''; foreach($list as $i){ $rows.='<tr><td class="code">'.h($i['code']).'</td><td>'.tcell($i['type']).'</td><td>'.pcell($i['priority']).'</td><td>'.h($i['title']).'</td><td>'.h($INC_STATUSES[$i['status']] ?? $i['status']).'</td><td>'.h($i['assignee'] ?: '—').'</td></tr>'; }
  return '<table class="t"><thead><tr><th>CODE</th><th>種別</th><th>優先</th><th>件名</th><th>状態</th><th>担当</th></tr></thead><tbody>'.$rows.'</tbody></table>'; }
function kvtbl($data,$map,$labelFn=null){ $rows='';
  foreach($data as $k=>$v){ if($v<=0) continue; $lbl=$labelFn?$labelFn($map[$k]):$map[$k]; $rows.='<tr><td>'.h($lbl).'</td><td style="text-align:right;font-weight:bold">'.$v.'</td></tr>'; }
  return $rows ?: '<tr><td class="muted">なし</td></tr>'; }
$s = $r['summary'];
?>
<!DOCTYPE html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title><?=($period==='month'?'月次':'週次')?>サービスデスク・レポート — <?=h($r['label'])?></title>
<style>
  *{box-sizing:border-box}
  body{font-family:"Meiryo","メイリオ","Hiragino Kaku Gothic ProN",sans-serif;color:#16242c;margin:0;background:#e9eef2;font-size:13px;line-height:1.6}
  .sheet{max-width:940px;margin:24px auto;background:#fff;padding:38px 44px;box-shadow:0 6px 30px rgba(0,0,0,.15)}
  .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0a2535;padding-bottom:14px}
  .top h1{margin:0;font-size:22px;letter-spacing:1px;color:#0a2535}
  .top .label{margin-top:8px;font-size:14px;color:#0a6c8a;font-weight:bold}
  .brand{text-align:right;font-size:11px;color:#5d7a8a;line-height:1.7}.brand b{color:#0a2535;font-size:13px}
  .kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:9px;margin:22px 0}
  .kpi{border:1px solid #d3dde4;border-radius:8px;padding:11px 8px;text-align:center}
  .kpi .v{font-size:23px;font-weight:800;line-height:1}.kpi .k{font-size:9px;color:#5d7a8a;letter-spacing:.5px;margin-top:6px}
  .gold{color:#b8860b}.green{color:#0a8a4a}.red{color:#c8253c}.cyan{color:#0a6c8a}
  h2{font-size:13px;letter-spacing:1px;color:#0a2535;border-left:5px solid #0a6c8a;padding-left:10px;margin:22px 0 12px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:26px}
  table.t{width:100%;border-collapse:collapse;font-size:12px}
  table.t th,table.t td{text-align:left;padding:7px 10px;border-bottom:1px solid #e1e8ed}
  table.t th{background:#f3f6f8;color:#5d7a8a;font-size:10px;letter-spacing:1px}
  .code{color:#0a6c8a;font-weight:bold;white-space:nowrap;font-family:Consolas,monospace}
  .pri{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:bold;color:#fff}
  .pri-P1{background:#c8253c}.pri-P2{background:#e07b1a}.pri-P3{background:#caa400;color:#3a2b00}.pri-P4{background:#0a8a4a}.pri-P5{background:#2b8fd0}
  .ty{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10px;font-weight:bold;border:1px solid #bbb}
  .ty-incident{color:#0a6c8a;border-color:#0a6c8a}.ty-request{color:#0a8a4a;border-color:#0a8a4a}.ty-problem{color:#a3219b;border-color:#a3219b}
  .muted{color:#8aa0ac;padding:8px 0;font-size:12px}
  .foot{margin-top:30px;border-top:1px solid #d3dde4;padding-top:12px;font-size:10px;color:#8aa0ac;display:flex;justify-content:space-between}
  .bar{position:fixed;top:0;left:0;right:0;background:#0a2535;color:#cfeefb;padding:8px 16px;display:flex;gap:12px;align-items:center;font-size:12px;z-index:9}
  .bar button,.bar a{background:#0a6c8a;color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;text-decoration:none;font-size:12px}
  .bar .sp{margin-left:auto;color:#7fa6b8}
  @media print{.bar{display:none}body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;padding:0}}
</style></head><body>
<div class="bar">
  <a href="index.php">← コンソールへ戻る</a>
  <a href="?period=week&date=<?=h($date ?: date('Y-m-d'))?>">週次</a>
  <a href="?period=month&date=<?=h($date ?: date('Y-m-d'))?>">月次</a>
  <button onclick="window.print()">🖨 印刷 / PDF保存</button>
  <span class="sp">閲覧: <?=h($me)?></span>
</div>
<div class="sheet">
  <div class="top">
    <div><h1><?=($period==='month'?'月次':'週次')?>サービスデスク・レポート</h1>
      <div class="label">対象期間 : <?=h($r['label'])?></div></div>
    <div class="brand"><b>BESTERRA // INCIDENT COMMAND</b><br>ベステラIT ・ ITIL 4 / HDI 準拠<br>生成 <?=h(inc_fmt_dt($r['generated_at']))?></div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="v gold"><?=$s['opened']?></div><div class="k">起票</div></div>
    <div class="kpi"><div class="v green"><?=$s['resolved']?></div><div class="k">解決</div></div>
    <div class="kpi"><div class="v <?=$s['carry_open']?'red':'cyan'?>"><?=$s['carry_open']?></div><div class="k">期末未解決</div></div>
    <div class="kpi"><div class="v cyan"><?=h(inc_dur_label($s['mttr_seconds']))?></div><div class="k">MTTR</div></div>
    <div class="kpi"><div class="v green"><?=$s['fcr_rate']===null?'—':$s['fcr_rate'].'%'?></div><div class="k">FCR一次解決</div></div>
    <div class="kpi"><div class="v cyan"><?=$s['sla_rate']===null?'—':$s['sla_rate'].'%'?></div><div class="k">SLA遵守</div></div>
    <div class="kpi"><div class="v gold"><?=$s['csat_avg']===null?'—':$s['csat_avg']?></div><div class="k">CSAT満足度</div></div>
  </div>
  <div class="two">
    <div><h2>種別別（起票）</h2><table class="t"><tbody><?=kvtbl($r['by_type'],$INC_TYPES,fn($v)=>$v['icon'].' '.$v['label'])?></tbody></table></div>
    <div><h2>優先度別（起票）</h2><table class="t"><tbody><?php foreach($r['by_priority'] as $k=>$v){ echo '<tr><td>'.pcell($k).' '.h($INC_PRIORITIES[$k]['label']).'</td><td style="text-align:right;font-weight:bold">'.$v.'</td></tr>'; }?></tbody></table></div>
  </div>
  <div class="two">
    <div><h2>分類別（起票）</h2><table class="t"><tbody><?=kvtbl($r['by_category'],$INC_CATEGORIES)?></tbody></table></div>
    <div><h2>問い合わせ経路別（起票）</h2><table class="t"><tbody><?=kvtbl($r['by_channel'],$INC_CHANNELS)?></tbody></table></div>
  </div>
  <h2>期間内に起票（<?=count($r['opened'])?>）</h2><?=tbl($r['opened'])?>
  <h2>期間内に解決（<?=count($r['resolved'])?>）</h2><?=tbl($r['resolved'])?>
  <h2>期末時点で未解決・継続対応（<?=count($r['carry'])?>）</h2><?=tbl($r['carry'])?>
  <div class="foot"><span>BESTERRA IT — サービスデスク（ITIL 4 / HDI 準拠）</span><span>本レポートは <?=h($me)?> により出力 / 監査用</span></div>
</div>
<?php if($auto): ?><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script><?php endif; ?>
</body></html>

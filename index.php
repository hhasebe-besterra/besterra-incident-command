<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>BESTERRA // INCIDENT COMMAND</title>
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg?v=1">
<link rel="apple-touch-icon" href="assets/icon.svg?v=1">
<meta name="theme-color" content="#ff5a1f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app.css?v=21">
</head>
<body class="booting">

<!-- ===== 背景レイヤー ===== -->
<canvas id="matrix"></canvas>
<div class="bg-grid"></div>
<div class="scanlines"></div>
<div class="vignette"></div>

<!-- ===== ログイン ===== -->
<section id="login" class="login-screen">
  <div class="login-box">
    <div class="login-brand">
      <img class="brand-logo" src="assets/icon.svg?v=1" alt="INCIDENT COMMAND" width="56" height="56">
      <div>
        <div class="brand-title" data-text="BESTERRA // INCIDENT COMMAND">BESTERRA // INCIDENT COMMAND</div>
        <div class="brand-sub">ベステラIT — SECURE INCIDENT OPERATIONS CONSOLE</div>
      </div>
    </div>
    <pre id="boot-log" class="boot-log"></pre>
    <form id="login-form" autocomplete="off">
      <label class="fld">
        <span class="fld-k">OPERATOR&nbsp;ID</span>
        <span class="fld-line"><span class="prompt">&gt;</span>
          <input id="li-user" name="username" type="text" spellcheck="false" autocapitalize="off" autocomplete="username" required></span>
      </label>
      <label class="fld">
        <span class="fld-k">PASSPHRASE</span>
        <span class="fld-line"><span class="prompt">&gt;</span>
          <input id="li-pass" name="password" type="password" autocomplete="current-password" required></span>
      </label>
      <button id="li-btn" class="btn-jack" type="submit">▶ AUTHENTICATE</button>
      <div id="li-msg" class="login-msg"></div>
    </form>
    <div class="login-foot">192.168.1.10 · INTERNAL NETWORK ONLY · ALL ACCESS LOGGED</div>
  </div>
</section>

<!-- ===== メインアプリ ===== -->
<main id="app" hidden>
  <header class="topbar">
    <div class="tb-left">
      <img class="brand-logo sm" src="assets/favicon.svg?v=1" alt="" width="30" height="30">
      <span class="tb-brand">INCIDENT&nbsp;COMMAND</span>
      <button class="std-badge" id="btn-model" title="準拠モデルを表示">ITIL 4 / HDI 準拠</button>
      <span class="tb-tag" id="tb-tag"></span>
    </div>
    <nav class="tb-nav">
      <button class="nav-tab active" data-view="dashboard">▚ DASHBOARD</button>
      <button class="nav-tab" data-view="incidents">▤ INCIDENTS</button>
      <button class="nav-tab" data-view="report">▦ REPORT</button>
    </nav>
    <div class="tb-right">
      <span class="clock" id="clock">--:--:--</span>
      <span class="who" id="who"></span>
      <button class="ico-btn" id="btn-theme" title="明るい/暗い表示を切替">☀</button>
      <button class="ico-btn" id="btn-help" title="チュートリアルをもう一度">❓</button>
      <button class="ico-btn" id="btn-pw" title="パスワード変更">⚙</button>
      <button class="ico-btn danger" id="btn-logout" title="ログアウト">⏻</button>
    </div>
  </header>

  <!-- ステータスストリップ -->
  <section class="statstrip" id="statstrip"></section>

  <!-- ビュー: ダッシュボード -->
  <section class="view" id="view-dashboard">
    <div class="grid-cards" id="dash-cards"></div>
    <div class="panel">
      <div class="panel-h"><span class="blink">●</span> 対応が必要なチケット — SLA超過・優先度順</div>
      <div id="dash-open" class="inc-table-wrap"></div>
    </div>
  </section>

  <!-- ビュー: インシデント一覧 -->
  <section class="view" id="view-incidents" hidden>
    <div class="toolbar">
      <button class="btn-jack" id="btn-new">＋ 新規起票</button>
      <input type="search" id="f-q" class="inp" placeholder="検索 / SEARCH (件名・本文・コード)">
      <select id="f-scope" class="inp">
        <option value="" selected>全件</option>
        <option value="open">未解決のみ</option>
      </select>
      <select id="f-type" class="inp"><option value="">種別: 全て</option></select>
      <select id="f-priority" class="inp"><option value="">優先度: 全て</option></select>
      <select id="f-status" class="inp"><option value="">状態: 全て</option></select>
      <select id="f-cat" class="inp"><option value="">分類: 全て</option></select>
      <select id="f-channel" class="inp"><option value="">経路: 全て</option></select>
    </div>
    <div class="panel">
      <div class="panel-h" id="inc-sorthint"></div>
      <div id="inc-list" class="inc-table-wrap"></div>
    </div>
  </section>

  <!-- ビュー: レポート -->
  <section class="view" id="view-report" hidden>
    <div class="toolbar">
      <select id="rep-period" class="inp">
        <option value="week">週次レポート</option>
        <option value="month">月次レポート</option>
      </select>
      <input type="date" id="rep-date" class="inp">
      <button class="btn-jack" id="btn-rep-run">▶ 生成</button>
      <button class="btn-ghost" id="btn-rep-print">🖨 印刷 / PDF</button>
      <span class="rep-hint">監査用：経営層はこの画面と印刷出力を確認</span>
    </div>
    <div id="rep-out" class="report-out"></div>
  </section>
</main>

<!-- ===== モーダル ===== -->
<div class="modal-back" id="modal-back" hidden></div>

<!-- 新規/詳細 用 ドロワー -->
<aside class="drawer" id="drawer" hidden></aside>

<!-- 汎用ダイアログ -->
<div class="dialog" id="dialog" hidden></div>

<!-- トースト -->
<div class="toasts" id="toasts"></div>

<script src="app.js?v=20"></script>
</body>
</html>

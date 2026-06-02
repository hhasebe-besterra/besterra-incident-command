<?php
/**
 * DB接続・スキーマ初期化・ユーザーシード（ITIL 4 / HDI 準拠スキーマ）
 */
require_once __DIR__ . '/config.php';

function inc_db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dir = dirname(INC_DB_PATH);
    if (!is_dir($dir)) @mkdir($dir, 0777, true);
    $fresh = !file_exists(INC_DB_PATH);

    $pdo = new PDO('sqlite:' . INC_DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode = WAL;');
    $pdo->exec('PRAGMA foreign_keys = ON;');

    inc_init_schema($pdo);
    if ($fresh) inc_seed_users($pdo);
    return $pdo;
}

function inc_init_schema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        pw_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )");

    // tickets（インシデント / サービス要求 / 問題 を type で区別）
    $pdo->exec("CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'incident',
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        impact TEXT NOT NULL DEFAULT 'M',
        urgency TEXT NOT NULL DEFAULT 'M',
        priority TEXT NOT NULL DEFAULT 'P3',
        status TEXT NOT NULL DEFAULT 'NEW',
        channel TEXT,
        affected TEXT,
        reporter TEXT,
        assignee TEXT,
        fcr INTEGER NOT NULL DEFAULT 0,
        csat INTEGER,
        workaround TEXT,
        root_cause TEXT,
        known_error INTEGER NOT NULL DEFAULT 0,
        linked TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        kind TEXT NOT NULL,
        body TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_inc_status  ON incidents(status)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_inc_type    ON incidents(type)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_inc_created ON incidents(created_at)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_evt_inc     ON events(incident_id)");
}

function inc_seed_users(PDO $pdo): void {
    global $INC_SEED_USERS;
    $now = inc_now();
    $st = $pdo->prepare("INSERT OR IGNORE INTO users (username, display_name, role, pw_hash, active, created_at)
                         VALUES (:u,:d,:r,:h,1,:c)");
    foreach ($INC_SEED_USERS as $u) {
        $st->execute([':u'=>$u['username'], ':d'=>$u['display_name'], ':r'=>$u['role'],
                      ':h'=>password_hash($u['password'], PASSWORD_DEFAULT), ':c'=>$now]);
    }
}

/** 種別別コード INC-/REQ-/PRB- + 年 + 連番 を採番 */
function inc_next_code(PDO $pdo, string $type): string {
    global $INC_TYPES;
    $short = $INC_TYPES[$type]['short'] ?? 'INC';
    $year = (new DateTime('now', new DateTimeZone(INC_TZ)))->format('Y');
    $prefix = "{$short}-{$year}-";
    $st = $pdo->prepare("SELECT code FROM incidents WHERE code LIKE :p ORDER BY id DESC LIMIT 1");
    $st->execute([':p' => $prefix . '%']);
    $last = $st->fetchColumn();
    $seq = ($last && preg_match('/(\d+)$/', $last, $m)) ? intval($m[1]) + 1 : 1;
    return $prefix . str_pad((string)$seq, 4, '0', STR_PAD_LEFT);
}

function inc_now(): string {
    return (new DateTime('now', new DateTimeZone(INC_TZ)))->format('c');
}

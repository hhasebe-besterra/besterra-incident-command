// INCIDENT COMMAND — 起票/クローズ/中止 通知 Edge Function
// Supabase Database Webhook（incidents の INSERT / UPDATE）から呼ばれ、
// メール（WebArena SMTP）・Teams 1:1（admin@ ROPC）・Slack（#it_working＋個別DM）へ配信する。
//
// 通知トリガ:
//   - INSERT … 起票（起票と同時にCLOSED/中止でもここで通知）
//   - UPDATE … status が CLOSED / CANCELLED に変化したとき
//
// 認証情報はすべて環境変数（Secrets）から読み込む。コードには一切書かない。
// 設定が無いチャネルは自動スキップ（他チャネルには影響しない）。

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const APP_URL = Deno.env.get("INC_APP_URL") || "https://hhasebe-besterra.github.io/besterra-incident-command/";

// 当面は Slack のみ配信する（メールは文字化け、Teams も一時停止）。再開は false に戻すだけ。
const SLACK_ONLY = (Deno.env.get("NOTIFY_SLACK_ONLY") ?? "1") !== "0";

// ---- ラベル（アプリ側 META と一致させる） ----
const TYPE: Record<string,string> = { incident:"問合せ（インシデント）", request:"リクエスト", problem:"計画・idea", other:"その他" };
const STATUS: Record<string,string> = { NEW:"新規", IN_PROGRESS:"対応中", ON_HOLD:"保留", RESOLVED:"解決済", CLOSED:"完了", CANCELLED:"中止" };
const PRI: Record<string,string> = { P1:"P1 緊急", P2:"P2 高", P3:"P3 中", P4:"P4 低", P5:"P5 計画" };
const CLOSED = ["CLOSED","CANCELLED"];

// ---- 通知先メール（既定。NOTIFY_EMAIL_TO があれば上書き） ----
const DEFAULT_TO = ["h.murano@besterra.co.jp","m.takeuchi@besterra.co.jp","h.hasebe@besterra.co.jp","c.kato@besterra.co.jp"];
const emailTo = (Deno.env.get("NOTIFY_EMAIL_TO") || DEFAULT_TO.join(",")).split(",").map(s=>s.trim()).filter(Boolean);

function decideEvent(body: any): {send:boolean; kind:string} {
  const t = body?.type, rec = body?.record || {}, old = body?.old_record || {};
  // 起票時に「通知する」のチェックを外した場合は一切通知しない
  if (rec.notify === false) return { send:false, kind:"" };
  if (t === "INSERT") {
    if (CLOSED.includes(rec.status)) return { send:true, kind: rec.status==="CANCELLED" ? "起票即中止" : "起票即クローズ" };
    return { send:true, kind:"新規起票" };
  }
  if (t === "UPDATE") {
    if (CLOSED.includes(rec.status) && rec.status !== old.status)
      return { send:true, kind: rec.status==="CANCELLED" ? "中止" : "クローズ" };
  }
  return { send:false, kind:"" };
}

function fmtDt(s:any): string {
  if (!s) return "-";
  try { return new Date(s).toLocaleString("ja-JP", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }); }
  catch { return String(s); }
}
function buildText(kind:string, r:any): {subject:string; text:string; html:string} {
  const code = r.code || "(採番待ち)";
  const subject = `【ITサービスデスク/${kind}】${code} ${r.title || ""}`.trim();
  const rows: [string,string][] = [
    ["イベント", kind],
    ["コード", code],
    ["種別", TYPE[r.type] || r.type || "-"],
    ["件名", r.title || "-"],
    ["優先度", PRI[r.priority] || r.priority || "-"],
    ["状態", STATUS[r.status] || r.status || "-"],
    ["分類", r.category || "-"],
    ["受付日時", fmtDt(r.received_at)],
    ["申告/要求者", r.reporter || "-"],
    ["担当", r.assignee || "未割当"],
    ["影響範囲", r.affected || "-"],
    ["起票者", r.created_by || "-"],
  ];
  const text = rows.map(([k,v])=>`${k}: ${v}`).join("\n")
    + `\n詳細: ${r.description || "-"}\n\n▶ 確認: ${APP_URL}`;
  const esc = (s:string)=>String(s??"").replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]!));
  const html = `<div style="font-family:Meiryo,sans-serif;font-size:14px;line-height:1.7">
    <p style="font-weight:bold;font-size:15px">ITサービスデスク 通知 — ${esc(kind)}</p>
    <table style="border-collapse:collapse">${rows.map(([k,v])=>`<tr><td style="color:#555;padding:2px 12px 2px 0;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join("")}</table>
    <p style="margin-top:8px">詳細: ${esc(r.description||"-")}</p>
    <p><a href="${APP_URL}">▶ INCIDENT COMMAND で確認する</a></p></div>`;
  return { subject, text, html };
}

// ---------- メール（WebArena SMTP） ----------
async function sendEmail(msg:{subject:string;text:string;html:string}): Promise<string> {
  const user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
  if (!user || !pass) return "skip(no SMTP creds)";
  const host = Deno.env.get("SMTP_HOST") || "v1700-227.mailsecure.jp";
  const port = Number(Deno.env.get("SMTP_PORT") || "465");
  const from = Deno.env.get("SMTP_FROM") || user;
  const client = new SMTPClient({ connection:{ hostname:host, port, tls: port===465, auth:{ username:user, password:pass } } });
  try {
    await client.send({ from, to: emailTo, subject: msg.subject, content: msg.text, html: msg.html });
    await client.close();
    return `ok(${emailTo.length})`;
  } catch(e){ try{ await client.close(); }catch(_){} return "err:"+ (e?.message||e); }
}

// ---------- Teams 1:1（admin@ ROPC + Graph） ----------
async function graphToken(): Promise<string|null> {
  const user = Deno.env.get("TEAMS_ROPC_USER"), pass = Deno.env.get("TEAMS_ROPC_PASS");
  if (!user || !pass) return null;
  const tenant = Deno.env.get("TEAMS_TENANT") || "besterra.onmicrosoft.com";
  const clientId = Deno.env.get("TEAMS_CLIENT_ID") || "14d82eec-204b-4c2f-b7e8-296a70dab67e"; // MS Graph PowerShell (public client)
  const f = new URLSearchParams({ grant_type:"password", client_id:clientId, username:user, password:pass, scope:"https://graph.microsoft.com/.default" });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:f });
  const j = await r.json();
  return j.access_token || null;
}
async function userId(token:string, email:string): Promise<string|null> {
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}?$select=id`, { headers:{ authorization:`Bearer ${token}` } });
  if(!r.ok) return null; const j = await r.json(); return j.id || null;
}
async function sendTeams(html:string): Promise<string> {
  const token = await graphToken();
  if (!token) return "skip(no ROPC creds)";
  const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=id", { headers:{ authorization:`Bearer ${token}` } });
  if(!me.ok) return "err:me "+me.status;
  const myId = (await me.json()).id;
  const targets = (Deno.env.get("TEAMS_DM_EMAILS") || emailTo.join(",")).split(",").map(s=>s.trim()).filter(Boolean);
  let ok=0, fail=0;
  for (const email of targets) {
    try {
      const rid = await userId(token, email); if(!rid){ fail++; continue; }
      const chatRes = await fetch("https://graph.microsoft.com/v1.0/chats", { method:"POST", headers:{ authorization:`Bearer ${token}`, "content-type":"application/json" },
        body: JSON.stringify({ chatType:"oneOnOne", members:[
          { "@odata.type":"#microsoft.graph.aadUserConversationMember", roles:["owner"], "user@odata.bind":`https://graph.microsoft.com/v1.0/users('${myId}')` },
          { "@odata.type":"#microsoft.graph.aadUserConversationMember", roles:["owner"], "user@odata.bind":`https://graph.microsoft.com/v1.0/users('${rid}')` } ] }) });
      if(!chatRes.ok){ fail++; continue; }
      const chatId = (await chatRes.json()).id;
      const m = await fetch(`https://graph.microsoft.com/v1.0/chats/${chatId}/messages`, { method:"POST", headers:{ authorization:`Bearer ${token}`, "content-type":"application/json" },
        body: JSON.stringify({ body:{ contentType:"html", content: html } }) });
      m.ok ? ok++ : fail++;
    } catch(_){ fail++; }
  }
  return `ok=${ok} fail=${fail}`;
}

// ---------- Slack（#it_working チャンネル ＋ 個別DM） ----------
async function slackPost(token:string, channel:string, text:string): Promise<boolean> {
  const r = await fetch("https://slack.com/api/chat.postMessage", { method:"POST", headers:{ authorization:`Bearer ${token}`, "content-type":"application/json; charset=utf-8" }, body: JSON.stringify({ channel, text }) });
  const j = await r.json(); return !!j.ok;
}
async function sendSlack(text:string): Promise<string> {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  const webhook = Deno.env.get("SLACK_WEBHOOK"); // #it_working 用 Incoming Webhook（任意）
  let res:string[] = [];
  if (webhook) { try{ const r=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text})}); res.push("wh:"+(r.ok?"ok":"err")); }catch(_){ res.push("wh:err"); } }
  if (token) {
    const ch = Deno.env.get("SLACK_CHANNEL"); // #it_working のチャンネルID
    if (ch && !webhook) res.push("ch:"+(await slackPost(token,ch,text)?"ok":"err"));
    const dm = (Deno.env.get("SLACK_DM_USER_IDS")||"").split(",").map(s=>s.trim()).filter(Boolean);
    let ok=0; for(const u of dm){ if(await slackPost(token,u,text)) ok++; }
    if (dm.length) res.push(`dm:${ok}/${dm.length}`);
  }
  return res.length ? res.join(" ") : "skip(no slack cfg)";
}

// ---------- エントリポイント ----------
Deno.serve(async (req) => {
  // 簡易認証（Webhook に x-webhook-secret を設定して照合）
  const want = Deno.env.get("WEBHOOK_SECRET");
  if (want && req.headers.get("x-webhook-secret") !== want) return new Response("unauthorized", { status:401 });

  let body:any = {};
  try { body = await req.json(); } catch(_){}
  const ev = decideEvent(body);
  if (!ev.send) return new Response(JSON.stringify({ skipped:true }), { headers:{ "content-type":"application/json" } });

  const r = body.record || {};
  const msg = buildText(ev.kind, r);
  // 2026-06-09 当面は Slack のみ配信。メールは文字化け（denomailer/MIME）のため停止、Teams も一時停止。
  // 再開時は SLACK_ONLY を false（Secret NOTIFY_SLACK_ONLY=0）にすればメール/Teamsも復活する。
  let email = "disabled(slack-only)", teams = "disabled(slack-only)", slack:string;
  if (SLACK_ONLY) {
    slack = await sendSlack(msg.text);
  } else {
    [email, teams, slack] = await Promise.all([ sendEmail(msg), sendTeams(msg.html), sendSlack(msg.text) ]);
  }
  console.log(JSON.stringify({ code:r.code, kind:ev.kind, email, teams, slack }));
  return new Response(JSON.stringify({ ok:true, kind:ev.kind, email, teams, slack }), { headers:{ "content-type":"application/json" } });
});

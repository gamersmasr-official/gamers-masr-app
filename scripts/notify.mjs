// Gamers Masr notification sender. Runs in GitHub Actions (cron */10).
// Reads new posts/mods from Firestore REST and sends FCM v1 to opted-in tokens.
// Auth: GCP access token from Workload Identity Federation (env GCP_ACCESS_TOKEN).
// No secrets stored; state tracked in data/notify-state.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PROJECT = 'gamers-masr-app';
const TOKEN = process.env.GCP_ACCESS_TOKEN;
if (!TOKEN) { console.error('missing GCP_ACCESS_TOKEN'); process.exit(1); }
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const FCM = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;
const SITE = 'https://gamersmasr-official.github.io/gamers-masr-app/';

const H = { Authorization: `Bearer ${TOKEN}` };

function tsToMs(v) { return v ? Date.parse(v) : 0; }
function fieldTs(doc, name) {
  const f = doc.fields && doc.fields[name];
  return f && f.timestampValue ? Date.parse(f.timestampValue) : 0;
}
function fieldStr(doc, name) {
  const f = doc.fields && doc.fields[name];
  return f && f.stringValue ? f.stringValue : '';
}

async function listDocs(coll) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${FS}/${coll}?pageSize=300${pageToken ? '&pageToken=' + pageToken : ''}`;
    const r = await fetch(url, { headers: H });
    if (!r.ok) throw new Error(`list ${coll}: ${r.status} ${await r.text()}`);
    const j = await r.json();
    out.push(...(j.documents || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function sendFcm(token, title, body) {
  const msg = { message: { token, notification: { title, body }, webpush: { fcmOptions: { link: SITE }, notification: { title, body, icon: SITE + 'icon-192.png' } } } };
  const r = await fetch(FCM, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
  if (!r.ok) { const t = await r.text(); return `ERR ${r.status} ${t.slice(0, 160)}`; }
  return 'OK';
}

const statePath = 'data/notify-state.json';
let state = null;
if (existsSync(statePath)) { try { state = JSON.parse(readFileSync(statePath, 'utf8')); } catch {} }

const [tokens, posts, mods] = await Promise.all([
  listDocs('pushTokens'),
  listDocs('posts'),
  listDocs('mods'),
]);

const lastPosts = state ? state.posts : null;
const lastMods = state ? state.mods : null;

const newPosts = posts.map(d => ({ d, ts: fieldTs(d, 'createdAt') })).filter(x => x.ts > 0).sort((a, b) => a.ts - b.ts);
const newMods = mods.map(d => ({ d, ts: fieldTs(d, 'createdAt') })).filter(x => x.ts > 0).sort((a, b) => a.ts - b.ts);

const maxPosts = newPosts.length ? newPosts[newPosts.length - 1].ts : (lastPosts || 0);
const maxMods = newMods.length ? newMods[newMods.length - 1].ts : (lastMods || 0);

if (!state) {
  // First run: initialize state without sending anything.
  mkdirSync('data', { recursive: true });
  writeFileSync(statePath, JSON.stringify({ posts: maxPosts, mods: maxMods }));
  execSync('git config user.email "actions@github.com" && git config user.name "github-actions"');
  execSync(`git add ${statePath} && git commit -m "notify state init" && git push`);
  console.log('initialized state, no sends');
  process.exit(0);
}

const toSend = [];
for (const x of newPosts) if (x.ts > lastPosts) toSend.push({ title: 'خبر جديد', body: fieldStr(x.d, 'title') || 'مقال جديد في المجلة' });
for (const x of newMods) if (x.ts > lastMods) toSend.push({ title: 'مود جديد', body: fieldStr(x.d, 'title') || 'مود جديد في المجلة' });

const valid = tokens
  .map(d => ({ token: fieldStr(d, 'token'), enabled: !d.fields || !d.fields.enabled || d.fields.enabled.booleanValue !== false }))
  .filter(t => t.token && t.enabled);

console.log(`new items: ${toSend.length}, tokens: ${valid.length}`);
let sent = 0;
for (const item of toSend.slice(0, 5)) {
  for (const t of valid) {
    const res = await sendFcm(t.token, item.title, item.body.slice(0, 100));
    if (res === 'OK') sent++;
    else console.log('send failed:', res);
  }
}
console.log('sent', sent);

state.posts = maxPosts; state.mods = maxMods;
writeFileSync(statePath, JSON.stringify(state));
const dirty = execSync('git status --porcelain data/notify-state.json').toString().trim();
if (dirty) {
  execSync('git config user.email "actions@github.com" && git config user.name "github-actions"');
  execSync(`git add ${statePath} && git commit -m "notify state update" && git push`);
  console.log('state committed');
} else console.log('state unchanged');

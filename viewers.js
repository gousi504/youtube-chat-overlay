// Viewer ledger: remembers everyone who has commented, keyed by their YouTube channel ID
// (the ID stays the same even when the person changes their display name).
// Everything is kept in viewers.json on this PC only. Nothing here is sent anywhere.
const fs = require("fs");
const path = require("path");

const MAX_NAME = 100, MAX_ALIAS = 40, MAX_MEMO = 300, MAX_OLD_NAMES = 10, MAX_ID = 64, MAX_STREAMS = 5000;

const clean = (s, max) => (typeof s === "string" ? s : "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const cleanMemo = (s) => (typeof s === "string" ? s : "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").slice(0, MAX_MEMO);
const num = (n, d) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : d);
const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= MAX_ID && /^[A-Za-z0-9_\-\u0080-￿]+$/.test(id);
const cleanUrl = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]{1,500}$/.test(u) ? u : "");
const isTestId = (id) => id.startsWith("test-");

function createLedger(dir) {
  const FILE = path.join(dir, "viewers.json");
  const BACKUP = path.join(dir, "viewers.backup.json");
  let viewers = new Map();
  let streams = new Map();
  let dirty = false;
  let timer = null;

  // Turns anything (file contents / imported file) into clean maps. Unknown or broken fields are dropped.
  function parse(raw) {
    const vs = new Map(), ss = new Map();
    if (!raw || typeof raw !== "object" || !raw.viewers || typeof raw.viewers !== "object") throw new Error("not a viewer ledger");
    for (const [id, v] of Object.entries(raw.viewers)) {
      if (!validId(id) || !v || typeof v !== "object") continue;
      const lastSeen = num(v.lastSeen, Date.now());
      vs.set(id, {
        name: clean(v.name, MAX_NAME),
        icon: cleanUrl(v.icon),
        names: (Array.isArray(v.names) ? v.names : [])
          .filter((n) => n && typeof n === "object" && clean(n.name, MAX_NAME))
          .slice(0, MAX_OLD_NAMES)
          .map((n) => ({ name: clean(n.name, MAX_NAME), until: num(n.until, 0) })),
        alias: clean(v.alias, MAX_ALIAS),
        memo: cleanMemo(v.memo),
        firstSeen: num(v.firstSeen, lastSeen),
        lastSeen,
        prevSeen: num(v.prevSeen, 0),
        visits: Math.max(1, Math.floor(num(v.visits, 1))),
        lastLiveId: clean(v.lastLiveId, MAX_ID),
        comments: Math.floor(num(v.comments, 0)),
      });
    }
    if (raw.streams && typeof raw.streams === "object") {
      for (const [id, s] of Object.entries(raw.streams)) {
        if (!validId(id) || !s || typeof s !== "object") continue;
        ss.set(id, { first: num(s.first, 0), last: num(s.last, 0) });
      }
    }
    return { vs, ss };
  }

  function serialize() {
    return JSON.stringify({ version: 1, streams: Object.fromEntries(streams), viewers: Object.fromEntries(viewers) });
  }

  function load() {
    let text;
    try { text = fs.readFileSync(FILE, "utf8"); } catch { return; } // no file yet: start empty
    try {
      const r = parse(JSON.parse(text));
      viewers = r.vs; streams = r.ss;
      try { fs.copyFileSync(FILE, BACKUP); } catch {}
    } catch (e) {
      // never overwrite a file we could not read: keep it aside and start empty
      const aside = path.join(dir, "viewers.broken-" + Date.now() + ".json");
      try { fs.renameSync(FILE, aside); } catch {}
      console.error("[viewers] viewers.json を読めなかったため退避した:", aside);
    }
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return;
    try {
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, serialize(), "utf8");
      fs.renameSync(tmp, FILE);
      dirty = false;
    } catch (e) {
      console.error("[viewers] 保存に失敗:", e.message);
    }
  }
  function touch() {
    dirty = true;
    if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 3000);
  }

  // What the management page sees for one person.
  function view(id) {
    const v = viewers.get(id);
    if (!v) return null;
    return {
      id, name: v.name, icon: v.icon, names: v.names, alias: v.alias, memo: v.memo,
      firstSeen: v.firstSeen, lastSeen: v.lastSeen, prevSeen: v.prevSeen,
      visits: v.visits, comments: v.comments, lastLiveId: v.lastLiveId, test: isTestId(id),
    };
  }

  // Called for every comment. Returns whether this is the person's first comment ever.
  function record(id, name, icon, liveId, now) {
    if (!validId(id)) return { first: false, viewer: null };
    name = clean(name, MAX_NAME);
    icon = cleanUrl(icon);
    liveId = clean(liveId, MAX_ID) || "unknown";
    let v = viewers.get(id);
    const first = !v;
    if (!v) {
      v = { name, icon, names: [], alias: "", memo: "", firstSeen: now, lastSeen: now, prevSeen: 0, visits: 1, lastLiveId: liveId, comments: 0 };
      viewers.set(id, v);
    } else {
      if (liveId !== v.lastLiveId) { v.visits++; v.prevSeen = v.lastSeen; v.lastLiveId = liveId; }
      if (name && name !== v.name) {
        const old = v.name;
        v.names = v.names.filter((n) => n.name !== name && n.name !== old);
        if (old) v.names.unshift({ name: old, until: now });
        v.names.length = Math.min(v.names.length, MAX_OLD_NAMES);
        v.name = name;
      }
      if (icon) v.icon = icon;
      v.lastSeen = now;
    }
    v.comments++;
    if (!isTestId(id)) {
      const s = streams.get(liveId);
      if (s) s.last = now;
      else if (streams.size < MAX_STREAMS) streams.set(liveId, { first: now, last: now });
    }
    touch();
    return { first, viewer: view(id) };
  }

  function update(id, patch) {
    const v = viewers.get(id);
    if (!v) return null;
    if ("alias" in patch) v.alias = clean(patch.alias, MAX_ALIAS);
    if ("memo" in patch) v.memo = cleanMemo(patch.memo);
    touch();
    return view(id);
  }
  function remove(id) { const ok = viewers.delete(id); if (ok) touch(); return ok; }
  function removeTests() {
    let n = 0;
    for (const id of Array.from(viewers.keys())) if (isTestId(id)) { viewers.delete(id); n++; }
    if (n) touch();
    return n;
  }
  function list() { return Array.from(viewers.keys()).map(view); }
  function stats() {
    let people = 0;
    for (const id of viewers.keys()) if (!isTestId(id)) people++;
    return { viewers: people, streams: streams.size };
  }
  function exportAll() { return JSON.parse(serialize()); }
  function importAll(raw) {
    const r = parse(raw); // throws when the file is not a ledger
    flush();
    try { if (fs.existsSync(FILE)) fs.copyFileSync(FILE, BACKUP); } catch {}
    viewers = r.vs; streams = r.ss;
    dirty = true; flush();
    return stats();
  }

  load();
  return { record, view, update, remove, removeTests, list, stats, exportAll, importAll, flush };
}

module.exports = { createLedger };

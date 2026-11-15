// YouTube Chat Overlay - local server
// Fetches YouTube live chat and pushes it to the OBS overlay page via WebSocket.
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { WebSocketServer } = require("ws");
const { LiveChat } = require("youtube-chat");

const PORT = Number(process.env.PORT) || 3456;
const CONFIG_PATH = path.join(__dirname, "config.json");

const app = express();

// ---------- local-only guard ----------
// Only this PC's own pages (settings page / OBS browser source) may talk to the server.
// Blocks other devices on the network and other websites open in the browser.
const ALLOWED_HOSTS = new Set(["localhost:" + PORT, "127.0.0.1:" + PORT, "[::1]:" + PORT]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => "http://" + h));
function isLocalRequest(req) {
  const origin = req.headers.origin;
  const ip = (req.socket && req.socket.remoteAddress) || "";
  const loopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  return loopback && ALLOWED_HOSTS.has(req.headers.host) && (!origin || ALLOWED_ORIGINS.has(origin));
}
app.use((req, res, next) => (isLocalRequest(req) ? next() : res.status(403).send("forbidden")));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, verifyClient: (info) => isLocalRequest(info.req) });

// ---------- config ----------
let config = loadConfig();

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

// ---------- broadcast ----------
function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// ---------- youtube chat ----------
let liveChat = null;
let status = { connected: false, liveId: null, error: null, source: null };

function setStatus(patch) {
  status = { ...status, ...patch };
  broadcast({ type: "status", status });
}

function parseYoutubeInput(input) {
  const s = (input || "").trim();
  if (!s) return null;
  // https://www.youtube.com/watch?v=XXXX
  let m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return { liveId: m[1] };
  // https://youtu.be/XXXX  or  https://www.youtube.com/live/XXXX
  m = s.match(/(?:youtu\.be\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return { liveId: m[1] };
  // https://www.youtube.com/channel/UCxxxx
  m = s.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (m) return { channelId: m[1] };
  // https://www.youtube.com/@handle
  m = s.match(/@([A-Za-z0-9_.-]+)/);
  if (m) return { handle: "@" + m[1] };
  // raw ids
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return { channelId: s };
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return { liveId: s };
  return null;
}

function toPlainChat(item) {
  return {
    type: "chat",
    id: item.id,
    author: {
      name: item.author.name,
      icon: item.author.thumbnail ? item.author.thumbnail.url : null,
      channelId: item.author.channelId,
      badge: item.author.badge ? item.author.badge.thumbnail.url : null,
    },
    message: item.message.map((m) =>
      "text" in m
        ? { text: m.text }
        : { emoji: m.url, alt: m.alt || m.emojiText || "" }
    ),
    superchat: item.superchat
      ? {
          amount: item.superchat.amount,
          color: item.superchat.color,
          sticker: item.superchat.sticker ? item.superchat.sticker.url : null,
        }
      : null,
    isMembership: !!item.isMembership,
    isOwner: !!item.isOwner,
    isModerator: !!item.isModerator,
    isVerified: !!item.isVerified,
    timestamp: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
  };
}

async function connectChat(input) {
  disconnectChat();
  const id = parseYoutubeInput(input);
  if (!id) {
    setStatus({ error: "URLの形式を認識できなかった", source: input });
    return false;
  }
  liveChat = new LiveChat(id, 1000);
  liveChat.on("start", (liveId) => {
    setStatus({ connected: true, liveId, error: null, source: input });
    console.log("[chat] connected:", liveId);
  });
  liveChat.on("end", (reason) => {
    setStatus({ connected: false, error: reason || null });
    console.log("[chat] ended:", reason);
  });
  liveChat.on("error", (err) => {
    const msg = err && err.message ? err.message : String(err);
    console.error("[chat] error:", msg);
    setStatus({ error: msg });
  });
  liveChat.on("chat", (item) => {
    try {
      broadcast(toPlainChat(item));
    } catch (e) {
      console.error("[chat] parse error:", e);
    }
  });
  const ok = await liveChat.start();
  if (!ok) {
    setStatus({ connected: false });
  }
  return ok;
}

function disconnectChat() {
  if (liveChat) {
    try {
      liveChat.stop("手動で切断");
    } catch {}
    liveChat.removeAllListeners();
    liveChat = null;
  }
  setStatus({ connected: false, liveId: null });
}

// ---------- API ----------
app.get("/api/config", (req, res) => res.json(config));

app.post("/api/config", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
    return res.status(400).json({ ok: false });
  }
  config = body;
  saveConfig();
  broadcast({ type: "config", config });
  res.json({ ok: true });
});

app.get("/api/status", (req, res) => res.json(status));

app.post("/api/connect", async (req, res) => {
  const ok = await connectChat(req.body.url);
  res.json({ ok, status });
});

app.post("/api/disconnect", (req, res) => {
  disconnectChat();
  res.json({ ok: true });
});

// test comment (dummy)
app.post("/api/test", (req, res) => {
  const kind = req.body.kind || "normal";
  const names = ["ゆき", "たろう", "ハナ", "Kenji", "みかん", "コメット"];
  const texts = [
    "こんにちは！",
    "初見です、よろしく",
    "wwwwww",
    "うまい！！",
    "今日も配信ありがとう",
    "888888",
    "それな",
    "次何やるの？",
    "かわいい",
    "ナイスプレイ",
  ];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const item = {
    type: "chat",
    id: "test-" + Date.now() + "-" + Math.random().toString(36).slice(2),
    author: {
      name: pick(names),
      icon: `https://api.dicebear.com/9.x/thumbs/svg?seed=${Math.floor(Math.random() * 1000)}`,
      channelId: "test",
      badge: null,
    },
    message: [{ text: pick(texts) }],
    superchat: null,
    isMembership: false,
    isOwner: false,
    isModerator: false,
    isVerified: false,
    timestamp: Date.now(),
  };
  if (kind === "long") {
    const longs = [
      "今日の配信めちゃくちゃ面白かったです！前回の続きがずっと気になってて、仕事終わってダッシュで帰ってきました。今日もよろしくお願いします！！！",
      "初見です。友達に勧められて来ました。この配信のこういう雰囲気すごく好きです。これからも応援させてください。長文失礼しました。",
      "wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww",
      "This is a long English comment to check how the overlay handles wrapping of very long words like supercalifragilisticexpialidocious and long sentences without line breaks.",
    ];
    item.message = [{ text: pick(longs) }];
  }
  if (kind === "member") item.isMembership = true;
  if (kind === "moderator") item.isModerator = true;
  if (kind === "owner") {
    item.isOwner = true;
    item.author.name = "配信者";
  }
  if (kind === "superchat") {
    const tiers = [
      ["¥200", "#1e88e5"],
      ["¥500", "#00e5ff"],
      ["¥1,000", "#1de9b6"],
      ["¥2,000", "#ffca28"],
      ["¥5,000", "#f57c00"],
      ["¥10,000", "#e91e63"],
      ["¥50,000", "#e62117"],
    ];
    const t = pick(tiers);
    item.superchat = { amount: t[0], color: t[1], sticker: null };
    item.message = [{ text: "応援してます！" }];
  }
  broadcast(item);
  res.json({ ok: true });
});

app.post("/api/clear", (req, res) => {
  broadcast({ type: "clear" });
  res.json({ ok: true });
});

// ---------- websocket ----------
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "config", config }));
  ws.send(JSON.stringify({ type: "status", status }));
});

server.listen(PORT, () => {
  console.log("");
  console.log("==========================================");
  console.log("  YouTube Chat Overlay");
  console.log("  設定画面 : http://localhost:" + PORT + "/");
  console.log("  OBS用URL : http://localhost:" + PORT + "/overlay.html");
  console.log("==========================================");
  console.log("");
  if (config.autoConnect && config.lastUrl) {
    console.log("[chat] auto-connecting to", config.lastUrl);
    connectChat(config.lastUrl);
  }
});

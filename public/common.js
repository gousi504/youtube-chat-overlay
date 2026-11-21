// Shared by overlay.html (chat) and topic.html (topic frames).
// Turns the saved config into CSS variables + body classes so both pages get the same look.
(function () {
  const isColor = (v) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);

  function hexToRgba(hex, a) {
    const h = (hex || "#000").replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  // drop anything in the config that is not a plain color / number / known keyword
  function sanitize(c) {
    const def = buildConfig({ theme: c.theme });
    ["textColor", "nameColor", "bgColor", "memberColor", "modColor", "ownerColor"].forEach(k => { if (!isColor(c[k])) c[k] = def[k]; });
    ["fontSize", "radius", "iconSize", "gap", "padding", "width", "bgOpacity", "scOpacity", "amountSize", "maxMessages", "fadeOutSec"].forEach(k => {
      const n = Number(c[k]); c[k] = Number.isFinite(n) ? n : def[k];
    });
    ["animation", "direction", "align", "amountStyle", "amountPos", "scTone", "firstEffect"].forEach(k => { if (!/^[a-z]+$/.test(c[k])) c[k] = def[k]; });
    if (!FONTS.includes(c.font)) c.font = def.font;
    c.firstLabel = typeof c.firstLabel === "string" ? c.firstLabel.slice(0, 30) : def.firstLabel;
    return c;
  }

  // Applies the visual config to the current page. Returns the cleaned config.
  function apply(c, extraClasses) {
    const cfg = sanitize(buildConfig(c));
    const r = document.documentElement.style;
    r.setProperty("--font", `"${cfg.font}"`);
    r.setProperty("--font-size", cfg.fontSize + "px");
    r.setProperty("--text", cfg.textColor);
    r.setProperty("--name", cfg.nameColor);
    r.setProperty("--accent", cfg.nameColor);
    r.setProperty("--accent-bg", hexToRgba(cfg.nameColor, 0.18));
    r.setProperty("--bg", hexToRgba(cfg.bgColor, cfg.bgOpacity));
    r.setProperty("--bg-solid", cfg.bgColor);
    r.setProperty("--radius", cfg.radius + "px");
    r.setProperty("--icon", cfg.iconSize + "px");
    r.setProperty("--gap", cfg.gap + "px");
    r.setProperty("--pad", cfg.padding + "px");
    r.setProperty("--width", cfg.width + "px");
    r.setProperty("--member", cfg.memberColor);
    r.setProperty("--mod", cfg.modColor);
    r.setProperty("--owner", cfg.ownerColor);
    r.setProperty("--sc-a", cfg.scOpacity);
    r.setProperty("--amt-size", cfg.amountSize);

    document.body.className = (extraClasses || []).concat([
      "theme-" + cfg.theme,
      "anim-" + cfg.animation,
      cfg.outline ? "outline" : "",
      cfg.shadow ? "shadow" : "",
      "dir-" + cfg.direction,
      "align-" + cfg.align,
      "amt-" + cfg.amountStyle,
      "amtpos-" + cfg.amountPos,
    ]).filter(Boolean).join(" ");
    return cfg;
  }

  // Keeps a WebSocket to the local server open and hands every message to onMessage.
  function connect(onMessage) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}`);
    ws.onmessage = (ev) => {
      let d;
      try { d = JSON.parse(ev.data); } catch { return; }
      onMessage(d);
    };
    ws.onclose = () => setTimeout(() => connect(onMessage), 2000);
    ws.onerror = () => ws.close();
  }

  window.OverlayCommon = { isColor, hexToRgba, sanitize, apply, connect };
})();

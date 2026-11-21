// Vidéos de présentation de Regio, animées image par image (rendu déterministe : window.seek(t) dessine l'instant t).
// film.html?v=a|b&fmt=169|916 — A : églises d'abord, ouverte aux autres · B : pour tout le monde.
// Images de l'interface : design/video/assets (capture.mjs, contenu de démonstration).
(() => {
  const q = new URLSearchParams(location.search);
  const V = q.get("v") === "b" ? "b" : "a";
  const VERT = q.get("fmt") === "916";
  const W = VERT ? 1080 : 1920;
  const H = VERT ? 1920 : 1080;
  const DURATION = 45;
  const stage = document.getElementById("stage");
  stage.style.width = W + "px";
  stage.style.height = H + "px";
  const RECTS = { loaded: false };

  // ---------- Outils ----------
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const out = (x) => 1 - Math.pow(1 - x, 3);
  const back = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
  const mix = (a, b, x) => a + (b - a) * x;
  const el = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    (parent || stage).appendChild(e);
    return e;
  };
  const place = (e, x, y, w, h) => Object.assign(e.style, { left: x + "px", top: y + "px", width: w + "px", ...(h !== undefined ? { height: h + "px" } : {}) });
  const b64 = (s) => "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(s)));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const S = VERT ? 1.18 : 1; // textes un peu plus grands en vertical (écran de téléphone)

  // ---------- Visuels de démonstration (mêmes dessins que les captures) ----------
  const camera = (bg, glow) =>
    b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice"><rect width="160" height="90" fill="${bg}"/><ellipse cx="80" cy="22" rx="70" ry="40" fill="${glow}" opacity=".55"/><rect y="66" width="160" height="24" fill="#000" opacity=".25"/><circle cx="80" cy="33" r="8.5" fill="#1b1714"/><path d="M61 72C61 52 70 45 80 45S99 52 99 72Z" fill="#1b1714"/><path d="M58 61H102L97 90H63Z" fill="#2b221c"/><rect x="58" y="59" width="44" height="4" rx="1.5" fill="#3a2e25"/></svg>`);
  const CAM = [camera("#2a211b", "#c9a27a"), camera("#1d2430", "#8aa3c4"), camera("#1c2a26", "#8fbfa8")];
  const slide = (title, lines) =>
    b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1640"/><stop offset="1" stop-color="#3a2160"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><text x="100" y="110" font-family="Montserrat Variable,Montserrat,Arial" font-weight="700" font-size="40" letter-spacing="6" fill="#ffffff" opacity=".55">${title.toUpperCase()}</text>${lines.map((l, i) => `<text x="960" y="${430 + i * 120 - (lines.length - 1) * 60}" text-anchor="middle" font-family="Montserrat Variable,Montserrat,Arial" font-weight="700" font-size="96" fill="#fff">${l}</text>`).join("")}</svg>`);
  const REFRAIN = slide("Refrain", ["À toi la gloire,", "ô Ressuscité !", "À toi la victoire", "pour l'éternité !"]);
  const verse = (lines, ref) =>
    b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><radialGradient id="v" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#18224a"/><stop offset="1" stop-color="#0e1530"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#v)"/>${lines.map((l, i) => `<text x="960" y="${470 + i * 96 - (lines.length - 1) * 48}" text-anchor="middle" font-family="Source Serif 4 Variable,Georgia,serif" font-size="70" fill="#f6f2e8">${l}</text>`).join("")}<text x="960" y="${580 + lines.length * 48}" text-anchor="middle" font-family="Inter Variable,Arial" font-weight="700" font-size="34" letter-spacing="5" fill="#e8b44c">${ref}</text></svg>`);
  const JN316 = verse(["Car Dieu a tant aimé le monde", "qu'il a donné son Fils unique,", "afin que quiconque croit en lui", "ne périsse point, mais qu'il ait", "la vie éternelle."], "JEAN 3:16");
  const lower = (cam, text, ref) =>
    b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><image href="${cam}" width="1920" height="1080" preserveAspectRatio="xMidYMid slice"/><rect x="0" y="770" width="1920" height="310" fill="#0e1530" opacity=".86"/><text x="120" y="890" font-family="Source Serif 4 Variable,Georgia,serif" font-size="58" fill="#f6f2e8">${text}</text><text x="120" y="975" font-family="Inter Variable,Arial" font-weight="700" font-size="32" letter-spacing="5" fill="#e8b44c">${ref}</text></svg>`);
  const slideB = (title, lines) =>
    b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f2a3d"/><stop offset="1" stop-color="#1c5161"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><text x="100" y="110" font-family="Montserrat Variable,Montserrat,Arial" font-weight="700" font-size="40" letter-spacing="6" fill="#ffffff" opacity=".6">${title.toUpperCase()}</text>${lines.map((l, i) => `<text x="960" y="${470 + i * 120 - (lines.length - 1) * 60}" text-anchor="middle" font-family="Montserrat Variable,Montserrat,Arial" font-weight="700" font-size="104" fill="#fff">${l}</text>`).join("")}</svg>`);
  const POSTER = b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1450"/><stop offset="1" stop-color="#c0392b"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#p)"/><text x="140" y="640" font-family="Montserrat Variable,Arial" font-weight="800" font-size="160" fill="#fff">Soirée live</text><text x="140" y="770" font-family="Montserrat Variable,Arial" font-weight="600" font-size="64" fill="#fff" opacity=".92">Vendredi · 20 h · en direct</text></svg>`);
  const MARK = `<svg viewBox="0 0 100 100" width="100%" height="100%"><rect x="9.5" y="19.5" width="81" height="61" rx="15" fill="none" stroke="#f6f2e8" stroke-width="7"/><path d="M36.5 63 V43" fill="none" stroke="#f6f2e8" stroke-width="9" stroke-linecap="round"/><path d="M36.5 51 C36.5 42 43.5 37 52.5 37" fill="none" stroke="#f6f2e8" stroke-width="9" stroke-linecap="round"/><circle class="dot" cx="62.5" cy="37" r="6" fill="#e8b44c"/></svg>`;
  const CURSOR = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M4 2l15 9-6.5 1.6L9.6 19z" fill="#f6f2e8" stroke="#0e1530" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  // ---------- Photos (Unsplash, licence gratuite : voir photos.json) ----------
  const P = (name) => `photos/${name}.jpg`;
  /** Photo plein cadre derrière un plan : assombrie (textes lisibles), légèrement floue, zoom lent façon cinéma. */
  function bgPhoto(scene, name, { dim = 0.72, blur = 0, pos = "50% 40%" } = {}) {
    const wrap = el("div", "abs", scene.root);
    scene.root.prepend(wrap);
    place(wrap, 0, 0, W, H);
    wrap.style.overflow = "hidden";
    const img = el("img", "", wrap);
    Object.assign(img.style, { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, filter: blur ? `blur(${blur}px)` : "" });
    img.src = P(name);
    const veil = el("div", "abs", wrap);
    place(veil, 0, 0, W, H);
    veil.style.background = `linear-gradient(180deg, rgba(14,21,48,${Math.min(0.95, dim + 0.12)}) 0%, rgba(14,21,48,${dim}) 45%, rgba(10,16,38,${Math.min(0.97, dim + 0.18)}) 100%)`;
    const len = scene.end - scene.start;
    scene.parts.push((t) => (img.style.transform = `scale(${1.08 - 0.08 * (t / len)})`));
    return img;
  }
  /** Contenu d'écran en HTML : photo de caméra + bandeau (titre, sous-titre), comme la sortie de Regio. */
  const camBar = (photo, title, small, serif = false) => ({ photo, title, small, serif });

  // ---------- Fond ----------
  el("div", "bg");
  const glowA = el("div", "glow");
  const glowB = el("div", "glow");
  const bgTick = (t) => {
    const r = Math.min(W, H) * 0.9;
    place(glowA, W * 0.5 + Math.sin(t * 0.25) * W * 0.25 - r / 2, H * 0.15 + Math.cos(t * 0.2) * H * 0.1 - r / 2, r, r);
    glowA.style.background = "#3a5ccc";
    place(glowB, W * 0.7 + Math.cos(t * 0.18) * W * 0.2 - r * 0.35, H * 0.8 + Math.sin(t * 0.22) * H * 0.08 - r * 0.35, r * 0.7, r * 0.7);
    glowB.style.background = "#2a3f9a";
    glowB.style.opacity = 0.22;
  };

  // ---------- Briques ----------
  /** Titre en une ou plusieurs lignes, qui apparaît à `at` (secondes, temps du plan). */
  function title(scene, lines, y, size, at = 0.15, opts = {}) {
    const e = el("div", "title", scene.root, lines.map((l) => `<span class="l">${l}</span>`).join(""));
    if (opts.area) Object.assign(e.style, { left: opts.area.x + "px", right: W - opts.area.x - opts.area.w + "px" });
    e.style.top = y + "px";
    e.style.fontSize = size * S + "px";
    if (opts.color) e.style.color = opts.color;
    const spans = [...e.querySelectorAll(".l")];
    scene.parts.push((t) => {
      spans.forEach((s, i) => {
        const p = out(prog(t, at + i * 0.18, at + i * 0.18 + 0.55));
        s.style.opacity = p;
        s.style.transform = `translateY(${(1 - p) * 34}px)`;
      });
    });
    return e;
  }
  function sub(scene, text, y, size, at, area) {
    const e = el("div", "sub", scene.root, text);
    if (area) Object.assign(e.style, { left: area.x + "px", right: W - area.x - area.w + "px" });
    e.style.top = y + "px";
    e.style.fontSize = size * S + "px";
    scene.parts.push((t) => {
      const p = out(prog(t, at, at + 0.5));
      e.style.opacity = p;
      e.style.transform = `translateY(${(1 - p) * 20}px)`;
    });
    return e;
  }
  /** Écran de Regio : captures superposées, caméra qui se déplace d'un cadre à l'autre (coordonnées 1600 × 900). */
  function screen(scene, box, caps) {
    const e = el("div", "screen", scene.root);
    place(e, box.x, box.y, box.w, box.h);
    const cap = el("div", "cap", e);
    const imgs = {};
    for (const c of caps) {
      const i = el("img", "", cap);
      i.src = `assets/${V}/${c}.png`;
      imgs[c] = i;
    }
    const ring = el("div", "ring", cap);
    const cur = el("div", "cursor", cap, CURSOR);
    const rip = el("div", "ripple", cap);
    const api = {
      el: e,
      /** view : [x,y,w,h] (capture) ; show : {capture: opacité} ; ring/cursor/ripple optionnels. */
      set({ view, show, ringRect, ringOn = 0, cursorAt, cursorOn = 0, rippleAt, rippleP = 0, maxZoom = 2.6 }) {
        const [rx, ry, rw, rh] = view;
        const k = Math.max(Math.min(box.w / rw, box.h / rh, maxZoom), Math.max(box.w / 1600, box.h / 900) * (view === FULL ? 0 : 1));
        // La vue ne sort jamais de la capture (pas de vide sur les bords).
        const vw = box.w / k, vh = box.h / k;
        const cx = vw >= 1600 ? 800 : clamp(rx + rw / 2, vw / 2, 1600 - vw / 2);
        const cy = vh >= 900 ? 450 : clamp(ry + rh / 2, vh / 2, 900 - vh / 2);
        const tx = box.w / 2 - cx * k;
        const ty = box.h / 2 - cy * k;
        cap.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
        for (const [c, i] of Object.entries(imgs)) i.style.opacity = show[c] ?? 0;
        ring.style.opacity = ringOn;
        if (ringRect) {
          const pad = 6 / k;
          Object.assign(ring.style, { left: ringRect[0] - pad + "px", top: ringRect[1] - pad + "px", width: ringRect[2] + 2 * pad + "px", height: ringRect[3] + 2 * pad + "px", borderWidth: 4 / k + "px", borderRadius: 14 / k + "px" });
        }
        cur.style.opacity = cursorOn;
        if (cursorAt) Object.assign(cur.style, { left: cursorAt[0] + "px", top: cursorAt[1] + "px", transform: `scale(${1.4 / k})` });
        rip.style.opacity = rippleP > 0 && rippleP < 1 ? 1 - rippleP : 0;
        if (rippleAt) {
          const r = (14 + rippleP * 46) / k;
          Object.assign(rip.style, { left: rippleAt[0] - r + "px", top: rippleAt[1] - r + "px", width: 2 * r + "px", height: 2 * r + "px", borderWidth: 3 / k + "px" });
        }
      },
    };
    return api;
  }
  const lerpRect = (a, b, x) => a.map((v, i) => mix(v, b[i], x));
  const pad = (r, p, minW = 0, minH = 0) => {
    let [x, y, w, h] = [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p];
    if (w < minW) { x -= (minW - w) / 2; w = minW; }
    if (h < minH) { y -= (minH - h) / 2; h = minH; }
    return [x, y, w, h];
  };
  const center = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2];
  const R = (shot, key) => RECTS[shot]?.[key] ?? [0, 0, 1600, 900];
  const FULL = [0, 0, 1600, 900];

  function tv(scene, box, images) {
    const e = el("div", "tv", scene.root);
    place(e, box.x, box.y, box.w, box.h);
    const inn = el("div", "in", e);
    el("div", "foot", e);
    const imgs = images.map((it) => {
      if (typeof it === "string") {
        const i = el("img", "", inn);
        i.src = it;
        return i;
      }
      // Caméra + bandeau en bas (verset, nom d'invitée, paroles).
      const layer = el("div", "abs", inn);
      Object.assign(layer.style, { inset: 0 });
      const i = el("img", "", layer);
      i.src = it.photo;
      Object.assign(i.style, { objectPosition: "50% 30%" });
      const bar = el("div", "abs", layer, `<div style="font:${it.serif ? "500 1em 'Source Serif 4 Variable',serif" : "700 1em 'Montserrat Variable',sans-serif"};color:#f6f2e8">${it.title}</div><div style="font:700 .55em 'Inter Variable',sans-serif;letter-spacing:.12em;color:#e8b44c;margin-top:.35em">${it.small}</div>`);
      Object.assign(bar.style, { left: 0, right: 0, bottom: 0, padding: "4% 6%", background: "rgba(14,21,48,.86)", fontSize: box.h * 0.075 + "px" });
      return layer;
    });
    return { el: e, show: (ops) => imgs.forEach((i, n) => (i.style.opacity = ops[n] ?? 0)) };
  }
  function phone(scene, box, src) {
    const e = el("div", "phone", scene.root);
    place(e, box.x, box.y, box.w, box.h);
    const inn = el("div", "in", e);
    const i = el("img", "", inn);
    i.src = src;
    const p = el("div", "pill", inn, "<i></i>EN DIRECT vers la régie");
    p.style.left = "22px";
    p.style.top = "18px";
    p.style.fontSize = 20 + "px";
    p.style.color = "var(--direct)";
    p.querySelector("i").style.background = "var(--direct)";
    return { el: e, pill: p };
  }
  function logo(scene, cx, cy, size) {
    const wrap = el("div", "abs", scene.root);
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = size * 0.18 + "px";
    const m = el("div", "abs", wrap, MARK);
    m.style.position = "relative";
    m.style.width = m.style.height = size + "px";
    const word = el("div", "", wrap, "regio");
    Object.assign(word.style, { fontFamily: '"Sora Variable",Sora,sans-serif', fontWeight: 600, fontSize: size * 0.78 + "px", letterSpacing: "-.03em", lineHeight: 1 });
    const total = size * (1 + 0.18) + size * 0.78 * 2.4;
    place(wrap, cx - total / 2, cy - size / 2, total, size);
    const dot = m.querySelector(".dot");
    return { wrap, mark: m, word, dot };
  }
  function chips(scene, labels, box, size) {
    const c = el("div", "chips", scene.root);
    place(c, box.x, box.y, box.w, box.h);
    c.style.fontSize = size * S + "px";
    return labels.map((l) => el("span", "chip", c, `<i></i>${l}`));
  }

  // ---------- Mise en page selon le format ----------
  const L = VERT
    ? { titleY: 210, titleSize: 76, subSize: 40, subGap: 250, screen: { x: 50, y: 640, w: 980, h: 940 }, wide: { x: 50, y: 700, w: 980, h: 600 } }
    : { titleY: 70, titleSize: 64, subSize: 34, subGap: 95, screen: { x: 260, y: 250, w: 1400, h: 760 }, wide: { x: 260, y: 250, w: 1400, h: 760 } };

  // ---------- Les plans ----------
  const scenes = [];
  function scene(start, end, build) {
    const s = { start, end, root: el("div", "scene"), parts: [] };
    build(s);
    scenes.push(s);
    return s;
  }

  // Plans communs ----------------------------------------------------------
  function sLogo(start, end, tagline) {
    scene(start, end, (s) => {
      const size = VERT ? 170 : 150;
      const lg = logo(s, W / 2, H / 2 - (VERT ? 60 : 40), size);
      const tg = sub(s, tagline, H / 2 + size * 0.75, VERT ? 46 : 40, 0.9);
      tg.style.color = "var(--ivoire)";
      tg.style.fontWeight = 600;
      s.parts.push((t) => {
        const p = back(prog(t, 0.05, 0.75));
        lg.mark.style.transform = `scale(${0.6 + 0.4 * p})`;
        lg.mark.style.opacity = clamp(p);
        const w = out(prog(t, 0.35, 0.95));
        lg.word.style.opacity = w;
        lg.word.style.transform = `translateX(${(1 - w) * -30}px)`;
        const d = prog(t, 0.7, 1.1);
        lg.dot.setAttribute("r", (6 * back(d)).toFixed(2));
        lg.dot.style.filter = `drop-shadow(0 0 ${6 + 10 * Math.sin(Math.min(1, d) * Math.PI)}px #e8b44c)`;
      });
    });
  }
  function sGuarantees(start, end, labels, bg) {
    scene(start, end, (s) => {
      if (bg) bgPhoto(s, bg, { dim: 0.84, blur: 4 });
      title(s, ["Et en plus :"], VERT ? 420 : 170, VERT ? 64 : 56, 0.05);
      const list = chips(s, labels, VERT ? { x: 60, y: 620, w: 960, h: 760 } : { x: 160, y: 330, w: 1600, h: 520 }, VERT ? 50 : 52);
      s.parts.push((t) => {
        list.forEach((c, i) => {
          const a = 0.45 + i * 0.55;
          const p = back(prog(t, a, a + 0.45));
          c.style.opacity = clamp(prog(t, a, a + 0.2));
          c.style.transform = `scale(${0.7 + 0.3 * p})`;
          const lit = t > a + 0.35;
          c.querySelector("i").style.background = lit ? "var(--pret)" : "var(--bord)";
          c.querySelector("i").style.boxShadow = lit ? "0 0 14px var(--pret)" : "none";
        });
      });
    });
  }
  function sCta(start, end, bg, pos) {
    scene(start, end, (s) => {
      // Photo d'un côté (à droite en 16:9, en haut en 9:16), fondue dans le bleu nuit ; le texte de l'autre côté.
      const area = VERT ? { x: 0, w: W } : { x: 0, w: W * 0.56 };
      const cy = VERT ? H * 0.66 : H / 2;
      if (bg) {
        const pane = el("div", "abs", s.root);
        if (VERT) place(pane, 0, 0, W, H * 0.56); else place(pane, W * 0.44, 0, W * 0.56, H);
        pane.style.overflow = "hidden";
        pane.style.webkitMaskImage = pane.style.maskImage = VERT ? "linear-gradient(180deg, #000 55%, transparent)" : "linear-gradient(90deg, transparent, #000 35%)";
        const img = el("img", "", pane);
        Object.assign(img.style, { width: "100%", height: "100%", objectFit: "cover", objectPosition: pos || "50% 30%" });
        img.src = P(bg);
        const len = end - start;
        s.parts.push((t) => (img.style.transform = `scale(${1.06 - 0.06 * (t / len)})`));
      }
      const size = VERT ? 150 : 130;
      const lg = logo(s, area.x + area.w / 2, cy - (VERT ? 230 : 200), size);
      title(s, ["Téléchargez Regio,", "gratuitement."], cy - (VERT ? 90 : 80), VERT ? 76 : 70, 0.35, { area });
      const chip = el("div", "abs", s.root, `<span class="chip" style="background:var(--ivoire);color:var(--nuit)">Lien dans la description</span>`);
      Object.assign(chip.style, { left: area.x + "px", width: area.w + "px", textAlign: "center", top: cy + (VERT ? 160 : 140) + "px", fontSize: (VERT ? 44 : 38) + "px" });
      const url = el("div", "url", s.root, "github.com/ngangoula-jaures/Regio");
      Object.assign(url.style, { left: area.x + "px", right: W - area.x - area.w + "px" });
      url.style.top = cy + (VERT ? 290 : 250) + "px";
      url.style.fontSize = (VERT ? 36 : 30) + "px";
      s.parts.push((t) => {
        const p = out(prog(t, 0, 0.6));
        lg.wrap.style.opacity = p;
        lg.dot.setAttribute("r", (6 * (1 + 0.25 * Math.sin(t * 3))).toFixed(2));
        lg.dot.style.filter = `drop-shadow(0 0 ${10 + 6 * Math.sin(t * 3)}px #e8b44c)`;
        const c = back(prog(t, 1.1, 1.6));
        chip.style.opacity = clamp(prog(t, 1.1, 1.3));
        chip.style.transform = `scale(${0.8 + 0.2 * c})`;
        url.style.opacity = out(prog(t, 1.6, 2.1));
      });
    });
  }
  /** Un téléphone devient caméra : QR code de la régie, puis le téléphone, puis « Connecté ». */
  function sPhone(start, end, lines, small, bg) {
    scene(start, end, (s) => {
      if (bg) bgPhoto(s, bg, { dim: 0.84, blur: 5 });
      title(s, lines, L.titleY, L.titleSize, 0.1);
      if (small) sub(s, small, L.titleY + (VERT ? L.subGap + (lines.length > 1 ? 90 : 0) : lines.length > 1 ? 175 : 95), L.subSize, 0.8);
      const qrBox = VERT ? { x: 140, y: 700, w: 800, h: 500 } : { x: 170, y: 330, w: 780, h: 560 };
      const sc = screen(s, qrBox, ["sources-qr", "sources-phone"]);
      const ph = phone(s, VERT ? { x: 170, y: 1250, w: 740, h: 390 } : { x: 1030, y: 420, w: 740, h: 400 }, P(V === "a" ? "chanteuse" : "podcasteuse"));
      s.parts.push((t) => {
        const qr = R("sources-qr", "qr");
        sc.set({ view: pad(qr, 14), show: { "sources-qr": 1 - prog(t, 3.0, 3.4), "sources-phone": prog(t, 3.0, 3.4) }, ringRect: qr, ringOn: prog(t, 3.3, 3.6) * (1 - prog(t, 4.6, 4.9)) });
        const p = out(prog(t, 1.2, 2.0));
        ph.el.style.opacity = p;
        ph.el.style.transform = `translate${VERT ? "Y" : "X"}(${(1 - p) * 120}px) rotate(${(1 - p) * 6}deg)`;
        ph.pill.style.opacity = prog(t, 2.4, 2.7);
      });
    });
  }

  // Vidéo A : églises d'abord ------------------------------------------------
  if (V === "a") {
    // 1. Accroche (0–3 s)
    scene(0, 3.2, (s) => {
      bgPhoto(s, "famille-vitrail", { dim: 0.45, pos: "50% 20%" });
      // Voile plus sombre en bas, où arrive le texte (les visages restent dégagés en haut).
      const low = el("div", "abs", s.root);
      place(low, 0, H * 0.45, W, H * 0.55);
      low.style.background = "linear-gradient(180deg, rgba(14,21,48,0) 0%, rgba(14,21,48,.88) 55%)";
      const t1 = title(s, VERT ? ["Dimanche,", "9 h 58."] : ["Dimanche, 9 h 58."], VERT ? 1060 : 640, VERT ? 104 : 104, 0.1);
      sub(s, VERT ? "Le culte commence<br>dans 2 minutes." : "Le culte commence dans 2 minutes.", VERT ? 1330 : 770, VERT ? 50 : 44, 0.9);
      const clock = el("div", "sub", s.root, "");
      clock.style.top = (VERT ? 1490 : 850) + "px";
      clock.style.fontSize = (VERT ? 46 : 40) + "px";
      clock.style.fontVariantNumeric = "tabular-nums";
      clock.style.color = "var(--or)";
      s.parts.push((t) => {
        const secs = Math.floor(t * 8);
        clock.textContent = `09:58:${String(secs).padStart(2, "0")}`;
        clock.style.opacity = prog(t, 1.4, 1.8);
        t1.style.letterSpacing = `${-0.025 + (1 - out(prog(t, 0, 1))) * 0.04}em`;
      });
    });
    // 2. Le problème (3–8 s)
    scene(3, 8.1, (s) => {
      bgPhoto(s, "regisseur-lagos", { dim: 0.55, pos: VERT ? "30% 30%" : "35% 40%" });
      const tools = ["PowerPoint", "OBS", "Facebook Live", "La Bible", "La caméra", "Les annonces", "Les chants", "Le micro"];
      const c = el("div", "abs", s.root);
      place(c, 0, 0, W, H);
      seed = 11;
      const items = tools.map((label, i) => {
        const e = el("span", "chip", c, `<i></i>${label}`);
        e.style.position = "absolute";
        e.style.fontSize = (VERT ? 46 : 44) + "px";
        const ang = rnd() * Math.PI * 2;
        const from = [W / 2 + Math.cos(ang) * W, H * 0.42 + Math.sin(ang) * H];
        // Grille un peu de travers : 3 colonnes (2 en vertical), légère dispersion.
        const cols = VERT ? 2 : 3;
        const col = i % cols, row = Math.floor(i / cols);
        const gx = VERT ? [W * 0.3, W * 0.7] : [W * 0.56, W * 0.72, W * 0.88];
        const to = [gx[col] + (rnd() - 0.5) * 50, (VERT ? 760 : 200) + row * (VERT ? 160 : 140) + (rnd() - 0.5) * 30];
        return { e, from, to, rot: (rnd() - 0.5) * 16, at: 0.1 + i * 0.22 };
      });
      title(s, ["Trop d'outils.", "Un seul bénévole."], VERT ? 1420 : H - 330, VERT ? 84 : 76, 2.6, VERT ? {} : { area: { x: W * 0.42, w: W * 0.58 } });
      s.parts.push((t) => {
        for (const it of items) {
          const p = out(prog(t, it.at, it.at + 0.7));
          const shake = t > 2.4 ? Math.sin(t * 40 + it.rot) * 3 * prog(t, 2.4, 2.6) : 0;
          const x = mix(it.from[0], it.to[0], p) + shake;
          const y = mix(it.from[1], it.to[1], p);
          it.e.style.transform = `translate(-50%,-50%) rotate(${it.rot * p}deg)`;
          it.e.style.left = x + "px";
          it.e.style.top = y + "px";
          it.e.style.opacity = prog(t, it.at, it.at + 0.2) * (1 - 0.55 * prog(t, 2.5, 3.0));
        }
      });
    });
    // 3. Regio (8–11 s)
    sLogo(8, 11.1, "La régie de vos cultes et de vos directs");
    // 4. Le programme et Suivant (11–17 s)
    scene(11, 17.1, (s) => {
      bgPhoto(s, "louange-assemblee", { dim: 0.86, blur: 8 });
      title(s, ["Préparez le culte en moments."], L.titleY, L.titleSize, 0.1);
      sub(s, "Le jour J : un seul bouton, <b class='gold'>Suivant</b>.", L.titleY + L.subGap, L.subSize + 4, 2.2);
      const sc = screen(s, L.screen, ["regie-louange-2", "regie-louange-3"]);
      s.parts.push((t) => {
        const plan = pad(R("regie-louange-2", "plan"), 10, 0, 0);
        const next = R("regie-louange-2", "next");
        const outR = R("regie-louange-2", "output");
        const vNext = pad([outR[0], outR[1], outR[2], next[1] + next[3] - outR[1]], 24);
        let view = FULL;
        if (VERT) view = lerpRect(pad(plan, 0, 0, 900).map((v, i) => (i === 2 ? 900 : v)), vNext, ease(prog(t, 2.0, 3.0)));
        else view = t < 1.6 ? lerpRect(FULL, pad(plan, 20, 900, 0), ease(prog(t, 0.6, 1.6))) : lerpRect(pad(plan, 20, 900, 0), vNext, ease(prog(t, 2.0, 3.0)));
        const [cx, cy] = center(next);
        const click = 3.9;
        sc.set({
          view,
          show: { "regie-louange-2": 1 - prog(t, click + 0.15, click + 0.45), "regie-louange-3": prog(t, click + 0.15, click + 0.45) },
          ringRect: next,
          ringOn: prog(t, 3.0, 3.3) * (1 - prog(t, 4.4, 4.7)),
          cursorAt: [mix(cx + 260, cx + 60, ease(prog(t, 3.1, 3.8))), mix(cy + 160, cy + 6, ease(prog(t, 3.1, 3.8)))],
          cursorOn: prog(t, 3.0, 3.2) * (1 - prog(t, 4.6, 4.9)),
          rippleAt: [cx + 60, cy + 6],
          rippleP: prog(t, click, click + 0.5),
        });
      });
    });
    // 5. La Bible (17–22 s)
    scene(17, 22.1, (s) => {
      bgPhoto(s, "pere-fils", { dim: 0.86, blur: 6 });
      title(s, ["La Bible complète,", "même sans Internet."], L.titleY, L.titleSize, 0.1);
      const box = VERT ? { x: 70, y: 600, w: 940, h: 380 } : { x: 200, y: 290, w: 720, h: 420 };
      const sc = screen(s, box, ["bible-tape"]);
      const tvBox = VERT ? { x: 120, y: 1120, w: 840, h: 472 } : { x: 990, y: 300, w: 760, h: 428 };
      const set = tv(s, tvBox, [JN316]);
      const lab = el("div", "label", s.root, "La télé de la salle");
      place(lab, tvBox.x, tvBox.y + tvBox.h + 60, tvBox.w);
      lab.style.fontSize = (VERT ? 34 : 28) + "px";
      const typed = el("div", "pill", s.root, "");
      s.parts.push((t) => {
        const search = R("bible-tape", "search");
        sc.set({ view: pad(search, 30, 620, 0), show: { "bible-tape": 1 }, ringRect: search, ringOn: prog(t, 0.7, 1.0) * (1 - prog(t, 2.6, 2.9)) });
        const p = out(prog(t, 1.8, 2.6));
        set.el.style.opacity = p;
        set.el.style.transform = `scale(${0.92 + 0.08 * p})`;
        set.show([1]);
        lab.style.opacity = prog(t, 2.4, 2.8);
        const word = "jn 3 16".slice(0, Math.floor(prog(t, 0.8, 1.7) * 7));
        typed.innerHTML = `Recherche : <span class="gold">${word || "…"}</span>`;
        Object.assign(typed.style, { left: box.x + 30 + "px", top: box.y + box.h + 30 + "px", fontSize: (VERT ? 34 : 28) + "px", opacity: prog(t, 0.6, 0.9) });
      });
    });
    // 6. Le téléphone (22–27 s)
    sPhone(22, 27.1, ["Un téléphone devient une caméra."], "Un QR code. Aucune application.", "chanteuse-sa");
    // 7. Projeter et diffuser (27–32 s)
    scene(27, 32.1, (s) => {
      bgPhoto(s, "chorale-ecran", { dim: 0.8, blur: 3 });
      title(s, ["Projetez dans la salle.", "Diffusez en direct."], L.titleY, L.titleSize, 0.1);
      const tvBox = VERT ? { x: 160, y: 640, w: 760, h: 428 } : { x: 170, y: 370, w: 760, h: 428 };
      const set = tv(s, tvBox, [REFRAIN]);
      const fbBox = VERT ? { x: 160, y: 1200, w: 760, h: 428 } : { x: 990, y: 370, w: 760, h: 428 };
      const fb = tv(s, fbBox, [camBar(P("louange-assemblee"), "À toi la gloire, ô Ressuscité !", "LOUANGE")]);
      fb.el.style.borderRadius = "18px";
      fb.el.querySelector(".foot").remove();
      const live = el("div", "pill live", fb.el, "<i></i>EN DIRECT · Facebook");
      Object.assign(live.style, { left: "30px", top: "30px", fontSize: (VERT ? 26 : 24) + "px" });
      const l1 = el("div", "label", s.root, "Dans la salle");
      const l2 = el("div", "label", s.root, "Sur Facebook");
      if (VERT) { place(l1, tvBox.x, tvBox.y - 60, tvBox.w); place(l2, fbBox.x, fbBox.y - 60, fbBox.w); }
      else { place(l1, tvBox.x, tvBox.y + tvBox.h + 60, tvBox.w); place(l2, fbBox.x, fbBox.y + fbBox.h + 60, fbBox.w); }
      for (const l of [l1, l2]) l.style.fontSize = (VERT ? 34 : 30) + "px";
      s.parts.push((t) => {
        const a = out(prog(t, 0.6, 1.3));
        const b = out(prog(t, 1.4, 2.1));
        set.el.style.opacity = a; set.el.style.transform = `translateY(${(1 - a) * 40}px)`; set.show([1]);
        fb.el.style.opacity = b; fb.el.style.transform = `translateY(${(1 - b) * 40}px)`; fb.show([1]);
        l1.style.opacity = a; l2.style.opacity = b;
        live.style.transform = `scale(${1 + 0.05 * Math.sin(t * 6)})`;
      });
    });
    // 8. Les garanties (32–37 s)
    sGuarantees(32, 37.1, ["Gratuit", "Open source", "Fonctionne hors ligne", "PC modestes", "Jamais d'écran noir"], "famille-vitrail-2");
    // 9. Ouvert aux autres (37–41 s)
    scene(37, 41.1, (s) => {
      title(s, ["Et aussi pour vos"], H / 2 - (VERT ? 190 : 150), VERT ? 76 : 72, 0.1);
      const words = ["conférences", "associations", "lives", "événements"];
      const pics = ["conference", "podcast-nairobi", "chanteuse-sa", "danse-africaine"].map((n) => bgPhoto(s, n, { dim: 0.66 }));
      const ws = words.map((w) => {
        const e = el("div", "word", s.root, w);
        e.style.top = H / 2 - (VERT ? 40 : 30) + "px";
        e.style.fontSize = (VERT ? 104 : 104) + "px";
        return e;
      });
      s.parts.push((t) => {
        ws.forEach((e, i) => {
          const a = 0.5 + i * 0.75;
          const inP = out(prog(t, a, a + 0.3));
          const outP = i === ws.length - 1 ? 0 : ease(prog(t, a + 0.6, a + 0.85));
          e.style.opacity = inP * (1 - outP);
          e.style.transform = `translateY(${(1 - inP) * 50 - outP * 50}px)`;
          // Chaque photo arrive par-dessus la précédente avec son mot.
          pics[i].parentElement.style.zIndex = String(-10 + i);
          pics[i].parentElement.style.opacity = i === 0 ? 1 : prog(t, a - 0.1, a + 0.25);
        });
      });
    });
    // 10. L'appel (41–45 s)
    sCta(41, 45, "homme-laptop", VERT ? "50% 0%" : "50% 25%");
  }

  // Vidéo B : pour tout le monde -------------------------------------------
  if (V === "b") {
    // 1. Accroche (0–3 s)
    scene(0, 3.2, (s) => {
      title(s, VERT ? ["Un live.", "Trois caméras."] : ["Un live. Trois caméras."], VERT ? 260 : 140, VERT ? 84 : 86, 0.1);
      bgPhoto(s, "camera-lumiere", { dim: 0.86, blur: 4 });
      const cards = [P("podcast-nairobi"), P("podcast-studio"), P("podcasteuse")].map((src) => {
        const c = el("div", "camcard", s.root, `<img src="${src}" style="object-fit:cover">`);
        return c;
      });
      const cw = VERT ? 560 : 480, ch = cw * 9 / 16;
      const pos = VERT
        ? [[W / 2 - cw / 2 - 150, 560], [W / 2 - cw / 2 + 150, 770], [W / 2 - cw / 2 - 60, 980]]
        : [[W / 2 - cw * 1.5 - 40, 360], [W / 2 - cw / 2, 360], [W / 2 + cw / 2 + 40, 360]];
      cards.forEach((c, i) => place(c, pos[i][0], pos[i][1], cw, ch));
      const last = title(s, ["Une seule personne."], VERT ? 1370 : 760, VERT ? 76 : 70, 1.9, { color: "var(--or)" });
      s.parts.push((t) => {
        cards.forEach((c, i) => {
          const p = back(prog(t, 0.4 + i * 0.35, 0.85 + i * 0.35));
          c.style.opacity = clamp(prog(t, 0.4 + i * 0.35, 0.6 + i * 0.35));
          c.style.transform = `scale(${0.6 + 0.4 * p}) rotate(${(i - 1) * 3 * p}deg)`;
        });
      });
    });
    // 2. Regio (3–7 s)
    sLogo(3, 7.1, "La régie de vos directs. Simple. Gratuite.");
    // 3. Changer de caméra (7–13 s)
    scene(7, 13.1, (s) => {
      bgPhoto(s, "podcast-studio", { dim: 0.88, blur: 8 });
      title(s, ["Changez de caméra d'un clic."], L.titleY, L.titleSize, 0.1);
      sub(s, "Ou au clavier : touches 1 à 6.", L.titleY + L.subGap, L.subSize + 4, 0.7);
      const sc = screen(s, L.screen, ["regie-cam1", "regie-cam2", "regie-cam3"]);
      const keySize = VERT ? 130 : 110;
      const key = el("div", "key", s.root, "1");
      place(key, VERT ? 90 : 90, VERT ? L.screen.y + L.screen.h - keySize - 40 : 720, keySize, keySize);
      key.style.fontSize = keySize * 0.5 + "px";
      s.parts.push((t) => {
        const cams = R("regie-cam1", "cams");
        const outR = R("regie-cam1", "output");
        const view = pad([cams[0], outR[1], outR[0] + outR[2] - cams[0], Math.max(cams[1] + cams[3], outR[1] + outR[3]) - outR[1]], 20);
        const n = t < 2.4 ? 0 : t < 3.8 ? 1 : 2;
        const f = (a) => prog(t, a, a + 0.25);
        const show = { "regie-cam1": 1 - f(2.2), "regie-cam2": f(2.2) * (1 - f(3.6)), "regie-cam3": f(3.6) };
        const tile = R("regie-cam1", "tile" + (n + 1));
        sc.set({ view: VERT ? lerpRect(pad(cams, 20), pad(outR, 20), ease(prog(t, 4.6, 5.4))) : view, show, ringRect: tile, ringOn: prog(t, 1.2, 1.4) });
        key.textContent = String(n + 1);
        const press = [1.9, 2.2, 3.6].some((a) => t > a && t < a + 0.2);
        key.style.opacity = prog(t, 1.0, 1.3);
        key.style.transform = `translateY(${press ? 8 : 0}px)`;
        key.style.boxShadow = press ? "0 0 0 #b9b3a6,0 10px 30px rgba(0,0,0,.45)" : "";
      });
    });
    // 4. Le téléphone (13–18 s)
    sPhone(13, 18.1, ["Vos téléphones deviennent", "des caméras."], VERT ? "Jusqu'à 4 téléphones. Aucune application." : "Jusqu'à 4 téléphones · aucune application", "telephone-concert");
    // 5. Tout votre contenu (18–24 s)
    scene(18, 24.1, (s) => {
      bgPhoto(s, "conference", { dim: 0.86, blur: 5 });
      title(s, ["Textes, images, PowerPoint, PDF :"], L.titleY, VERT ? 66 : 60, 0.1);
      sub(s, "à l'écran en un clic.", L.titleY + (VERT ? L.subGap : 85), L.subSize + 6, 0.6);
      const tvBox = VERT ? { x: 90, y: 700, w: 900, h: 506 } : { x: 380, y: 290, w: 1160, h: 652 };
      const set = tv(s, tvBox, [camBar(P("podcast-nairobi"), "Awa Koné", "FONDATRICE DU STUDIO KORA"), slideB("Ses 3 conseils", ["Lancer sa chaîne", "en 3 étapes"]), POSTER]);
      const lab = el("div", "label", s.root, "");
      place(lab, tvBox.x, VERT ? tvBox.y + tvBox.h + 80 : tvBox.y + tvBox.h + 24, tvBox.w);
      lab.style.fontSize = (VERT ? 40 : 30) + "px";
      s.parts.push((t) => {
        const a = out(prog(t, 0.5, 1.1));
        set.el.style.opacity = a;
        set.el.style.transform = `scale(${0.94 + 0.06 * a})`;
        const f = (x) => prog(t, x, x + 0.35);
        set.show([1 - f(2.6), f(2.6) * (1 - f(4.2)), f(4.2)]);
        lab.innerHTML = t < 2.8 ? "Un bandeau sur la caméra" : t < 4.4 ? "Une diapo PowerPoint" : "Une affiche en plein écran";
        lab.style.opacity = a;
      });
    });
    // 6. Le son (24–29 s)
    scene(24, 29.1, (s) => {
      bgPhoto(s, "podcasteuse", { dim: 0.88, blur: 8 });
      title(s, ["Le son suit l'image."], L.titleY, L.titleSize, 0.1);
      sub(s, "Ou gardez le micro de votre choix.", L.titleY + L.subGap, L.subSize + 4, 1.8);
      const sc = screen(s, L.screen, ["regie-cam3", "regie-son"]);
      s.parts.push((t) => {
        const cams = R("regie-son", "cams");
        const keep = R("regie-son", "keep");
        const sound = R("regie-son", "sound");
        const v0 = pad([sound[0], sound[1], cams[0] + cams[2] - sound[0], cams[1] + cams[3] - sound[1]], 20);
        const v1 = pad([keep[0] - 160, sound[1], keep[0] + keep[2] - sound[0] + 160, keep[1] + keep[3] - sound[1] + 120], 20);
        const [cx, cy] = center(keep);
        const click = 2.6;
        sc.set({
          view: lerpRect(v0, VERT ? pad(cams, 10) : v1, ease(prog(t, 1.0, 2.0))),
          show: { "regie-cam3": 1 - prog(t, click + 0.1, click + 0.4), "regie-son": prog(t, click + 0.1, click + 0.4) },
          ringRect: prog(t, click, click + 1) > 0.4 ? sound : keep,
          ringOn: prog(t, 2.0, 2.3),
          cursorAt: [mix(cx + 120, cx, ease(prog(t, 1.9, 2.5))), mix(cy + 90, cy, ease(prog(t, 1.9, 2.5)))],
          cursorOn: prog(t, 1.8, 2.0) * (1 - prog(t, 3.4, 3.7)),
          rippleAt: [cx, cy],
          rippleP: prog(t, click, click + 0.5),
        });
      });
    });
    // 7. En direct (29–33 s)
    scene(29, 33.1, (s) => {
      bgPhoto(s, "streamer", { dim: 0.84, blur: 4 });
      title(s, ["En direct sur Facebook."], L.titleY, L.titleSize, 0.1);
      sub(s, "YouTube bientôt.", L.titleY + L.subGap, L.subSize + 4, 0.8);
      const sc = screen(s, L.screen, ["direct"]);
      const timer = el("div", "pill live", s.root, "<i></i>EN DIRECT 00:00:00");
      timer.style.fontSize = (VERT ? 44 : 40) + "px";
      s.parts.push((t) => {
        const live = R("direct", "live");
        const outR = R("direct", "output");
        sc.set({ view: lerpRect(FULL, pad([live[0] - 300, live[1], outR[0] + outR[2] - live[0] + 300, outR[1] + outR[3] - live[1]], 20), ease(prog(t, 0.6, 1.6))), show: { direct: 1 }, ringRect: live, ringOn: prog(t, 1.6, 1.9) });
        const secs = 12 + Math.floor(t);
        timer.innerHTML = `<i></i>EN DIRECT 00:00:${String(secs).padStart(2, "0")}`;
        const p = back(prog(t, 2.0, 2.4));
        Object.assign(timer.style, { left: W / 2 + "px", top: L.screen.y + L.screen.h + 30 + "px", opacity: VERT ? clamp(prog(t, 2.0, 2.2)) : 0, transform: `translateX(-50%) scale(${0.7 + 0.3 * p})` });
      });
    });
    // 8. Les garanties (33–38 s)
    sGuarantees(33, 38.1, ["Gratuit", "Open source", "Fonctionne hors ligne", "PC modestes", "Connexion faible"], "createrice-ring");
    // 9. Pour qui (38–41 s)
    scene(38, 41.1, (s) => {
      title(s, ["Pour qui ?"], VERT ? 230 : 70, VERT ? 76 : 64, 0.05);
      const who = [["streamer", "Streamers"], ["createrice-ring", "Créateurs"], ["podcast-nairobi", "Associations"], ["louange-france", "Églises"], ["conference", "Événements"]];
      // 16:9 : 3 en haut, 2 en bas ; 9:16 : 2 colonnes.
      const cw = VERT ? 470 : 520, ch = VERT ? 360 : 300, gap = VERT ? 26 : 30;
      const cardPos = who.map((_, i) => {
        if (VERT) { const col = i % 2, row = Math.floor(i / 2); const n = row === 2 ? 1 : 2; return [W / 2 - (n * cw + (n - 1) * gap) / 2 + col * (cw + gap), 430 + row * (ch + gap)]; }
        const row = i < 3 ? 0 : 1, n = row === 0 ? 3 : 2, col = row === 0 ? i : i - 3;
        return [W / 2 - (n * cw + (n - 1) * gap) / 2 + col * (cw + gap), 200 + row * (ch + gap)];
      });
      const cards = who.map(([pic, label], i) => {
        const c = el("div", "camcard", s.root, `<img src="${P(pic)}" style="object-fit:cover"><span style="position:absolute;left:0;right:0;bottom:0;padding:14px 18px;background:linear-gradient(transparent,rgba(14,21,48,.92));font:700 ${VERT ? 36 : 32}px 'Sora Variable',sans-serif;color:#f6f2e8">${label}</span>`);
        place(c, cardPos[i][0], cardPos[i][1], cw, ch);
        c.style.position = "absolute";
        return c;
      });
      s.parts.push((t) => {
        cards.forEach((c, i) => {
          const a = 0.3 + i * 0.32;
          const p = back(prog(t, a, a + 0.45));
          c.style.opacity = clamp(prog(t, a, a + 0.2));
          c.style.transform = `translateY(${(1 - p) * 50}px) scale(${0.92 + 0.08 * p})`;
        });
      });
    });
    // 10. L'appel (41–45 s)
    sCta(41, 45, "cadreur-soleil", "50% 50%");
  }

  // ---------- Lecture ----------
  const FADE = 0.4;
  window.seek = (t) => {
    bgTick(t);
    for (const s of scenes) {
      const lt = t - s.start;
      const on = t >= s.start && t < s.end;
      if (!on) {
        s.root.style.opacity = 0;
        s.root.style.display = "none";
        continue;
      }
      s.root.style.display = "";
      const fin = s.start === 0 ? 1 : prog(lt, 0, FADE);
      const fout = s.end >= DURATION ? 1 : 1 - prog(t, s.end - FADE, s.end);
      s.root.style.opacity = Math.min(fin, fout);
      s.root.style.transform = `scale(${1 + 0.015 * (1 - Math.min(fin, 1))})`;
      for (const p of s.parts) p(lt);
    }
  };
  window.DURATION = DURATION;
  window.filmReady = (async () => {
    RECTS_LOAD: {
      const r = await fetch(`assets/${V}/rects.json`).then((x) => x.json());
      Object.assign(RECTS, r);
    }
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    window.seek(0);
    return true;
  })();
  // Aperçu dans un navigateur : ?play=1 lit la vidéo en temps réel.
  if (q.get("play")) {
    const t0 = performance.now();
    const loop = () => {
      window.seek(((performance.now() - t0) / 1000) % DURATION);
      requestAnimationFrame(loop);
    };
    window.filmReady.then(loop);
  }
  if (q.get("t")) window.filmReady.then(() => window.seek(Number(q.get("t"))));
})();

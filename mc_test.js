// Realistic Physics Mod for Sandboxels
// - Every vanilla solid gets gravity (except steel, which is an anchor)
// - Explosions fling nearly everything outward (except steel and pinned pixels)
// - Link tool: joins pixels into one rigid object that falls / flies as a unit
// - Pin tool: locks pixels in place (pinned pixels, and anything linked to them, never move)
// - Unlink / Unpin tools to undo

(function () {
  // ---------- settings ----------
  const EXCLUDE = ["steel"];     // elements that never move and act as anchors
  const GRAVITY = 0.25;          // acceleration per tick
  const MAX_FALL = 5;            // max cells per tick
  const DRAG = 0.97;             // air drag on horizontal speed
  const EXPLOSION_REACH = 2.5;   // push radius = explosion radius * this
  const EXPLOSION_POWER = 0.3;   // push speed scale
  const EXPLOSION_CORE = 0.6;    // fraction of radius that still gets vanilla destruction

  let groups = {};
  let strokeLink = null;

  const newId = () => "L" + Math.random().toString(36).slice(2, 9);
  const isAnchor = (p) => p.pinned || EXCLUDE.includes(p.element);
  const dead = (m, id) => m.del || m.link !== id || !pixelMap[m.x] || pixelMap[m.x][m.y] !== m;

  // ---------- link groups ----------
  function makeGroup(id, members, old) {
    return {
      id, members, set: new Set(members),
      vx: old ? old.vx : 0, vy: old ? old.vy : 0, ax: 0, ay: 0,
      frame: -1, checked: pixelTicks,
    };
  }

  function buildAll() {
    const lists = {};
    for (const p of currentPixels) {
      if (p.link && !groups[p.link]) (lists[p.link] = lists[p.link] || []).push(p);
    }
    for (const id in lists) groups[id] = makeGroup(id, lists[id]);
  }

  function rebuild(id, old) {
    const alive = old.members.filter((m) => !dead(m, id));
    if (!alive.length) { delete groups[id]; return null; }
    const seen = new Set();
    const comps = [];
    for (const start of alive) {
      if (seen.has(start)) continue;
      const comp = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const c = stack.pop();
        comp.push(c);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const col = pixelMap[c.x + dx];
          const n = col && col[c.y + dy];
          if (n && n.link === id && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
      }
      comps.push(comp);
    }
    // broken-off pieces become their own objects
    for (let i = 1; i < comps.length; i++) {
      const nid = newId();
      comps[i].forEach((m) => (m.link = nid));
      groups[nid] = makeGroup(nid, comps[i], old);
    }
    groups[id] = makeGroup(id, comps[0], old);
    return groups[id];
  }

  function getGroup(id) {
    let g = groups[id];
    if (!g) { buildAll(); g = groups[id]; if (!g) return null; }
    if (g.checked !== pixelTicks) {
      g.checked = pixelTicks;
      if (g.members.some((m) => dead(m, id))) g = rebuild(id, g);
    }
    return g;
  }

  // ---------- movement helpers ----------
  function canMove(members, body, dx, dy) {
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const nx = m.x + dx, ny = m.y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
      const o = pixelMap[nx][ny];
      if (o && !body.has(o)) return false;
    }
    return true;
  }

  function shift(members, dx, dy) {
    if (members.length === 1) { movePixel(members[0], members[0].x + dx, members[0].y + dy); return; }
    // move the leading edge first so cells are free when needed
    members.sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy));
    for (const m of members) movePixel(m, m.x + dx, m.y + dy);
  }

  function step(p) {
    if (p.del) return;
    let g = null;
    if (p.link) {
      g = getGroup(p.link);
      if (!g) delete p.link;
      else { if (g.frame === pixelTicks) return; g.frame = pixelTicks; }
    }
    const h = g || p;
    const el = elements[p.element];
    const moving = (h.vx || 0) !== 0 || (h.vy || 0) !== 0;

    if (!g) {
      if (!el.rg && !moving) return;                    // vanilla physics handles it
      if (isAnchor(p)) { h.vx = h.vy = 0; return; }
      if (!moving && !isEmpty(p.x, p.y + 1)) return;    // resting
    } else if (g.members.some(isAnchor)) { g.vx = g.vy = 0; return; }

    const members = g ? g.members : [p];
    const body = g ? g.set : new Set([p]);

    if (g && !moving && !canMove(members, body, 0, 1)) return; // resting group

    let vx = (h.vx || 0) * DRAG;
    let vy = Math.min((h.vy || 0) + GRAVITY, MAX_FALL);
    h.ax = (h.ax || 0) + vx;
    h.ay = (h.ay || 0) + vy;
    const mx = Math.trunc(h.ax), my = Math.trunc(h.ay);
    h.ax -= mx; h.ay -= my;

    const sx = Math.sign(mx), sy = Math.sign(my);
    let remX = Math.abs(mx), remY = Math.abs(my);
    let blockedX = false, blockedY = false;
    const n = remX + remY;

    for (let i = 0; i < n; i++) {
      const dx = remX > 0 ? sx : 0, dy = remY > 0 ? sy : 0;
      if (!dx && !dy) break;
      if (dx && dy && canMove(members, body, dx, dy)) { shift(members, dx, dy); remX--; remY--; continue; }
      if (dy) {
        if (canMove(members, body, 0, dy)) { shift(members, 0, dy); remY--; }
        else { blockedY = true; remY = 0; }
      }
      if (dx) {
        if (canMove(members, body, dx, 0)) { shift(members, dx, 0); remX--; }
        else { blockedX = true; remX = 0; }
      }
    }

    if (blockedY) { if (vy > 0) vx *= 0.6; vy = 0; h.ay = 0; }
    if (blockedX) { vx = 0; h.ax = 0; }
    if (blockedY && Math.abs(vx) < 0.2) vx = 0;
    h.vx = vx; h.vy = vy;
  }

  // ---------- explosions ----------
  if (typeof explodeAt === "function") {
    const origExplode = explodeAt;
    explodeAt = function (x, y, radius, ...rest) {
      const R = radius * EXPLOSION_REACH;
      const hit = [];
      for (let cx = Math.floor(x - R); cx <= Math.ceil(x + R); cx++) {
        for (let cy = Math.floor(y - R); cy <= Math.ceil(y + R); cy++) {
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
          const p = pixelMap[cx][cy];
          if (!p) continue;
          const d = Math.hypot(cx - x, cy - y);
          if (d > R) continue;
          const el = elements[p.element];
          if (!el || el.state === "gas" || isAnchor(p)) continue;
          hit.push({ p, d, dx: cx - x, dy: cy - y });
        }
      }

      const result = origExplode.call(this, x, y, Math.max(1, Math.round(radius * EXPLOSION_CORE)), ...rest);

      const bodies = new Map();
      for (const { p, d, dx, dy } of hit) {
        if (p.del || !pixelMap[p.x] || pixelMap[p.x][p.y] !== p) continue;
        let ux, uy;
        if (d < 0.5) { ux = Math.random() - 0.5; uy = -1; }
        else { ux = dx / d; uy = dy / d; }
        const s = (1 - d / R) * radius * EXPLOSION_POWER;
        const ix = ux * s, iy = uy * s - s * 0.25;
        let h = p, key = p;
        if (p.link) {
          const g = getGroup(p.link);
          if (g) { h = g; key = g; }
        }
        const b = bodies.get(key) || { h, sx: 0, sy: 0, c: 0 };
        b.sx += ix; b.sy += iy; b.c++;
        bodies.set(key, b);
      }
      for (const b of bodies.values()) {
        const mass = b.h.members ? Math.sqrt(b.h.members.length) : 1;
        b.h.vx = (b.h.vx || 0) + b.sx / b.c / mass;
        b.h.vy = (b.h.vy || 0) + b.sy / b.c / mass;
      }
      return result;
    };
  }

  // ---------- tools ----------
  document.addEventListener("mousedown", () => { strokeLink = null; }, true);
  document.addEventListener("touchstart", () => { strokeLink = null; }, true);

  elements.link_tool = {
    color: "#00e5ff",
    category: "tools",
    canPlace: false,
    desc: "Drag over pixels to link them into one rigid object. Linking into an existing object merges them.",
    tool: function (p) {
      if (strokeLink === null) strokeLink = p.link || newId();
      if (p.link === strokeLink) return;
      if (p.link) {
        const og = getGroup(p.link);
        if (og) og.members.forEach((m) => (m.link = strokeLink));
      }
      p.link = strokeLink;
      delete groups[strokeLink]; // rebuilt on next tick
    },
  };

  elements.unlink_tool = {
    color: "#0077aa",
    category: "tools",
    canPlace: false,
    desc: "Removes links from pixels.",
    tool: function (p) { delete p.link; },
  };

  elements.pin_tool = {
    color: "#ff3c3c",
    category: "tools",
    canPlace: false,
    desc: "Pins pixels in place. Pinned pixels (and anything linked to them) never move.",
    tool: function (p) { p.pinned = true; },
  };

  elements.unpin_tool = {
    color: "#aa2222",
    category: "tools",
    canPlace: false,
    desc: "Removes pins.",
    tool: function (p) { delete p.pinned; },
  };

  // little markers: cyan dot = linked, red dot = pinned
  if (typeof renderPostPixel === "function") {
    renderPostPixel(function (ctx) {
      const s = pixelSize;
      for (const p of currentPixels) {
        if (!p.pinned && !p.link) continue;
        ctx.fillStyle = p.pinned ? "rgba(255,60,60,0.95)" : "rgba(0,229,255,0.7)";
        ctx.fillRect(p.x * s + s * 0.35, p.y * s + s * 0.35, s * 0.3, s * 0.3);
      }
    });
  }

  // ---------- apply to all vanilla elements ----------
  runAfterLoad(function () {
    for (const name in elements) {
      const el = elements[name];
      if (!el || el.category === "tools" || EXCLUDE.includes(name) || el.__rp) continue;
      if (el.state !== "solid" && el.state !== "liquid") continue;

      const flat = Array.isArray(el.behavior) ? JSON.stringify(el.behavior) : "";
      // solids that don't already fall/move by themselves get gravity
      el.rg = el.state === "solid" && !/M[12]/.test(flat);
      el.__rp = true;

      const old = el.tick;
      el.tick = function (p) {
        step(p);
        if (!p.del && old) return old.apply(this, arguments);
      };
    }
  });

  if (typeof runAfterReset === "function") {
    runAfterReset(function () { groups = {}; strokeLink = null; });
  }
})();

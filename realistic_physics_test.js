// Realistic Physics Mod for Sandboxels
// - Every solid gets gravity (except steel and walls, which are anchors)
// - Explosions fling nearly everything outward (except anchors and pinned pixels)
// - Link tool: joins pixels into one rigid object that falls / flies as a unit
//     * objects that are stuck inside / on top of / against other objects now push
//       each other and move together instead of deadlocking in mid-air
// - Pin tool: locks pixels in place (pinned pixels, and anything linked to them, never move)
// - Unlink / Unpin tools to undo

(function () {
  // ---------- settings ----------
  const EXCLUDE = ["steel", "wall"]; // elements that never move and act as anchors
  const GRAVITY = 0.25;          // acceleration per tick
  const MAX_FALL = 5;            // max cells per tick
  const DRAG = 0.97;             // air drag on horizontal speed
  const MAX_PUSH = 6000;         // max pixels that can be pushed along as one stack
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

  // ---------- pushing / stacking ----------
  // A "body" is a link group, or a loose pixel wrapped as {single, ref, members, set}.
  // Returns the body that owns pixel o if it may be pushed along, otherwise null.
  function bodyOf(o) {
    if (o.link) {
      const g = getGroup(o.link);
      if (!g || g.members.some(isAnchor)) return null;
      return g;
    }
    if (isAnchor(o)) return null;
    const el = elements[o.element];
    if (!el || !el.rg) return null; // loose powders / liquids / gases are never pushed
    return { single: true, ref: o, members: [o], set: new Set([o]) };
  }

  // Works out which bodies have to move together for `start` to move by (dx,dy).
  // Anything in the way that is allowed to move gets added (and so on, recursively),
  // which is what lets a group that is snug inside another group move with it.
  // Returns the list of bodies (start first) or null if the move is blocked.
  function plan(start, dx, dy) {
    let bodies = null, all = null, count = start.members.length;
    const queue = [start];
    while (queue.length) {
      const b = queue.pop();
      const ms = b.members;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i];
        const nx = m.x + dx, ny = m.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return null;
        const o = pixelMap[nx][ny];
        if (!o) continue;
        if (all ? all.has(o) : start.set.has(o)) continue;
        const nb = bodyOf(o);
        if (!nb) return null;
        if (!all) { all = new Set(start.set); bodies = [start]; }
        nb.set.forEach((x) => all.add(x));
        bodies.push(nb);
        count += nb.members.length;
        if (count > MAX_PUSH) return null;
        queue.push(nb);
      }
    }
    return bodies || [start];
  }

  function shift(bodies, dx, dy) {
    let ms;
    if (bodies.length === 1) ms = bodies[0].members;
    else { ms = []; for (const b of bodies) for (const m of b.members) ms.push(m); }
    if (ms.length === 1) { movePixel(ms[0], ms[0].x + dx, ms[0].y + dy); return; }
    // move the leading edge first so cells are free when needed
    ms.sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy));
    for (const m of ms) movePixel(m, m.x + dx, m.y + dy);
  }

  function step(p) {
    if (p.del) return;
    let g = null;
    if (p.link) {
      g = getGroup(p.link);
      if (!g) delete p.link;
      else { if (g.frame === pixelTicks) return; g.frame = pixelTicks; }
    }
    if (!g && p.rpf === pixelTicks) return; // already carried along by something this tick

    const h = g || p;
    const el = elements[p.element];
    const moving = (h.vx || 0) !== 0 || (h.vy || 0) !== 0;

    if (!g) {
      if (!el.rg && !moving) return;                    // vanilla physics handles it
      if (isAnchor(p)) { h.vx = h.vy = 0; return; }
      if (!moving && !isEmpty(p.x, p.y + 1)) return;    // resting
    } else if (g.members.some(isAnchor)) { g.vx = g.vy = 0; return; }

    const body = g || { single: true, ref: p, members: [p], set: new Set([p]) };

    if (g && !moving && !plan(body, 0, 1)) return; // resting group

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
    const carried = new Set();

    const go = (dx, dy) => {
      const pl = plan(body, dx, dy);
      if (!pl) return false;
      shift(pl, dx, dy);
      for (let i = 1; i < pl.length; i++) carried.add(pl[i]);
      return true;
    };

    for (let i = 0; i < n; i++) {
      const dx = remX > 0 ? sx : 0, dy = remY > 0 ? sy : 0;
      if (!dx && !dy) break;
      if (dx && dy && go(dx, dy)) { remX--; remY--; continue; }
      if (dy) {
        if (go(0, dy)) remY--;
        else { blockedY = true; remY = 0; }
      }
      if (dx) {
        if (go(dx, 0)) remX--;
        else { blockedX = true; remX = 0; }
      }
    }

    if (blockedY) { if (vy > 0) vx *= 0.6; vy = 0; h.ay = 0; }
    if (blockedX) { vx = 0; h.ax = 0; }
    if (blockedY && Math.abs(vx) < 0.2) vx = 0;
    h.vx = vx; h.vy = vy;

    // everything that got pushed along now travels with the same velocity and
    // doesn't get its own move this tick (otherwise a stack would move twice as fast)
    for (const b of carried) {
      const t = b.single ? b.ref : b;
      t.vx = vx; t.vy = vy; t.ax = 0; t.ay = 0;
      if (b.single) b.ref.rpf = pixelTicks; else b.frame = pixelTicks;
    }
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

  // ---------- apply gravity to every element ----------
  // true if vanilla behaviour already makes this element fall by itself
  // (bottom-middle cell of its 3x3 behaviour grid moves it down)
  function fallsByItself(el) {
    const b = el.behavior;
    if (!Array.isArray(b)) return false;
    if (b.length === 3 && b.every((r) => Array.isArray(r) && r.length === 3)) {
      return /M[12]/.test(String(b[2][1]));
    }
    return /M[12]/.test(JSON.stringify(b)); // unusual layout: stay on the safe side
  }

  function applyGravity() {
    for (const name in elements) {
      const el = elements[name];
      if (!el || el.category === "tools" || EXCLUDE.includes(name) || el.__rp) continue;
      if (el.state !== "solid" && el.state !== "liquid") continue;

      el.rg = el.state === "solid" && !fallsByItself(el);
      el.__rp = true;

      const old = el.tick;
      el.tick = function (p) {
        step(p);
        if (!p.del && old) return old.apply(this, arguments);
      };
    }
  }

  runAfterLoad(applyGravity);

  if (typeof runAfterReset === "function") {
    runAfterReset(function () { groups = {}; strokeLink = null; applyGravity(); });
  }
})();

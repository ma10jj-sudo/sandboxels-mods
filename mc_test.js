// survival_all.js - Survival mode for Sandboxels that works with ALL elements
// (including elements added by other mods).
//
// How it works:
//  * Placing any element costs 1 from your inventory (per pixel).
//  * Use the "Mine" tool (Tools category) to collect pixels into your inventory.
//  * Place a "Player" and control it with WASD / arrow keys. Press F to eat.
//  * The player has Health and Hunger. Fire, lava, acid, extreme temperatures
//    and starvation hurt. Food in your inventory restores hunger.
//  * A random supply drop of a random element arrives every 25 seconds, so
//    even rare elements can be obtained.
//  * Inventory is saved in localStorage. The panel on the right shows it;
//    click an entry to select that element.

(function () {
  "use strict";

  var SAVE_KEY = "survivalAll_v1";
  var DROP_EVERY_MS = 25000;

  var inv = {};
  var enabled = true;
  var dirty = true;
  var userPlacing = false;
  var activePlayer = null;
  var activeStamp = 0;
  var eatRequest = false;
  var keys = {};
  var lastWarn = 0;
  var filterText = "";

  // ---------- helpers ----------
  function isPlaceable(name) {
    var e = elements[name];
    return !!e && !e.tool && e.category !== "tools" && e.canPlace !== false && name !== "mine";
  }

  function allPlaceable() {
    return Object.keys(elements).filter(isPlaceable);
  }

  function addInv(name, n) {
    inv[name] = (inv[name] || 0) + n;
    if (inv[name] <= 0) delete inv[name];
    dirty = true;
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ inv: inv, enabled: enabled }));
    } catch (e) {}
  }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (d && d.inv) {
        inv = d.inv;
        enabled = d.enabled !== false;
        return true;
      }
    } catch (e) {}
    return false;
  }

  function say(msg) {
    try { logMessage(msg); } catch (e) { console.log(msg); }
  }

  function colorOf(name) {
    var c = elements[name] && elements[name].color;
    if (Array.isArray(c)) c = c[0];
    return c || "#888";
  }

  function prettyName(name) {
    var e = elements[name];
    return (e && e.name) || name.replace(/_/g, " ");
  }

  // ---------- elements ----------
  var FOOD = {
    cooked_meat: 45, meat: 20, bread: 30, cheese: 25, cooked_egg: 25, egg: 12,
    honey: 20, apple: 20, cherry: 8, chocolate: 15, candy: 10, sugar: 6,
    pancake: 30, baked_potato: 30, potato: 12, carrot: 12, rice: 12
  };

  var HAZARD = {
    fire: 3, plasma: 5, lava: 6, magma: 6, acid: 3, sulfuric_acid: 3,
    radiation: 2, neutron: 2, cyanide: 2, poison: 2, chlorine: 1, bleach: 1,
    explosion: 8, napalm: 3
  };

  elements.mine = {
    color: "#c9a14a",
    category: "tools",
    desc: "Collect pixels into your survival inventory.",
    tool: function (pixel) {
      if (!pixel || !elements[pixel.element]) return;
      addInv(pixel.element, 1);
      deletePixel(pixel.x, pixel.y);
    }
  };

  function canEnter(x, y) {
    if (outOfBounds(x, y)) return false;
    var c = pixelMap[x][y];
    if (!c) return true;
    var info = elements[c.element];
    return !!info && (info.state === "liquid" || info.state === "gas");
  }

  function tryMove(p, dx, dy) {
    var nx = p.x + dx, ny = p.y + dy;
    if (outOfBounds(nx, ny)) return false;
    var c = pixelMap[nx][ny];
    if (!c) {
      movePixel(p, nx, ny);
      return true;
    }
    var info = elements[c.element];
    if (info && (info.state === "liquid" || info.state === "gas") && typeof swapPixels === "function") {
      swapPixels(p, c);
      return true;
    }
    return false;
  }

  function isLiquidAt(x, y) {
    if (outOfBounds(x, y)) return false;
    var c = pixelMap[x][y];
    return !!c && elements[c.element] && elements[c.element].state === "liquid";
  }

  elements.player = {
    color: ["#e8b98f", "#d9a577"],
    category: "life",
    state: "solid",
    behavior: behaviors.WALL,
    density: 1000,
    desc: "Survivor. WASD / arrows to move, F to eat from your inventory.",
    tick: function (p) {
      if (p.hp === undefined) { p.hp = 100; p.food = 100; p.t = 0; p.jump = 0; }
      p.t++;
      activePlayer = p;
      activeStamp = performance.now();

      var L = keys["a"] || keys["arrowleft"];
      var R = keys["d"] || keys["arrowright"];
      var U = keys["w"] || keys["arrowup"] || keys[" "];

      // horizontal movement (with 1-pixel step up)
      if (p.t % 2 === 0 && L !== R) {
        var dx = L ? -1 : 1;
        if (!tryMove(p, dx, 0)) tryMove(p, dx, -1) && tryMove(p, dx, 0);
      }

      // vertical movement
      var wet = isLiquidAt(p.x, p.y - 1) || isLiquidAt(p.x, p.y + 1);
      var grounded = !canEnter(p.x, p.y + 1);
      if (U) {
        if (p.jump > 0) {
          if (tryMove(p, 0, -1)) p.jump--; else p.jump = 0;
        } else if (grounded) {
          p.jump = 5;
        } else if (wet && p.t % 2 === 0) {
          tryMove(p, 0, -1);
        } else if (p.t % (wet ? 4 : 1) === 0) {
          tryMove(p, 0, 1);
        }
      } else {
        p.jump = 0;
        if (p.t % (wet ? 4 : 1) === 0) tryMove(p, 0, 1);
      }

      // eating
      if (eatRequest) {
        eatRequest = false;
        var names = Object.keys(FOOD);
        for (var i = 0; i < names.length; i++) {
          if ((inv[names[i]] || 0) > 0) {
            addInv(names[i], -1);
            p.food = Math.min(100, p.food + FOOD[names[i]]);
            say("Ate " + prettyName(names[i]) + ".");
            break;
          }
        }
      }

      // hunger and regen
      if (p.t % 200 === 0) p.food = Math.max(0, p.food - 1);
      if (p.t % 60 === 0) {
        if (p.food <= 0) p.hp -= 2;
        else if (p.food > 60 && p.hp < 100) p.hp += 1;
      }

      // hazards
      if (p.t % 10 === 0) {
        var dmg = 0;
        for (var ox = -1; ox <= 1; ox++) {
          for (var oy = -1; oy <= 1; oy++) {
            if (!ox && !oy) continue;
            var nx = p.x + ox, ny = p.y + oy;
            if (outOfBounds(nx, ny)) continue;
            var c = pixelMap[nx][ny];
            if (!c) continue;
            if (HAZARD[c.element]) dmg += HAZARD[c.element];
            else if (c.temp > 200) dmg += 1;
          }
        }
        if (p.temp > 60) dmg += Math.ceil((p.temp - 60) / 40);
        if (p.temp < -20) dmg += Math.ceil((-20 - p.temp) / 40);
        if (dmg > 0) p.hp -= dmg;
      }

      // death
      if (p.hp <= 0) {
        var x = p.x, y = p.y;
        deletePixel(x, y);
        createPixel(elements.meat ? "meat" : (elements.ash ? "ash" : "dirt"), x, y);
        say("You died." + ((inv.player || 0) > 0 ? " Place another player to respawn." : " No players left in inventory!"));
        if (activePlayer === p) activePlayer = null;
      }
    }
  };

  // ---------- hooks ----------
  var origCreate = window.createPixel;
  window.createPixel = function (element, x, y) {
    if (enabled && userPlacing && isPlaceable(element)) {
      var occupied = pixelMap[x] && pixelMap[x][y];
      if (!occupied) {
        if ((inv[element] || 0) <= 0) {
          var now = Date.now();
          if (now - lastWarn > 1500) {
            lastWarn = now;
            say("Out of " + prettyName(element) + ". Mine some or wait for a supply drop.");
          }
          return;
        }
        var r = origCreate.apply(this, arguments);
        if (pixelMap[x] && pixelMap[x][y] && pixelMap[x][y].element === element) addInv(element, -1);
        return r;
      }
    }
    return origCreate.apply(this, arguments);
  };

  if (typeof window.mouse1Action === "function") {
    var origMouse = window.mouse1Action;
    window.mouse1Action = function () {
      userPlacing = true;
      try { return origMouse.apply(this, arguments); }
      finally { userPlacing = false; }
    };
  }

  window.addEventListener("keydown", function (e) {
    var t = e.target && e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA") return;
    var k = (e.key || "").toLowerCase();
    if (!keys[k] && k === "f") eatRequest = true;
    keys[k] = true;
    if (k.indexOf("arrow") === 0 && performance.now() - activeStamp < 1000) e.preventDefault();
  });
  window.addEventListener("keyup", function (e) {
    keys[(e.key || "").toLowerCase()] = false;
  });
  window.addEventListener("blur", function () { keys = {}; });

  // ---------- supply drops ----------
  function supplyDrop() {
    if (!enabled) return;
    if (typeof paused !== "undefined" && paused) return;
    var list = allPlaceable();
    if (!list.length) return;
    var name = list[Math.floor(Math.random() * list.length)];
    var amt = 10 + Math.floor(Math.random() * 31);
    addInv(name, amt);
    say("Supply drop: +" + amt + " " + prettyName(name));
  }

  // ---------- UI ----------
  function buildUI() {
    var style = document.createElement("style");
    style.textContent =
      "#svPanel{position:fixed;right:8px;top:70px;width:210px;max-height:62vh;display:flex;flex-direction:column;" +
      "background:rgba(20,20,20,.88);color:#eee;font:12px sans-serif;border:1px solid #555;border-radius:6px;z-index:9999}" +
      "#svPanel .h{display:flex;justify-content:space-between;align-items:center;padding:5px 8px;font-weight:bold;cursor:pointer;background:#333;border-radius:6px 6px 0 0}" +
      "#svPanel .b{padding:6px 8px;display:flex;flex-direction:column;gap:5px;overflow:hidden}" +
      "#svPanel .bar{height:10px;background:#444;border-radius:4px;overflow:hidden}" +
      "#svPanel .bar i{display:block;height:100%}" +
      "#svPanel input{width:100%;box-sizing:border-box;padding:2px 4px}" +
      "#svPanel button{cursor:pointer;padding:2px 6px}" +
      "#svList{overflow-y:auto;max-height:30vh;border-top:1px solid #444}" +
      "#svList div{display:flex;align-items:center;gap:6px;padding:2px 3px;cursor:pointer}" +
      "#svList div:hover{background:#444}" +
      "#svList div.sel{background:#2d5a8a}" +
      "#svList s{display:inline-block;width:10px;height:10px;border-radius:2px;flex:none}" +
      "#svList span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      "#svPanel small{color:#aaa;line-height:1.3}";
    document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = "svPanel";
    panel.innerHTML =
      '<div class="h" id="svHead"><span>Survival (All Elements)</span><span id="svCollapse">-</span></div>' +
      '<div class="b" id="svBody">' +
      '<div>HP <span id="svHpT"></span><div class="bar"><i id="svHp" style="background:#d33"></i></div></div>' +
      '<div>Food <span id="svFoodT"></span><div class="bar"><i id="svFood" style="background:#d90"></i></div></div>' +
      '<div style="display:flex;gap:4px"><button id="svToggle"></button><button id="svReset">Reset</button></div>' +
      '<input id="svFilter" placeholder="Filter inventory...">' +
      '<div id="svList"></div>' +
      '<small>Mine tool (Tools) collects pixels. WASD/arrows move, F eats. Supply drop every 25s.</small>' +
      "</div>";
    document.body.appendChild(panel);

    ["mousedown", "touchstart", "pointerdown"].forEach(function (ev) {
      panel.addEventListener(ev, function (e) { e.stopPropagation(); });
    });

    var body = document.getElementById("svBody");
    document.getElementById("svHead").onclick = function () {
      var hidden = body.style.display === "none";
      body.style.display = hidden ? "flex" : "none";
      document.getElementById("svCollapse").textContent = hidden ? "-" : "+";
    };

    var toggle = document.getElementById("svToggle");
    function setToggleLabel() { toggle.textContent = "Survival: " + (enabled ? "ON" : "OFF"); }
    toggle.onclick = function () { enabled = !enabled; setToggleLabel(); save(); };
    setToggleLabel();

    document.getElementById("svReset").onclick = function () {
      if (confirm("Reset your survival inventory to the starter kit?")) { giveStarter(); save(); }
    };

    document.getElementById("svFilter").oninput = function (e) {
      filterText = e.target.value.toLowerCase();
      dirty = true;
    };

    document.getElementById("svList").onclick = function (e) {
      var row = e.target.closest("div[data-el]");
      if (!row) return;
      try { selectElement(row.getAttribute("data-el")); } catch (err) {}
      dirty = true;
    };

    setInterval(refreshUI, 400);
  }

  function refreshUI() {
    var alive = activePlayer && performance.now() - activeStamp < 500;
    var hp = alive ? Math.max(0, activePlayer.hp) : 0;
    var food = alive ? activePlayer.food : 0;
    document.getElementById("svHp").style.width = hp + "%";
    document.getElementById("svFood").style.width = food + "%";
    document.getElementById("svHpT").textContent = alive ? Math.round(hp) : "(no player)";
    document.getElementById("svFoodT").textContent = alive ? Math.round(food) : "";

    if (!dirty) return;
    dirty = false;
    var list = document.getElementById("svList");
    var names = Object.keys(inv).filter(function (n) {
      return elements[n] && inv[n] > 0 && (!filterText || prettyName(n).toLowerCase().indexOf(filterText) !== -1);
    }).sort();
    var cur = typeof currentElement !== "undefined" ? currentElement : null;
    list.innerHTML = "";
    names.forEach(function (n) {
      var row = document.createElement("div");
      row.setAttribute("data-el", n);
      if (n === cur) row.className = "sel";
      var sw = document.createElement("s");
      sw.style.background = colorOf(n);
      var label = document.createElement("span");
      label.textContent = prettyName(n);
      var cnt = document.createElement("b");
      cnt.textContent = inv[n];
      row.appendChild(sw); row.appendChild(label); row.appendChild(cnt);
      list.appendChild(row);
    });
    if (!names.length) list.textContent = "Inventory empty. Use the Mine tool!";
    save();
  }

  function giveStarter() {
    inv = {};
    var kit = {
      player: 3, dirt: 150, sand: 100, water: 100, wood: 100, stone: 100,
      bread: 5, meat: 5, apple: 5, fire: 10, glass: 30, torch: 5
    };
    Object.keys(kit).forEach(function (k) { if (elements[k] && isPlaceable(k)) inv[k] = kit[k]; });
    dirty = true;
  }

  // ---------- init ----------
  runAfterLoad(function () {
    if (!load()) giveStarter();
    buildUI();
    setInterval(supplyDrop, DROP_EVERY_MS);
    say("Survival (All Elements) loaded. Use Tools > Mine to gather elements.");
  });
})();

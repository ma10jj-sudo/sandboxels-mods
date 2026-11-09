// Color Screen + Power Button - a Sandboxels mod
// Companion to multicolor_wire.js (Red / Blue / Green / Yellow wires).
// https://raw.githubusercontent.com/ma10jj-sudo/sandboxels-mods/refs/heads/main/multicolor_wire.js
//
// Adds (under "machines"):
//   Screen Pixel  - lights up from the powered wires touching it (up/down/left/right)
//                   and mixes them: red/green/blue = RGB channels, yellow = red+green,
//                   regular wire = white.
//   Power Button  - click it to toggle ON/OFF (works with any tool selected).
//                   OFF (red):   does nothing.
//                   ON  (green): acts like a battery and powers any wire/conductor touching it
//                                (including Red/Green/Blue/Yellow wires).
//
// Load AFTER multicolor_wire.js.

(function () {
	// ---------- Screen pixel ----------
	const SOURCES = {
		red_wire:         [1, 0, 0],
		green_wire:       [0, 1, 0],
		blue_wire:        [0, 0, 1],
		yellow_wire:      [1, 1, 0],
		red_converter:    [1, 0, 0],
		green_converter:  [0, 1, 0],
		blue_converter:   [0, 0, 1],
		yellow_converter: [1, 1, 0],
		wire:             [1, 1, 1],
	};
	const HOLD = 6;
	const OFF = [28, 32, 38];

	elements.screen_pixel = {
		name: "Screen Pixel",
		color: "#1c2026",
		behavior: behaviors.WALL,
		category: "machines",
		state: "solid",
		density: 2500,
		tempHigh: 1500,
		stateHigh: "molten_glass",
		desc: "Lights up from touching powered wires. Red/Green/Blue mix like a real display; Yellow = Red+Green.",
		tick: function (pixel) {
			if (!pixel.ch) pixel.ch = [0, 0, 0];

			for (let i = 0; i < adjacentCoords.length; i++) {
				const x = pixel.x + adjacentCoords[i][0];
				const y = pixel.y + adjacentCoords[i][1];
				if (pixelMap[x] === undefined || !pixelMap[x][y]) continue;
				const n = pixelMap[x][y];
				const src = SOURCES[n.element];
				if (!src) continue;
				if (!(n.charge || n.chargeCD)) continue;
				for (let k = 0; k < 3; k++) if (src[k]) pixel.ch[k] = HOLD;
			}

			const rgb = [OFF[0], OFF[1], OFF[2]];
			for (let k = 0; k < 3; k++) {
				if (pixel.ch[k] > 0) { rgb[k] = 255; pixel.ch[k]--; }
			}
			const col = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
			if (pixel.color !== col) pixel.color = col;
		},
	};

	// ---------- Power button (switch + power source) ----------
	// Two elements: power_button (off) and power_button_on. Only the OFF one is in the menu.
	elements.power_button = {
		name: "Power Button",
		color: "#8a2222",
		behavior: behaviors.WALL,
		category: "machines",
		state: "solid",
		density: 2000,
		tempHigh: 1085,
		stateHigh: "molten_copper",
		desc: "Click it to turn it ON/OFF. When ON it powers any wire touching it.",
	};

	elements.power_button_on = {
		name: "Power Button (On)",
		color: "#2aff5a",
		behavior: behaviors.WALL,
		category: "machines",
		state: "solid",
		density: 2000,
		tempHigh: 1085,
		stateHigh: "molten_copper",
		hidden: true,
		desc: "Power button, currently ON. Click it to turn it off.",
		tick: function (pixel) {
			// Behave like a battery: charge every adjacent conductor that isn't already charged.
			for (let i = 0; i < adjacentCoords.length; i++) {
				const x = pixel.x + adjacentCoords[i][0];
				const y = pixel.y + adjacentCoords[i][1];
				if (pixelMap[x] === undefined || !pixelMap[x][y]) continue;
				const n = pixelMap[x][y];
				if (n.element === "power_button_on") continue;
				const info = elements[n.element];
				if (info && info.conduct && !n.charge && !n.chargeCD) {
					n.charge = 1;
				}
			}
		},
	};

	function toggleButton(pixel) {
		if (pixel.element === "power_button") {
			changePixel(pixel, "power_button_on");
		} else {
			changePixel(pixel, "power_button");
		}
	}

	// Click anywhere on a power button (any tool selected) to toggle it.
	// Runs in the capture phase and cancels the event so the game doesn't also draw.
	document.addEventListener("pointerdown", function (e) {
		try {
			const canvas = document.getElementById("game");
			if (!canvas || e.target !== canvas) return;
			if (e.button !== undefined && e.button !== 0) return;

			const rect = canvas.getBoundingClientRect();
			const scale = canvas.width / rect.width;
			const x = Math.floor((e.clientX - rect.left) * scale / pixelSize);
			const y = Math.floor((e.clientY - rect.top) * scale / pixelSize);
			if (pixelMap[x] === undefined || !pixelMap[x][y]) return;
			const p = pixelMap[x][y];
			if (p.element === "power_button" || p.element === "power_button_on") {
				toggleButton(p);
				e.preventDefault();
				e.stopPropagation();
			}
		} catch (err) {
			console.error("[color_screen] power button click error:", err);
		}
	}, true);

	if (typeof runAfterLoad === "function") {
		runAfterLoad(function () {
			if (!elements.red_wire) {
				console.warn("[color_screen] multicolor_wire.js isn't loaded; only regular wire (white) will light the screen.");
			}
		});
	}
})();

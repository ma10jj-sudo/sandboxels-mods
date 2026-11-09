// Color Screen & Monitor - a Sandboxels mod
// Companion to multicolor_wire.js (Red / Blue / Green / Yellow wires).
// https://raw.githubusercontent.com/ma10jj-sudo/sandboxels-mods/refs/heads/main/multicolor_wire.js
//
// Adds (all under the "machines" category):
//   Screen Pixel        - a single display pixel. Lights up based on the powered
//                         wires touching it (up/down/left/right) and MIXES them:
//                           red + green + blue = RGB channels, yellow = red+green,
//                           regular wire / white = all channels.
//   Monitor (Solid)     - click to spawn a full monitor: bezel, stand, solid screen.
//                         Drive the pixels by running powered wires against the screen.
//   Monitor (Wireable)  - same, but the screen is a checkerboard of pixels so you can
//                         draw wires in the gaps. Each wire dot lights the 4 pixels around it.
//   Monitor Bezel/Stand - the pieces, if you want to build your own shape.
//
// Load AFTER multicolor_wire.js (or at least have it loaded in the same session).

(function () {
	// Which wire-ish elements light which channels: [R, G, B]
	const SOURCES = {
		red_wire:         [1, 0, 0],
		green_wire:       [0, 1, 0],
		blue_wire:        [0, 0, 1],
		yellow_wire:      [1, 1, 0],
		red_converter:    [1, 0, 0],
		green_converter:  [0, 1, 0],
		blue_converter:   [0, 0, 1],
		yellow_converter: [1, 1, 0],
		wire:             [1, 1, 1], // normal Sandboxels wire = white
	};

	const HOLD = 6;                 // ticks a channel stays lit after the last pulse (smooths wire pulsing)
	const OFF = [28, 32, 38];       // dark "screen off" color

	// ---------- Screen pixel ----------
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
				if (!(n.charge || n.chargeCD)) continue; // wire isn't powered
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

	// ---------- Monitor parts ----------
	elements.monitor_bezel = {
		name: "Monitor Bezel",
		color: ["#2a2a30", "#2e2e35"],
		behavior: behaviors.WALL,
		category: "machines",
		state: "solid",
		density: 1200,
		tempHigh: 250,
		stateHigh: "molten_plastic",
		desc: "Plastic frame for monitors.",
	};
	elements.monitor_stand = {
		name: "Monitor Stand",
		color: ["#3a3a42", "#42424b"],
		behavior: behaviors.WALL,
		category: "machines",
		state: "solid",
		density: 1500,
		tempHigh: 250,
		stateHigh: "molten_plastic",
		desc: "Stand for monitors.",
	};

	// ---------- Monitor spawner ----------
	const SW = 24, SH = 14, B = 2; // screen width/height, bezel thickness

	function buildMonitor(pixel, checker) {
		const ox = pixel.x, oy = pixel.y;
		const W = SW + B * 2, H = SH + B * 2;
		const cx = ox + Math.floor(W / 2);
		const cells = []; // [element, x, y]

		for (let dy = 0; dy < H; dy++) {
			for (let dx = 0; dx < W; dx++) {
				const inScreen = dx >= B && dx < W - B && dy >= B && dy < H - B;
				if (!inScreen) {
					cells.push(["monitor_bezel", ox + dx, oy + dy]);
				} else if (!checker || ((dx - B) + (dy - B)) % 2 === 0) {
					cells.push(["screen_pixel", ox + dx, oy + dy]);
				}
			}
		}
		// neck (2 wide, 3 tall) + base (12 wide, 1 tall)
		for (let n = 0; n < 3; n++) {
			cells.push(["monitor_stand", cx - 1, oy + H + n]);
			cells.push(["monitor_stand", cx, oy + H + n]);
		}
		for (let b = -6; b < 6; b++) cells.push(["monitor_stand", cx + b, oy + H + 3]);

		// Make sure it all fits before touching anything
		for (let i = 0; i < cells.length; i++) {
			if (outOfBounds(cells[i][1], cells[i][2])) {
				deletePixel(pixel.x, pixel.y);
				return;
			}
		}
		deletePixel(pixel.x, pixel.y);
		for (let i = 0; i < cells.length; i++) {
			const x = cells[i][1], y = cells[i][2];
			if (pixelMap[x] && pixelMap[x][y]) deletePixel(x, y);
			createPixel(cells[i][0], x, y);
		}
	}

	elements.monitor_solid = {
		name: "Monitor (Solid)",
		color: "#4a5560",
		behavior: behaviors.WALL,
		category: "machines",
		state: "solid",
		desc: "Click to spawn a 24x14 monitor (click = top-left corner). Press powered colored wires against the screen to light pixels.",
		tick: function (pixel) { buildMonitor(pixel, false); },
	};

	elements.monitor_wireable = {
		name: "Monitor (Wireable)",
		color: "#5a6a78",
		behavior: behaviors.WALL,
		category: "machines",
		state: "solid",
		desc: "Click to spawn a 24x14 checkerboard monitor. Draw wires in the gaps: each powered wire lights the 4 pixels around it.",
		tick: function (pixel) { buildMonitor(pixel, true); },
	};

	if (typeof runAfterLoad === "function") {
		runAfterLoad(function () {
			if (!elements.red_wire) {
				console.warn("[color_screen] multicolor_wire.js isn't loaded; only regular wire (white) will light the screen.");
			}
		});
	}
})();

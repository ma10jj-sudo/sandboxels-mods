// Multicolor Wires + Screen + Power Button + Constant Converters - a Sandboxels mod
// Combines multicolor_wire.js and multicolor_wire_screen.js, plus a new part:
//
//   Constant Converters (Red/Blue/Green/Yellow) - once they receive power from any
//   source they latch ON and output a steady, continuous charge into wires of
//   THEIR color (like a battery) for as long as input keeps arriving. When the
//   input stops, they shut off after a short hold time.
//   They do NOT accept power from their own output color, so they can't feed
//   themselves and latch forever.
//
// All parts are in the "machines" category.

(function () {
	const COLORS = {
		red:    { dark: "#7a1b1b", on: "#ff4040", conv: ["#b8b8b8", "#ff4040"], rgb: [1, 0, 0] },
		blue:   { dark: "#1b2f7a", on: "#4a7dff", conv: ["#b8b8b8", "#4a7dff"], rgb: [0, 0, 1] },
		green:  { dark: "#1b6a2a", on: "#45ff6a", conv: ["#b8b8b8", "#45ff6a"], rgb: [0, 1, 0] },
		yellow: { dark: "#8a7a10", on: "#fff04a", conv: ["#b8b8b8", "#fff04a"], rgb: [1, 1, 0] },
	};

	const CONST_HOLD = 10; // ticks the constant converter stays ON after its last input

	const wireOf = {};  // element name -> color key
	const convOf = {};  // element name -> output color key (pulse converters)
	const constOf = {}; // element name -> output color key (constant converters)

	for (const key in COLORS) {
		const c = COLORS[key];
		const label = key.charAt(0).toUpperCase() + key.slice(1);

		// ---------- Wire ----------
		elements[key + "_wire"] = {
			name: label + " Wire",
			color: c.dark,
			colorOn: c.on,
			behavior: behaviors.WALL,
			category: "machines",
			state: "solid",
			conduct: 1,
			density: 8000,
			tempHigh: 1085,
			stateHigh: "molten_copper",
			desc: label + " wire. Only passes power to other " + key + " wires (and to devices). Use a converter to change colors.",
		};
		wireOf[key + "_wire"] = key;

		// ---------- Pulse converter (original) ----------
		elements[key + "_converter"] = {
			name: label + " Converter",
			color: c.conv,
			colorOn: c.on,
			behavior: behaviors.WALL,
			category: "machines",
			state: "solid",
			conduct: 1,
			density: 8000,
			tempHigh: 1085,
			stateHigh: "molten_copper",
			desc: "Takes power from any wire and outputs it ONLY into " + key + " wires.",
		};
		convOf[key + "_converter"] = key;

		// ---------- Constant-output converter (new) ----------
		const dim = c.dark;
		const bright = c.on;
		elements[key + "_constant_converter"] = {
			name: label + " Constant Converter",
			color: dim,
			behavior: behaviors.WALL,
			category: "machines",
			state: "solid",
			conduct: 1,
			density: 8000,
			tempHigh: 1085,
			stateHigh: "molten_copper",
			desc: "When powered, outputs a constant steady charge into " + key + " wires, like a battery. Ignores power from " + key + " wires.",
			tick: function (pixel) {
				if (!(pixel.active > 0)) {
					if (pixel.color !== dim) pixel.color = dim;
					return;
				}
				pixel.active--;
				if (pixel.color !== bright) pixel.color = bright;

				// Constant output: charge every neighbouring conductor each tick.
				for (let i = 0; i < adjacentCoords.length; i++) {
					const x = pixel.x + adjacentCoords[i][0];
					const y = pixel.y + adjacentCoords[i][1];
					if (pixelMap[x] === undefined || !pixelMap[x][y]) continue;
					const n = pixelMap[x][y];
					if (n.del) continue;
					const info = elements[n.element];
					if (!info || !info.conduct) continue;
					if (n.charge || n.chargeCD) continue;
					if (wireOf[n.element] !== undefined && wireOf[n.element] !== key) continue; // wrong color
					if (constOf[n.element] === key) continue; // don't ping-pong with same-color constant converters
					n.charge = 1;
					if (wireOf[n.element] === undefined && convOf[n.element] === undefined && constOf[n.element] === undefined) {
						n.from = key;
					}
				}
			},
		};
		constOf[key + "_constant_converter"] = key;
	}

	// Spread a charge from `pixel` as color `key`.
	function spreadFrom(pixel, key) {
		for (let i = 0; i < adjacentCoords.length; i++) {
			const x = pixel.x + adjacentCoords[i][0];
			const y = pixel.y + adjacentCoords[i][1];
			if (pixelMap[x] === undefined || !pixelMap[x][y]) continue;
			const n = pixelMap[x][y];
			if (n.del) continue;
			const info = elements[n.element];
			if (!info || !info.conduct) continue;
			if (n.charge || n.chargeCD) continue;

			const isWire = wireOf[n.element] !== undefined;
			const isConv = convOf[n.element] !== undefined;
			const isConst = constOf[n.element] !== undefined;

			if (isWire && wireOf[n.element] !== key) continue;      // blocked color
			if (isConst && constOf[n.element] === key) continue;    // constant converter ignores its own color
			if (Math.random() > info.conduct) continue;

			n.charge = 1;
			if (!isWire && !isConv && !isConst) n.from = key;
		}
		delete pixel.charge;
		pixel.chargeCD = 4;
	}

	if (typeof doElectricity === "function") {
		const origDoElectricity = doElectricity;
		doElectricity = function (pixel) {
			if (!pixel.charge) return origDoElectricity(pixel);

			const el = pixel.element;
			if (wireOf[el] !== undefined) return spreadFrom(pixel, wireOf[el]);
			if (convOf[el] !== undefined) return spreadFrom(pixel, convOf[el]);

			// Constant converter: input just (re)arms it; its tick() does the output.
			if (constOf[el] !== undefined) {
				pixel.active = CONST_HOLD;
				delete pixel.charge;
				pixel.chargeCD = 4;
				return;
			}

			// A normal conductor that was powered by one of our colors.
			if (pixel.from !== undefined) {
				const key = pixel.from;
				delete pixel.from;
				return spreadFrom(pixel, key);
			}
			return origDoElectricity(pixel);
		};
	} else {
		console.error("[multicolor_wire_combined] doElectricity not found; wires won't be color-isolated.");
	}

	// ---------- Screen pixel ----------
	const SOURCES = {
		wire: [1, 1, 1],
	};
	for (const key in COLORS) {
		SOURCES[key + "_wire"] = COLORS[key].rgb;
		SOURCES[key + "_converter"] = COLORS[key].rgb;
		SOURCES[key + "_constant_converter"] = COLORS[key].rgb;
	}
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
				if (!(n.charge || n.chargeCD || n.active > 0)) continue;
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
		changePixel(pixel, pixel.element === "power_button" ? "power_button_on" : "power_button");
	}

	// Click a power button (any tool selected) to toggle it.
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
			console.error("[multicolor_wire_combined] power button click error:", err);
		}
	}, true);
})();

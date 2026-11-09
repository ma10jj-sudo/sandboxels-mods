// Four Color Wires - a Sandboxels mod
// Adds Red / Blue / Green / Yellow wires. Each color carries power only to
// wires of the SAME color. They still power machines/devices next to them.
// To cross colors, use a Converter: it accepts power from ANY wire and
// outputs only into wires of its own color.

(function () {
	const COLORS = {
		red:    { dark: "#7a1b1b", on: "#ff4040", conv: ["#b8b8b8", "#ff4040"] },
		blue:   { dark: "#1b2f7a", on: "#4a7dff", conv: ["#b8b8b8", "#4a7dff"] },
		green:  { dark: "#1b6a2a", on: "#45ff6a", conv: ["#b8b8b8", "#45ff6a"] },
		yellow: { dark: "#8a7a10", on: "#fff04a", conv: ["#b8b8b8", "#fff04a"] },
	};

	const wireOf = {}; // element name -> color key
	const convOf = {}; // element name -> output color key

	for (const key in COLORS) {
		const c = COLORS[key];
		const label = key.charAt(0).toUpperCase() + key.slice(1);

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
	}

	// Spread a charge from `pixel` as color `key`.
	// - same-color wires: powered
	// - other-color wires: blocked
	// - converters: always accept
	// - anything else that conducts: powered, and tagged so it can't bridge
	//   the signal into a different-colored wire either
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

			if (isWire && wireOf[n.element] !== key) continue; // blocked color
			if (Math.random() > info.conduct) continue;

			n.charge = 1;
			if (!isWire && !isConv) n.from = key; // remember which color powered it
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

			// A normal conductor that was powered by one of our colors:
			// keep the color restriction going.
			if (pixel.from !== undefined) {
				const key = pixel.from;
				delete pixel.from;
				return spreadFrom(pixel, key);
			}
			return origDoElectricity(pixel);
		};
	} else {
		console.error("[four_color_wires] doElectricity not found; wires won't be color-isolated.");
	}
})();

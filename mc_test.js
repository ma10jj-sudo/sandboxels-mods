	// Elements the power button keeps constantly powered (the whole connected wire network)
	const WIRES = {
		wire: 1, red_wire: 1, green_wire: 1, blue_wire: 1, yellow_wire: 1,
	};
	const MAX_FLOOD = 10000;

	function holdOn(n) {
		n.charge = 1;
		delete n.chargeCD;
	}

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
		desc: "Power button, currently ON. Constantly powers every wire connected to it. Click it to turn it off.",
		tick: function (pixel) {
			const visited = new Set();
			const stack = [];

			// Seed: everything touching the button
			for (let i = 0; i < adjacentCoords.length; i++) {
				const x = pixel.x + adjacentCoords[i][0];
				const y = pixel.y + adjacentCoords[i][1];
				if (pixelMap[x] === undefined || !pixelMap[x][y]) continue;
				const n = pixelMap[x][y];
				if (n.element === "power_button_on") continue;
				const info = elements[n.element];
				if (!info || !info.conduct) continue;
				holdOn(n);
				if (WIRES[n.element] && !visited.has(n)) {
					visited.add(n);
					stack.push(n);
				}
			}

			// Flood through connected wires, holding each one charged
			while (stack.length && visited.size < MAX_FLOOD) {
				const p = stack.pop();
				for (let i = 0; i < adjacentCoords.length; i++) {
					const x = p.x + adjacentCoords[i][0];
					const y = p.y + adjacentCoords[i][1];
					if (pixelMap[x] === undefined || !pixelMap[x][y]) continue;
					const n = pixelMap[x][y];
					if (visited.has(n) || !WIRES[n.element]) continue;
					visited.add(n);
					holdOn(n);
					stack.push(n);
				}
			}
		},
	};

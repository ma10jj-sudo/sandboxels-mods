// Multichannel Wires Mod
// Red, Blue, Green, and Yellow independent power networks
// copy and paste the url in mod menu

function spreadChannelPower(pixel, channelName) {
    if(pixel.signalTimer === undefined) {
        pixel.signalTimer = 0;
    }

    if(pixel.signalTimer > 0) {
        pixel.signalTimer--;

        const dirs = [
            [1,0],
            [-1,0],
            [0,1],
            [0,-1]
        ];

        for(const dir of dirs) {
            let nx = pixel.x + dir[0];
            let ny = pixel.y + dir[1];

            let neighbor = pixelMap[nx]?.[ny];

            if(!neighbor) continue;

            // Continue along same wire color only
            if(
                neighbor.element === channelName &&
                (!neighbor.signalTimer || neighbor.signalTimer === 0)
            ) {
                neighbor.signalTimer = 2;
            }

            // Power anything conductive touching the wire
            if(
                neighbor.element !== channelName &&
                neighbor.conduct > 0
            ) {
                neighbor.charge = 1;
            }
        }
    }
}

function batteryPower(pixel, wireType) {
    const dirs = [
        [1,0],
        [-1,0],
        [0,1],
        [0,-1]
    ];

    for(const dir of dirs) {
        let neighbor =
            pixelMap[pixel.x + dir[0]]?.[pixel.y + dir[1]];

        if(neighbor && neighbor.element === wireType) {
            neighbor.signalTimer = 2;
        }
    }
}

// RED NETWORK

elements.red_power_wire = {
    color: "#ff3030",
    category: "tech",
    behavior: behaviors.WALL,
    noMix: true,
    tick(pixel) {
        spreadChannelPower(pixel,"red_power_wire");
    }
};

elements.red_battery = {
    color: "#aa0000",
    category: "tech",
    behavior: behaviors.WALL,
    tick(pixel) {
        batteryPower(pixel,"red_power_wire");
    }
};

// BLUE NETWORK

elements.blue_power_wire = {
    color: "#3399ff",
    category: "tech",
    behavior: behaviors.WALL,
    noMix: true,
    tick(pixel) {
        spreadChannelPower(pixel,"blue_power_wire");
    }
};

elements.blue_battery = {
    color: "#0044aa",
    category: "tech",
    behavior: behaviors.WALL,
    tick(pixel) {
        batteryPower(pixel,"blue_power_wire");
    }
};

// GREEN NETWORK

elements.green_power_wire = {
    color: "#22cc22",
    category: "tech",
    behavior: behaviors.WALL,
    noMix: true,
    tick(pixel) {
        spreadChannelPower(pixel,"green_power_wire");
    }
};

elements.green_battery = {
    color: "#007700",
    category: "tech",
    behavior: behaviors.WALL,
    tick(pixel) {
        batteryPower(pixel,"green_power_wire");
    }
};

// YELLOW NETWORK

elements.yellow_power_wire = {
    color: "#ffdd00",
    category: "tech",
    behavior: behaviors.WALL,
    noMix: true,
    tick(pixel) {
        spreadChannelPower(pixel,"yellow_power_wire");
    }
};

elements.yellow_battery = {
    color: "#bb9900",
    category: "tech",
    behavior: behaviors.WALL,
    tick(pixel) {
        batteryPower(pixel,"yellow_power_wire");
    }
};

import fs from "fs";
import path from "path";

const dataDir = "./data";

const list = JSON.parse(
    fs.readFileSync(path.join(dataDir, "_list.json"), "utf8")
);

const levels = [];

for (const levelPath of list) {
    const file = path.join(dataDir, `${levelPath}.json`);

    if (!fs.existsSync(file)) continue;

    const level = JSON.parse(
        fs.readFileSync(file, "utf8")
    );

    levels.push({
        path: levelPath,
        ...level,
    });
}

fs.writeFileSync(
    path.join(dataDir, "levels.json"),
    JSON.stringify(levels, null, 4)
);

console.log(`Built ${levels.length} levels.`);

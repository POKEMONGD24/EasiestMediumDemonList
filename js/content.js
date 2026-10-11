
import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = '/data';

const sheetURL =
    "https://docs.google.com/spreadsheets/d/1c_tyXFIWhv82d17LwP44cj3dheCEXQLeajvthDDdMzk/export?format=csv&gid=0";

/**
 * Fetch and parse Google Sheets CSV data.
 */
async function fetchSheet() {
    const result = await fetch(sheetURL);

    if (!result.ok) {
        throw new Error(`Failed to fetch Google Sheet: ${result.status}`);
    }

    const text = await result.text();

    const parsed = text.split(/\r?\n/).map(line => {
        const values = [];
        let current = "";
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (insideQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === "," && !insideQuotes) {
                values.push(current);
                current = "";
            } else {
                current += char;
            }
        }

        values.push(current);
        return values.map(v => v.trim());
    });

    const headers = parsed.shift().map(header =>
        header.replace(/^"|"$/g, "").trim()
    );

    return parsed
        .filter(row => row.some(value => value.trim() !== ""))
        .map(row => {
            const obj = {};

            headers.forEach((header, i) => {
                obj[header] = (row[i] ?? "").replace(/^"|"$/g, "").trim();
            });

            return obj;
        });
}

/**
 * Cache the spreadsheet data and index rows by level ID.
 * The sheet is downloaded only once per page session.
 */
let sheetIndexPromise = null;

async function fetchSheetIndex() {
    if (!sheetIndexPromise) {
        sheetIndexPromise = fetchSheet()
            .then(rows => new Map(
                rows
                    .filter(row => row.ID !== undefined && row.ID !== "")
                    .map(row => [
                        String(row.ID).trim(),
                        row
                    ])
            ))
            .catch(error => {
                sheetIndexPromise = null;
                throw error;
            });
    }

    return sheetIndexPromise;
}

/**
 * Load list levels and inject spreadsheet metadata.
 */
export async function fetchList() {
    let sheetIndex;

    try {
        sheetIndex = await fetchSheetIndex();
    } catch (error) {
        console.error("Failed to load Google Sheets metadata:", error);
        return null;
    }

    const packs = await fetchPacks();
    const levelToPacks = {};

    if (packs) {
        packs.forEach(pack => {
            (pack.levels ?? []).forEach(levelId => {
                (levelToPacks[levelId] ??= []).push({
                    name: pack.name,
                    colour: pack.colour,
                });
            });
        });
    }

    const listResult = await fetch(`${dir}/_list.json`);

    try {
        const list = await listResult.json();

        return await Promise.all(
            list.map(async (path, rank) => {
                const levelResult = await fetch(`${dir}/${path}.json`);

                try {
                    const level = await levelResult.json();

                    const sheetLevel = sheetIndex.get(
                        String(level.id).trim()
                    );

                    return [
                        {
                            ...level,
                            path,

                            length: sheetLevel?.Length ?? "",
                            tier: sheetLevel?.Tier ?? "",
                            enjoyment: sheetLevel?.Enjoyment ?? "",
                            mdsTier: sheetLevel?.["MDS Tier"] ?? "",

                            // Inject pack membership.
                            packs: levelToPacks[path] ?? [],

                            records: (level.records ?? [])
                                .map(({ hz, ...rest }) => rest)
                                .sort((a, b) => b.percent - a.percent),
                        },
                        null,
                    ];
                } catch {
                    console.error(
                        `Failed to load level #${rank + 1} ${path}.`
                    );

                    return [null, path];
                }
            })
        );
    } catch {
        console.error("Failed to load list.");
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        return await editorsResults.json();
    } catch {
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    if (!list) {
        return null;
    }

    const scoreMap = {};
    const errs = [];

    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verification
        const verifier = Object.keys(scoreMap).find(
            u => u.toLowerCase() === (level.verifier || "").toLowerCase()
        ) || level.verifier;

        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };

        const { verified } = scoreMap[verifier];

        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // Records
        level.records.forEach(record => {
            const user = Object.keys(scoreMap).find(
                u => u.toLowerCase() === (record.user || "").toLowerCase()
            ) || record.user;

            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };

            const { completed, progressed } = scoreMap[user];

            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    levelPath: level.path,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                });

                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                levelPath: level.path,
                percent: record.percent,
                score: score(
                    rank + 1,
                    record.percent,
                    level.percentToQualify
                ),
                link: record.link,
            });
        });
    });

    // Calculate total player scores.
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;

        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            total: round(total),
            packs: [],
            ...scores,
        };
    });

    /* ================= PACK COMPLETION ================= */

    const packs = await fetchPacks();

    if (packs) {
        res.forEach(player => {
            const completedIds = new Set(
                player.completed
                    .map(level => level.levelPath)
                    .filter(Boolean)
            );

            player.packs = packs.filter(pack => {
                const levels = pack.levels ?? [];

                if (levels.length === 0) {
                    return false;
                }

                return levels.every(levelId => completedIds.has(levelId));
            });
        });
    } else {
        res.forEach(player => {
            player.packs = [];
        });
    }

    /* =================================================== */

    return [res.sort((a, b) => b.total - a.total), errs];
}

export async function fetchPacks() {
    try {
        const res = await fetch(`${dir}/_packlist.json`);
        return await res.json();
    } catch {
        return null;
    }
}

export async function fetchPackLevels(packName) {
    try {
        const packs = await fetchPacks();

        if (!packs) {
            return null;
        }

        const pack = packs.find(p => p.name === packName);

        if (!pack) {
            return null;
        }

        return await Promise.all(
            pack.levels.map(async (path, idx) => {
                try {
                    const levelRes = await fetch(`${dir}/${path}.json`);
                    const level = await levelRes.json();

                    return [
                        {
                            level: {
                                ...level,
                                path,
                                records: (level.records ?? [])
                                    .map(({ hz, ...rest }) => rest)
                                    .sort((a, b) => b.percent - a.percent),
                            }
                        },
                        null
                    ];
                } catch {
                    console.error(
                        `Failed to load pack level #${idx + 1}: ${path}.json`
                    );

                    return [null, path];
                }
            })
        );
    } catch {
        return null;
    }
}

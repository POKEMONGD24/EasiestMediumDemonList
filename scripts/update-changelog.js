#!/usr/bin/env node
/**
 * Record changes between the previous and current data/_list.json.
 * Rank positions in the current site are 1-based.
 */
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const listPath = 'data/_list.json';
const historyPath = 'data/changelog.json';
const baseSha = process.env.BASE_SHA;

function readJsonFile(path) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
}
function readPreviousList() {
    const candidates = [];
    if (baseSha && !/^0+$/.test(baseSha)) candidates.push(`${baseSha}:${listPath}`);
    candidates.push(`HEAD^:${listPath}`);
    for (const ref of candidates) {
        try {
            return JSON.parse(execFileSync('git', ['show', ref], { encoding: 'utf8' }));
        } catch (_) {
            // Try the next possible base revision.
        }
    }
    return null;
}
function listName(rank) {
    if (rank <= 75) return 'Main List';
    if (rank <= 150) return 'Extended List';
    return 'Legacy List';
}
function rankMap(names) {
    const result = new Map();
    names.forEach((name, index) => {
        result.set(name.trim(), index + 1);
    });
    return result;
}

const current = readJsonFile(listPath);
const previous = readPreviousList();
let history = [];
try {
    history = readJsonFile(historyPath);
    if (!Array.isArray(history)) history = [];
} catch (_) {
    history = [];
}

// No historical baseline means we can't accurately claim what changed.
// The next list update will be compared against this current list.
if (!previous) {
    console.log('No previous list snapshot available; initialized history without inventing entries.');
    if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, '[]\n');
    process.exit(0);
}

const oldRanks = rankMap(previous);
const newRanks = rankMap(current);
const today = new Date().toISOString().slice(0, 10);
const additions = [];
let nextId = history.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1;

for (const [level, toRank] of newRanks) {
    const fromRank = oldRanks.get(level);
    if (fromRank === undefined) {
        additions.push({
            id: nextId++,
            date: today,
            level,
            action: 'Placed',
            fromRank: null,
            toRank,
            fromList: null,
            toList: listName(toRank),
        });
    } else if (fromRank !== toRank) {
        additions.push({
            id: nextId++,
            date: today,
            level,
            action: 'Moved',
            fromRank,
            toRank,
            fromList: listName(fromRank),
            toList: listName(toRank),
        });
    }
}
for (const [level, fromRank] of oldRanks) {
    if (!newRanks.has(level)) {
        additions.push({
            id: nextId++,
            date: today,
            level,
            action: 'Removed',
            fromRank,
            toRank: null,
            fromList: listName(fromRank),
            toList: null,
        });
    }
}

history.push(...additions);
fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
console.log(`Recorded ${additions.length} changelog entries.`);

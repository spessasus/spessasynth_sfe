import * as fs from "node:fs/promises";
import path from "node:path";
import { buildGroup } from "./framework/group_build";
import { writeSite } from "./site/build_site";
import { groupBaseName } from "./framework/types";
import { Report } from "./framework/verify";
import { ALL_GROUPS, GROUPS } from "./groups";

const DIST = path.resolve(import.meta.dirname, "..", "dist");

async function main() {
    const args = process.argv.slice(2);
    // `--only GEN-19,GEN-20` keeps only those tests, for working on a test. The page and the zip are skipped then.
    const onlyIndex = args.indexOf("--only");
    const only =
        onlyIndex === -1
            ? undefined
            : new Set(args.splice(onlyIndex, 2)[1]?.split(","));
    if (only?.size === 0 || only?.has(""))
        throw new Error("--only needs test ids, such as --only GEN-01,GEN-02");
    const selected = new Set(args.map(Number));
    const groups = GROUPS.filter(
        (g) => selected.size === 0 || selected.has(g.number)
    );
    if (groups.length === 0)
        throw new Error(`No group matches ${[...selected].join(", ")}`);
    // A full build starts from an empty folder, so a renamed or removed group leaves nothing behind
    if (selected.size === 0 && !only)
        await fs.rm(DIST, { recursive: true, force: true });
    await fs.mkdir(DIST, { recursive: true });

    // The open questions count too, so a clash shows before they are answered
    const ids = new Set<string>();
    for (const group of ALL_GROUPS)
        for (const test of group.tests) {
            // An id may repeat across groups but not inside one.
            // Preset selection rows need several banks, with one part of the row in each group.
            const key = `${group.number}/${test.id}`;
            if (ids.has(key))
                throw new Error(
                    `The test ${test.id} appears twice in group ${group.number}`
                );
            ids.add(key);
        }

    if (only) {
        const known = new Set(groups.flatMap((g) => g.tests.map((t) => t.id)));
        const unknown = [...only].filter((id) => !known.has(id));
        if (unknown.length > 0)
            throw new Error(
                `No test in the selected groups has the id ${unknown.join(", ")}`
            );
    }

    const report = new Report();
    const files = new Array<string>();
    for (const group of groups) {
        const tests = only
            ? group.tests.filter((t) => only.has(t.id))
            : group.tests;
        // With --only, a group without any of the tests is left alone, so its files in dist/ stay as they are
        if (only && tests.length === 0) continue;
        try {
            files.push(
                ...(await buildGroup({ ...group, tests }, report, DIST))
            );
        } catch (error) {
            report.error(
                `${groupBaseName(group)}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
            );
        }
    }

    // The pages and the zip list every group, so they are only written by a full build
    if (selected.size === 0 && !only) await writeSite(DIST, GROUPS, files);

    // A group left out because all its tests wait for the owner still reports them
    for (const group of ALL_GROUPS.filter(
        (g) => selected.size === 0 || selected.has(g.number)
    ))
        for (const test of group.tests)
            if (test.openQuestion)
                report.warn(
                    `${test.id} is left out until the owner answers: ${test.openQuestion}`
                );

    console.info(
        `\n${report.warnings.length} warning(s), ${report.errors.length} error(s)`
    );
    for (const warning of report.warnings) console.warn(`WARN  ${warning}`);
    for (const error of report.errors) console.error(`ERROR ${error}`);
    if (report.errors.length > 0) process.exit(1);
}

await main();

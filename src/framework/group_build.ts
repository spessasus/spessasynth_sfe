import * as fs from "node:fs/promises";
import path from "node:path";
import { BasicSoundBank } from "spessasynth_core";
import { BankBuilder } from "./bank_builder";
import { groupFiles } from "./catalogue";
import { addClick, DEFAULT_CLICK_CHANNEL, playClick } from "./click";
import { encodeFLAC } from "./flac";
import {
    layoutTests,
    TEST_OFFSET,
    Timeline,
    writeGroupMIDI
} from "./midi_writer";
import { RIFFFile } from "./patch";
import { loadBank, renderFiles } from "./render";
import { type AnyTest, type Group, groupBaseName } from "./types";
import { type Report, verifyTests } from "./verify";
import { checkWrittenBank } from "./writer_checks";

/**
 * Builds the bank of a group and returns the bank and the handles of each test.
 */
function buildBank(group: Group) {
    const bank = new BasicSoundBank("sfe", group.dmod === "default");
    const builder = new BankBuilder(bank);
    if (typeof group.dmod === "function") group.dmod(bank, builder);
    if (group.clickChannel !== null) addClick(builder);
    const handles = group.tests.map((test) => test.bank(builder) as unknown);
    bank.soundBankInfo.name = groupBaseName(group);
    // A fixed date, so the same code writes the same bank every time
    bank.soundBankInfo.creationDate = new Date("2026-01-01T00:00:00Z");
    // Keep the order the tests made, which the preset selection groups rely on
    bank.flush(false);
    return { bank, handles };
}

/**
 * Builds the timeline of a test with its preamble, and returns it with what the test's `midi` returned.
 */
function buildTimeline(group: Group, test: AnyTest, handle: unknown) {
    const timeline = new Timeline(test.id, test.length);
    const channels = test.channels ?? [0];
    const clickChannel =
        group.clickChannel === undefined
            ? DEFAULT_CLICK_CHANNEL
            : group.clickChannel;
    timeline.preamble(() => {
        timeline.marker(-TEST_OFFSET, `${test.id} ${test.title}`);
        if (group.preamble !== "none") timeline.gsReset(-TEST_OFFSET);
        if (clickChannel !== null)
            playClick(timeline, -TEST_OFFSET, clickChannel);
        if (group.preamble === undefined || group.preamble === "gs-reset")
            for (const ch of channels) {
                timeline.cc(-TEST_OFFSET + 0.2, ch, 91, 0);
                timeline.cc(-TEST_OFFSET + 0.2, ch, 93, 0);
            }
    });
    const result: unknown = test.midi(timeline, handle);
    return { timeline, result };
}

/**
 * Writes a group's bank and MIDI file into the folder, renders and verifies it, and returns the names of its files.
 */
export async function buildGroup(group: Group, report: Report, dist: string) {
    const base = groupBaseName(group);
    console.info(`${base}: ${group.tests.length} tests`);
    const { bank, handles } = buildBank(group);
    let bytes = new Uint8Array(
        bank.writeSFe({
            rf64: group.rf64 ?? false,
            software: "spessasynth_sfe"
        })
    );
    // The writer checks look at core's output, so a patched bank is checked before its patch
    for (const problem of checkWrittenBank(bytes, bank))
        report.error(`${base}: writer check: ${problem}`);
    if (group.patch) {
        const riff = RIFFFile.parse(bytes);
        group.patch(riff);
        bytes = riff.write();
    }

    const layout = layoutTests(group.tests);
    const built = layout.map((l, i) =>
        buildTimeline(group, l.test, handles[i])
    );
    const results = built.map((b) => b.result);
    const midi = writeGroupMIDI(
        group,
        built.map((b, i) => ({ layout: layout[i], timeline: b.timeline }))
    );

    await fs.writeFile(path.join(dist, `${base}.sf4`), bytes);
    await fs.writeFile(path.join(dist, `${base}.mid`), midi);
    // The same list the page and TESTS.md link
    const files = groupFiles(group);

    const expect = group.expect ?? "load";
    if (expect !== "load") {
        let loaded = false;
        try {
            loadBank(bytes);
            loaded = true;
        } catch (error) {
            // The reason shows in the log, so a patch that breaks the bank some other way is noticed
            console.info(
                `  ok   core rejects the bank: ${error instanceof Error ? error.message : String(error)}`
            );
        }
        if (loaded && group.coreFinding)
            report.warn(
                `${base}: core loads it, as noted (${group.coreFinding})`
            );
        else if (loaded)
            report.error(`${base}: core loads a bank that must be rejected`);
        else if (group.coreFinding)
            report.error(
                `${base}: core now rejects it, remove its coreFinding note`
            );
        return files;
    }

    if (group.checkLoaded) {
        const problems = group.checkLoaded(loadBank(bytes));
        for (const problem of problems)
            report.error(`${base}: loaded bank: ${problem}`);
        if (problems.length === 0)
            console.info("  ok   the loaded bank passes its checks");
    }

    // Core's MIDI duration ends at the last note event, so the last slot can reach further
    const { left, right } = await renderFiles(bytes, midi, {
        effects: group.effects ?? false,
        minimumSeconds: layout.length > 0 ? layout[layout.length - 1].end : 0
    });

    let peak = 0;
    for (let i = 0; i < left.length; i++)
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    if (peak > 1)
        report.error(
            `${base}: the render peaks at ${(20 * Math.log10(peak)).toFixed(2)} dBFS`
        );

    verifyTests(layout, handles, results, left, right, report);

    await fs.writeFile(
        path.join(dist, `${base}-reference.flac`),
        await encodeFLAC(left, right)
    );
    return files;
}

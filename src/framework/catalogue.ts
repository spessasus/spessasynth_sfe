import { layoutTests } from "./midi_writer";
import { type AnyTest, type Group, groupBaseName } from "./types";

/**
 * The files of a group, in the order they are listed.
 */
export function groupFiles(group: Group) {
    const base = groupBaseName(group);
    const files = [`${base}.sf4`, `${base}.mid`];
    if ((group.expect ?? "load") === "load")
        files.push(`${base}-reference.flac`);
    return files;
}

/**
 * The note on a group whose bank a reader must or should reject, or undefined.
 */
export function rejectNote(group: Group) {
    if (group.expect === "reject")
        return "A reader must reject this bank, so it has no reference render.";
    if (group.expect === "reject-should")
        return "A reader should reject this bank, so it has no reference render.";
    return undefined;
}

/**
 * "Section" or "Sections", for a group's list of sections.
 */
export function sectionsLabel(sections: string) {
    return /,| to /.test(sections) ? "Sections" : "Section";
}

/**
 * A time in seconds as m:ss.
 */
export function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * Throws when a test's texts can't be read without the reference file.
 */
export function checkTexts(test: AnyTest) {
    for (const [field, text] of [
        ["title", test.title],
        ["description", test.description],
        ["pass", test.pass]
    ])
        if (text.trim().length === 0)
            throw new Error(`${test.id}: the ${field} is empty`);
    if (test.pass.trim() === test.description.trim())
        throw new Error(
            `${test.id}: the pass criterion only repeats the description`
        );
}

/**
 * How to run a group, at the top of TESTS.md.
 */
const RUNNING = `Each group is a set of files with the same base name:

- \`sfe4-<nn>-<slug>.sf4\`: the bank.
- \`sfe4-<nn>-<slug>.mid\`: the MIDI file that plays it (format 1, 480 ticks per quarter, 120 BPM).
- \`sfe4-<nn>-<slug>-reference.flac\`: the render of spessasynth_core, 48 kHz, 16 bit, lossless.

To run a group:

1. Start the synthesizer under test, freshly, with only the group's bank loaded.
2. Render or play the group's MIDI file at 48 kHz if you can, so a waveform lines up with the reference.
3. For every test below, compare what you hear or see with its pass criterion. The reference render shows what a
   pass looks like, but every criterion can be checked without it.

Unless a group says otherwise, every test starts on a whole second, with a short click on channel 16, a marker meta
event that holds its id and title, and a GS Reset that puts the synthesizer back into a known state. Its own notes
start half a second later.

A criterion marked "(should)" or "(may)" follows the wording of the specification. A synthesizer that differs there is
not wrong.

Most banks have no default modulators, so velocity, CC 7 and the pitch wheel do nothing unless a test says so. Levels
are relative: "the reference tone" is the \`sine\` sample at key 69, played with no generator set apart from its loop
and a release of 0.1 s.

A few groups need something from the player and say so: a MIDI file with two ports, a freshly started synthesizer,
or a bank that a reader must reject.`;

/**
 * TESTS.md of the zip: how to run a group, then every group and test.
 */
export function testsMarkdown(groups: Group[]) {
    const lines = ["# SFe 4 Spec Test", "", RUNNING, ""];
    for (const group of groups) {
        lines.push(
            `## ${groupBaseName(group)}: ${group.title}`,
            "",
            `${sectionsLabel(group.sections)} ${group.sections}. ${group.intro}`,
            ""
        );
        if (group.playerNote)
            lines.push(`> **Player:** ${group.playerNote}`, "");
        const reject = rejectNote(group);
        if (reject) lines.push(reject, "");
        if (group.coreFinding)
            lines.push(`> **Core finding:** ${group.coreFinding}`, "");
        lines.push(
            `Files: ${groupFiles(group)
                .map((f) => `\`${f}\``)
                .join(", ")}`,
            ""
        );
        for (const slot of layoutTests(group.tests)) {
            const test = slot.test;
            checkTexts(test);
            lines.push(
                `### ${test.id}: ${test.title}`,
                "",
                `Starts at ${formatTime(slot.start)}. Section ${test.section}.`,
                "",
                `**What it plays:** ${test.description}`,
                "",
                `**Pass:** ${test.pass}`,
                ""
            );
            if (test.coreFinding)
                lines.push(`**Core finding:** ${test.coreFinding}`, "");
        }
    }
    return `${lines.join("\n").trimEnd()}\n`;
}

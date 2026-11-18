import { GeneratorTypes as G, type Modulator } from "spessasynth_core";
import { defaultState, modulatorOutput } from "../../framework/modulator_eval";
import {
    type BankBuilder,
    cc,
    mod,
    none,
    src
} from "../../framework/bank_builder";
import { centsFrom440, frequency, levelDb } from "../../framework/measure";
import type { RIFFFile } from "../../framework/patch";
import {
    EXTENDED_FLAG,
    type ModRecord,
    readMods,
    writeMods,
    XMOD_SIZE
} from "../../framework/records";
import {
    type AnyTest,
    defineTest,
    type Group,
    type PresetRef
} from "../../framework/types";

/**
 * What a modulator adds after a reset (CC 11 at 127, the No Controller source at 16384, exactly 1), worked out the
 * way the specification does.
 */
function centsOf(modulator: Modulator) {
    return modulatorOutput(modulator, defaultState());
}

/**
 * Core adds each modulator in whole cents, and the specification doesn't define the rounding, so a statement gets
 * a few cents of room. Statements differ by hundreds of cents, so that is still far from a mix-up.
 */
const STATEMENT_CENTS = 5;

/**
 * A pitch modulator and the cents it adds when it acts.
 */
export interface PitchMod {
    modulator: Modulator;
    cents: number;
}

/**
 * A constant modulator to `fineTune` through the No Controller source.
 */
export function plain(amount: number) {
    const modulator = mod(none(), none(), G.fineTune, amount);
    return { modulator, cents: centsOf(modulator) };
}

/**
 * A modulator to `fineTune` from CC 11, which stays at 127. It differs from `plain`, so both can be in one zone
 * without being identical.
 */
export function viaCC11(amount: number) {
    const modulator = mod(cc(11), none(), G.fineTune, amount);
    return { modulator, cents: centsOf(modulator) };
}

/**
 * A custom curve modulator to `fineTune`: the No Controller source through a flat curve at `y`, so it adds
 * `amount * y / 16384`. Each call adds a curve of its own to the bank.
 */
export function curved(b: BankBuilder, y: number, amount: number) {
    const modulator = mod(
        src(0, {
            curve: b.curve(
                [
                    [0, y],
                    [16_384, y]
                ],
                `flat ${y}`
            )
        }),
        none(),
        G.fineTune,
        amount
    );
    return { modulator, cents: centsOf(modulator) };
}

/**
 * One statement of a probe bank: a preset and the pitch its note must play.
 */
export interface Statement {
    label: string;
    /**
     * The expected pitch in cents from 440 Hz.
     */
    cents: number;
    build: (b: BankBuilder) => PresetRef;
    /**
     * A controller set before the note and back to 0 after it.
     */
    cc?: [controller: number, value: number];
}

/**
 * A preset of the `sine` with the modulators of its instrument zone, and of its preset zone.
 */
export function pitchPreset(
    b: BankBuilder,
    name: string,
    zone: Modulator[],
    preset: Modulator[] = []
) {
    return b.preset({
        name,
        zones: [{ sample: b.sample("sine"), modulators: zone }],
        presetModulators: preset.length > 0 ? preset : undefined
    });
}

/**
 * The seconds between two statements: the test note, then its partner, a plain `sine` tuned to the pitch a pass
 * should have.
 */
const SPACING = 1;

/**
 * A test made of statements. Each statement plays its note, then a partner note that sounds as a pass should.
 */
export function statementTest(spec: {
    id: string;
    title: string;
    section: string;
    description: string;
    pass: string;
    statements: Statement[];
    coreFinding?: string;
    openQuestion?: string;
    /**
     * Set for a bank that must be rejected: the texts then leave out the notes, which never play.
     */
    rejected?: boolean;
}) {
    const lines = spec.statements.map(
        (s) => `${s.label}: ${s.cents.toFixed(0)} cents`
    );
    return defineTest({
        id: spec.id,
        title: spec.title,
        section: spec.section,
        coreFinding: spec.coreFinding,
        openQuestion: spec.openQuestion,
        description: spec.rejected
            ? spec.description
            : `${spec.description} Each note is followed by a plain \`sine\` at the pitch a pass should have.`,
        pass: spec.rejected
            ? spec.pass
            : `${spec.pass} Expected, note by note, in cents from 440 Hz: ${lines.join(". ")}.`,
        length: spec.statements.length * SPACING,
        bank: (b) =>
            spec.statements.map((s) => ({
                test: s.build(b),
                partner: b.tone(`${spec.id} ${Math.round(s.cents)} cents`, {
                    [G.fineTune]: Math.round(s.cents)
                })
            })),
        midi: (m, presets) => {
            for (const [i, p] of presets.entries()) {
                const set = spec.statements[i].cc;
                m.program(i * SPACING, 0, p.test);
                if (set) m.cc(i * SPACING, 0, set[0], set[1]);
                m.note(i * SPACING + 0.05, 0.4);
                if (set) m.cc(i * SPACING + 0.49, 0, set[0], 0);
                m.program(i * SPACING + 0.5, 0, p.partner);
                m.note(i * SPACING + 0.55, 0.4);
            }
        },
        verify: (r) => {
            for (const [i, s] of spec.statements.entries()) {
                const t = i * SPACING + 0.05;
                const x = r.at(t + 0.1, t + 0.35);
                if (levelDb(x) < -60) {
                    r.check(`${s.label}: sounds`, false, "silence");
                    continue;
                }
                r.cents(
                    `${s.label}, in cents`,
                    centsFrom440(frequency(x)),
                    s.cents,
                    STATEMENT_CENTS
                );
            }
        }
    });
}

/**
 * A modulator of a `pdta` sub-chunk with its extended record, if it has the flag.
 */
export interface ModEntry {
    record: ModRecord;
    extended?: Uint8Array;
}

/**
 * Edits the modulators of `pmod` or `imod` together with their extended records in `xdta`, so the records keep
 * matching unless the edit means to break that. The records are read while they still match (as the writer made
 * them), and written back after the edit: one for each modulator with the flag, in order, then the terminal one.
 * A modulator that gets the flag without a record gets a record of zeros.
 */
export function editMods(
    riff: RIFFFile,
    chunk: "pmod" | "imod",
    edit: (find: (amount: number) => ModEntry) => void
) {
    const main = riff.find(`LIST:pdta/${chunk}`);
    const extended = riff.find(`LIST:INFO/LIST:xdta/${chunk}`);
    const records = readMods(main.data);
    const terminal = records.pop()!;
    let next = 0;
    const entries: ModEntry[] = records.map((record) => {
        if (!(record.transform & EXTENDED_FLAG)) return { record };
        const o = next++ * XMOD_SIZE;
        return {
            record,
            extended: extended.data.slice(o, o + XMOD_SIZE)
        };
    });
    const find = (amount: number) => {
        const found = entries.filter((e) => e.record.amount === amount);
        if (found.length !== 1)
            throw new Error(
                `${found.length} modulators with the amount ${amount} in ${chunk}, expected 1`
            );
        return found[0];
    };
    edit(find);
    main.setData(writeMods([...entries.map((e) => e.record), terminal]));
    const flagged = entries.filter((e) => e.record.transform & EXTENDED_FLAG);
    const data = new Uint8Array((flagged.length + 1) * XMOD_SIZE);
    for (const [i, e] of flagged.entries())
        if (e.extended) data.set(e.extended, i * XMOD_SIZE);
    extended.setData(data);
}

/**
 * A reader group: a small bank of its own with one test and an empty `DMOD` unless it says otherwise.
 */
export function readerGroup(
    spec: Omit<Group, "tests" | "dmod"> & {
        test: AnyTest;
        dmod?: Group["dmod"];
    }
): Group {
    const { test, ...fields } = spec;
    return { dmod: "empty", ...fields, tests: [test] };
}

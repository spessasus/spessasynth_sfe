import { GeneratorTypes as G } from "spessasynth_core";
import { centsFrom440, frequency, levelDb } from "../../framework/measure";
import { type GenRecord, patchGen } from "../../framework/records";
import { defineTest, type Group, type TestRender } from "../../framework/types";
import { readerGroup } from "./common";

/**
 * The generators of spec section 7.1.1 that hold the upper 16 bits of `instrument` and `sampleID`.
 */
const INSTRUMENT_MSB = 90;
const SAMPLE_ID_MSB = 91;

/**
 * The semitones of the `coarseTune` that CON-23 places before or after the terminal generator.
 */
const LATE_SEMITONES = 12;

/**
 * Moves the patched record behind the terminal generator (`instrument` or `sampleID`) that follows it.
 */
function moveBehindTerminal(records: GenRecord[], index: number) {
    const next = records[index + 1];
    if (next?.operator !== G.instrument && next?.operator !== G.sampleID)
        throw new Error(
            `The record after generator ${index} is ${next?.operator}, not instrument or sampleID`
        );
    records[index + 1] = records[index];
    records[index] = next;
}

/**
 * The CON-21 cases in play order. The bank writes a placeholder `fineTune` with a unique amount in each zone, and
 * the patch turns it into an MSB generator with its value. Core's writer puts `instrument` and `sampleID` last, so
 * the placeholder sits before them, and `after` moves it behind them.
 */
const CASES: {
    label: string;
    level: "preset" | "instrument" | "global";
    placeholder: number;
    operator: number;
    value: number;
    after?: boolean;
    sounds: boolean;
}[] = [
    {
        label: "instrumentMSB 1 in the preset zone (an instrument past the bank)",
        level: "preset",
        placeholder: 3,
        operator: INSTRUMENT_MSB,
        value: 1,
        sounds: false
    },
    {
        label: "instrumentMSB 0 in the preset zone",
        level: "preset",
        placeholder: 5,
        operator: INSTRUMENT_MSB,
        value: 0,
        sounds: true
    },
    {
        label: "sampleIDMSB 1 in the instrument zone (a sample past the bank)",
        level: "instrument",
        placeholder: 11,
        operator: SAMPLE_ID_MSB,
        value: 1,
        sounds: false
    },
    {
        label: "sampleIDMSB 1 in the preset zone (the wrong level)",
        level: "preset",
        placeholder: 7,
        operator: SAMPLE_ID_MSB,
        value: 1,
        sounds: true
    },
    {
        label: "instrumentMSB 1 in the instrument zone (the wrong level)",
        level: "instrument",
        placeholder: 13,
        operator: INSTRUMENT_MSB,
        value: 1,
        sounds: true
    },
    {
        label: "sampleIDMSB 1 in the global instrument zone",
        level: "global",
        placeholder: 17,
        operator: SAMPLE_ID_MSB,
        value: 1,
        sounds: true
    },
    {
        label: "instrumentMSB 1 after `instrument` in the preset zone",
        level: "preset",
        placeholder: 19,
        operator: INSTRUMENT_MSB,
        value: 1,
        after: true,
        sounds: true
    },
    {
        label: "sampleIDMSB 1 after `sampleID` in the instrument zone",
        level: "instrument",
        placeholder: 23,
        operator: SAMPLE_ID_MSB,
        value: 1,
        after: true,
        sounds: true
    }
];

/**
 * Checks each step of a test: silent, or the reference level at the expected pitch.
 */
function checkSteps(r: TestRender, steps: { label: string; cents?: number }[]) {
    const reference = levelDb(r.at(0.15, 0.55));
    for (const [i, step] of steps.entries()) {
        const x = r.at(i + 1.15, i + 1.55);
        const level = levelDb(x) - reference;
        if (step.cents === undefined) {
            r.check(
                `${step.label}: silent`,
                level < -60,
                `${level.toFixed(1)} dB`
            );
            continue;
        }
        r.near(
            `${step.label}: level against the reference, in dB`,
            level,
            0,
            0.5
        );
        r.cents(
            `${step.label}, in cents`,
            centsFrom440(frequency(x)),
            step.cents
        );
    }
}

const CON_21 = defineTest({
    id: "CON-21",
    title: "instrumentMSB and sampleIDMSB",
    section: "7.1.1, 5.5",
    description: `The reference tone, then eight presets of the \`sine\` in a small bank, each with one of the generators \`instrumentMSB\` (90) and \`sampleIDMSB\` (91): ${CASES.map((c) => c.label).join(", ")}.`,
    pass: `${CASES.map((c) => `${c.label}: ${c.sounds ? "plays 440 Hz" : "silent"}`).join(". ")}. An MSB of 1 makes the index 65536 plus the 16-bit value, past every instrument and sample of this bank, so the reader ignores the zone. The generators only count in a zone at their own level, before the generator they extend, and are ignored anywhere else.`,
    length: CASES.length + 1,
    bank: (b) => [
        b.reference(),
        ...CASES.map((c) => {
            const name = `CON-21 ${c.label}`;
            const sine = b.sample("sine");
            if (c.level === "preset")
                return b.preset({
                    name,
                    zones: [{ sample: sine }],
                    presetGenerators: { [G.fineTune]: c.placeholder }
                });
            if (c.level === "instrument")
                return b.preset({
                    name,
                    zones: [
                        {
                            sample: sine,
                            generators: { [G.fineTune]: c.placeholder }
                        }
                    ]
                });
            const inst = b.instrument(name, [{ sample: sine }]);
            inst.globalZone.setGenerator(G.fineTune, c.placeholder);
            return b.preset({ name, zones: inst });
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 0.6 }),
    verify: (r) =>
        checkSteps(
            r,
            CASES.map((c) => ({
                label: c.label,
                cents: c.sounds ? 0 : undefined
            }))
        )
});

/**
 * The instrument indices of CON-22. The decoy has the same lower 16 bits as the instrument past 65535.
 */
const LOW = 5;
const SIGNED = 32_768;
const HIGH = 65_536 + LOW;

/**
 * The pitch of each instrument that a CON-22 preset may reach, in cents. Every other instrument plays 440 Hz.
 */
const PITCH = { decoy: -500, signed: 300, high: 700 } as const;

/**
 * The `fineTune` placeholder that the patch turns into `instrumentMSB` 1.
 */
const HIGH_PLACEHOLDER = 29;

const CON_22 = defineTest({
    id: "CON-22",
    title: "Instrument indices above 32767 and 65535",
    section: "7.1.1, 5.5",
    description: `The reference tone, then two presets of a bank with ${HIGH + 1} instruments of the \`sine\`. The first refers to instrument ${SIGNED}, which plays ${PITCH.signed} cents up. The second refers to instrument ${LOW} with \`instrumentMSB\` 1, so to instrument ${HIGH}, which plays ${PITCH.high} cents up. Instrument ${LOW} itself plays ${PITCH.decoy} cents, and the others 440 Hz. The bank has more than 65535 instrument zones, so a reader also needs the 32-bit bag and generator indices of the \`xdta-list\` chunk (5.5).`,
    pass: `The two presets play ${PITCH.signed} and ${PITCH.high} cents above 440 Hz. \`instrument\` is read as an unsigned WORD, so ${SIGNED} is not negative, and the index is \`(instrumentMSB << 16) | instrument\`. A reader that reads ${SIGNED} as signed plays something else or nothing, and one that ignores \`instrumentMSB\` plays ${PITCH.decoy} cents.`,
    length: 3,
    bank: (b) => {
        const reference = b.reference();
        const sine = b.sample("sine");
        // Instruments are written in the order they are added, so these fill the indices up to HIGH
        const instruments = new Array<ReturnType<typeof b.instrument>>();
        for (let index = b.bank.instruments.length; index <= HIGH; index++) {
            const cents =
                index === LOW
                    ? PITCH.decoy
                    : index === SIGNED
                      ? PITCH.signed
                      : index === HIGH
                        ? PITCH.high
                        : 0;
            instruments[index] = b.instrument(`CON-22 ${index}`, [
                { sample: sine, generators: { [G.fineTune]: cents } }
            ]);
        }
        return [
            reference,
            b.preset({ name: "CON-22 signed", zones: instruments[SIGNED] }),
            b.preset({
                name: "CON-22 high",
                zones: instruments[LOW],
                presetGenerators: { [G.fineTune]: HIGH_PLACEHOLDER }
            })
        ];
    },
    midi: (m, presets) => m.steps(presets, { length: 0.6 }),
    verify: (r) =>
        checkSteps(r, [
            { label: `instrument ${SIGNED}`, cents: PITCH.signed },
            {
                label: `instrumentMSB 1 with instrument ${LOW}`,
                cents: PITCH.high
            }
        ])
});

/**
 * The CON-23 cases in play order. A late case writes a placeholder `fineTune` that the patch turns into `coarseTune`
 * +12 and moves behind `instrument` or `sampleID`. A control case writes the same `coarseTune` before it, where it acts.
 */
const LATE_CASES: {
    label: string;
    level: "preset" | "instrument";
    placeholder?: number;
    cents: number;
}[] = [
    {
        label: "`coarseTune` +12 after `sampleID` in the instrument zone",
        level: "instrument",
        placeholder: 31,
        cents: 0
    },
    {
        label: "`coarseTune` +12 after `instrument` in the preset zone",
        level: "preset",
        placeholder: 37,
        cents: 0
    },
    {
        label: "`coarseTune` +12 before `sampleID` in the instrument zone (control)",
        level: "instrument",
        cents: 1200
    },
    {
        label: "`coarseTune` +12 before `instrument` in the preset zone (control)",
        level: "preset",
        cents: 1200
    }
];

const CON_23 = defineTest({
    id: "CON-23",
    title: "Generators after instrument and sampleID",
    section: "7.1.1",
    description: `The reference tone, then four presets of the \`sine\`: ${LATE_CASES.map((c) => c.label).join(", ")}.`,
    pass: "The first two play 440 Hz: a generator after `instrument` or `sampleID` is ignored, as in SoundFont 2, and the zone still plays. The two controls play an octave up (880 Hz). A reader that applies the late generators plays the first two an octave up too, and one that drops their zones plays nothing.",
    length: LATE_CASES.length + 1,
    bank: (b) => [
        b.reference(),
        ...LATE_CASES.map((c) => {
            const name = `CON-23 ${c.label}`;
            const sine = b.sample("sine");
            const generator =
                c.placeholder === undefined
                    ? { [G.coarseTune]: LATE_SEMITONES }
                    : { [G.fineTune]: c.placeholder };
            if (c.level === "preset")
                return b.preset({
                    name,
                    zones: [{ sample: sine }],
                    presetGenerators: generator
                });
            return b.preset({
                name,
                zones: [{ sample: sine, generators: generator }]
            });
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 0.6 }),
    verify: (r) =>
        checkSteps(
            r,
            LATE_CASES.map((c) => ({ label: c.label, cents: c.cents }))
        )
});

/**
 * The generators that extend `instrument` and `sampleID` past 65535.
 */
export const INDEX_MSB_GROUPS: Group[] = [
    readerGroup({
        number: 96,
        slug: "index-msb",
        title: "instrumentMSB and sampleIDMSB",
        sections: "7.1.1, 5.5",
        intro: "A small bank whose zones hold `instrumentMSB` and `sampleIDMSB`, written by patching placeholders, at their own level, at the wrong level, in a global zone and after the generator they extend.",
        test: CON_21,
        patch: (riff) => {
            for (const c of CASES)
                patchGen(
                    riff.find(
                        c.level === "preset"
                            ? "LIST:pdta/pgen"
                            : "LIST:pdta/igen"
                    ),
                    G.fineTune,
                    c.placeholder,
                    (record, index, records) => {
                        record.operator = c.operator;
                        record.amount = c.value;
                        if (c.after) moveBehindTerminal(records, index);
                    }
                );
        }
    }),
    readerGroup({
        number: 97,
        slug: "index-large",
        title: "Instrument indices above 32767 and 65535",
        sections: "7.1.1, 5.5",
        intro: `A bank of ${HIGH + 1} instruments. A preset zone refers to instrument ${SIGNED}, and another reaches instrument ${HIGH} through \`instrumentMSB\`, patched in from a placeholder.`,
        test: CON_22,
        patch: (riff) =>
            patchGen(
                riff.find("LIST:pdta/pgen"),
                G.fineTune,
                HIGH_PLACEHOLDER,
                (record) => {
                    record.operator = INSTRUMENT_MSB;
                    record.amount = 1;
                }
            )
    }),
    readerGroup({
        number: 98,
        slug: "after-index",
        title: "Generators after instrument and sampleID",
        sections: "7.1.1",
        intro: "A small bank whose zones hold `coarseTune` after `instrument` or `sampleID`, written by patching placeholders, next to zones that hold it before.",
        test: CON_23,
        patch: (riff) => {
            for (const c of LATE_CASES) {
                if (c.placeholder === undefined) continue;
                patchGen(
                    riff.find(
                        c.level === "preset"
                            ? "LIST:pdta/pgen"
                            : "LIST:pdta/igen"
                    ),
                    G.fineTune,
                    c.placeholder,
                    (record, index, records) => {
                        record.operator = G.coarseTune;
                        record.amount = LATE_SEMITONES;
                        moveBehindTerminal(records, index);
                    }
                );
            }
        }
    })
];

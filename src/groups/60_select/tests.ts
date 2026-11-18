import { GeneratorTypes as G } from "spessasynth_core";
import type { BankBuilder } from "../../framework/bank_builder";
import { centsFrom440, frequency, levelDb } from "../../framework/measure";
import { CLICK_PRESET } from "../../framework/click";
import {
    gsPart,
    MODE_MESSAGES,
    type ModeMessage,
    type Timeline
} from "../../framework/midi_writer";
import { defineTest } from "../../framework/types";
import { type Mode, ModelChannel, type SelectionPreset } from "./model";

type P = [
    name: string,
    program: number,
    msb: number,
    lsb: number,
    drum?: boolean
];

/**
 * The melodic presets, in `PHDR` order. They are not in the order of "the first", so a synthesizer that takes the
 * first in `PHDR` order plays another preset.
 */
const MELODIC: P[] = [
    ["R 18", 18, 0, 0],
    ["capital 0", 0, 0, 0],
    ["A 1", 1, 0, 0],
    ["B 1 MSB 16", 1, 16, 0],
    ["F 1 MSB 5 LSB 3", 1, 5, 3],
    ["D 1 MSB 8", 1, 8, 0],
    ["C 1 LSB 8", 1, 0, 8],
    ["G 2", 2, 0, 0],
    ["H 2 MSB 121", 2, 121, 0],
    ["I 3 LSB 2", 3, 0, 2],
    ["I0 3 LSB 1", 3, 0, 1],
    ["J 3 MSB 16", 3, 16, 0],
    ["K 3 MSB 20", 3, 20, 0],
    ["L 4", 4, 0, 0],
    ["M 4 MSB 6 LSB 9", 4, 6, 9],
    ["N 4 MSB 64", 4, 64, 0],
    ["O 6 MSB 126", 6, 126, 0],
    ["Q1 7", 7, 0, 0],
    ["Q2 7, same values", 7, 0, 0]
];

/**
 * The XG drum presets, MSB 127 before MSB 120 and program 66 first, so their `PHDR` order is not the order of
 * "the first". Program 57 is only at MSB 127, which rule 3.1.3 skips above program 48.
 */
const XG_DRUMS: P[] = [
    ...[66, 9, 17, 33, 41, 58, 126, 127].flatMap((program): P[] => [
        [`XG ${program} MSB 127`, program, 127, 0],
        [`XG ${program} MSB 120`, program, 120, 0]
    ]),
    ["XG 57 MSB 127", 57, 127, 0]
];

/**
 * The GM/GS drum presets, program 60 first, so their `PHDR` order is not the order of "the first" either.
 */
const GS_DRUMS: P[] = [
    ["GS drum 60", 60, 0, 0, true],
    ["GS drum 0", 0, 0, 0, true],
    ["GS drum 17", 17, 0, 0, true],
    ["GS drum 30", 30, 0, 0, true],
    ["GS drum 30 LSB 5", 30, 0, 5, true],
    ["GS drum 48", 48, 0, 0, true],
    ["GS drum 49", 49, 0, 0, true]
];

export type BankName =
    "full" | "xgdrums" | "gsdrums" | "nodrums" | "xgfail" | "empty";

/**
 * The full bank. "GS drum 0" comes before "capital 0" in `PHDR` with the same program, bank MSB and LSB, so a
 * synthesizer that does not put the GM/GS drum presets last in "the first" plays the drum.
 */
const FULL: P[] = [
    ...XG_DRUMS.slice(0, 6),
    ...GS_DRUMS.slice(0, 2),
    ...MELODIC,
    ...GS_DRUMS.slice(2),
    ...XG_DRUMS.slice(6)
];

export const BANKS: Record<BankName, P[]> = {
    full: FULL,
    // Program 9 is only at bank MSB 127 here, which makes it "the first" XG drum preset by program before MSB
    // (XG 17 at MSB 120 would be first by MSB before program)
    xgdrums: [
        ...MELODIC,
        ...XG_DRUMS.filter(
            ([, program, msb]) => !(program === 9 && msb === 120)
        )
    ],
    gsdrums: [...MELODIC, ...GS_DRUMS],
    nodrums: MELODIC,
    xgfail: [...FULL, ["fail 10 MSB 127 drum", 10, 127, 0, true]],
    empty: []
};

/**
 * The presets of a bank with their pitches: a semitone apart, from 25 semitones down. Every bank but the empty one
 * also holds the start click (program 127, bank LSB 127), first in `PHDR`, which the model has to know about.
 */
export function selectionPresets(name: BankName) {
    const presets = new Array<SelectionPreset>();
    if (name !== "empty")
        presets.push({
            name: CLICK_PRESET.name,
            program: CLICK_PRESET.program,
            msb: CLICK_PRESET.bankMSB,
            lsb: CLICK_PRESET.bankLSB,
            drum: false,
            cents: 0
        });
    for (const [i, [label, program, msb, lsb, drum]] of BANKS[name].entries())
        presets.push({
            name: label,
            program,
            msb,
            lsb,
            drum: drum ?? false,
            cents: (i - 25) * 100
        });
    return presets;
}

/**
 * Adds the presets of a selection bank, once per bank.
 */
function addBank(b: BankBuilder, name: BankName) {
    b.shared("selection bank", () => {
        for (const preset of selectionPresets(name).filter(
            (p) => p.name !== CLICK_PRESET.name
        ))
            b.preset({
                name: preset.name,
                program: preset.program,
                bankMSB: preset.msb,
                bankLSB: preset.lsb,
                drum: preset.drum,
                zones: [
                    {
                        sample: b.sample("sine"),
                        generators: {
                            [G.scaleTuning]: 0,
                            [G.coarseTune]: preset.cents / 100
                        }
                    }
                ]
            });
    });
}

/**
 * The messages a step may send.
 */
type Action =
    | { reset: ModeMessage }
    | { cc0: number; ch?: number }
    | { cc32: number; ch?: number }
    | { pc: number; ch?: number }
    | { gsRhythm: number; ch?: number }
    | { xgPart: number; ch?: number };

const RESET_MODES: Record<ModeMessage, Mode> = {
    "GM1 System On": "gm",
    "GM System Off": "gs",
    "GM2 System On": "gm2",
    "GS Reset": "gs",
    "GS Exit": "gm",
    "GS System Mode Set": "gs",
    "XG System On": "xg",
    "XG All Parameter Reset": "xg"
};

/**
 * A step: messages, then a note on a channel (1 or 10).
 */
interface Step {
    label: string;
    actions: Action[];
    ch?: number;
}

/**
 * Sends the messages of a step from the time.
 */
function emit(m: Timeline, t: number, actions: Action[]) {
    let time = t;
    for (const action of actions) {
        const ch = "ch" in action ? (action.ch ?? 0) : 0;
        if ("reset" in action) {
            MODE_MESSAGES[action.reset](m, time);
            time += 0.1;
        } else if ("cc0" in action) m.cc(time, ch, 0, action.cc0);
        else if ("cc32" in action) m.cc(time, ch, 32, action.cc32);
        else if ("pc" in action) m.programChange(time, ch, action.pc);
        else if ("gsRhythm" in action)
            m.gs(time, [0x40, 0x10 | gsPart(ch), 0x15], [action.gsRhythm]);
        else if ("xgPart" in action)
            m.xg(time, [0x08, ch, 0x07], [action.xgPart]);
        time += 0.01;
    }
}

/**
 * Runs the steps through the model and returns the expected pitch of each note, or undefined for silence.
 */
function expect(bank: BankName, steps: Step[]) {
    const presets = selectionPresets(bank);
    const channels = [
        new ModelChannel(presets, false),
        new ModelChannel(presets, true)
    ];
    // The preamble of every test is a GS Reset
    for (const c of channels) c.reset("gs");
    const channelOf = (ch: number) => channels[ch === 9 ? 1 : 0];
    return steps.map((step) => {
        for (const action of step.actions) {
            const channel = channelOf("ch" in action ? (action.ch ?? 0) : 0);
            if ("reset" in action)
                for (const c of channels) c.reset(RESET_MODES[action.reset]);
            else if ("cc0" in action) channel.bankMSB(action.cc0);
            else if ("cc32" in action) channel.bankLSB(action.cc32);
            else if ("pc" in action) channel.programChange(action.pc);
            else
                channel.setPartMode(
                    "gsRhythm" in action ? action.gsRhythm : action.xgPart
                );
        }
        const channel = channelOf(step.ch ?? 0);
        return { cents: channel.noteCents(), preset: channel.preset };
    });
}

const STEP_SECONDS = 0.6;

/**
 * A selection test on a bank: each step's messages, then a note whose pitch shows the preset that plays.
 */
export function selectionTest(spec: {
    id: string;
    part?: string;
    title: string;
    section: string;
    description: string;
    pass: string;
    bank: BankName;
    steps: Step[];
}) {
    const expected = expect(spec.bank, spec.steps);
    const lines = spec.steps.map((step, i) => {
        const e = expected[i];
        return `${step.label}: ${e.preset ? `${e.preset.name} (${e.cents} cents)` : "silence"}`;
    });
    return defineTest({
        id: spec.id,
        title: spec.part ? `${spec.title} (${spec.part})` : spec.title,
        section: spec.section,
        description: spec.description,
        pass: `${spec.pass} Expected, step by step: ${lines.join(". ")}.`,
        length: spec.steps.length * STEP_SECONDS,
        channels: [0, 9],
        bank: (b) => addBank(b, spec.bank),
        midi: (m) => {
            for (const [i, step] of spec.steps.entries()) {
                const t = i * STEP_SECONDS;
                emit(m, t, step.actions);
                m.marker(t + 0.2, `${spec.id} step ${i + 1}: ${lines[i]}`);
                m.note(t + 0.25, 0.25, { ch: step.ch ?? 0 });
            }
        },
        verify: (r) => {
            for (const [i, step] of spec.steps.entries()) {
                const t = i * STEP_SECONDS + 0.25;
                const cents = expected[i].cents;
                if (cents === undefined)
                    r.check(
                        `${step.label}: silence`,
                        levelDb(r.at(t, t + 0.25)) < -90
                    );
                // The presets are 100 cents apart, so 5 cents tells them apart with room
                else
                    r.near(
                        `${step.label}, in cents`,
                        centsFrom440(frequency(r.at(t + 0.05, t + 0.24))),
                        cents,
                        5
                    );
            }
        }
    });
}

const CH10 = 9;

/**
 * Bank select and Program Change on a channel, in that order.
 */
function request(msb: number, lsb: number, program: number, ch = 0) {
    return [
        { cc0: msb, ch },
        { cc32: lsb, ch },
        { pc: program, ch }
    ];
}

export const SEL_01 = selectionTest({
    id: "SEL-01",
    title: "wBank holds the bank MSB, the bank LSB and the drum flag",
    section: "6.1",
    description:
        "In GS, program 1 with bank MSB 8, then with bank LSB 8. Then program 0 on channel 1 and on channel 10, which has the drum flag. Every preset of the bank plays its own pitch.",
    pass: "Four different presets: the MSB, the LSB and the drum flag each select a preset of their own.",
    bank: "full",
    steps: [
        { label: "MSB 8, program 1", actions: request(8, 0, 1) },
        { label: "LSB 8, program 1", actions: request(0, 8, 1) },
        { label: "program 0 on channel 1", actions: request(0, 0, 0) },
        {
            label: "program 0 on channel 10",
            actions: [{ pc: 0, ch: CH10 }],
            ch: CH10
        }
    ]
});

export const SEL_02 = selectionTest({
    id: "SEL-02",
    title: "Rule 2, an exact match, in all four modes",
    section: "11.2.3",
    description:
        "Program 1 requested in GM with bank MSB 8 (ignored), in GS with MSB 8, in GM2 with LSB 8, and in XG with MSB 5 and LSB 3.",
    pass: "Each mode plays the preset with exactly the values it uses.",
    bank: "full",
    steps: [
        {
            label: "GM, MSB 8 (ignored)",
            actions: [{ reset: "GM1 System On" }, ...request(8, 0, 1)]
        },
        {
            label: "GS, MSB 8",
            actions: [{ reset: "GS Reset" }, ...request(8, 0, 1)]
        },
        {
            label: "GM2, LSB 8",
            actions: [{ reset: "GM2 System On" }, ...request(0, 8, 1)]
        },
        {
            label: "XG, MSB 5 and LSB 3",
            actions: [{ reset: "XG System On" }, ...request(5, 3, 1)]
        }
    ]
});

export const SEL_03 = selectionTest({
    id: "SEL-03",
    title: "Bank select only stores",
    section: "11.2.2",
    description:
        "In GS, program 1 on bank 0. Then CC 0 at 8 without a Program Change, then a Program Change to 1. Then CC 0 at 0 and CC 32 at 8 without a Program Change, then a Program Change to 1. Last, a GS Reset and a note without a Program Change.",
    pass: "The second note is still the first preset: CC 0 only stores. The third plays the preset of bank MSB 8. The fourth is still that one: CC 32 only stores too. The fifth plays the preset of bank LSB 8. After a GS Reset with no Program Change, the sixth plays program 0 on bank 0: a reset selects again.",
    bank: "full",
    steps: [
        { label: "program 1", actions: request(0, 0, 1) },
        { label: "CC 0 at 8 only", actions: [{ cc0: 8 }] },
        { label: "Program Change 1", actions: [{ pc: 1 }] },
        {
            label: "CC 0 at 0 and CC 32 at 8 only",
            actions: [{ cc0: 0 }, { cc32: 8 }]
        },
        { label: "Program Change 1 again", actions: [{ pc: 1 }] },
        {
            label: "GS Reset, no Program Change",
            actions: [{ reset: "GS Reset" }]
        }
    ]
});

/**
 * The eight mode messages in an order where each one follows a message of another mode, so each must set its own.
 */
const RESETS: ModeMessage[] = [
    "GM1 System On",
    "XG System On",
    "GM System Off",
    "XG All Parameter Reset",
    "GM2 System On",
    "GS Reset",
    "GS Exit",
    "GS System Mode Set"
];

export const SEL_04 = selectionTest({
    id: "SEL-04",
    title: "Each mode message sets its mode",
    section: "11.1",
    description:
        "After each of the eight mode messages: on channel 1 bank MSB 16, LSB 3, program 1, and on channel 10 program 9. The two requests together tell GM, GS, GM2 and XG apart.",
    pass: "GM1 System On and GS Exit give the GM answers, GM System Off, GS Reset and GS System Mode Set the GS answers, GM2 System On the GM2 answers, and both XG messages the XG answers. Most of these answers come from the fallbacks of rule 3 (should).",
    bank: "full",
    steps: RESETS.flatMap((reset) => [
        {
            label: `${reset}, channel 1`,
            actions: [{ reset }, ...request(16, 3, 1)]
        },
        {
            label: `${reset}, channel 10`,
            actions: [{ pc: 9, ch: CH10 }],
            ch: CH10
        }
    ])
});

export const SEL_05 = selectionTest({
    id: "SEL-05",
    title: "The default bank of each mode",
    section: "11.2.2",
    description:
        "After each mode's reset, only a Program Change to 2. Then in GM, bank LSB 8 with program 1.",
    pass: "Program 2 on bank 0 in GM, GS and XG, and on bank MSB 121 in GM2: the default bank MSB of each mode. GM ignores the LSB.",
    bank: "full",
    steps: [
        ...(
            [
                "GM1 System On",
                "GS Reset",
                "GM2 System On",
                "XG System On"
            ] as ModeMessage[]
        ).map((reset) => ({
            label: `${reset}, program 2`,
            actions: [{ reset }, { pc: 2 }] as Action[]
        })),
        {
            label: "GM, LSB 8 and program 1",
            actions: [{ reset: "GM1 System On" }, ...request(0, 8, 1)]
        }
    ]
});

export const SEL_06 = selectionTest({
    id: "SEL-06",
    title: "Channel 10 after each mode's reset",
    section: "11.2.2",
    description:
        "After each mode's reset, program 17 on channel 10. The bank has program 17 as a GM/GS drum preset and as XG drum presets at bank MSB 120 and 127.",
    pass: "GM and GS play the GM/GS drum preset (the drum flag), GM2 the one at MSB 120, XG the one at MSB 127.",
    bank: "full",
    steps: (
        [
            "GM1 System On",
            "GS Reset",
            "GM2 System On",
            "XG System On"
        ] as ModeMessage[]
    ).map((reset) => ({
        label: `${reset}, channel 10`,
        actions: [{ reset }, { pc: 17, ch: CH10 }] as Action[],
        ch: CH10
    }))
});

const SEL_07_TEXT = {
    title: "Rule 3.1, a request with the drum flag",
    section: "11.2.3",
    description:
        "In GS on channel 10, with bank MSB 8 so no request has an exact match: program 30 with bank LSB 5, then program 17 with LSB 7 (a GM/GS drum preset and XG drum presets have program 17), then program 33 (only XG drum presets), then program 57 (only an XG drum preset at MSB 127, above 48), then program 58 (XG drum presets at MSB 127 and 120, above 48), then program 34 (no drum preset). The other banks of this test hold no GM/GS drum presets, or no drum presets at all.",
    pass: "Rule 3.1 in order (should): the GM/GS drum preset with the same program and LSB, then the same program, then any drum preset with the same program if the program is below 49 or the preset is at bank MSB 120 (so program 57 skips its XG drum preset and program 58 takes the one at MSB 120), then the first GM/GS drum preset, then the first drum preset, then the first preset. In the bank of XG drum presets only, program 9 is only at bank MSB 127, so the first drum preset is that one (by program before MSB), not program 17 at MSB 120."
};

export const SEL_07 = selectionTest({
    id: "SEL-07",
    part: "the full bank",
    ...SEL_07_TEXT,
    bank: "full",
    steps: [
        {
            label: "3.1.1, MSB 8, program 30 LSB 5",
            actions: [
                { cc0: 8, ch: CH10 },
                { cc32: 5, ch: CH10 },
                { pc: 30, ch: CH10 }
            ],
            ch: CH10
        },
        {
            label: "3.1.2, program 17 LSB 7",
            actions: [
                { cc32: 7, ch: CH10 },
                { pc: 17, ch: CH10 }
            ],
            ch: CH10
        },
        {
            label: "3.1.3, program 33",
            actions: [
                { cc32: 0, ch: CH10 },
                { pc: 33, ch: CH10 }
            ],
            ch: CH10
        },
        {
            label: "3.1.3 skipped above 48, program 57",
            actions: [{ pc: 57, ch: CH10 }],
            ch: CH10
        },
        {
            label: "3.1.3 at MSB 120 above 48, program 58",
            actions: [{ pc: 58, ch: CH10 }],
            ch: CH10
        },
        {
            label: "3.1.4, program 34",
            actions: [{ pc: 34, ch: CH10 }],
            ch: CH10
        }
    ]
});

export const SEL_07_XG = selectionTest({
    id: "SEL-07",
    part: "XG drum presets only",
    ...SEL_07_TEXT,
    bank: "xgdrums",
    steps: [
        {
            label: "3.1.5, program 34",
            actions: [{ pc: 34, ch: CH10 }],
            ch: CH10
        }
    ]
});

export const SEL_07_NONE = selectionTest({
    id: "SEL-07",
    part: "no drum presets",
    ...SEL_07_TEXT,
    bank: "nodrums",
    steps: [
        {
            label: "3.1.6, program 34",
            actions: [{ pc: 34, ch: CH10 }],
            ch: CH10
        }
    ]
});

const SEL_08_TEXT = {
    title: "Rule 3.2, drum requests in XG and GM2",
    section: "11.2.3",
    description:
        "On channel 10 in XG and in GM2: program 58 with bank LSB 5 (no exact match, and above program 48, so only rule 3.2.1 finds the XG drum preset of program 58), program 30 and program 48 (GM/GS drum presets below program 49), programs 49 and 60 (GM/GS drum presets from program 49 on, which rule 3.2.2 only takes in GM2), and program 34. Rule 1 is not reached from MIDI here: no message sets the drum flag in XG or GM2.",
    pass: "Rule 3.2 in order (should): the XG drum preset with the same program, then a drum preset with the same program (below program 49, or any program in GM2, which numbers its kits as GS does), then the first XG drum preset, then the first drum preset, then the first preset. Among the XG drum presets of one program, the first plays, the one at MSB 120."
};

export const SEL_08 = selectionTest({
    id: "SEL-08",
    part: "the full bank",
    ...SEL_08_TEXT,
    bank: "full",
    steps: (["XG System On", "GM2 System On"] as ModeMessage[]).flatMap(
        (reset) => [
            {
                label: `${reset}: 3.2.1, program 58 LSB 5`,
                actions: [
                    { reset },
                    { cc32: 5, ch: CH10 },
                    { pc: 58, ch: CH10 }
                ],
                ch: CH10
            },
            {
                label: `${reset}: 3.2.2, program 30`,
                actions: [
                    { cc32: 0, ch: CH10 },
                    { pc: 30, ch: CH10 }
                ],
                ch: CH10
            },
            {
                label: `${reset}: 3.2.2, program 48`,
                actions: [{ pc: 48, ch: CH10 }],
                ch: CH10
            },
            {
                label: `${reset}: ${reset === "GM2 System On" ? "3.2.2" : "3.2.3"}, program 49`,
                actions: [{ pc: 49, ch: CH10 }],
                ch: CH10
            },
            {
                label: `${reset}: ${reset === "GM2 System On" ? "3.2.2" : "3.2.3"}, program 60`,
                actions: [{ pc: 60, ch: CH10 }],
                ch: CH10
            }
        ]
    )
});

export const SEL_08_GS = selectionTest({
    id: "SEL-08",
    part: "GM/GS drum presets only",
    ...SEL_08_TEXT,
    bank: "gsdrums",
    steps: [
        {
            label: "XG: 3.2.4, program 34",
            actions: [{ reset: "XG System On" }, { pc: 34, ch: CH10 }],
            ch: CH10
        }
    ]
});

export const SEL_08_NONE = selectionTest({
    id: "SEL-08",
    part: "no drum presets",
    ...SEL_08_TEXT,
    bank: "nodrums",
    steps: [
        {
            label: "XG: 3.2.5, program 34",
            actions: [{ reset: "XG System On" }, { pc: 34, ch: CH10 }],
            ch: CH10
        }
    ]
});

export const SEL_09 = selectionTest({
    id: "SEL-09",
    title: "Rule 3.3 in GM and GS",
    section: "11.2.3",
    description:
        "In GS, program 3 (presets at MSB 0 LSB 1, MSB 0 LSB 2, MSB 16 and MSB 20) requested with MSB 9 LSB 2, MSB 16 LSB 20 (the MSB matches, the higher value 20 matches another preset), MSB 3 LSB 20 and MSB 4 LSB 4. Then program 1 with MSB 3 LSB 1 (the preset at MSB 5 LSB 3 has the higher value as its LSB), and program 4 with MSB 10 LSB 64 (GS does not skip rule 3.3.3 for LSB 64). Then in GM, program 3 with MSB 16.",
    pass: "Each request is answered by its own step of rule 3.3 (should): bank MSB 0 with the same LSB, the same MSB, the MSB or LSB equal to the higher of the two, and the first candidate. GM ignores the bank and plays the first candidate on bank MSB 0, by rule 3.3.2.",
    bank: "full",
    steps: [
        { label: "3.3.1, MSB 9 LSB 2", actions: request(9, 2, 3) },
        { label: "3.3.2, MSB 16 LSB 20", actions: request(16, 20, 3) },
        { label: "3.3.3, MSB 3 LSB 20", actions: request(3, 20, 3) },
        { label: "3.3.4, MSB 4 LSB 4", actions: request(4, 4, 3) },
        {
            label: "3.3.3, the higher value 3 equals an LSB, program 1 MSB 3 LSB 1",
            actions: request(3, 1, 1)
        },
        {
            label: "3.3.3 with LSB 64, program 4 MSB 10",
            actions: request(10, 64, 4)
        },
        {
            label: "GM, MSB 16",
            actions: [{ reset: "GM1 System On" }, ...request(16, 0, 3)]
        }
    ]
});

export const SEL_10 = selectionTest({
    id: "SEL-10",
    title: "Rule 3.3 in XG and GM2",
    section: "11.2.3",
    description:
        "In XG, program 4 (presets at bank 0, at MSB 6 LSB 9 and at MSB 64) requested with MSB 2 LSB 9, MSB 6 LSB 1, MSB 3 LSB 2, MSB 6 LSB 0 and MSB 0 LSB 9 (the same LSB, never the same MSB), MSB 3 LSB 6 (the higher value is the LSB) and MSB 10 LSB 64. Then in GM2 with MSB 2 LSB 9 and with MSB 10 LSB 64.",
    pass: "The same LSB, then the MSB or LSB equal to the higher of the two, then the first candidate (should). With LSB 64 the third step is skipped, so the first candidate plays, not the preset at MSB 64.",
    bank: "full",
    steps: [
        {
            label: "3.3.2, MSB 2 LSB 9",
            actions: [{ reset: "XG System On" }, ...request(2, 9, 4)]
        },
        { label: "3.3.3, MSB 6 LSB 1", actions: request(6, 1, 4) },
        { label: "3.3.4, MSB 3 LSB 2", actions: request(3, 2, 4) },
        { label: "3.3.2 by the LSB, MSB 6 LSB 0", actions: request(6, 0, 4) },
        { label: "3.3.2 by the LSB, MSB 0 LSB 9", actions: request(0, 9, 4) },
        {
            label: "3.3.3, the higher value 6 equals an MSB, MSB 3 LSB 6",
            actions: request(3, 6, 4)
        },
        { label: "LSB 64 skips 3.3.3", actions: request(10, 64, 4) },
        {
            label: "GM2: 3.3.2, MSB 2 LSB 9",
            actions: [{ reset: "GM2 System On" }, ...request(2, 9, 4)]
        },
        { label: "GM2: LSB 64 skips 3.3.3", actions: request(10, 64, 4) }
    ]
});

export const SEL_11 = selectionTest({
    id: "SEL-11",
    title: "Rule 3.3 without a candidate",
    section: "11.2.3",
    description: "In GS on channel 1, program 5, which has no melodic preset.",
    pass: "The first preset plays (should): program 0 on bank 0, although other presets come first in `PHDR`.",
    bank: "full",
    steps: [{ label: "program 5", actions: request(0, 0, 5) }]
});

const SEL_12_TEXT = {
    title: "Rule 2 in XG and GM2 with MSB 127 or 120 and an exact match that is not an XG drum preset",
    section: "11.2.3",
    description:
        "On channel 1, bank MSB 127 with program 9 in XG, and bank MSB 120 with program 9 in GM2. In the `xgfail` bank, which fails the XG test, the presets at MSB 120 and 127 are melodic, apart from its preset at MSB 127 program 10 with the drum flag set, a GM/GS drum preset.",
    pass: "With the full bank the exact match plays, an XG drum preset. With the `xgfail` bank the exact match is skipped, and rule 3.2 picks the first drum preset (should), a GM/GS drum preset."
};

export const SEL_12 = selectionTest({
    id: "SEL-12",
    part: "the full bank",
    ...SEL_12_TEXT,
    bank: "full",
    steps: [
        {
            label: "XG, MSB 127 program 9",
            actions: [{ reset: "XG System On" }, ...request(127, 0, 9)]
        },
        {
            label: "GM2, MSB 120 program 9",
            actions: [{ reset: "GM2 System On" }, ...request(120, 0, 9)]
        }
    ]
});

export const SEL_12_FAIL = selectionTest({
    id: "SEL-12",
    part: "the xgfail bank",
    ...SEL_12_TEXT,
    bank: "xgfail",
    steps: [
        {
            label: "XG, MSB 127 program 9",
            actions: [{ reset: "XG System On" }, ...request(127, 0, 9)]
        },
        {
            label: "GM2, MSB 120 program 9",
            actions: [{ reset: "GM2 System On" }, ...request(120, 0, 9)]
        }
    ]
});

const SEL_13_TEXT = {
    title: "The XG test",
    section: "11.2.1, 11.2.3",
    description:
        "In GS on channel 10 (the drum flag), bank MSB 8 with program 9, which no GM/GS drum preset has. Only the presets at bank MSB 120 and 127 have program 9, and the `xgfail` bank holds a preset at MSB 127 with a program outside the XG list.",
    pass: "Rule 3.1 (should). With the full bank the presets at MSB 120 and 127 are XG drum presets, so rule 3.1.3 plays the one of program 9 at MSB 120. With the `xgfail` bank they are melodic, so rule 3.1.3 finds nothing and rule 3.1.4 plays the first GM/GS drum preset."
};

const SEL_13_STEPS: Step[] = [
    {
        label: "GS channel 10, MSB 8 program 9",
        actions: [
            { reset: "GS Reset" },
            { cc0: 8, ch: CH10 },
            { pc: 9, ch: CH10 }
        ],
        ch: CH10
    }
];

export const SEL_13 = selectionTest({
    id: "SEL-13",
    part: "the full bank",
    ...SEL_13_TEXT,
    bank: "full",
    steps: SEL_13_STEPS
});

export const SEL_13_FAIL = selectionTest({
    id: "SEL-13",
    part: "the xgfail bank",
    ...SEL_13_TEXT,
    bank: "xgfail",
    steps: SEL_13_STEPS
});

export const SEL_14 = selectionTest({
    id: "SEL-14",
    title: "MSB 126, two presets with the same values, and the order of the first",
    section: "11.2.1",
    description:
        "In GS: bank MSB 126 with program 6. Then program 7, which two presets share with the same four values. Then program 5, which has no melodic preset. In `PHDR` the GM/GS drum preset of program 0 comes before the melodic program 0 on bank 0, with the same program, MSB and LSB. Last, MSB 126 with program 9, which has no melodic preset, on channel 1 in XG and on channel 10 in GM2.",
    pass: "The MSB 126 preset plays: an exact match selects it. Program 7 plays the first of the two presets in `PHDR`. Program 5 plays the first preset (should): the melodic program 0, since the GM/GS drum presets come last in that order, whatever `PHDR` says. MSB 126 is not a drum bank outside XG channel 10: both requests go through rule 3.3 and play the first preset (should), not an XG drum preset of program 9.",
    bank: "full",
    steps: [
        {
            label: "MSB 126 program 6",
            actions: request(126, 0, 6)
        },
        {
            label: "program 7",
            actions: [{ reset: "GS Reset" }, ...request(0, 0, 7)]
        },
        { label: "program 5", actions: request(0, 0, 5) },
        {
            label: "XG channel 1, MSB 126 program 9",
            actions: [{ reset: "XG System On" }, ...request(126, 0, 9)]
        },
        {
            label: "GM2 channel 10, MSB 126 program 9",
            actions: [{ reset: "GM2 System On" }, ...request(126, 0, 9, CH10)],
            ch: CH10
        }
    ]
});

export const SEL_15 = selectionTest({
    id: "SEL-15",
    title: "XG channel 10",
    section: "11.2.2",
    description:
        "In XG on channel 10: CC 0 at 5 with program 9, then CC 0 at 126 with program 6 (an exact match), then CC 0 at 126 with program 9 (no exact match), then CC 0 at 127 and 120 with program 9, then CC 0 at 5 again with program 9.",
    pass: "CC 0 at 5 is ignored, so the XG drum preset at MSB 127 plays. MSB 126 with an exact match plays that melodic preset. MSB 126 without one goes through rule 3.2 and plays an XG drum preset of program 9 (should: the first, at MSB 120). CC 0 at 120 is taken, as 126 and 127 are, so that note plays the XG drum preset at MSB 120. The last CC 0 at 5 is ignored again, so the channel stays at MSB 120.",
    bank: "full",
    steps: [
        {
            label: "CC 0 at 5, program 9",
            actions: [
                { reset: "XG System On" },
                { cc0: 5, ch: CH10 },
                { pc: 9, ch: CH10 }
            ],
            ch: CH10
        },
        {
            label: "CC 0 at 126, program 6",
            actions: [
                { cc0: 126, ch: CH10 },
                { pc: 6, ch: CH10 }
            ],
            ch: CH10
        },
        {
            label: "CC 0 at 126, program 9",
            actions: [{ pc: 9, ch: CH10 }],
            ch: CH10
        },
        {
            label: "CC 0 at 127, then 120, program 9",
            actions: [
                { cc0: 127, ch: CH10 },
                { cc0: 120, ch: CH10 },
                { pc: 9, ch: CH10 }
            ],
            ch: CH10
        },
        {
            label: "CC 0 at 5 again, program 9",
            actions: [
                { cc0: 5, ch: CH10 },
                { pc: 9, ch: CH10 }
            ],
            ch: CH10
        }
    ]
});

export const SEL_16 = selectionTest({
    id: "SEL-16",
    title: "GM2 channel 10, and XG drum presets in GS",
    section: "11.2.2",
    description:
        "In GM2 on channel 10, bank MSB 121 with program 2. Then in GS on channel 1, bank MSB 127 with program 17 (an XG drum preset exists) and with program 18 (none exists).",
    pass: "GM2 channel 10 plays the melodic preset at MSB 121. In GS, MSB 127 program 17 plays the XG drum preset by its exact match, and MSB 127 program 18 plays the melodic program 18 (should, by rule 3.3): without an exact match GS does not select XG drum presets.",
    bank: "full",
    steps: [
        {
            label: "GM2 channel 10, MSB 121 program 2",
            actions: [{ reset: "GM2 System On" }, ...request(121, 0, 2, CH10)],
            ch: CH10
        },
        {
            label: "GS, MSB 127 program 17",
            actions: [{ reset: "GS Reset" }, ...request(127, 0, 17)]
        },
        { label: "GS, MSB 127 program 18", actions: request(127, 0, 18) }
    ]
});

export const SEL_17 = selectionTest({
    id: "SEL-17",
    title: "The part mode in GS",
    section: "11.6",
    description:
        "In GS on channel 1: MSB 8 program 1. Then CC 32 at 5 (stored only) and GS USE FOR RHYTHM PART at 1. Then program 30, and USE FOR RHYTHM PART at 1 again. Then at 0, and program 1. Then XG PART MODE at 2, and USE FOR RHYTHM PART at 2.",
    pass: "A drum value selects program 0 with the drum flag on bank MSB and LSB 0, so program 30 then plays the drum preset of LSB 0. The same value again selects nothing, so program 30 stays. A melodic value selects program 0 on bank 0, so program 1 then plays the preset of MSB 0. XG PART MODE sets the same value as the GS message, so the last message changes nothing.",
    bank: "full",
    steps: [
        { label: "MSB 8 program 1", actions: request(8, 0, 1) },
        {
            label: "CC 32 at 5, then USE FOR RHYTHM PART 1",
            actions: [{ cc32: 5 }, { gsRhythm: 1 }]
        },
        {
            label: "program 30, then 1 again",
            actions: [{ pc: 30 }, { gsRhythm: 1 }]
        },
        { label: "USE FOR RHYTHM PART 0", actions: [{ gsRhythm: 0 }] },
        { label: "program 1", actions: [{ pc: 1 }] },
        { label: "XG PART MODE 2", actions: [{ xgPart: 2 }] },
        {
            label: "program 17, then USE FOR RHYTHM PART 2",
            actions: [{ pc: 17 }, { gsRhythm: 2 }]
        }
    ]
});

export const SEL_18 = selectionTest({
    id: "SEL-18",
    title: "The part mode in XG and GM2",
    section: "11.6",
    description:
        "In XG on channel 1: MSB 5 LSB 3 program 1, then XG PART MODE at 1, program 2 and XG PART MODE at 0. Then MSB 120 program 9, XG PART MODE at 1 (a note), and program 17, then CC 0 at 127 (stored only) and XG PART MODE at 1 again, then CC 0 at 5 (stored only) and XG PART MODE at 1 once more. The first part again in GM2 through GS USE FOR RHYTHM PART, with program 17 after the drum value, then USE FOR RHYTHM PART at 0 on GM2 channel 10. On XG channel 10: MSB 126 program 9 (a drum preset through rule 3.2), then XG PART MODE at 1, then at 0. In XG, LSB 8 program 1, then XG PART MODE at 0, then XG PART MODE at 1 and program 17 (the LSB 8 stays, so there is no exact match). Then the first part once more with the other message: GS USE FOR RHYTHM PART in XG and XG PART MODE in GM2, which act the same. In GM, both part mode messages at 1 after program 1.",
    pass: "In XG and GM2 a message acts even with the value it already has. A drum value moves the bank MSB to the drum bank of the mode, unless it already is 120 or 127, and then selects nothing. On a channel that was not a drum channel it selects program 0, on a drum channel it selects the program again. A melodic value moves the MSB back to the default of the mode, keeps the LSB and selects the program again. XG channel 10 ignores a melodic value, GM2 channel 10 takes it. GM ignores both messages. The answers that come from fallbacks are a should.",
    bank: "full",
    steps: [
        {
            label: "XG, MSB 5 LSB 3 program 1",
            actions: [{ reset: "XG System On" }, ...request(5, 3, 1)]
        },
        { label: "XG PART MODE 1", actions: [{ xgPart: 1 }] },
        { label: "program 2", actions: [{ pc: 2 }] },
        { label: "XG PART MODE 0", actions: [{ xgPart: 0 }] },
        {
            label: "XG, MSB 120 program 9",
            actions: [{ reset: "XG System On" }, ...request(120, 0, 9)]
        },
        { label: "XG PART MODE 1 on a drum channel", actions: [{ xgPart: 1 }] },
        { label: "program 17", actions: [{ pc: 17 }] },
        {
            label: "CC 0 at 127, then XG PART MODE 1",
            actions: [{ cc0: 127 }, { xgPart: 1 }]
        },
        {
            label: "CC 0 at 5, then XG PART MODE 1 again",
            actions: [{ cc0: 5 }, { xgPart: 1 }]
        },
        {
            label: "GM2, MSB 5 LSB 3 program 1",
            actions: [{ reset: "GM2 System On" }, ...request(5, 3, 1)]
        },
        { label: "GM2 USE FOR RHYTHM PART 1", actions: [{ gsRhythm: 1 }] },
        { label: "GM2 program 17", actions: [{ pc: 17 }] },
        {
            label: "GM2 program 2, then USE FOR RHYTHM PART 0",
            actions: [{ pc: 2 }, { gsRhythm: 0 }]
        },
        {
            label: "GM2 channel 10, USE FOR RHYTHM PART 0",
            actions: [{ gsRhythm: 0, ch: CH10 }],
            ch: CH10
        },
        {
            label: "XG channel 10, MSB 126 program 9",
            actions: [
                { reset: "XG System On" },
                { cc0: 126, ch: CH10 },
                { pc: 9, ch: CH10 }
            ],
            ch: CH10
        },
        {
            label: "XG channel 10, XG PART MODE 1",
            actions: [{ xgPart: 1, ch: CH10 }],
            ch: CH10
        },
        {
            label: "XG channel 10, XG PART MODE 0",
            actions: [{ xgPart: 0, ch: CH10 }],
            ch: CH10
        },
        {
            label: "XG, LSB 8 program 1",
            actions: [{ reset: "XG System On" }, ...request(0, 8, 1)]
        },
        { label: "XG PART MODE 0, the LSB stays", actions: [{ xgPart: 0 }] },
        {
            label: "XG PART MODE 1 with LSB 8, then program 17",
            actions: [{ xgPart: 1 }, { pc: 17 }]
        },
        {
            label: "XG, MSB 5 LSB 3 program 1 again",
            actions: [{ reset: "XG System On" }, ...request(5, 3, 1)]
        },
        {
            label: "XG, USE FOR RHYTHM PART 1, then program 2",
            actions: [{ gsRhythm: 1 }, { pc: 2 }]
        },
        {
            label: "XG, USE FOR RHYTHM PART 0",
            actions: [{ gsRhythm: 0 }]
        },
        {
            label: "GM2, MSB 5 LSB 3 program 1 again",
            actions: [{ reset: "GM2 System On" }, ...request(5, 3, 1)]
        },
        {
            label: "GM2, XG PART MODE 1, then program 2",
            actions: [{ xgPart: 1 }, { pc: 2 }]
        },
        { label: "GM2, XG PART MODE 0", actions: [{ xgPart: 0 }] },
        {
            label: "GM, program 1, both part mode messages at 1",
            actions: [
                { reset: "GM1 System On" },
                { pc: 1 },
                { xgPart: 1 },
                { gsRhythm: 1 }
            ]
        }
    ]
});

export const SEL_19 = selectionTest({
    id: "SEL-19",
    title: "The part mode after a reset",
    section: "11.6",
    description:
        "In GS on channel 10: program 30, then GS USE FOR RHYTHM PART at 1, then at 2. On channel 1: program 1, then USE FOR RHYTHM PART at 0.",
    pass: "On channel 10 the value 1 is the one after the reset, so it selects nothing and program 30 stays. The value 2 differs and selects program 0. On channel 1 the value 0 is the one after the reset and selects nothing.",
    bank: "full",
    steps: [
        {
            label: "channel 10, program 30",
            actions: [{ pc: 30, ch: CH10 }],
            ch: CH10
        },
        {
            label: "channel 10, USE FOR RHYTHM PART 1",
            actions: [{ gsRhythm: 1, ch: CH10 }],
            ch: CH10
        },
        {
            label: "channel 10, USE FOR RHYTHM PART 2",
            actions: [{ gsRhythm: 2, ch: CH10 }],
            ch: CH10
        },
        {
            label: "channel 1, program 1, then 0",
            actions: [...request(0, 0, 1), { gsRhythm: 0 }]
        }
    ]
});

export const SEL_20 = selectionTest({
    id: "SEL-20",
    title: "An empty bank",
    section: "11.2.3",
    description: "A bank without presets, and a note with program 0.",
    pass: "Silence: a file without presets selects nothing.",
    bank: "empty",
    steps: [{ label: "program 0", actions: request(0, 0, 0) }]
});

export const SEL_21 = selectionTest({
    id: "SEL-21",
    title: "A drum channel is one whose preset is a drum preset",
    section: "11.2.2, 11.6",
    description:
        "In XG on channel 1, bank MSB 127 with program 17, an XG drum preset, so channel 1 is a drum channel without any drum flag. Then XG PART MODE 1 on part 0. A drum value on a channel that was not a drum channel stores program 0 and selects it.",
    pass: "Both notes play the XG drum preset of program 17: the channel already was a drum channel and the bank MSB already was 127, so the part mode message selects nothing. A synthesizer that does not count the channel as a drum channel selects program 0 for the second note, which falls back to another preset.",
    bank: "full",
    steps: [
        {
            label: "XG channel 1, MSB 127 program 17",
            actions: [{ reset: "XG System On" }, ...request(127, 0, 17)]
        },
        { label: "XG PART MODE 1", actions: [{ xgPart: 1 }] }
    ]
});

/**
 * The reader rule of spec section 6.1 on the full bank (group 91, with the bank patched).
 */
export const CON_18 = selectionTest({
    id: "CON-18",
    title: "Bit 15 of wBank is ignored",
    section: "6.1",
    description:
        "The full selection bank of group 60, with bit 15 of `wBank` set in every preset header. Program 1 with bank MSB 8, then with bank LSB 8, program 0 on channel 1 and on channel 10, and program 17 on channel 10 in XG.",
    pass: "Each note plays the preset group 60 selects for the same request: bit 15 is ignored.",
    bank: "full",
    steps: [
        {
            label: "MSB 8, program 1",
            actions: [{ cc0: 8 }, { cc32: 0 }, { pc: 1 }]
        },
        {
            label: "LSB 8, program 1",
            actions: [{ cc0: 0 }, { cc32: 8 }, { pc: 1 }]
        },
        {
            label: "program 0 on channel 1",
            actions: [{ cc0: 0 }, { cc32: 0 }, { pc: 0 }]
        },
        {
            label: "program 0 on channel 10",
            actions: [{ pc: 0, ch: CH10 }],
            ch: CH10
        },
        {
            label: "XG, program 17 on channel 10",
            actions: [{ reset: "XG System On" }, { pc: 17, ch: CH10 }],
            ch: CH10
        }
    ]
});

import { GeneratorTypes as G } from "spessasynth_core";
import {
    type BankBuilder,
    cc,
    mod,
    none,
    src
} from "../../framework/bank_builder";
import { levelDb } from "../../framework/measure";
import type { Timeline } from "../../framework/midi_writer";
import {
    customCurveOutput,
    fourteenBitX,
    sevenBitX
} from "../../framework/spec_math";
import {
    defineTest,
    type PresetRef,
    type TestRender
} from "../../framework/types";
import {
    FULL,
    type Points,
    STAIRCASE,
    holdLevel,
    sweepLength,
    LINEAR,
    stepLevelDb,
    sweepMidi,
    stepNotes
} from "./common";

/**
 * The level change in dB of a source output on `gain` with -240: unipolar from 0 to 24 dB down. A bipolar zone
 * has 240 cB of attenuation as well, so it goes from 0 (output -1) to 48 dB down (output 1).
 */
function expectedLevel(output: number, bipolar: boolean) {
    return bipolar ? -24 - 24 * output : -24 * output;
}

/**
 * A preset whose CC 16 reads a custom curve, to `gain` with -240.
 */
function curvePreset(
    b: BankBuilder,
    name: string,
    points: Points,
    options: { bipolar?: boolean; negative?: boolean } = {}
) {
    const curve = b.curve(points, name.slice(0, 40));
    return b.preset({
        name,
        zones: [
            {
                sample: b.sample("sine"),
                generators: options.bipolar
                    ? { [G.initialAttenuation]: 240 }
                    : {},
                modulators: [
                    mod(
                        cc(16, {
                            curve,
                            bipolar: options.bipolar,
                            negative: options.negative
                        }),
                        none(),
                        G.gain,
                        -240
                    )
                ]
            }
        ]
    });
}

/**
 * Checks the sweep at the given controller values against the curve.
 */
function checkSweep(
    r: TestRender,
    holds: Map<number, number>,
    points: Points,
    options: { bipolar?: boolean; negative?: boolean } = {}
) {
    const reference = levelDb(r.at(0.2, 0.7));
    for (const [v, start] of holds) {
        const output = customCurveOutput(points, sevenBitX(v), options);
        r.near(
            `CC 16 at ${v}, level in dB`,
            holdLevel(r, start, reference),
            expectedLevel(output, options.bipolar ?? false),
            0.3
        );
    }
}

/**
 * The reference tone, then one note per controller value, the value sent before the note.
 */
function valueMidi(
    m: Timeline,
    reference: PresetRef,
    presets: PresetRef[],
    values: number[],
    controller = 16
) {
    stepNotes(
        m,
        reference,
        presets.flatMap((preset) =>
            values.map((v) => ({
                preset,
                at: (t: number) => m.cc(t, 0, controller, v)
            }))
        )
    );
}

const ZIGZAG: Points = [
    [0, 0],
    [4096, 16_384],
    [4096, 0],
    [8192, 16_384],
    [8192, 0],
    [12_288, 16_384],
    [12_288, 0],
    [16_384, 16_384]
];

export const MOD_01 = defineTest({
    id: "MOD-01",
    title: "A zigzag curve",
    section: "7.2.1",
    description:
        "The reference tone. Then CC 16 swept from 0 to 127 over about 4 s, pausing on each checked value, through a custom curve of four rising teeth, to `gain` with the amount -240.",
    pass: "The level shows four sawtooth teeth: it falls from the reference level to 24 dB below it four times, jumping back up at CC 32, 64 and 96. No SoundFont 2 curve gives that.",
    length: sweepLength(9),
    bank: (b) => [b.reference(), curvePreset(b, "MOD-01 zigzag", ZIGZAG)],
    midi: (m, [reference, preset]) =>
        sweepMidi(m, reference, preset, [8, 24, 31, 33, 48, 72, 88, 100, 120]),
    verify: (r, _presets, holds) => checkSweep(r, holds, ZIGZAG)
});

export const MOD_02 = defineTest({
    id: "MOD-02",
    title: "A staircase curve",
    section: "7.2.1",
    description:
        "The reference tone. Then CC 16 swept from 0 to 127 over about 4 s, pausing on each checked value, through a staircase of eight equal steps (`y` from 0 to 14336 in steps of 2048), to `gain` with -240.",
    pass: "Eight plateaus, each 3 dB below the one before: 0, 3, 6 and so on to 21 dB below the reference tone.",
    length: sweepLength(8),
    bank: (b) => [b.reference(), curvePreset(b, "MOD-02 staircase", STAIRCASE)],
    midi: (m, [reference, preset]) =>
        sweepMidi(m, reference, preset, [8, 24, 40, 56, 72, 88, 104, 120]),
    verify: (r, _presets, holds) => checkSweep(r, holds, STAIRCASE)
});

export const MOD_03 = defineTest({
    id: "MOD-03",
    title: "A curve at 16384 is the full amount",
    section: "7.2.1",
    description:
        "The reference tone. Then a custom curve that is 16384 everywhere on CC 16, as a unipolar source to `gain` with -240, at CC 16 = 0 and 127. Then the same as a bipolar source, with 24 dB of attenuation, at CC 16 = 0 and 127.",
    pass: "The unipolar notes are 24 dB below the reference tone and the bipolar ones 48 dB below it: in both cases the output is 1, the full amount.",
    length: 5,
    bank: (b) => [
        b.reference(),
        curvePreset(b, "MOD-03 unipolar", FULL),
        curvePreset(b, "MOD-03 bipolar", FULL, { bipolar: true })
    ],
    midi: (m, [reference, unipolar, bipolar]) =>
        valueMidi(m, reference, [unipolar, bipolar], [0, 127]),
    verify: (r) => {
        r.near("unipolar at 0 in dB", stepLevelDb(r, 0), -24, 0.3);
        r.near("unipolar at 127 in dB", stepLevelDb(r, 1), -24, 0.3);
        r.near("bipolar at 0 in dB", stepLevelDb(r, 2), -48, 0.3);
        r.near("bipolar at 127 in dB", stepLevelDb(r, 3), -48, 0.3);
    }
});

const HALF_RISE: Points = [
    [0, 0],
    [8192, 16_384],
    [16_384, 16_384]
];

export const MOD_04 = defineTest({
    id: "MOD-04",
    title: "A bipolar curve is not mirrored",
    section: "7.2.1",
    description:
        "The reference tone. Then CC 16 as a bipolar source through a curve that rises from 0 to 16384 over the lower half and stays there, to `gain` with -240 on a zone with 24 dB of attenuation, swept from 0 to 127, pausing on each checked value.",
    pass: "The output goes from -1 to 1 over the lower half of the sweep and stays at 1: the level falls from the reference level to 48 dB below it by CC 64 and stays there. A mirrored curve would come back up.",
    length: sweepLength(8),
    bank: (b) => [
        b.reference(),
        curvePreset(b, "MOD-04 asymmetric", HALF_RISE, { bipolar: true })
    ],
    midi: (m, [reference, preset]) =>
        sweepMidi(m, reference, preset, [0, 16, 32, 48, 64, 80, 96, 127]),
    verify: (r, _presets, holds) =>
        checkSweep(r, holds, HALF_RISE, {
            bipolar: true
        })
});

export const MOD_05 = defineTest({
    id: "MOD-05",
    title: "A staircase with a negative direction",
    section: "7.2.1",
    description:
        "The reference tone. Then the staircase of MOD-02 on CC 16 with a negative direction, swept from 0 to 127, pausing on each checked value.",
    pass: "The same eight plateaus in reverse order: from 21 dB below the reference tone up to the reference level.",
    length: sweepLength(8),
    bank: (b) => [
        b.reference(),
        curvePreset(b, "MOD-05 reversed staircase", STAIRCASE, {
            negative: true
        })
    ],
    midi: (m, [reference, preset]) =>
        sweepMidi(m, reference, preset, [8, 24, 40, 56, 72, 88, 104, 120]),
    verify: (r, _presets, holds) =>
        checkSweep(r, holds, STAIRCASE, {
            negative: true
        })
});

const SPIKE: Points = [
    [0, 0],
    [8191, 0],
    [8192, 16_384],
    [8193, 0],
    [16_384, 0]
];
const LAST_STEP: Points = [
    [0, 0],
    [16_383, 0],
    [16_384, 16_384]
];

export const MOD_06 = defineTest({
    id: "MOD-06",
    title: "The negative direction is 16384 minus x",
    section: "7.2.1, 5.4",
    description:
        "The reference tone. Then a curve with a narrow spike at 8192 on CC 16 with a negative direction, at CC 16 = 64. Then a curve with the points (16383, 0) and (16384, 16384) with a negative direction, at CC 16 = 0.",
    pass: "Both notes are 24 dB below the reference tone. 64 stays exactly 8192 and hits the spike, and 0 becomes 16384, which reaches the last point. With 16383 minus x, both would miss and play at the reference level.",
    length: 3,
    bank: (b) => [
        b.reference(),
        curvePreset(b, "MOD-06 spike", SPIKE, { negative: true }),
        curvePreset(b, "MOD-06 last step", LAST_STEP, { negative: true })
    ],
    midi: (m, [reference, spike, last]) =>
        stepNotes(m, reference, [
            { preset: spike, at: (t) => m.cc(t, 0, 16, 64) },
            { preset: last, at: (t) => m.cc(t, 0, 16, 0) }
        ]),
    verify: (r) => {
        r.near("the spike at 64, in dB", stepLevelDb(r, 0), -24, 0.3);
        r.near("0 reaches 16384, in dB", stepLevelDb(r, 1), -24, 0.3);
    }
});

const VERTICAL: Points = [
    [0, 0],
    [8192, 0],
    [8192, 16_384],
    [16_384, 16_384]
];

export const MOD_07 = defineTest({
    id: "MOD-07",
    title: "A vertical step",
    section: "7.2.1",
    description:
        "The reference tone. Then the curve (0, 0), (8192, 0), (8192, 16384), (16384, 16384) on CC 16, at CC 16 = 63, 64 and 65.",
    pass: "Off, on, on: the reference level, then 24 dB below it twice. At an `x` with several points the last one gives the value.",
    length: 4,
    bank: (b) => [b.reference(), curvePreset(b, "MOD-07 vertical", VERTICAL)],
    midi: (m, [reference, preset]) =>
        valueMidi(m, reference, [preset], [63, 64, 65]),
    verify: (r) => {
        r.near("63 in dB", stepLevelDb(r, 0), 0, 0.3);
        r.near("64 in dB", stepLevelDb(r, 1), -24, 0.3);
        r.near("65 in dB", stepLevelDb(r, 2), -24, 0.3);
    }
});

const MIDDLE: Points = [
    [4096, 4096],
    [12_288, 12_288]
];

export const MOD_08 = defineTest({
    id: "MOD-08",
    title: "A curve that covers part of the range",
    section: "7.2.1",
    description:
        "The reference tone. Then a curve with points only from `x` 4096 to 12288, on CC 16 swept from 0 to 127, pausing on each checked value.",
    pass: "The level is flat at 6 dB below the reference tone up to CC 32, falls in a nearly straight line to 18 dB below it at CC 96 (with a slight bend at 64, where the steps grow from 128 to 130), and stays flat there.",
    length: sweepLength(9),
    bank: (b) => [b.reference(), curvePreset(b, "MOD-08 middle", MIDDLE)],
    midi: (m, [reference, preset]) =>
        sweepMidi(m, reference, preset, [0, 16, 32, 48, 64, 80, 96, 112, 127]),
    verify: (r, _presets, holds) => checkSweep(r, holds, MIDDLE)
});

const NARROW_STEP: Points = [
    [8192, 0],
    [8320, 16_384]
];

/**
 * The pitch wheel values of MOD-09, through the step of the curve and past it.
 */
const WHEEL_STEPS = [8192, 8224, 8256, 8288, 8319, 8448];

export const MOD_09 = defineTest({
    id: "MOD-09",
    title: "Interpolation between points",
    section: "7.2.1",
    description:
        "The reference tone. Then a curve of two points, (8192, 0) and (8320, 16384), on the Pitch Wheel, to `gain` with -240. The wheel steps 8192, 8224, 8256, 8288 and 8319, then goes to 8448.",
    pass: "The level falls in a straight line with the wheel: 0, 6, 12, 18 and 23.8 dB below the reference tone, then 24 dB at 8448.",
    length: 7,
    bank: (b) => {
        const curve = b.curve(NARROW_STEP, "MOD-09 narrow step");
        return [
            b.reference(),
            b.tone("MOD-09 interpolation", {}, [
                mod(src(14, { curve }), none(), G.gain, -240)
            ])
        ];
    },
    midi: (m, [reference, preset]) => {
        m.steps([reference]);
        for (const [i, wheel] of WHEEL_STEPS.entries()) {
            m.program(i + 1, 0, preset);
            m.pitchWheel(i + 1, 0, wheel);
            m.note(i + 1.05, 0.75);
        }
    },
    verify: (r) => {
        for (const [i, wheel] of WHEEL_STEPS.entries())
            r.near(
                `pitch wheel ${wheel} in dB`,
                stepLevelDb(r, i),
                -24 * customCurveOutput(NARROW_STEP, fourteenBitX(wheel)),
                0.3
            );
    }
});

/**
 * 16384 everywhere apart from 16384 itself, so only the value 16384 plays at the reference level.
 */
const NO_CONTROLLER: Points = [
    [0, 16_384],
    [16_383, 16_384],
    [16_384, 0]
];

export const MOD_10 = defineTest({
    id: "MOD-10",
    title: "The No Controller source is 16384",
    section: "5.4, 7.2",
    description:
        "The reference tone. Then the curve (0, 16384), (16383, 16384), (16384, 0) read by the No Controller source, to `gain` with -240, first with the positive and then with the negative direction. Only a source value of 16384 gives 0 on it.",
    pass: "The second note has the level of the reference tone: No Controller is 16384, the end of the range, where the curve is 0. A synthesizer that reads it as 16383 plays 24 dB lower. The third note is 24 dB below the reference: the negative direction turns 16384 into 0, where the curve is full.",
    length: 3,
    bank: (b) => {
        const curve = b.curve(NO_CONTROLLER, "MOD-10 only 16384");
        return [
            b.reference(),
            b.tone("MOD-10 no controller", {}, [
                mod(src(0, { curve }), none(), G.gain, -240)
            ]),
            b.tone("MOD-10 negative no controller", {}, [
                mod(src(0, { curve, negative: true }), none(), G.gain, -240)
            ])
        ];
    },
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = levelDb(r.at(0.2, 0.7));
        r.db(
            "positive against the reference in dB",
            levelDb(r.at(1.2, 1.7)) - reference,
            0
        );
        r.db(
            "negative against the reference in dB",
            levelDb(r.at(2.2, 2.7)) - reference,
            -24
        );
    }
});

export const MOD_11 = defineTest({
    id: "MOD-11",
    title: "The linear custom curve equals the SoundFont 2 linear type",
    section: "5.4",
    description:
        "The custom curve (0, 0), (16384, 16384) on CC 16 next to the SoundFont 2 linear type, both to `gain` with -240, first with a positive and then with a negative direction, each at CC 16 = 0, 32, 64, 96 and 127.",
    pass: "Each custom curve note has the same level as the SoundFont 2 note at the same value: `x / 16384`.",
    length: 21,
    bank: (b) => {
        const curve = b.curve(LINEAR, "MOD-11 linear");
        const preset = (name: string, options: Parameters<typeof cc>[1]) =>
            b.preset({
                name,
                zones: [
                    {
                        sample: b.sample("sine"),
                        modulators: [mod(cc(16, options), none(), G.gain, -240)]
                    }
                ]
            });
        return [
            b.reference(),
            preset("MOD-11 custom positive", { curve }),
            preset("MOD-11 linear positive", {}),
            preset("MOD-11 custom negative", { curve, negative: true }),
            preset("MOD-11 linear negative", { negative: true })
        ];
    },
    midi: (m, [reference, ...presets]) =>
        valueMidi(m, reference, presets, [0, 32, 64, 96, 127]),
    verify: (r) => {
        for (const [pair, label] of [
            [0, "positive"],
            [2, "negative"]
        ] as const)
            for (const [i, v] of [0, 32, 64, 96, 127].entries())
                r.db(
                    `${label} at ${v}, custom against linear in dB`,
                    stepLevelDb(r, pair * 5 + i) -
                        stepLevelDb(r, (pair + 1) * 5 + i),
                    0
                );
    }
});

const DOUBLE: Points = [
    [0, 0],
    [8192, 16_384],
    [16_384, 16_384]
];
const FALLING: Points = [
    [0, 16_384],
    [16_384, 0]
];
const PAIRS = [
    [32, 0],
    [64, 64],
    [127, 32],
    [16, 96]
];

export const MOD_12 = defineTest({
    id: "MOD-12",
    title: "Custom curves on both sources",
    section: "7.2.1",
    description:
        "The reference tone. Then CC 16 with the SoundFont 2 linear type as the source and CC 17 through a falling custom curve as the amount source. Then CC 16 through a curve that doubles and stops at 1, with the same amount source. Each at four pairs of CC 16 and CC 17 values: (32, 0), (64, 64), (127, 32) and (16, 96), all to `gain` with -240.",
    pass: "The level is 24 dB times the product of the two source outputs below the reference tone, each source read through its own curve.",
    length: 9,
    bank: (b) => {
        const falling = b.curve(FALLING, "MOD-12 falling");
        const double = b.curve(DOUBLE, "MOD-12 double");
        return [
            b.reference(),
            b.tone("MOD-12 amount curve", {}, [
                mod(cc(16), cc(17, { curve: falling }), G.gain, -240)
            ]),
            b.tone("MOD-12 both curves", {}, [
                mod(
                    cc(16, { curve: double }),
                    cc(17, { curve: falling }),
                    G.gain,
                    -240
                )
            ])
        ];
    },
    midi: (m, [reference, ...presets]) => {
        m.steps([reference]);
        let t = 1;
        for (const preset of presets)
            for (const [a, c] of PAIRS) {
                m.program(t, 0, preset);
                m.cc(t, 0, 16, a);
                m.cc(t, 0, 17, c);
                m.note(t + 0.05, 0.75);
                t++;
            }
    },
    verify: (r) => {
        for (const [i, [a, c]] of PAIRS.entries()) {
            const amount = customCurveOutput(FALLING, sevenBitX(c));
            r.near(
                `amount curve, CC 16 ${a} and CC 17 ${c}, in dB`,
                stepLevelDb(r, i),
                -24 * (sevenBitX(a) / 16_384) * amount,
                0.3
            );
            r.near(
                `both curves, CC 16 ${a} and CC 17 ${c}, in dB`,
                stepLevelDb(r, 4 + i),
                -24 * customCurveOutput(DOUBLE, sevenBitX(a)) * amount,
                0.3
            );
        }
    }
});

const VELOCITIES = [8, 24, 40, 56, 72, 88, 104, 120];

export const MOD_13 = defineTest({
    id: "MOD-13",
    title: "Custom curves on other sources",
    section: "7.2.1",
    description:
        "The staircase of MOD-02 on the Note-On Velocity (velocities 8 to 120 in steps of 16), on the Pitch Wheel as a unipolar source (the 14-bit values in the middle of each step), and on the Pitch Wheel as a bipolar source with a negative direction, with 24 dB of attenuation (the same values). The reference tone comes first.",
    pass: "Each source walks the eight plateaus: 3 dB apart below the reference tone for the first two, and for the bipolar one from 42 dB below the reference tone up to the reference level as the wheel rises, in steps of 6 dB.",
    length: 25,
    bank: (b) => {
        const stairs = b.curve(STAIRCASE, "MOD-13 staircase");
        const sine = b.sample("sine");
        return [
            b.reference(),
            b.preset({
                name: "MOD-13 velocity",
                zones: [
                    {
                        sample: sine,
                        modulators: [
                            mod(
                                src(2, {
                                    curve: stairs
                                }),
                                none(),
                                G.gain,
                                -240
                            )
                        ]
                    }
                ]
            }),
            b.preset({
                name: "MOD-13 pitch wheel",
                zones: [
                    {
                        sample: sine,
                        modulators: [
                            mod(
                                src(14, {
                                    curve: stairs
                                }),
                                none(),
                                G.gain,
                                -240
                            )
                        ]
                    }
                ]
            }),
            b.preset({
                name: "MOD-13 bipolar pitch wheel",
                zones: [
                    {
                        sample: sine,
                        generators: { [G.initialAttenuation]: 240 },
                        modulators: [
                            mod(
                                src(14, {
                                    curve: stairs,
                                    bipolar: true,
                                    negative: true
                                }),
                                none(),
                                G.gain,
                                -240
                            )
                        ]
                    }
                ]
            })
        ];
    },
    midi: (m, [reference, velocity, wheel, bipolar]) => {
        m.steps([reference]);
        for (const [i, v] of VELOCITIES.entries()) {
            m.program(1 + i, 0, velocity);
            m.note(1 + i, 0.8, { vel: v });
        }
        for (const [k, preset] of [wheel, bipolar].entries())
            for (const [i, v] of VELOCITIES.entries()) {
                const t = 9 + k * 8 + i;
                m.program(t, 0, preset);
                m.pitchWheel(t, 0, v * 128);
                m.note(t + 0.05, 0.75);
            }
    },
    verify: (r) => {
        const reference = levelDb(r.at(0.2, 0.7));
        for (const [i, v] of VELOCITIES.entries()) {
            r.near(
                `velocity ${v} in dB`,
                levelDb(r.at(1 + i + 0.2, 1 + i + 0.7)) - reference,
                -24 * customCurveOutput(STAIRCASE, sevenBitX(v)),
                0.3
            );
            // The wheel is sent as v * 128, a 14-bit value
            const wheel = fourteenBitX(v * 128);
            r.near(
                `pitch wheel ${v * 128} in dB`,
                levelDb(r.at(9 + i + 0.25, 9 + i + 0.75)) - reference,
                -24 * customCurveOutput(STAIRCASE, wheel),
                0.3
            );
            r.near(
                `bipolar pitch wheel ${v * 128} in dB`,
                levelDb(r.at(17 + i + 0.25, 17 + i + 0.75)) - reference,
                expectedLevel(
                    customCurveOutput(STAIRCASE, wheel, {
                        bipolar: true,
                        negative: true
                    }),
                    true
                ),
                0.3
            );
        }
    }
});

/**
 * Constant curves, one value each, for the curve numbering of MOD-15.
 */
function flat(value: number): Points {
    return [
        [0, value],
        [16_384, value]
    ];
}

const FORTY = "MOD-15 a curve name of forty characters!";

export const MOD_15 = defineTest({
    id: "MOD-15",
    title: "Curve numbering and names",
    section: "5.4",
    description:
        "Six flat curves: one used by three modulators, one that no modulator uses, one with an empty name, two with the same name, and one with a name of 40 characters. Each used curve has its own level, and each note uses one of them through CC 16 (at 127) to `gain` with -240. The reference tone comes first.",
    pass: "Every note has the level of its own curve: 3, 3 and 3 dB down for the shared curve, then 6, 12, 18 and 24 dB down. An unused curve or an unusual name does not move the curves after it to other numbers.",
    length: 8,
    bank: (b) => {
        const shared = b.curve(flat(2048), "MOD-15 shared");
        b.curve(flat(16_384), "MOD-15 unused");
        const empty = b.curve(flat(4096), "");
        const twinA = b.curve(flat(8192), "MOD-15 twin");
        const twinB = b.curve(flat(12_288), "MOD-15 twin");
        const long = b.curve(flat(16_384), FORTY);
        const preset = (name: string, curve: typeof shared) =>
            b.preset({
                name,
                zones: [
                    {
                        sample: b.sample("sine"),
                        modulators: [
                            mod(cc(16, { curve }), none(), G.gain, -240)
                        ]
                    }
                ]
            });
        return [
            b.reference(),
            preset("MOD-15 shared 1", shared),
            preset("MOD-15 shared 2", shared),
            preset("MOD-15 shared 3", shared),
            preset("MOD-15 empty name", empty),
            preset("MOD-15 twin A", twinA),
            preset("MOD-15 twin B", twinB),
            preset("MOD-15 long name", long)
        ];
    },
    midi: (m, [reference, ...presets]) =>
        valueMidi(m, reference, presets, [127]),
    verify: (r) => {
        for (const [i, db] of [-3, -3, -3, -6, -12, -18, -24].entries())
            r.near(`note ${i + 2} in dB`, stepLevelDb(r, i), db, 0.3);
    }
});

export const MOD_16 = defineTest({
    id: "MOD-16",
    title: "A custom curve modulator in a preset zone",
    section: "5.5.1",
    description:
        "The staircase of MOD-02 on CC 16 at 127 to `gain`: first with -240 in the instrument zone only, then with -120 more in the preset zone.",
    pass: "The first note is 21 dB below the reference tone. The second is 31.5 dB below it: the preset modulator adds to the instrument one.",
    length: 3,
    bank: (b) => {
        const stairs = b.curve(STAIRCASE, "MOD-16 staircase");
        // Both presets use the same instrument
        const instrument = b.instrument("MOD-16 instrument", [
            {
                sample: b.sample("sine"),
                modulators: [
                    mod(cc(16, { curve: stairs }), none(), G.gain, -240)
                ]
            }
        ]);
        return [
            b.reference(),
            b.preset({ name: "MOD-16 instrument", zones: instrument }),
            b.preset({
                name: "MOD-16 instrument and preset",
                zones: instrument,
                presetModulators: [
                    mod(cc(16, { curve: stairs }), none(), G.gain, -120)
                ]
            })
        ];
    },
    midi: (m, [reference, ...presets]) =>
        valueMidi(m, reference, presets, [127]),
    verify: (r) => {
        r.near("instrument only in dB", stepLevelDb(r, 0), -21, 0.3);
        r.near("instrument and preset in dB", stepLevelDb(r, 1), -31.5, 0.3);
    }
});

export const MOD_17 = defineTest({
    id: "MOD-17",
    title: "The absolute value transform on a custom curve",
    section: "5.5.1, 7.4",
    description:
        "The reference tone. Then CC 16 as a bipolar source through the linear custom curve, with the absolute value transform, to `gain` with 240, on a zone with 24 dB of attenuation, swept from 0 to 127. The modulator has the extended flag, so its transform is stored as 0x8002.",
    pass: "A V shape: the reference level at CC 0 and at CC 127, 24 dB below it at CC 64. The transform is the lower 15 bits of the enumerator.",
    length: sweepLength(5),
    bank: (b) => {
        const curve = b.curve(LINEAR, "MOD-17 linear");
        return [
            b.reference(),
            b.tone("MOD-17 absolute", { [G.initialAttenuation]: 240 }, [
                mod(cc(16, { curve, bipolar: true }), none(), G.gain, 240, 2)
            ])
        ];
    },
    midi: (m, [reference, preset]) =>
        sweepMidi(m, reference, preset, [0, 32, 64, 96, 127]),
    verify: (r, _presets, holds) => {
        const reference = levelDb(r.at(0.2, 0.7));
        for (const [v, start] of holds)
            r.near(
                `CC 16 at ${v}, level in dB`,
                holdLevel(r, start, reference),
                -24 +
                    24 *
                        Math.abs(
                            customCurveOutput(LINEAR, sevenBitX(v), {
                                bipolar: true
                            })
                        ),
                0.3
            );
    }
});

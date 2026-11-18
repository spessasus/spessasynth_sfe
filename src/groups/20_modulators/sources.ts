import {
    type GeneratorType,
    GeneratorTypes as G,
    type ModulatorSourceIndex
} from "spessasynth_core";
import {
    cc,
    type Generators,
    mod,
    none,
    src
} from "../../framework/bank_builder";
import {
    centsFrom440,
    envelopeDb,
    firstSound,
    frequency,
    levelDb,
    lowpassCutoffHz
} from "../../framework/measure";
import type { Timeline } from "../../framework/midi_writer";
import {
    absoluteCentsToHz,
    filterGainDb,
    fourteenBitX,
    hzToAbsoluteCents,
    sevenBitX
} from "../../framework/spec_math";
import {
    defineTest,
    type PresetRef,
    type TestRender
} from "../../framework/types";
import {
    holdLevel,
    sweepLength,
    stepLevelDb,
    sweepMidi,
    stepNotes
} from "./common";

/**
 * The pitch in cents from 440 Hz of the note at the index (notes start at 1 s, after the reference tone).
 */
function notePitch(r: TestRender, index: number) {
    return centsFrom440(frequency(r.at(index + 1.2, index + 1.7)));
}

/**
 * The reference tone, then one note per step, each step sent just before its note.
 */
function stepMidi(
    m: Timeline,
    reference: PresetRef,
    preset: PresetRef,
    steps: ((t: number) => void)[],
    key = 69
) {
    stepNotes(
        m,
        reference,
        steps.map((at) => ({ preset, at })),
        { key }
    );
}

export const MOD_18 = defineTest({
    id: "MOD-18",
    title: "7-bit scaling: 64 is exactly the center",
    section: "7.2",
    description:
        "The reference tone. Then a bipolar linear modulator from CC 16 to `fineTune` with the amount 12700, with CC 16 at 64.",
    pass: "The second note has exactly the pitch of the reference tone: 64 is 8192 of 16384, the center. Scaling 64 by 127 would put it about 100 cents up.",
    length: 2,
    bank: (b) => [
        b.reference(),
        b.tone("MOD-18 center", {}, [
            mod(cc(16, { bipolar: true }), none(), G.fineTune, 12_700)
        ])
    ],
    midi: (m, [reference, preset]) =>
        stepMidi(m, reference, preset, [(t) => m.cc(t, 0, 16, 64)]),
    verify: (r) => r.cents("pitch in cents", notePitch(r, 0), 0)
});

export const MOD_19 = defineTest({
    id: "MOD-19",
    title: "The controllers 33 to 63 are sources of their own",
    section: "7.2, 11.3",
    description:
        "The reference tone. Then a bipolar linear modulator from CC 17 to `fineTune` with the amount 6350, with CC 17 at 64 and CC 49 at 127. Then a unipolar linear modulator from CC 49 to `fineTune` with the amount 1200: CC 49 at 64, then at 127, then CC 17 at 100 after CC 49 at 127.",
    pass: "0, 600, 1200 and 1200 cents above the reference tone. CC 49 is not the LSB of CC 17, so it does not move the first modulator, and a CC 17 message does not reset it.",
    length: 5,
    bank: (b) => [
        b.reference(),
        b.tone("MOD-19 CC 17", {}, [
            mod(cc(17, { bipolar: true }), none(), G.fineTune, 6350)
        ]),
        b.tone("MOD-19 CC 49", {}, [mod(cc(49), none(), G.fineTune, 1200)])
    ],
    midi: (m, [reference, cc17, cc49]) =>
        stepNotes(m, reference, [
            {
                preset: cc17,
                at: (t) => {
                    m.cc(t, 0, 17, 64);
                    m.cc(t, 0, 49, 127);
                }
            },
            { preset: cc49, at: (t) => m.cc(t, 0, 49, 64) },
            { preset: cc49, at: (t) => m.cc(t, 0, 49, 127) },
            { preset: cc49, at: (t) => m.cc(t, 0, 17, 100) }
        ]),
    verify: (r) => {
        r.cents("CC 49 under a CC 17 modulator, in cents", notePitch(r, 0), 0);
        for (const [i, v] of [64, 127, 127].entries())
            r.cents(
                `CC 49 at ${v}${i === 2 ? " after CC 17" : ""}, in cents`,
                notePitch(r, i + 1),
                (1200 * sevenBitX(v)) / 16_384
            );
    }
});

const FULL_SCALE = [64, 96, 127];

export const MOD_20 = defineTest({
    id: "MOD-20",
    title: "Full scale at 127",
    section: "7.2",
    description:
        "The reference tone. Then a unipolar linear modulator from CC 16 to `fineTune` with the amount 1200, at CC 16 = 64, 96 and 127. Then a bipolar linear one with the same amount at 0 and at 127.",
    pass: "600, 904.8 and 1200 cents above the reference tone, then 1200 cents below and 1200 above it. 64 is the center, 127 is exactly full scale, and the steps above 64 are 1/126 of the range. Scaling by 128 would give 900 and 1190.6 cents.",
    length: 6,
    bank: (b) => [
        b.reference(),
        b.tone("MOD-20 unipolar", {}, [mod(cc(16), none(), G.fineTune, 1200)]),
        b.tone("MOD-20 bipolar", {}, [
            mod(cc(16, { bipolar: true }), none(), G.fineTune, 1200)
        ])
    ],
    midi: (m, [reference, unipolar, bipolar]) =>
        stepNotes(m, reference, [
            ...FULL_SCALE.map((v) => ({
                preset: unipolar,
                at: (t: number) => m.cc(t, 0, 16, v)
            })),
            ...[0, 127].map((v) => ({
                preset: bipolar,
                at: (t: number) => m.cc(t, 0, 16, v)
            }))
        ]),
    verify: (r) => {
        for (const [i, v] of FULL_SCALE.entries())
            r.cents(
                `unipolar, CC 16 at ${v}, in cents`,
                notePitch(r, i),
                (1200 * sevenBitX(v)) / 16_384
            );
        for (const [i, v] of [0, 127].entries())
            r.cents(
                `bipolar, CC 16 at ${v}, in cents`,
                notePitch(r, 3 + i),
                (1200 * (sevenBitX(v) - 8192)) / 8192
            );
    }
});

const WHEEL = [0, 4096, 8192, 12_288, 16_383];

export const MOD_21 = defineTest({
    id: "MOD-21",
    title: "The Pitch Wheel as a bipolar source",
    section: "7.2",
    description:
        "The reference tone. Then the Pitch Wheel as a bipolar linear source to `gain` with -120, on a zone with 12 dB of attenuation, at 0, 4096, 8192, 12288 and 16383.",
    pass: "Equal steps of 6 dB, from the reference level down to 24 dB below it, with no special step at the center: the wheel is its 14-bit value, and 16383 is full scale.",
    length: 6,
    bank: (b) => [
        b.reference(),
        b.tone("MOD-21 wheel", { [G.initialAttenuation]: 120 }, [
            mod(src(14, { bipolar: true }), none(), G.gain, -120)
        ])
    ],
    midi: (m, [reference, preset]) =>
        stepMidi(
            m,
            reference,
            preset,
            WHEEL.map((v) => (t: number) => m.pitchWheel(t, 0, v))
        ),
    verify: (r) => {
        for (const [i, v] of WHEEL.entries())
            r.db(
                `wheel ${v} in dB`,
                stepLevelDb(r, i),
                -12 - 12 * ((fourteenBitX(v) - 8192) / 8192)
            );
    }
});

/**
 * RPN 0 settings and the source value they give: `semitones * 128` plus the cents, rounded down, at most 16383.
 */
const SENSITIVITY = [
    { msb: 2, lsb: 0, source: 256 },
    { msb: 24, lsb: 0, source: 3072 },
    { msb: 12, lsb: 99, source: 1662 },
    { msb: 127, lsb: 127, source: 16_383 }
];

export const MOD_22 = defineTest({
    id: "MOD-22",
    title: "The Pitch Wheel Sensitivity as a source",
    section: "7.2",
    description:
        "The Pitch Wheel Sensitivity as a unipolar linear source to `fineTune` with 12700. RPN 0 at 2 semitones, 24 semitones, 12 semitones and 99 cents, and 127 semitones and 127 cents. The last note is at key 0, so its pitch stays below the Nyquist frequency. The reference tone comes first.",
    pass: "198.4, 2381.3 and 1288.3 cents above the reference tone (12.99 semitones times 128, 1662.7, so the cents of the LSB count, rounded down to 1662: the rounding itself is within the tolerance), and 12700 cents above key 0, about 12.5 kHz: 128.27 semitones would be 16418, and the source stops at 16383, which is full scale.",
    length: 5,
    bank: (b) => [
        b.reference(),
        b.tone("MOD-22 sensitivity", {}, [
            mod(src(16), none(), G.fineTune, 12_700)
        ])
    ],
    midi: (m, [reference, preset]) => {
        m.steps([reference]);
        for (const [i, s] of SENSITIVITY.entries()) {
            const t = i + 1;
            m.program(t, 0, preset);
            m.rpn(t, 0, [0, 0], s.msb, s.lsb);
            m.note(t + 0.05, 0.75, { key: i === 3 ? 0 : 69 });
        }
    },
    verify: (r) => {
        for (const [i, s] of SENSITIVITY.entries()) {
            const expected =
                (fourteenBitX(s.source) / 16_384) * 12_700 -
                (i === 3 ? 6900 : 0);
            r.near(
                `RPN 0 at ${s.msb} and ${s.lsb}, in cents`,
                notePitch(r, i),
                expected,
                i === 3 ? 3 : 2
            );
        }
    }
});

/**
 * RPN 5 settings: semitones and the LSB in 100/128 cents.
 */
const DEPTH = [
    { msb: 0, lsb: 0 },
    { msb: 0, lsb: 64 },
    { msb: 1, lsb: 0 },
    { msb: 8, lsb: 0 },
    { msb: 16, lsb: 0 },
    { msb: 32, lsb: 0 }
];

export const MOD_23 = defineTest({
    id: "MOD-23",
    title: "The Modulation Depth Range as a source",
    section: "7.2",
    description:
        "The Modulation Depth Range as a unipolar linear source to `fineTune` with 1600. RPN 5 at 0, 50 cents, 1, 8, 16 and 32 semitones. The reference tone comes first.",
    pass: "0, 50, 100, 800, 1600 and 1600 cents above the reference tone: the source is `min(16383, 8 * v)`, the center at 8 semitones and full scale from 16.",
    length: 7,
    bank: (b) => [
        b.reference(),
        b.tone("MOD-23 depth range", {}, [
            mod(src(17), none(), G.fineTune, 1600)
        ])
    ],
    midi: (m, [reference, preset]) =>
        stepMidi(
            m,
            reference,
            preset,
            DEPTH.map((d) => (t: number) => m.rpn(t, 0, [0, 5], d.msb, d.lsb))
        ),
    verify: (r) => {
        for (const [i, d] of DEPTH.entries()) {
            const source = Math.min(16_383, 8 * (d.msb * 128 + d.lsb));
            r.cents(
                `RPN 5 at ${d.msb} and ${d.lsb}, in cents`,
                notePitch(r, i),
                (fourteenBitX(source) / 16_384) * 1600
            );
        }
    }
});

const VALUES = [32, 64, 96, 127];

export const MOD_24 = defineTest({
    id: "MOD-24",
    title: "Velocity, key, poly pressure and channel pressure as sources",
    section: "7.2",
    description:
        "Each of the Note-On Velocity, the Note-On Key Number, the Poly Pressure and the Channel Pressure as a unipolar linear source to `gain` with -240, and as a bipolar linear source to `fineTune` with 1200, at 32, 64, 96 and 127. The key number zone has `scaleTuning` 0, so every key plays 440 Hz. The reference tone comes first.",
    pass: "For each source: 6, 12, 18.1 and 24 dB below the reference tone, and -600, 0, 609.5 and 1200 cents. 64 is exactly half, so the pitch is exactly 440 Hz there, and 127 is exactly full scale.",
    length: 17,
    bank: (b) => {
        const preset = (name: string, index: ModulatorSourceIndex) =>
            b.preset({
                name,
                zones: [
                    {
                        sample: b.sample("sine"),
                        generators: { [G.scaleTuning]: 0 },
                        modulators: [
                            mod(src(index), none(), G.gain, -240),
                            mod(
                                src(index, { bipolar: true }),
                                none(),
                                G.fineTune,
                                1200
                            )
                        ]
                    }
                ]
            });
        return [
            b.reference(),
            preset("MOD-24 velocity", 2),
            preset("MOD-24 key", 3),
            preset("MOD-24 poly pressure", 10),
            preset("MOD-24 channel pressure", 13)
        ];
    },
    midi: (m, [reference, velocity, key, poly, channel]) => {
        m.steps([reference]);
        for (const [i, v] of VALUES.entries()) {
            m.program(1 + i, 0, velocity);
            m.note(1 + i, 0.8, { vel: v });
            m.program(5 + i, 0, key);
            m.note(5 + i, 0.8, { key: v });
            m.program(9 + i, 0, poly);
            m.note(9 + i, 0.8);
            m.polyPressure(9 + i + 0.01, 0, 69, v);
            m.program(13 + i, 0, channel);
            m.channelPressure(13 + i, 0, v);
            m.note(13 + i + 0.05, 0.75);
        }
    },
    verify: (r) => {
        for (const [k, label] of [
            "velocity",
            "key",
            "poly pressure",
            "channel pressure"
        ].entries())
            for (const [i, v] of VALUES.entries()) {
                r.db(
                    `${label} ${v} in dB`,
                    stepLevelDb(r, k * 4 + i),
                    (-24 * sevenBitX(v)) / 16_384
                );
                // The bipolar modulator is exactly at its center at 64
                r.cents(
                    `${label} ${v}, pitch in cents`,
                    centsFrom440(
                        frequency(r.at(k * 4 + i + 1.25, k * 4 + i + 1.75))
                    ),
                    (1200 * (sevenBitX(v) - 8192)) / 8192
                );
            }
    }
});

/**
 * The swing of the level in dB over a stretch: the loudest window minus the quietest.
 */
function swing(r: TestRender, from: number, to: number, window: number) {
    const env = envelopeDb(r.at(from, to), window);
    return Math.max(...env) - Math.min(...env);
}

export const MOD_26 = defineTest({
    id: "MOD-26",
    title: "Modulators to SFe generators",
    section: "7.1",
    description:
        "CC 16 moves from 0 to 127 halfway through each held note, with a modulator to an SFe generator: `gain` (-240), `filterQOffset` (100, the `sine` on a lowpass cutoff), `maxFilterFc` (-6000, the `noise` with an open filter), `modLfoToAmplitude` (500, 2 Hz) and `vibLfoToFilterFc` (2400, the `noise` through a bandpass).",
    pass: "Each note changes when the controller moves: 24 dB quieter, 10 dB louder (the resonance peak at the cutoff, with no gain reduction from `filterQOffset`), a lowpass at about 620 Hz (7500 absolute cents), a tremolo appears, and a filter sweep appears.",
    length: 10,
    bank: (b) => {
        const sine = b.sample("sine");
        const noise = b.sample("noise");
        const fromCC = (
            name: string,
            sample: typeof sine,
            generators: Generators,
            destination: GeneratorType,
            amount: number
        ) =>
            b.preset({
                name: `MOD-26 ${name}`,
                zones: [
                    {
                        sample,
                        generators,
                        modulators: [mod(cc(16), none(), destination, amount)]
                    }
                ]
            });
        return [
            fromCC("gain", sine, {}, G.gain, -240),
            fromCC(
                "Q offset",
                sine,
                { [G.initialFilterFc]: 6900 },
                G.filterQOffset,
                100
            ),
            fromCC("max cutoff", noise, {}, G.maxFilterFc, -6000),
            fromCC(
                "amplitude",
                sine,
                { [G.freqModLFO]: hzToAbsoluteCents(2) },
                G.modLfoToAmplitude,
                500
            ),
            fromCC(
                "vib to filter",
                noise,
                {
                    [G.filterType]: 2,
                    [G.initialFilterFc]: 9000,
                    [G.initialFilterQ]: 100,
                    [G.freqVibLFO]: hzToAbsoluteCents(2)
                },
                G.vibLfoToFilterFc,
                2400
            )
        ];
    },
    // Returns the start of each preset's two seconds, with CC 16 moved 0.95 s in
    midi: (m, presets) =>
        presets.map((preset, i) => {
            const t = i * 2;
            m.program(t, 0, preset);
            m.cc(t, 0, 16, 0);
            m.note(t + 0.05, 1.8);
            m.cc(t + 0.95, 0, 16, 127);
            return t;
        }),
    verify: (r, _presets, starts) => {
        const before = (i: number) =>
            levelDb(r.at(starts[i] + 0.3, starts[i] + 0.9));
        const after = (i: number) =>
            levelDb(r.at(starts[i] + 1.2, starts[i] + 1.8));
        const t = (i: number, offset: number) => starts[i] + offset;
        r.near("gain: change in dB", after(0) - before(0), -24, 0.3);
        r.near(
            "filterQOffset: change in dB",
            after(1) - before(1),
            filterGainDb("lowpass", 440, 6900, 100, 0) -
                filterGainDb("lowpass", 440, 6900, 0),
            0.3
        );
        // Windows 1 s apart read the same stretch of the looped noise
        const cutoff = lowpassCutoffHz(
            r.at(t(2, 1.25), t(2, 1.85)),
            r.at(t(2, 0.25), t(2, 0.85))
        );
        r.near(
            "maxFilterFc: the ceiling after, in cents from 7500",
            1200 * Math.log2(cutoff / absoluteCentsToHz(13_500 - 6000)),
            0,
            50
        );
        r.check(
            "modLfoToAmplitude: no tremolo before",
            swing(r, t(3, 0.3), t(3, 0.9), 2 / 440) < 0.3
        );
        r.check(
            "modLfoToAmplitude: a tremolo after",
            swing(r, t(3, 1.2), t(3, 1.8), 2 / 440) > 8
        );
        r.check(
            "vibLfoToFilterFc: still before",
            swing(r, t(4, 0.3), t(4, 0.9), 0.05) < 1.5
        );
        r.check(
            "vibLfoToFilterFc: a sweep after",
            swing(r, t(4, 1.2), t(4, 1.9), 0.05) > 6
        );
    }
});

export const MOD_27 = defineTest({
    id: "MOD-27",
    title: "delayVoice is read once",
    section: "7.1.2",
    description:
        "The `click` with `delayVoice` 0.5 s and a modulator from CC 16 to `delayVoice` with the amount 1200. First CC 16 is 127 at the note on and 0 just after it. Then CC 16 is 0 at the note on and 127 just after it.",
    pass: "The first click comes 1 s after its note on, the second 0.5 s after its note on: only the value at the note on counts.",
    length: 4,
    bank: (b) => [
        b.preset({
            name: "MOD-27 delay from CC 16",
            zones: [
                {
                    sample: b.sample("click"),
                    generators: { [G.sampleModes]: 0, [G.delayVoice]: -1200 },
                    modulators: [mod(cc(16), none(), G.delayVoice, 1200)]
                }
            ]
        })
    ],
    midi: (m, [preset]) => {
        m.program(0, 0, preset);
        m.cc(0, 0, 16, 127);
        m.note(0.05, 1.5);
        m.cc(0.1, 0, 16, 0);
        m.cc(2, 0, 16, 0);
        m.note(2.05, 1.5);
        m.cc(2.1, 0, 16, 127);
    },
    verify: (r) => {
        const first = firstSound(r.at(0.05, 1.9), -60) / r.sampleRate;
        r.near("first click after its note on, in s", first, 1, 0.01);
        const second = firstSound(r.at(2.05, 3.9), -60) / r.sampleRate;
        r.near("second click after its note on, in s", second, 0.5, 0.01);
    }
});

export const MOD_28 = defineTest({
    id: "MOD-28",
    title: "The absolute value transform",
    section: "7.4",
    description:
        "The reference tone. Then CC 16 as a bipolar linear source with the absolute value transform (2), to `gain` with 240, on a zone with 24 dB of attenuation, swept from 0 to 127, pausing on each checked value.",
    pass: "A V shape: the reference level at CC 0 and at CC 127, 24 dB below it at CC 64.",
    length: sweepLength(5),
    bank: (b) => [
        b.reference(),
        b.tone("MOD-28 absolute", { [G.initialAttenuation]: 240 }, [
            mod(cc(16, { bipolar: true }), none(), G.gain, 240, 2)
        ])
    ],
    midi: (m, [reference, preset]) =>
        sweepMidi(m, reference, preset, [0, 32, 64, 96, 127]),
    verify: (r, _presets, holds) => {
        const reference = levelDb(r.at(0.2, 0.7));
        for (const [v, start] of holds)
            r.near(
                `CC 16 at ${v}, level in dB`,
                holdLevel(r, start, reference),
                -24 + 24 * Math.abs((sevenBitX(v) - 8192) / 8192),
                0.3
            );
    }
});

export const MOD_29 = defineTest({
    id: "MOD-29",
    title: "The attenuation follows its modulators in the sustain and the release",
    section: "8.1.3",
    description:
        "The reference tone. Then the `sine` with a decay of 0.5 s to `sustainVolEnv` 120 and a release of 4 s (24 dB per second), a modulator from CC 16 to `initialAttenuation` with 240 and one from CC 17 to `gain` with 240. Both controllers are 0 at the note on. CC 16 moves to 127 in the sustain, and after the note off CC 17 moves to 64 in the release.",
    pass: "In the sustain the level falls by 24 dB when CC 16 moves. In the release it rises by 12 dB when CC 17 moves, on top of the falling release: 4.8 dB higher 0.3 s later instead of 7.2 dB lower. The attenuation follows its modulators in every phase of the Volume Envelope. (How a modulator to an envelope generator acts during a note is not defined, spec 8.1.6.)",
    length: 4.5,
    bank: (b) => [
        b.reference(),
        b.tone(
            "MOD-29 attenuation",
            {
                [G.decayVolEnv]: -1200,
                [G.sustainVolEnv]: 120,
                [G.releaseVolEnv]: 2400
            },
            [
                mod(cc(16), none(), G.initialAttenuation, 240),
                mod(cc(17), none(), G.gain, 240)
            ]
        )
    ],
    midi: (m, [reference, preset]) => {
        m.steps([reference]);
        m.program(1, 0, preset);
        m.cc(1, 0, 16, 0);
        m.cc(1, 0, 17, 0);
        m.note(1.05, 1);
        m.cc(1.5, 0, 16, 127);
        m.cc(2.4, 0, 17, 64);
        m.cc(4.4, 0, 16, 0);
        m.cc(4.4, 0, 17, 0);
    },
    verify: (r) => {
        const level = (t: number) => levelDb(r.at(t - 0.01, t + 0.01));
        r.near(
            "the sustain, CC 16 to 127, change in dB",
            levelDb(r.at(1.6, 1.95)) - levelDb(r.at(1.25, 1.45)),
            (-240 * sevenBitX(127)) / 16_384 / 10,
            0.3
        );
        // Both points are in the release, so its start does not matter: 0.3 s of 24 dB per second, plus 12 dB
        r.near(
            "the release, CC 17 to 64, from 2.3 s to 2.6 s, in dB",
            level(2.6) - level(2.3),
            -24 * 0.3 + (240 * sevenBitX(64)) / 16_384 / 10,
            0.5
        );
    }
});

/**
 * The CC 16 values of MOD-30, each with the cents a positive and a negative switch give there.
 */
const SWITCH_STEPS = [
    { value: 63, positive: 0, negative: 1200 },
    { value: 64, positive: 1200, negative: 0 },
    { value: 127, positive: 1200, negative: 0 }
];

export const MOD_30 = defineTest({
    id: "MOD-30",
    title: "The switch at 8192, in both directions",
    section: "7.2",
    description:
        "Two presets with CC 16 through the switch curve to `fineTune` with 1200, one with the positive direction and one with the negative direction. Each plays with CC 16 at 63, 64 and 127.",
    pass: "The positive switch is off at 63 (440 Hz) and on at 64 and 127 (one octave up). The negative switch is the exact opposite: on at 63, off at 64 and 127. A 7-bit 64 is 8192, where the switch turns.",
    length: 6,
    bank: (b) =>
        [false, true].map((negative) =>
            b.tone(`MOD-30 ${negative ? "negative" : "positive"} switch`, {}, [
                mod(
                    cc(16, { curve: "switch", negative }),
                    none(),
                    G.fineTune,
                    1200
                )
            ])
        ),
    midi: (m, presets) => {
        for (const [p, preset] of presets.entries())
            for (const [i, step] of SWITCH_STEPS.entries()) {
                const t = (p * SWITCH_STEPS.length + i) * 1;
                m.program(t, 0, preset);
                m.cc(t, 0, 16, step.value);
                m.note(t + 0.05, 0.6);
                m.cc(t + 0.9, 0, 16, 0);
            }
    },
    verify: (r) => {
        for (const [p, direction] of (
            ["positive", "negative"] as const
        ).entries())
            for (const [i, step] of SWITCH_STEPS.entries()) {
                const t = p * SWITCH_STEPS.length + i;
                r.cents(
                    `${direction} switch at ${step.value}, in cents`,
                    centsFrom440(frequency(r.at(t + 0.15, t + 0.55))),
                    step[direction]
                );
            }
    }
});

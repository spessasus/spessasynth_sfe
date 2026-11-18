import {
    type BasicSample,
    type GeneratorType,
    GeneratorTypes as G
} from "spessasynth_core";
import {
    cc,
    constant,
    DECAY_AT_ONCE,
    type Generators,
    mod,
    none,
    src,
    type ZoneSpec
} from "../../framework/bank_builder";
import {
    centsFrom440,
    firstSound,
    frequency,
    levelDb
} from "../../framework/measure";
import { sevenBitX } from "../../framework/spec_math";
import { defineTest } from "../../framework/types";
import {
    AMPLITUDE_WINDOW,
    checkDecayGoesOn,
    checkShape,
    envelopeDifference,
    sustainDb,
    pitchAt,
    pitchCrossing,
    soundLength,
    voiceStart,
    HZ_2
} from "./common";

/**
 * The amplitude LFO used to show a waveform: 2 Hz with `modLfoToAmplitude` 500.
 */
const SHOW_MOD_LFO = { [G.freqModLFO]: HZ_2, [G.modLfoToAmplitude]: 500 };
const SHOW_VIB_LFO = { [G.freqVibLFO]: HZ_2, [G.vibLfoToAmplitude]: 500 };

export const GEN_79 = defineTest({
    id: "GEN-79",
    title: "Enumerations are truncated toward zero",
    section: "7.1",
    description:
        "The reference tone. Then the `sine` with `modLfoToAmplitude` 500 at 2 Hz and a unipolar linear modulator from CC 16 to `modLfoWaveform` with the amount 4, with CC 16 at 0, 56, 88 and 127.",
    pass: "The tremolo is a triangle, a sawtooth, a sine and a square: 0, 1.75, 2.76 and 4 give 0, 1, 2 and 3 (truncated toward zero, and 4 clamped to the range). Rounding would give a sine, a square and a square.",
    length: 5,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-79 waveform from CC 16", SHOW_MOD_LFO, [
            mod(cc(16), none(), G.modLfoWaveform, 4)
        ])
    ],
    midi: (m, [reference, preset]) => {
        m.steps([reference]);
        for (const [i, value] of [0, 56, 88, 127].entries()) {
            m.program(i + 1, 0, preset);
            m.cc(i + 1, 0, 16, value);
            m.note(i + 1, 0.95);
        }
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        for (const waveform of [0, 1, 2, 3])
            checkShape(
                r,
                `CC 16 step ${waveform + 1}`,
                waveform + 1,
                reference,
                2,
                500,
                waveform
            );
    }
});

export const GEN_80 = defineTest({
    id: "GEN-80",
    title: "Enumerations are clamped to their range",
    section: "7.1",
    description:
        "The reference tone. Then constant modulators that push `modLfoWaveform` to 10 and to -2, each with `modLfoToAmplitude` 500 at 2 Hz. Then one that pushes `filterType` to 9 on the `sine` on a cutoff of 440 Hz. Then one that pushes `ignoreNoteOff` to 5 on a note of 0.1 s that decays to silence over 2 s from the first sound (zero time for its delay, attack and hold).",
    pass: "A square, a triangle, a nearly silent note (the notch on its cutoff) and a note that plays its whole decay (on, 9.6 dB lower 0.5 s in than 0.3 s in): each value is clamped to its range after truncation.",
    length: 6,
    bank: (b) => {
        const sine = b.sample("sine");
        return [
            b.reference(),
            ...[10, -2].map((value) =>
                b.preset({
                    name: `GEN-80 waveform ${value}`,
                    zones: [
                        {
                            sample: sine,
                            generators: SHOW_MOD_LFO,
                            modulators: [constant(G.modLfoWaveform, value)]
                        }
                    ]
                })
            ),
            b.preset({
                name: "GEN-80 filter type 9",
                zones: [
                    {
                        sample: sine,
                        generators: {
                            [G.initialFilterFc]: 6900,
                            [G.initialFilterQ]: 200
                        },
                        modulators: [constant(G.filterType, 9)]
                    }
                ]
            }),
            b.preset({
                name: "GEN-80 ignoreNoteOff 5",
                zones: [
                    {
                        sample: sine,
                        generators: {
                            ...DECAY_AT_ONCE,
                            [G.decayVolEnv]: 1200,
                            [G.sustainVolEnv]: 1000
                        },
                        modulators: [constant(G.ignoreNoteOff, 5)]
                    }
                ]
            })
        ];
    },
    midi: (m, [reference, ten, minusTwo, filter, ignore]) => {
        m.steps([reference, ten, minusTwo, filter], { length: 0.95 });
        m.steps([ignore], { start: 4, length: 0.1 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        checkShape(r, "waveform 10", 1, reference, 2, 500, 3);
        checkShape(r, "waveform -2", 2, reference, 2, 500, 0);
        const notch = sustainDb(r, 3) - reference;
        r.check(
            "filter type 9 is the notch, at least 30 dB down",
            notch < -30,
            `${notch.toFixed(1)} dB`
        );
        checkDecayGoesOn(
            r,
            "ignoreNoteOff 5 is on",
            voiceStart(r, 4),
            reference
        );
    }
});

export const GEN_81 = defineTest({
    id: "GEN-81",
    title: "Instrument-only generators in preset zones are ignored",
    section: "7.1",
    description:
        "Presets whose zones set `filterType` 4, `modLfoWaveform` 3, `vibLfoWaveform` 3 and `ignoreNoteOff` 1: a lowpass on the cutoff of the `sine`, a triangle tremolo of each LFO, and a note of 0.1 s that decays over 2 s. The reference tone comes first.",
    pass: "Each preset value is ignored: the note on the cutoff is 3 dB below the reference tone (a lowpass, not a notch), both tremolos are triangles, and the short note stops after its note off.",
    length: 6,
    bank: (b) => {
        const sine = b.sample("sine");
        return [
            b.reference(),
            b.preset({
                name: "GEN-81 preset filter type",
                zones: [
                    { sample: sine, generators: { [G.initialFilterFc]: 6900 } }
                ],
                presetGenerators: { [G.filterType]: 4 }
            }),
            b.preset({
                name: "GEN-81 preset mod waveform",
                zones: [{ sample: sine, generators: SHOW_MOD_LFO }],
                presetGenerators: { [G.modLfoWaveform]: 3 }
            }),
            b.preset({
                name: "GEN-81 preset vib waveform",
                zones: [{ sample: sine, generators: SHOW_VIB_LFO }],
                presetGenerators: { [G.vibLfoWaveform]: 3 }
            }),
            b.preset({
                name: "GEN-81 preset ignoreNoteOff",
                zones: [
                    {
                        sample: sine,
                        generators: {
                            [G.decayVolEnv]: 1200,
                            [G.sustainVolEnv]: 1000
                        }
                    }
                ],
                presetGenerators: { [G.ignoreNoteOff]: 1 }
            })
        ];
    },
    midi: (m, [reference, filter, modWave, vibWave, ignore]) => {
        m.steps([reference, filter, modWave, vibWave], { length: 0.95 });
        m.steps([ignore], { start: 4, length: 0.1 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.db(
            "filterType in the preset zone: a lowpass on the cutoff, in dB",
            sustainDb(r, 1) - reference,
            -3.01
        );
        checkShape(
            r,
            "modLfoWaveform in the preset zone",
            2,
            reference,
            2,
            500,
            0
        );
        checkShape(
            r,
            "vibLfoWaveform in the preset zone",
            3,
            reference,
            2,
            500,
            0
        );
        r.check(
            "ignoreNoteOff in the preset zone: gone 0.5 s in",
            levelDb(r.at(4.45, 4.55)) < -90
        );
    }
});

export const GEN_82 = defineTest({
    id: "GEN-82",
    title: "Preset modulators to instrument-only generators are ignored",
    section: "7.1",
    description:
        "Constant preset zone modulators to instrument-only destinations, one per preset: `filterType` +4, `modLfoWaveform` +3, `vibLfoWaveform` +3, `ignoreNoteOff` +2, `sampleModes` -1 on a looped `sine`, `exclusiveClass` +5 on two keys struck together, `overridingRootKey` +12 on the `sine`, and `startAddrsOffset` +4000 on the `steps`. The reference tone comes first.",
    pass: "None acts: a lowpass on the cutoff (3 dB down), two triangle tremolos, a short note that stops, a loop that goes on past 1.1 s, two keys that both sound, 440 Hz, and the whole `steps` (as long as without the offset).",
    length: 11,
    bank: (b) => {
        const sine = b.sample("sine");
        const presetMod = (
            name: string,
            zones: ZoneSpec[],
            destination: GeneratorType,
            amount: number
        ) =>
            b.preset({
                name: `GEN-82 ${name}`,
                zones,
                presetModulators: [constant(destination, amount)]
            });
        return {
            reference: b.reference(),
            filter: presetMod(
                "filter type",
                [{ sample: sine, generators: { [G.initialFilterFc]: 6900 } }],
                G.filterType,
                4
            ),
            modWave: presetMod(
                "mod waveform",
                [{ sample: sine, generators: SHOW_MOD_LFO }],
                G.modLfoWaveform,
                3
            ),
            vibWave: presetMod(
                "vib waveform",
                [{ sample: sine, generators: SHOW_VIB_LFO }],
                G.vibLfoWaveform,
                3
            ),
            ignore: presetMod(
                "ignoreNoteOff",
                [
                    {
                        sample: sine,
                        generators: {
                            [G.decayVolEnv]: 1200,
                            [G.sustainVolEnv]: 1000
                        }
                    }
                ],
                G.ignoreNoteOff,
                2
            ),
            modes: presetMod(
                "sample modes",
                [{ sample: sine }],
                G.sampleModes,
                -1
            ),
            exclusive: presetMod(
                "exclusive class",
                [
                    { sample: sine, keys: [69, 69] },
                    { sample: sine, keys: [81, 81] }
                ],
                G.exclusiveClass,
                5
            ),
            rootKey: presetMod(
                "root key",
                [{ sample: sine }],
                G.overridingRootKey,
                12
            ),
            offset: presetMod(
                "start offset",
                [
                    {
                        sample: b.sample("steps"),
                        generators: { [G.sampleModes]: 0 }
                    }
                ],
                G.startAddrsOffset,
                4000
            ),
            plainSteps: b.preset({
                name: "GEN-82 plain steps",
                zones: [
                    {
                        sample: b.sample("steps"),
                        generators: { [G.sampleModes]: 0 }
                    }
                ]
            })
        };
    },
    midi: (m, p) => {
        m.steps([p.reference, p.filter, p.modWave, p.vibWave], {
            length: 0.95
        });
        m.steps([p.ignore], { start: 4, length: 0.1 });
        m.steps([p.modes], { start: 5, length: 1.5 });
        m.program(7, 0, p.exclusive);
        m.note(7, 0.8, { key: 69 });
        m.note(7, 0.8, { key: 81 });
        m.steps([p.rootKey, p.offset, p.plainSteps], { start: 8, length: 0.5 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.db(
            "filterType: a lowpass on the cutoff, in dB",
            sustainDb(r, 1) - reference,
            -3.01
        );
        checkShape(r, "modLfoWaveform", 2, reference, 2, 500, 0);
        checkShape(r, "vibLfoWaveform", 3, reference, 2, 500, 0);
        r.check(
            "ignoreNoteOff: gone 0.5 s in",
            levelDb(r.at(4.45, 4.55)) < -90
        );
        r.check(
            "sampleModes: still looping at 1.3 s",
            levelDb(r.at(6.2, 6.4)) - reference > -1
        );
        r.near(
            "exclusiveClass: both keys sound, in dB against one",
            levelDb(r.at(7.2, 7.7)) - reference,
            3.01,
            0.3
        );
        r.cents(
            "overridingRootKey: in cents",
            centsFrom440(frequency(r.at(8.1, 8.4))),
            0
        );
        // A start offset of 4000 that acts would leave 4000 of the 8000 points, half the length
        r.near(
            "startAddrsOffset: the length against the plain steps, in s",
            soundLength(r, 9),
            soundLength(r, 10),
            0.01
        );
    }
});

export const GEN_83 = defineTest({
    id: "GEN-83",
    title: "Stored values beyond the range",
    section: "7.1.2",
    description:
        "Pairs of notes of 1.9 s, a stored value beyond the range of the generator next to the limit: `modLfoToAmplitude` 1500 and 1000, `vibLfoToFilterFc` 20000 and 12000 (on the `noise` through a lowpass at 1500, with the slowest triangle Vibrato LFO started at 18 degrees, so it stays near 0.2 and the cutoff near 3900 instead of 5500), `fadeModLFO` 8000 and 5000 (with `modLfoToAmplitude` 1000), `keyNumToModEnv2Hold` 3000 and 1200 at key 61, `sustainModEnv2` 2000 and 1000, `attackModEnv2` 9000 and 8000, and `modLfoStartPhase` 400 and 360. The envelope pairs go to the pitch with `modEnv2ToPitch` 1200. Last, `delayVoice` 8000 and 5000 on two clicks struck 0.5 s apart.",
    pass: "The two notes of each pair are the same: a stored value is limited to the range of its generator. The two delayed clicks come 18 s after their note ons, 0.5 s apart.",
    length: 48,
    bank: (b) => {
        const sine = b.sample("sine");
        const pair = (
            name: string,
            sample: BasicSample,
            generators: Generators,
            generator: GeneratorType,
            values: [number, number]
        ) =>
            values.map((value) =>
                b.preset({
                    name: `GEN-83 ${name} ${value}`,
                    zones: [
                        {
                            sample,
                            generators,
                            rawGenerators: { [generator]: value }
                        }
                    ]
                })
            );
        const env2 = { [G.modEnv2ToPitch]: 1200, [G.scaleTuning]: 0 };
        return {
            pairs: [
                pair(
                    "amplitude",
                    sine,
                    { [G.freqModLFO]: HZ_2 },
                    G.modLfoToAmplitude,
                    [1500, 1000]
                ),
                pair(
                    "vib to filter",
                    b.sample("noise"),
                    // The slowest triangle LFO, started at 18 degrees, stays near 0.2 for the whole note. So the
                    // Cutoff is 1500 + 2400, 78 Hz, and 20000 would reach 1500 + 4000, 197 Hz.
                    {
                        [G.initialFilterFc]: 1500,
                        [G.vibLfoStartPhase]: 18,
                        [G.freqVibLFO]: -16_000
                    },
                    G.vibLfoToFilterFc,
                    [20_000, 12_000]
                ),
                pair(
                    "fade",
                    sine,
                    { [G.freqModLFO]: HZ_2, [G.modLfoToAmplitude]: 1000 },
                    G.fadeModLFO,
                    [8000, 5000]
                ),
                pair(
                    "hold key scaling",
                    sine,
                    { ...env2, [G.holdModEnv2]: 0, [G.sustainModEnv2]: 1000 },
                    G.keyNumToModEnv2Hold,
                    [3000, 1200]
                ),
                pair(
                    "sustain",
                    sine,
                    { ...env2, [G.decayModEnv2]: -1200 },
                    G.sustainModEnv2,
                    [2000, 1000]
                ),
                pair("attack", sine, env2, G.attackModEnv2, [9000, 8000]),
                pair(
                    "start phase",
                    sine,
                    { [G.freqModLFO]: HZ_2, [G.modLfoToAmplitude]: 500 },
                    G.modLfoStartPhase,
                    [400, 360]
                )
            ],
            clicks: pair(
                "delay voice",
                b.sample("click"),
                { [G.sampleModes]: 0 },
                G.delayVoice,
                [8000, 5000]
            )
        };
    },
    midi: (m, p) => ({
        // The two notes of a pair are 2 s apart, so a looped sample is at the same place in both
        pairs: p.pairs.map((pair, i) =>
            m.steps(pair, {
                start: i * 4,
                spacing: 2,
                key: i === 3 ? 61 : 69,
                length: 1.9
            })
        ),
        clicks: m.steps(p.clicks, { start: 28, spacing: 0.5, length: 0.1 })
    }),
    verify: (r, _p, { pairs, clicks }) => {
        const labels = [
            "modLfoToAmplitude",
            "vibLfoToFilterFc",
            "fadeModLFO",
            "keyNumToModEnv2Hold",
            "sustainModEnv2",
            "attackModEnv2",
            "modLfoStartPhase"
        ];
        for (const [i, label] of labels.entries())
            r.near(
                `${label}: the pair, largest envelope difference in dB`,
                i === 1
                    ? envelopeDifference(
                          r,
                          pairs[i][0] + 0.02,
                          pairs[i][1] + 0.02,
                          0.2,
                          0.05
                      )
                    : envelopeDifference(
                          r,
                          pairs[i][0],
                          pairs[i][1],
                          1.85,
                          AMPLITUDE_WINDOW
                      ),
                0,
                0.3
            );
        // The envelope pairs show in the pitch, not in the level
        const starts = (i: number) => pairs[i].map((t) => voiceStart(r, t));
        const [holdA, holdB] = starts(3);
        r.near(
            "keyNumToModEnv2Hold: the octave ends at the same time, in s",
            pitchCrossing(r, holdA + 0.01, holdA + 1.8, 600, "down") -
                holdA -
                (pitchCrossing(r, holdB + 0.01, holdB + 1.8, 600, "down") -
                    holdB),
            0,
            0.01
        );
        const [sustainA, sustainB] = starts(4);
        r.near(
            "sustainModEnv2 2000: pitch after the decay, in cents",
            pitchAt(r, sustainA + 1.2),
            0,
            5
        );
        r.near(
            "sustainModEnv2 1000: pitch after the decay, in cents",
            pitchAt(r, sustainB + 1.2),
            0,
            5
        );
        const [attackA, attackB] = starts(5);
        r.near(
            "attackModEnv2: the same pitch 1.8 s into the attack, in cents",
            pitchAt(r, attackA + 1.8) - pitchAt(r, attackB + 1.8),
            0,
            3
        );
        const first =
            firstSound(r.at(clicks[0], clicks[0] + 19), -60) / r.sampleRate;
        r.near(
            "delayVoice 8000: the click comes after, in s",
            first,
            2 ** (5000 / 1200),
            0.01
        );
        const second =
            firstSound(r.at(clicks[0] + first + 0.1, clicks[0] + 20), -60) /
                r.sampleRate +
            first +
            0.1;
        r.near(
            "delayVoice: the second click after the first, in s",
            second - first,
            0.5,
            0.01
        );
    }
});

/**
 * The level in dB of a linear unipolar source of the 7-bit value through -240 cB to `gain`.
 */
function sourceGainDb(value: number) {
    return (-24 * sevenBitX(value)) / 16_384;
}

export const GEN_91 = defineTest({
    id: "GEN-91",
    title: "Modulators to keynum and velocity are ignored",
    section: "7.1",
    description:
        "The reference tone. Then the `sine` with the Note-On Velocity to `gain` with -240 and a constant modulator of 21 to `velocity`. Then the `sine` with the Note-On Key Number to `gain` with -240 and a constant modulator of 21 to `keynum`. Key 69, velocity 127.",
    pass: "The second note is 24 dB below the reference (velocity 127) and the third 13 dB below it (key 69). Both constant modulators are ignored. A synthesizer that applied them would read velocity or key 20 (the default -1 plus 21), 3.8 dB down.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-91 velocity", {}, [
            mod(src(2), none(), G.gain, -240),
            constant(G.velocity, 21)
        ]),
        b.tone("GEN-91 keynum", {}, [
            mod(src(3), none(), G.gain, -240),
            constant(G.keyNum, 21)
        ])
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.db(
            "velocity modulator ignored, in dB",
            sustainDb(r, 1) - reference,
            sourceGainDb(127)
        );
        r.db(
            "keynum modulator ignored, in dB",
            sustainDb(r, 2) - reference,
            sourceGainDb(69)
        );
    }
});

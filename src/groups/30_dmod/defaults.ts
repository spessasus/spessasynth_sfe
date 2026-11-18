import { type GeneratorType, GeneratorTypes as G } from "spessasynth_core";
import {
    type BankBuilder,
    DECAY_AT_ONCE,
    type Generators
} from "../../framework/bank_builder";
import {
    bandEnergyDb,
    envelopeDb,
    firstSound,
    levelDb,
    periodTrack
} from "../../framework/measure";
import type { Timeline } from "../../framework/midi_writer";
import { destinationSum, withState } from "../../framework/modulator_eval";
import { absoluteCentsToHz, filterGainDb } from "../../framework/spec_math";
import { stepNotes } from "../../framework/steps";
import {
    defineTest,
    type PresetRef,
    type TestRender
} from "../../framework/types";
import {
    DEFAULTS,
    noteBalance,
    stepLevelDb,
    trackedVibratoDepth,
    vibratoDepth
} from "./common";

/**
 * The sum of the default modulators on a destination, with some controllers moved (7-bit values).
 */
function defaultSum(
    destination: GeneratorType,
    cc: Record<number, number> = {},
    other: Record<number, number> = {}
) {
    return destinationSum(DEFAULTS, destination, withState({ cc, other }));
}

/**
 * The level change in dB the default modulators give, against the state of a note at velocity 127.
 */
function levelChange(
    cc: Record<number, number>,
    other: Record<number, number> = {}
) {
    const level = (c: Record<number, number>, o: Record<number, number>) =>
        (defaultSum(G.gain, c, o) - defaultSum(G.initialAttenuation, c, o)) /
        10;
    return level(cc, other) - level({}, {});
}

const VELOCITIES = [127, 111, 95, 79, 63, 47, 31, 15];

export const DEF_01 = defineTest({
    id: "DEF-01",
    title: "Velocity",
    section: "7.3",
    description:
        "The `sine` at velocities 127, 111, 95, 79, 63, 47, 31 and 15, with the default modulator list of a new bank.",
    // The numbers come from the default list, so the text follows it if it changes
    pass: `The level follows the 96 dB concave curve of the default velocity modulator: ${(-levelChange({}, { 2: 111 * 128 })).toFixed(2)} dB from 127 to 111, and each step below falls further than the one before it, ${Math.round(-levelChange({}, { 2: 15 * 128 }))} dB down at 15.`,
    length: 8,
    bank: (b) => [b.reference()],
    midi: (m, [reference]) => {
        for (const [i, v] of VELOCITIES.entries()) {
            m.program(i, 0, reference);
            m.note(i, 0.8, { vel: v });
        }
    },
    verify: (r) => {
        for (const [i, v] of VELOCITIES.entries())
            if (i > 0)
                r.db(
                    `velocity ${v} against 127, in dB`,
                    levelDb(r.at(i + 0.25, i + 0.75)) -
                        levelDb(r.at(0.25, 0.75)),
                    levelChange({}, { 2: v * 128 })
                );
    }
});

const VOLUMES = [100, 64, 32];

export const DEF_02 = defineTest({
    id: "DEF-02",
    title: "Volume and expression",
    section: "7.3",
    description:
        "The `sine` with CC 7 and CC 11 at 127, then CC 7 at 100, 64 and 32 with CC 11 at 127, then CC 11 at the same values with CC 7 at 127, then both at 64.",
    pass: "CC 7 and CC 11 give the same concave curve: one of them at 64 is 12 dB below the first note, either one. Together they add: both at 64 is 24.1 dB down.",
    length: 9,
    bank: (b) => [b.reference()],
    midi: (m, [reference]) => {
        m.cc(0, 0, 7, 127);
        m.cc(0, 0, 11, 127);
        stepNotes(m, reference, [
            ...VOLUMES.map((v) => (t: number) => {
                m.cc(t, 0, 7, v);
                m.cc(t, 0, 11, 127);
            }),
            ...VOLUMES.map((v) => (t: number) => {
                m.cc(t, 0, 7, 127);
                m.cc(t, 0, 11, v);
            }),
            (t) => {
                m.cc(t, 0, 7, 64);
                m.cc(t, 0, 11, 64);
            }
        ]);
    },
    verify: (r) => {
        const base = levelChange({ 7: 127, 11: 127 });
        const steps: Record<number, number>[] = [
            ...VOLUMES.map((v) => ({ 7: v, 11: 127 })),
            ...VOLUMES.map((v) => ({ 7: 127, 11: v })),
            { 7: 64, 11: 64 }
        ];
        for (const [i, cc] of steps.entries())
            r.db(
                `CC 7 ${cc[7]} and CC 11 ${cc[11]}, in dB`,
                stepLevelDb(r, i),
                levelChange(cc) - base
            );
    }
});

export const DEF_03 = defineTest({
    id: "DEF-03",
    title: "The pitch wheel",
    section: "7.3",
    description:
        "The `sine` with the pitch wheel at the center, fully down, fully up, then fully up again with RPN 0 at 12 semitones.",
    pass: "198.4 cents down and up at the default range of 2 semitones, then 1190.6 cents up (the note that tells the scale apart from a plain 2 semitones, and from 1200 cents): 12700 times the range over 128 semitones, with the wheel at 16383, which is full scale.",
    length: 4,
    bank: (b) => [b.reference()],
    midi: (m, [reference]) =>
        stepNotes(m, reference, [
            (t) => m.pitchWheel(t, 0, 0),
            (t) => m.pitchWheel(t, 0, 16_383),
            (t) => {
                m.rpn(t, 0, [0, 0], 12, 0);
                m.pitchWheel(t, 0, 16_383);
            }
        ]),
    verify: (r) => {
        const pitch = (i: number) => {
            const track = periodTrack(r.at(i + 1.25, i + 1.75));
            return (
                1200 *
                Math.log2(
                    track.reduce((a, p) => a + p.hz, 0) / track.length / 440
                )
            );
        };
        r.cents(
            "wheel down in cents",
            pitch(0),
            defaultSum(G.fineTune, {}, { 14: 0 })
        );
        r.cents(
            "wheel up in cents",
            pitch(1),
            defaultSum(G.fineTune, {}, { 14: 16_383 })
        );
        r.cents(
            "wheel up at 12 semitones in cents",
            pitch(2),
            defaultSum(G.fineTune, {}, { 14: 16_383, 16: 12 * 128 })
        );
    }
});

// Values on both sides of 64. The comparison zones round the pan of the default modulator to a whole number,
// Which is less than 0.05 units off above 64 (spec section 7.2)
const PANS = [16, 32, 64, 96, 112];

export const DEF_04 = defineTest({
    id: "DEF-04",
    title: "Pan",
    section: "7.3, 10.5",
    description:
        "The `sine` with CC 10 at 16, 32, 64, 96 and 112, each next to a zone with the `pan` the default modulator gives there (-375, -250, 0, 254 and 381, rounded) and CC 10 at 64.",
    pass: "Each pair has the same balance between the channels: the default pan modulator has the amount 500. With the 1000 of SoundFont 2, CC 10 at 32 would already be hard left.",
    length: 11,
    bank: (b) => ({
        plain: b.reference(),
        panned: PANS.map((v) =>
            b.tone(`DEF-04 pan ${v}`, {
                [G.pan]: Math.round(defaultSum(G.pan, { 10: v }))
            })
        )
    }),
    // Returns the times of the pairs: the CC 10 note, then the pan zone note 1 s later
    midi: (m, p) =>
        PANS.map((v, i) => {
            const t = i * 2;
            m.program(t, 0, p.plain);
            m.cc(t, 0, 10, v);
            m.note(t + 0.05, 0.75);
            m.program(t + 1, 0, p.panned[i]);
            m.cc(t + 1, 0, 10, 64);
            m.note(t + 1.05, 0.75);
            return t;
        }),
    verify: (r, _p, pairs) => {
        for (const [i, v] of PANS.entries())
            r.db(
                `CC 10 at ${v} against its pan zone, balance in dB`,
                noteBalance(r, pairs[i]) - noteBalance(r, pairs[i] + 1),
                0
            );
    }
});

const DEPTHS: [number, number][] = [
    [0, 64],
    [1, 0],
    [2, 0]
];

export const DEF_05 = defineTest({
    id: "DEF-05",
    title: "The modulation wheel and the Modulation Depth Range",
    section: "7.3, 10.8",
    description:
        "The `sine` with CC 1 at 127: at the default Modulation Depth Range (50 cents), then with RPN 5 at 1 and at 2 semitones.",
    pass: "A vibrato of 50, 100 and 200 cents to each side, within 5 cents: the default vibrato modulator follows RPN 5.",
    length: 6,
    bank: (b) => [b.reference()],
    midi: (m, [reference]) =>
        DEPTHS.map(([msb, lsb], i) => {
            const t = i * 2;
            m.program(t, 0, reference);
            m.cc(t, 0, 1, 127);
            if (i > 0) m.rpn(t, 0, [0, 5], msb, lsb);
            m.note(t + 0.05, 1.8);
            return t;
        }),
    verify: (r, _presets, starts) => {
        for (const [i, [msb, lsb]] of DEPTHS.entries())
            r.near(
                `${i === 0 ? "the default range" : `RPN 5 at ${msb} and ${lsb}`}: vibrato to each side in cents`,
                vibratoDepth(r, starts[i] + 0.4, starts[i] + 1.8),
                trackedVibratoDepth(
                    defaultSum(
                        G.vibLfoToPitch,
                        { 1: 127 },
                        { 17: Math.min(16_383, 8 * (msb * 128 + lsb)) }
                    )
                ),
                5
            );
    }
});

/**
 * The time a note takes to reach 89 % of its later amplitude: 0.89 of a linear attack.
 */
function riseTime(r: TestRender, noteTime: number) {
    const x = r.at(noteTime, noteTime + 1.8);
    const start = firstSound(x, -80);
    const env = envelopeDb(x.subarray(start), 1 / 440);
    const top = env[Math.floor(1.7 / (1 / 440)) - 1];
    const index = env.findIndex((v) => v >= top + 20 * Math.log10(0.89));
    if (index === -1) return Number.NaN;
    return (index + 0.5) / 440;
}

// Values whose attack is 0.1 s or more, so a minimum attack against clicks (spec section 8.1) does not matter
const ATTACK_VALUES = [56, 60, 64, 66, 69, 70, 87, 95];
// 0.2 s, long enough that a linear modulator would already move it at 69
const ATTACK = -2786;

/**
 * The attack time of DEF-06 in seconds for a CC 73 value.
 */
function attackTime(v: number) {
    // Attack times stop at -12000, 1 ms (spec section 7.1)
    return (
        2 **
        (Math.max(-12_000, ATTACK + defaultSum(G.attackVolEnv, { 73: v })) /
            1200)
    );
}

export const DEF_06 = defineTest({
    id: "DEF-06",
    title: "Attack time from CC 73",
    section: "7.3, 10.4",
    description:
        "The `sine` with a Volume Envelope attack of 0.2 s, with CC 73 at 56, 60, 64, 66, 69, 70, 87 and 95.",
    pass: "The attack follows curve A of the default list: 0.1 s at 56 and 0.14 s at 60, exactly 0.2 s from 64 to 69, then longer, about 0.75 s at 87 and 1.4 s at 95. Lower values give attacks of a few milliseconds, which a synthesizer may lengthen against clicks (spec section 8.1), so they are not checked.",
    length: 16,
    bank: (b) => [b.tone("DEF-06 attack", { [G.attackVolEnv]: ATTACK })],
    midi: (m, [preset]) =>
        ATTACK_VALUES.map((v, i) => {
            m.program(i * 2, 0, preset);
            m.cc(i * 2, 0, 73, v);
            m.note(i * 2 + 0.05, 1.8);
            return i * 2 + 0.05;
        }),
    verify: (r, _presets, notes) => {
        for (const [i, v] of ATTACK_VALUES.entries())
            r.near(
                `CC 73 at ${v}: time to 89 % in s`,
                riseTime(r, notes[i]),
                0.89 * attackTime(v),
                // Room for a smoothing of the level of up to about 50 ms (spec section 8.1)
                Math.max(0.05, 0.1 * attackTime(v))
            );
    }
});

const TIME_VALUES = [0, 32, 56, 60, 64, 65, 67, 110, 111, 120, 126, 127];

/**
 * Where the release notes of DEF-07 start, after a slot of 2 s for each decay note.
 */
const RELEASE_START = TIME_VALUES.length * 2;

/**
 * The time in seconds a slope takes to fall 20 dB, from the levels at `from` and `span` seconds later.
 */
function twentyDbTime(r: TestRender, from: number, span: number) {
    const level = (t: number) => levelDb(r.at(t - 0.005, t + 0.005));
    return (20 * span) / (level(from) - level(from + span));
}
const HALF_SECOND = -1200;

export const DEF_07 = defineTest({
    id: "DEF-07",
    title: "Decay time from CC 75 and release time from CC 72",
    section: "7.3, 10.4",
    description:
        "The `sine` with a decay of 0.5 s to silence that starts at once (zero time for the delay, attack and hold), with CC 75 at 0, 32, 56, 60, 64, 65, 67, 110, 111, 120, 126 and 127. Then a release of 0.5 s, with CC 72 at the same values. Each time is read from the levels 0.1 s into the decay or release and 20 dB further down.",
    pass: "Both times follow curve B of the default list: shorter below 64 (half the time at 56, 0.71 times at 60), unchanged and flat from 67 to 110, then longer, up to about 3.8 s for 96 dB at 127. The decays at CC 75 = 0 and 32 and the releases at CC 72 = 0 and 32 (2 and 31 ms for 96 dB) are not checked, since a synthesizer may lengthen such short times against clicks (spec section 8.1).",
    length: 50,
    bank: (b) => [
        b.tone("DEF-07 decay", {
            ...DECAY_AT_ONCE,
            [G.decayVolEnv]: HALF_SECOND,
            [G.sustainVolEnv]: 1000
        }),
        b.tone("DEF-07 release", { [G.releaseVolEnv]: HALF_SECOND })
    ],
    // Returns where each decay note's slot starts and when each release note ends
    midi: (m, [decay, release]) =>
        TIME_VALUES.map((v, i) => {
            m.program(i * 2, 0, decay);
            m.cc(i * 2, 0, 75, v);
            m.note(i * 2 + 0.05, 1.5);
            m.program(RELEASE_START + i * 2, 0, release);
            m.cc(RELEASE_START + i * 2, 0, 72, v);
            m.note(RELEASE_START + i * 2 + 0.05, 0.3);
            return { decay: i * 2, off: RELEASE_START + i * 2 + 0.35 };
        }),
    verify: (r, _presets, notes) => {
        for (const [i, v] of TIME_VALUES.entries()) {
            const slot = notes[i].decay;
            const decay =
                2 **
                ((HALF_SECOND + defaultSum(G.decayVolEnv, { 75: v })) / 1200);
            const release =
                2 **
                ((HALF_SECOND + defaultSum(G.releaseVolEnv, { 72: v })) / 1200);
            // 20 dB of a time that is given for 96 dB, read from two levels of the same slope, both 0.1 s or more in,
            // So a smoothing of the level shifts both alike (spec section 8.1)
            // A decay or a release under 0.1 s may be lengthened against clicks, so it is not checked
            if (decay >= 0.1) {
                const start =
                    firstSound(r.at(slot, slot + 0.1), -80) / r.sampleRate +
                    slot;
                r.near(
                    `CC 75 at ${v}: 20 dB of decay in s`,
                    twentyDbTime(r, start + 0.1, (decay * 20) / 96),
                    (decay * 20) / 96,
                    Math.max(0.006, (decay * 20) / 96 / 20)
                );
            }
            if (release < 0.1) continue;
            r.near(
                `CC 72 at ${v}: 20 dB of release in s`,
                twentyDbTime(r, notes[i].off + 0.1, (release * 20) / 96),
                (release * 20) / 96,
                Math.max(0.006, (release * 20) / 96 / 20)
            );
        }
    }
});

/**
 * Pairs of a note with a controller and a plain zone with the generators that the controller should give. The
 * controller goes back to its resting value for the plain zone.
 */
function pairTest(
    controller: number,
    resting: number,
    values: number[],
    base: Generators,
    expected: (value: number) => Generators,
    band?: (value: number) => number
) {
    return {
        bank: (b: BankBuilder) => ({
            moved: b.preset({
                name: `CC ${controller} moved`,
                zones: [{ sample: b.sample("noise"), generators: base }]
            }),
            fixed: values.map((v) =>
                b.preset({
                    name: `CC ${controller} at ${v} as generators`,
                    zones: [
                        {
                            sample: b.sample("noise"),
                            generators: { ...base, ...expected(v) }
                        }
                    ]
                })
            )
        }),
        midi: (m: Timeline, p: { moved: PresetRef; fixed: PresetRef[] }) => {
            for (const [i, v] of values.entries()) {
                m.program(i * 2, 0, p.moved);
                m.cc(i * 2, 0, controller, v);
                m.note(i * 2 + 0.05, 0.8);
                m.program(i * 2 + 1, 0, p.fixed[i]);
                m.cc(i * 2 + 1, 0, controller, resting);
                m.note(i * 2 + 1.05, 0.8);
            }
        },
        verify: (r: TestRender) => {
            for (const [i, v] of values.entries()) {
                // Notes a whole second apart read the same stretch of the looped noise
                const x = envelopeDb(r.at(i * 2 + 0.15, i * 2 + 0.8), 0.05);
                const y = envelopeDb(r.at(i * 2 + 1.15, i * 2 + 1.8), 0.05);
                const difference = Math.max(
                    ...x.map((value, k) => Math.abs(value - y[k]))
                );
                r.near(
                    `CC ${controller} at ${v} against its generators, largest difference in dB`,
                    difference,
                    0,
                    0.3
                );
                if (band) {
                    // A band where the change shows more than in the whole level, such as above a moved cutoff
                    const hz = band(v);
                    const energy = (t: number) =>
                        bandEnergyDb(
                            r.at(t + 0.15, t + 0.8),
                            hz / 1.12,
                            hz * 1.12
                        );
                    r.near(
                        `CC ${controller} at ${v}: the band at ${Math.round(hz)} Hz against its generators, in dB`,
                        energy(i * 2) - energy(i * 2 + 1),
                        0,
                        0.3
                    );
                }
            }
        }
    };
}

const BRIGHTNESS = [0, 32, 64, 96, 127];
const brightness = pairTest(
    74,
    64,
    BRIGHTNESS,
    { [G.initialFilterFc]: 8000 },
    (v) => ({
        [G.initialFilterFc]: Math.round(
            8000 + defaultSum(G.initialFilterFc, { 74: v })
        )
    }),
    // Half an octave above the cutoff, where a small move of the cutoff shows more than in the whole level
    (v) =>
        1.4 * absoluteCentsToHz(8000 + defaultSum(G.initialFilterFc, { 74: v }))
);

export const DEF_08 = defineTest({
    id: "DEF-08",
    title: "Brightness",
    section: "7.3, 10.7",
    description:
        "The `noise` through a lowpass at 8000 (about 830 Hz), with CC 74 at 0, 32, 64, 96 and 127, each next to a zone with the cutoff moved by what the default modulator gives there.",
    pass: "Each pair sounds the same: the cutoff moves 4800 cents down at 0, 2400 down at 32, not at 64, 2438 up at 96 and 4800 up at 127.",
    length: 10,
    ...brightness
});

const RESONANCE = [0, 64, 127];
const resonance = pairTest(
    71,
    64,
    RESONANCE,
    { [G.initialFilterFc]: 8000 },
    (v) => ({
        [G.filterQOffset]: Math.round(defaultSum(G.filterQOffset, { 71: v }))
    }),
    // The band around the cutoff, where the resonance shows
    () => absoluteCentsToHz(8000)
);

export const DEF_09 = defineTest({
    id: "DEF-09",
    title: "Resonance",
    section: "7.3, 10.3",
    description:
        "The `noise` through a lowpass at 8000 (about 830 Hz), with CC 71 at 0, 64 and 127, each next to a zone with the `filterQOffset` that the default CC 71 modulator gives there.",
    pass: `Each pair sounds the same: the default CC 71 modulator acts only above 64, so CC 71 at 0 plays like 64 (an offset of ${Math.round(defaultSum(G.filterQOffset, { 71: 0 }))} cB), and at 127 the resonance moves ${Math.round(defaultSum(G.filterQOffset, { 71: 127 }))} cB up, a peak at the cutoff.`,
    length: 6,
    ...resonance
});

const LEVEL_STEPS = [63, 64, 96, 127, 32, 0];

/**
 * The level in dB of DEF-10's note for a CC 71 value. Only the initialFilterQ part lowers the gain, so this stays
 * close to the level at 64.
 */
function resonanceLevel(v: number) {
    const offset = defaultSum(G.filterQOffset, { 71: v });
    return filterGainDb("lowpass", 55, 13_500, 300 + offset, 300);
}

export const DEF_10 = defineTest({
    id: "DEF-10",
    title: "CC 71 leaves the level alone",
    section: "7.3, 7.1.1 #63, 10.3",
    description:
        "The `sine` at key 33 (55 Hz), far below a lowpass cutoff of 13500, with `initialFilterQ` 300. CC 71 at 64 first, then at 63, 64, 96, 127, 32 and 0.",
    pass: "Every note has the level of the first: the default CC 71 modulator moves `filterQOffset`, which does not lower the gain, and `initialFilterQ` 300 lowers it by 15 dB in every note alike. There is no step at 64.",
    length: 7,
    bank: (b) => [
        b.tone("DEF-10 level", {
            [G.initialFilterFc]: 13_500,
            [G.initialFilterQ]: 300
        })
    ],
    midi: (m, [preset]) =>
        stepNotes(
            m,
            preset,
            LEVEL_STEPS.map((v) => (t: number) => m.cc(t, 0, 71, v)),
            { key: 33 }
        ),
    verify: (r) => {
        for (const [i, v] of LEVEL_STEPS.entries())
            r.db(
                `CC 71 at ${v} against 64, in dB`,
                stepLevelDb(r, i),
                resonanceLevel(v) - resonanceLevel(64)
            );
    }
});

const SOFT = [0, 63, 127];
const soft = pairTest(67, 0, SOFT, { [G.initialFilterFc]: 9000 }, (v) => ({
    [G.initialFilterFc]: Math.round(
        9000 + defaultSum(G.initialFilterFc, { 67: v })
    )
}));

export const DEF_11 = defineTest({
    id: "DEF-11",
    title: "The soft pedal",
    section: "7.3",
    description:
        "The `noise` through a lowpass at 9000 (1.5 kHz), with CC 67 at 0, 63 and 127, each next to a zone with the cutoff the default modulator gives there. The value 64 itself is DEF-16.",
    pass: "Each pair sounds the same: the cutoff is one octave lower at 127 and unchanged at 0 and 63, a switch.",
    length: 6,
    ...soft
});

const soft64 = pairTest(67, 0, [64], { [G.initialFilterFc]: 9000 }, (v) => ({
    [G.initialFilterFc]: Math.round(
        9000 + defaultSum(G.initialFilterFc, { 67: v })
    )
}));

export const DEF_16 = defineTest({
    id: "DEF-16",
    title: "The soft pedal at exactly 64",
    section: "7.3",
    description:
        "The `noise` through a lowpass at 9000 (1.5 kHz), with CC 67 at 64, next to a zone with the cutoff one octave lower.",
    pass: "The pair sounds the same: the switch is on at 64.",
    length: 2,
    ...soft64
});

export const DEF_12 = defineTest({
    id: "DEF-12",
    title: "No velocity to the filter cutoff",
    section: "10.6",
    description:
        "The `noise` through a lowpass at 9000 (1.5 kHz), at velocities 127, 64 and 16.",
    pass: "Only the level changes: the balance between low and high frequencies is the same in the three notes, so the cutoff does not move with the velocity.",
    length: 3,
    bank: (b) => [
        b.preset({
            name: "DEF-12 lowpass",
            zones: [
                {
                    sample: b.sample("noise"),
                    generators: { [G.initialFilterFc]: 9000 }
                }
            ]
        })
    ],
    midi: (m, [preset]) => {
        for (const [i, v] of [127, 64, 16].entries()) {
            m.program(i, 0, preset);
            m.note(i, 0.8, { vel: v });
        }
    },
    verify: (r) => {
        const tilt = (i: number) => {
            const x = r.at(i + 0.15, i + 0.75);
            return bandEnergyDb(x, 2000, 6000) - bandEnergyDb(x, 200, 600);
        };
        r.near(
            "velocity 64 against 127, tilt in dB",
            tilt(1) - tilt(0),
            0,
            0.5
        );
        r.near(
            "velocity 16 against 127, tilt in dB",
            tilt(2) - tilt(0),
            0,
            0.5
        );
    }
});

export const DEF_13 = defineTest({
    id: "DEF-13",
    title: "No channel pressure vibrato",
    section: "10.9",
    description: "The `sine` held for 1.8 s with the channel pressure at 127.",
    pass: "No vibrato: the pitch stays at 440 Hz.",
    length: 2,
    bank: (b) => [b.reference()],
    midi: (m, [reference]) => {
        m.program(0, 0, reference);
        m.channelPressure(0, 0, 127);
        m.note(0.05, 1.8);
    },
    verify: (r) =>
        r.cents("vibrato to each side in cents", vibratoDepth(r, 0.4, 1.8), 0)
});

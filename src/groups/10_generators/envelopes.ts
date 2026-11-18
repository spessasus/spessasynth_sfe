import { GeneratorTypes as G } from "spessasynth_core";
import { DECAY_AT_ONCE } from "../../framework/bank_builder";
import { bandRatioDb, levelDb } from "../../framework/measure";
import { filterGainDb } from "../../framework/spec_math";
import { defineTest, type TestRender } from "../../framework/types";
import {
    levelAround,
    sustainDb,
    pitchAt,
    pitchCrossing,
    voiceStart
} from "./common";

/**
 * The timing a level check allows on a slope, so a synthesizer that rounds the 1 ms default attack and hold up to
 * its update period (spec section 7.1) still passes: 5 ms, as a level in dB at the slope of the point.
 */
function slopeTolerance(dbPerSecond: number) {
    return 0.3 + Math.abs(dbPerSecond) * 0.005;
}

/**
 * Pitch checks at times measured from the voice start of a note.
 */
function checkPitches(
    r: TestRender,
    noteTime: number,
    points: [number, number][],
    tolerance = 5
) {
    const start = voiceStart(r, noteTime);
    for (const [t, cents] of points)
        r.near(
            `pitch at ${t} s in cents`,
            pitchAt(r, start + t),
            cents,
            tolerance
        );
}

/**
 * Level changes in dB between two times of one note, measured from its voice start. Both points sit on the same
 * slope or plateau, so a synthesizer that smooths level changes (spec section 8.1) shifts both alike.
 */
function checkDrops(
    r: TestRender,
    noteTime: number,
    pairs: [from: number, to: number, db: number, tolerance?: number][],
    tolerance = 0.3
) {
    const start = voiceStart(r, noteTime);
    for (const [from, to, db, own] of pairs)
        r.near(
            `level change from ${from} s to ${to} s in dB`,
            levelAround(r, start + to, 0) - levelAround(r, start + from, 0),
            db,
            own ?? tolerance
        );
}

/**
 * Level checks at times measured from the voice start of a note, against the reference level.
 */
function checkLevels(
    r: TestRender,
    noteTime: number,
    referenceDb: number,
    points: [time: number, db: number, tolerance?: number][],
    tolerance = 0.3
) {
    const start = voiceStart(r, noteTime);
    for (const [t, db, own] of points)
        r.near(
            `level at ${t} s in dB`,
            levelAround(r, start + t, referenceDb),
            db,
            own ?? tolerance
        );
}

export const GEN_40 = defineTest({
    id: "GEN-40",
    title: "The second Modulation Envelope",
    section: "7.1.1 #74, #76 to #81",
    description:
        "The `sine` with `modEnv2ToPitch` 1200 and the second Modulation Envelope at: delay 1 s, attack 1 s, hold 1 s, decay 2 s (`decayModEnv2` 1200), `sustainModEnv2` 500 (50 %), release 2 s. The note is held for 5 s, and the Volume Envelope releases over 2 s so the pitch stays audible.",
    pass: "The pitch has the SoundFont 2 envelope shape: 440 Hz for 1 s, a convex rise to one octave up over 1 s (the convex curve of section 7.2, about 1050 cents halfway), held for 1 s, a straight fall to half an octave up over 1 s (half of the decay time, for half of the range), held until the note off, then a straight fall back to 440 Hz over 1 s.",
    length: 7.5,
    bank: (b) => [
        b.tone("GEN-40 second envelope", {
            [G.modEnv2ToPitch]: 1200,
            [G.delayModEnv2]: 0,
            [G.attackModEnv2]: 0,
            [G.holdModEnv2]: 0,
            [G.decayModEnv2]: 1200,
            [G.sustainModEnv2]: 500,
            [G.releaseModEnv2]: 1200,
            [G.releaseVolEnv]: 1200
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 5 }),
    verify: (r) => {
        checkPitches(r, 0, [
            [0.5, 0],
            [2.5, 1200],
            [3.5, 900],
            [4.5, 600],
            [5.5, 300],
            [6.2, 0]
        ]);
        const start = voiceStart(r, 0);
        const middle = pitchAt(r, start + 1.5);
        // Spec section 8.1.6: the attack outputs convex(t), so halfway it is 1 + (5/12) * log10(0.5) of the octave,
        // About 1050 cents. A linear attack reads 600. The curve rises about 430 cents per second there, so the
        // Tolerance covers a few ms of timing
        r.near(
            "the attack is convex(t): halfway, in cents",
            middle,
            1200 * (1 + (5 / 12) * Math.log10(0.5)),
            15
        );
    }
});

export const GEN_41 = defineTest({
    id: "GEN-41",
    title: "modEnv2ToFilterFc",
    section: "7.1.1 #75",
    description:
        "The `noise` through a highpass at 7000 (466 Hz) with `modEnv2ToFilterFc` 1200 and the envelope of GEN-40, held for 5 s. Then three short notes through plain highpass filters at 7000, 8200 and 7600 for comparison.",
    pass: "The cutoff follows the envelope: during the delay the first note sounds like the highpass at 7000, during the hold like the one at 8200 (one octave up), and in the sustain like the one at 7600 (half an octave up).",
    length: 9,
    bank: (b) => {
        const highpass = { [G.filterType]: 1 };
        return {
            envelope: b.preset({
                name: "GEN-41 envelope to cutoff",
                zones: [
                    {
                        sample: b.sample("noise"),
                        generators: {
                            ...highpass,
                            [G.initialFilterFc]: 7000,
                            [G.modEnv2ToFilterFc]: 1200,
                            [G.delayModEnv2]: 0,
                            [G.attackModEnv2]: 0,
                            [G.holdModEnv2]: 0,
                            [G.decayModEnv2]: 1200,
                            [G.sustainModEnv2]: 500
                        }
                    }
                ]
            }),
            fixed: [7000, 8200, 7600].map((fc) =>
                b.preset({
                    name: `GEN-41 highpass ${fc}`,
                    zones: [
                        {
                            sample: b.sample("noise"),
                            generators: { ...highpass, [G.initialFilterFc]: fc }
                        }
                    ]
                })
            )
        };
    },
    midi: (m, p) => {
        m.steps([p.envelope], { length: 5 });
        m.steps(p.fixed, { start: 6 });
    },
    verify: (r) => {
        // Windows a whole number of seconds apart read the same stretch of the looped noise
        for (const [label, t, fixed] of [
            ["delay", 0.2, 6],
            ["hold", 2.2, 7],
            ["sustain", 4.2, 8]
        ] as const)
            r.near(
                `${label} against the fixed highpass at 466 Hz in dB`,
                bandRatioDb(
                    r.at(t, t + 0.5),
                    r.at(fixed + 0.2, fixed + 0.7),
                    466,
                    1 / 3
                ),
                0,
                0.5
            );
    }
});

export const GEN_42 = defineTest({
    id: "GEN-42",
    title: "Two independent Modulation Envelopes",
    section: "7.1.1 #74 to #81",
    description:
        "The `sine` through a lowpass at 5700 (220 Hz). The first Modulation Envelope opens it by 2400 cents after a delay of 0.5 s (`modEnvToFilterFc` 2400). The second raises the pitch by an octave after a delay of 1.5 s (`modEnv2ToPitch` 1200). Both attacks are instant.",
    pass: "At 0.5 s the note gets louder (the filter opens) while the pitch stays at 440 Hz. At 1.5 s the pitch jumps an octave: each envelope drives only its own destination, on its own times.",
    length: 2.5,
    bank: (b) => [
        b.tone("GEN-42 two envelopes", {
            [G.initialFilterFc]: 5700,
            [G.modEnvToFilterFc]: 2400,
            [G.delayModEnv]: -1200,
            [G.modEnv2ToPitch]: 1200,
            [G.delayModEnv2]: 702
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 2.4 }),
    verify: (r) => {
        checkPitches(r, 0, [
            [0.3, 0],
            [1.2, 0],
            [2, 1200]
        ]);
        const start = voiceStart(r, 0);
        const opened =
            levelDb(r.at(start + 0.9, start + 1.3)) -
            levelDb(r.at(start + 0.1, start + 0.45));
        r.near(
            "the filter opens at 0.5 s, level change in dB",
            opened,
            filterGainDb("lowpass", 440, 8100, 0) -
                filterGainDb("lowpass", 440, 5700, 0),
            0.3
        );
    }
});

export const GEN_43 = defineTest({
    id: "GEN-43",
    title: "The defaults of the second Modulation Envelope",
    section: "7.1.2",
    description:
        "The `sine` with only `modEnv2ToPitch` 1200 set, a note of 0.8 s, and a Volume Envelope release of 0.5 s.",
    pass: "The note is one octave up from its start and for the whole note (no delay, attack or hold, full sustain). It is back at 440 Hz 0.1 s after the note off, since the default release of the envelope is 1 ms, while the volume still releases.",
    length: 1.5,
    bank: (b) => [
        b.tone("GEN-43 defaults", {
            [G.modEnv2ToPitch]: 1200,
            [G.releaseVolEnv]: -1200
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) =>
        checkPitches(r, 0, [
            [0.15, 1200],
            [0.7, 1200],
            [0.9, 0],
            [1, 0]
        ])
});

const KEYS = [36, 48, 60, 72, 84];

export const GEN_44 = defineTest({
    id: "GEN-44",
    title: "Key scaling of the second Modulation Envelope",
    section: "7.1.1 #82, #83",
    description:
        "The `sine` with `scaleTuning` 0, so every key plays 440 Hz, and `modEnv2ToPitch` 1200, at keys 36, 48, 60, 72 and 84. First with a hold of 0.5 s and `keyNumToModEnv2Hold` 100, the envelope falling to 0 after the hold. Then with a decay of 1 s to 0 and `keyNumToModEnv2Decay` 100.",
    pass: "In the first five notes the octave lasts 2, 1, 0.5, 0.25 and 0.125 s: the hold halves per octave upward. In the last five the pitch falls in a straight line and passes half an octave after 2, 1, 0.5, 0.25 and 0.125 s: the decay halves per octave too.",
    length: 25,
    bank: (b) => {
        const base = {
            [G.scaleTuning]: 0,
            [G.modEnv2ToPitch]: 1200,
            [G.sustainModEnv2]: 1000
        };
        return [
            b.tone("GEN-44 hold", {
                ...base,
                [G.holdModEnv2]: -1200,
                [G.keyNumToModEnv2Hold]: 100
            }),
            b.tone("GEN-44 decay", {
                ...base,
                [G.decayModEnv2]: 0,
                [G.keyNumToModEnv2Decay]: 100
            })
        ];
    },
    midi: (m, [hold, decay]) =>
        KEYS.map((key, i) => {
            m.program(i * 2.5, 0, hold);
            m.note(i * 2.5, 2.3, { key });
            m.program(12.5 + i * 2.5, 0, decay);
            m.note(12.5 + i * 2.5, 2.3, { key });
            return { hold: i * 2.5, decay: 12.5 + i * 2.5 };
        }),
    verify: (r, _presets, notes) => {
        for (const [i, key] of KEYS.entries()) {
            const scale = 2 ** ((60 - key) / 12);
            for (const [label, noteTime, expected] of [
                ["hold", notes[i].hold, 0.5 * scale],
                ["half of the decay", notes[i].decay, 0.5 * scale]
            ] as const) {
                const start = voiceStart(r, noteTime);
                const crossing =
                    pitchCrossing(r, start + 0.01, start + 2.3, 600, "down") -
                    start;
                r.near(
                    `key ${key}: ${label} in s`,
                    crossing,
                    expected,
                    0.01 + expected * 0.02
                );
            }
        }
    }
});

export const GEN_45 = defineTest({
    id: "GEN-45",
    title: "The second decay of the Volume Envelope",
    section: "7.1.1 #84, #85",
    description:
        "The reference tone, then the `sine` with zero time for the delay, attack and hold of its Volume Envelope, `decayVolEnv` 4 s (24 dB per second) to `sustainVolEnv` 120, `decay2VolEnv` 8 s (12 dB per second) with `sustain2VolEnv` 240, held for 4 s and then released.",
    pass: "A decay, a second decay, a sustain and a release: the level falls 24 dB per second for the first 0.5 s, then 12 dB per second along a straight line in dB to 36 dB below the reference tone after 2 more seconds, then stays there until the note off, then releases. The slopes are checked as changes between two points of each, so smoothing does not matter.",
    length: 5.5,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-45 second decay", {
            ...DECAY_AT_ONCE,
            [G.decayVolEnv]: 2400,
            [G.sustainVolEnv]: 120,
            [G.decay2VolEnv]: 3600,
            [G.sustain2VolEnv]: 240
        })
    ],
    midi: (m, [reference, envelope]) => {
        m.steps([reference]);
        m.steps([envelope], { start: 1, length: 4 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        checkDrops(r, 1, [
            [0.1, 0.4, -24 * 0.3],
            [0.7, 2.2, -12 * 1.5]
        ]);
        checkLevels(r, 1, reference, [
            [2.8, -36],
            [3.5, -36]
        ]);
        // The default release has taken the note to silence 100 ms after the note off, also with a minimum release
        // That section 8.1 allows
        const released = levelAround(r, voiceStart(r, 1) + 4.1, reference);
        r.check(
            "released after the note off",
            released < -70,
            `${released.toFixed(1)} dB`
        );
    }
});

export const GEN_46 = defineTest({
    id: "GEN-46",
    title: "A negative sustain2VolEnv",
    section: "7.1.1 #85",
    description:
        "The reference tone, then the `sine` with zero time for the delay, attack and hold of its Volume Envelope, `decayVolEnv` 4 s to `sustainVolEnv` 240, then `decay2VolEnv` 4 s with `sustain2VolEnv` -120.",
    pass: "The level falls 24 dB per second for the first second, then rises in a straight line, 24 dB per second for half a second, and stays 12 dB below the reference tone.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-46 rising", {
            ...DECAY_AT_ONCE,
            [G.decayVolEnv]: 2400,
            [G.sustainVolEnv]: 240,
            [G.decay2VolEnv]: 2400,
            [G.sustain2VolEnv]: -120
        })
    ],
    midi: (m, [reference, envelope]) => {
        m.steps([reference]);
        m.steps([envelope], { start: 1, length: 1.9 });
    },
    verify: (r) => {
        checkDrops(r, 1, [
            [0.1, 0.8, -24 * 0.7],
            [1.15, 1.45, 24 * 0.3]
        ]);
        checkLevels(r, 1, sustainDb(r, 0), [[1.75, -12]]);
    }
});

export const GEN_47 = defineTest({
    id: "GEN-47",
    title: "A sustainVolEnv above 960 counts as 960",
    section: "7.1.1 #84",
    description:
        "The reference tone, then the `sine` with zero time for the delay, attack and hold of its Volume Envelope, `decayVolEnv` 1 s, `sustainVolEnv` 1200, `decay2VolEnv` 1 s and `sustain2VolEnv` -600.",
    pass: "The level falls 96 dB per second to silence in the first second, then rises back and stays 36 dB below the reference tone: the end level is 960 - 600 = 360 cB. Taking 1200 as it is would give 60 dB.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-47 above 960", {
            ...DECAY_AT_ONCE,
            [G.decayVolEnv]: 0,
            [G.sustainVolEnv]: 1200,
            [G.decay2VolEnv]: 0,
            [G.sustain2VolEnv]: -600
        })
    ],
    midi: (m, [reference, envelope]) => {
        m.steps([reference]);
        m.steps([envelope], { start: 1, length: 1.9 });
    },
    verify: (r) => {
        checkDrops(r, 1, [[0.1, 0.35, -96 * 0.25, slopeTolerance(96)]]);
        checkLevels(r, 1, sustainDb(r, 0), [[1.8, -36]]);
    }
});

export const GEN_48 = defineTest({
    id: "GEN-48",
    title: "The default decay2VolEnv, and no second decay",
    section: "7.1.1 #84, 8.1.6",
    description:
        "The reference tone. Then the `sine` with zero time for the delay, attack and hold of its Volume Envelope, `decayVolEnv` 2 s (48 dB per second) to `sustainVolEnv` 120, and `sustain2VolEnv` 240 with `decay2VolEnv` at its default. Then `decay2VolEnv` 8000 with `sustain2VolEnv` 0.",
    pass: "The second note falls 48 dB per second for a quarter second (12 dB), then drops 24 dB more at once (the default second decay is 1 ms for 96 dB), and is 36 dB down 0.1 s later. The third note falls to 12 dB below the reference tone and stays there: with `sustain2VolEnv` 0 there is no second decay, however long `decay2VolEnv` is.",
    length: 4,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-48 default second decay", {
            ...DECAY_AT_ONCE,
            [G.decayVolEnv]: 1200,
            [G.sustainVolEnv]: 120,
            [G.sustain2VolEnv]: 240
        }),
        b.tone("GEN-48 no second decay", {
            ...DECAY_AT_ONCE,
            [G.decayVolEnv]: 1200,
            [G.sustainVolEnv]: 120,
            [G.decay2VolEnv]: 8000
        })
    ],
    midi: (m, [reference, step, none]) => {
        m.steps([reference]);
        m.steps([step, none], { start: 1, length: 1.4, spacing: 1.5 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        checkDrops(r, 1, [[0.1, 0.2, -48 * 0.1]]);
        checkLevels(r, 1, reference, [
            [0.35, -36],
            [1, -36]
        ]);
        checkLevels(r, 2.5, reference, [
            [0.5, -12],
            [1.3, -12]
        ]);
    }
});

export const GEN_49 = defineTest({
    id: "GEN-49",
    title: "keynumToVolEnvDecay scales the second decay",
    section: "7.1.1 #84",
    description:
        "The reference tone. Then the `sine` with zero time for the delay, attack and hold of its Volume Envelope, `scaleTuning` 0 at keys 48, 60 and 72, `sustainVolEnv` 0, `decay2VolEnv` 4 s with `sustain2VolEnv` 480, `keynumToVolEnvDecay` 100 and a release of 2 s (48 dB per second). The notes last 2, 1 and 0.5 s, so each note off comes when its second decay is half done, 24 dB down.",
    pass: "The second decay falls 12, 24 and 48 dB per second: it halves in time per octave upward, so each note falls 12 dB over the middle half of its length. At each note off the release goes on from the level the note has, without a jump: 0.1 s before and after the note off differ by the two slopes alone.",
    length: 13,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-49 key scaling", {
            ...DECAY_AT_ONCE,
            [G.scaleTuning]: 0,
            [G.sustainVolEnv]: 0,
            [G.decay2VolEnv]: 2400,
            [G.sustain2VolEnv]: 480,
            [G.keyNumToVolEnvDecay]: 100,
            [G.releaseVolEnv]: 1200
        })
    ],
    // The note starts, 4 s apart, and their lengths
    midi: (m, [reference, scaled]) => {
        m.steps([reference]);
        return [48, 60, 72].map((key, i) => {
            const start = 1 + 4 * i;
            m.program(start, 0, scaled);
            m.note(start, 2 / 2 ** i, { key });
            return start;
        });
    },
    verify: (r, _presets, starts) => {
        for (const [i, start] of starts.entries()) {
            const rate = 12 * 2 ** i;
            const off = 2 / 2 ** i;
            checkDrops(r, start, [
                // The middle half of the second decay
                [off / 4, (off * 3) / 4, -rate * (off / 2)],
                // Across the note off: the decay before it, the release of 48 dB per second after it
                // Across the note off the two slopes differ, so a smoothing lag shifts this pair a little
                [off - 0.1, off + 0.1, -rate * 0.1 - 48 * 0.1, 2.5]
            ]);
        }
    }
});

export const GEN_50 = defineTest({
    id: "GEN-50",
    title: "Decay and release times are for 960 cB",
    section: "7.1.1 #84",
    description:
        "The `sine` with `decayVolEnv` 2 s to `sustainVolEnv` 240 and `releaseVolEnv` 2 s, a note of 2 s.",
    pass: "The decay and the release both fall 48 dB per second, so 24 dB take half a second, a quarter of the time given: the times are for a change of 96 dB.",
    length: 4,
    bank: (b) => [
        b.tone("GEN-50 960 cB", {
            [G.decayVolEnv]: 1200,
            [G.sustainVolEnv]: 240,
            [G.releaseVolEnv]: 1200
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 2 }),
    verify: (r) => {
        const start = voiceStart(r, 0);
        const decay =
            (levelAround(r, start + 0.4, 0) - levelAround(r, start + 0.1, 0)) /
            0.3;
        r.near("decay slope in dB per second", decay, -48, 1);
        const release =
            (levelAround(r, start + 2.6, 0) - levelAround(r, start + 2.1, 0)) /
            0.5;
        r.near("release slope in dB per second", release, -48, 1);
    }
});

import { GeneratorTypes as G } from "spessasynth_core";
import { cc, mod, none } from "../../framework/bank_builder";
import {
    bandEnergyDb,
    centsFrom440,
    frequency,
    levelDb
} from "../../framework/measure";
import { createSample, SAMPLE_PEAK, sampleData } from "../../framework/samples";
import { defineTest, type TestRender } from "../../framework/types";
import { soundLength, sustainDb, voiceStart } from "./common";

/**
 * The pitch in cents from 440 Hz over a stretch.
 */
function pitchOver(
    r: TestRender,
    from: number,
    to: number,
    channel: "left" | "right" | "mid" = "mid"
) {
    return centsFrom440(frequency(r.at(from, to, channel)));
}

/**
 * The energy at a frequency against the energy at another one, in dB, from a spectrum of the stretch.
 */
function bandAgainst(
    r: TestRender,
    from: number,
    to: number,
    hz: number,
    otherHz: number
) {
    const x = r.at(from, to);
    return (
        bandEnergyDb(x, hz * 0.97, hz * 1.03) -
        bandEnergyDb(x, otherHz * 0.97, otherHz * 1.03)
    );
}

/**
 * Long releases, so that a sample played during the release keeps its level.
 */
const LONG_RELEASE = { [G.releaseVolEnv]: 8000 };

export const GEN_64 = defineTest({
    id: "GEN-64",
    title: "sampleModes 0, 1 and 3",
    section: "7.1",
    description:
        "The `tail` (a loop of 440 Hz with 0.3 s of 880 Hz after the loop end) with a release of 2 s (48 dB per second), held for 1.5 s, with `sampleModes` 0, 1 and 3.",
    pass: "Mode 0 plays the sample through once: 440 Hz for about 1.05 s, then 880 Hz, then silence before the note off. Mode 1 loops the 440 Hz through the release. Mode 3 loops while the key is held, and after the note off it plays on to the loop end and then the 880 Hz tail.",
    length: 12,
    bank: (b) =>
        [0, 1, 3].map((mode) =>
            b.preset({
                name: `GEN-64 mode ${mode}`,
                zones: [
                    {
                        sample: b.sample("tail"),
                        generators: {
                            [G.sampleModes]: mode,
                            [G.releaseVolEnv]: 1200
                        }
                    }
                ]
            })
        ),
    midi: (m, presets) => m.steps(presets, { length: 1.5, spacing: 4 }),
    verify: (r) => {
        r.cents("mode 0: 440 Hz at first, in cents", pitchOver(r, 0.3, 0.8), 0);
        r.cents(
            "mode 0: 880 Hz after the loop end, in cents",
            pitchOver(r, 1.1, 1.3),
            1200
        );
        r.check(
            "mode 0: silent after the sample",
            levelDb(r.at(1.4, 1.5)) < -90
        );
        r.cents(
            "mode 1: 440 Hz in the release, in cents",
            pitchOver(r, 4 + 1.6, 4 + 2.2),
            0
        );
        r.check(
            "mode 1: no 880 Hz in the release",
            bandAgainst(r, 5.5, 6.4, 880, 440) < -40
        );
        r.cents(
            "mode 3: 440 Hz while held, in cents",
            pitchOver(r, 8 + 0.3, 8 + 1.4),
            0
        );
        // The loop is halfway through at the note off, so the tail plays from about 0.55 s later
        r.check(
            "mode 3: the 880 Hz tail after the loop end",
            bandAgainst(r, 10.1, 10.3, 880, 440) > 20
        );
    }
});

export const GEN_65 = defineTest({
    id: "GEN-65",
    title: "sampleModes 2, start on release",
    section: "7.1",
    description:
        "The `steps` (eight falling plateaus, no loop) with `sampleModes` 2 and a very long release, held for 1 s. Then the same sample with `sampleModes` 0 for comparison.",
    pass: "The first note is silent while the key is held. At the note off the sample plays once from its start: the same eight plateaus, at the same level, as the second note plays at its note on.",
    length: 3,
    bank: (b) =>
        [2, 0].map((mode) =>
            b.preset({
                name: `GEN-65 mode ${mode}`,
                zones: [
                    {
                        sample: b.sample("steps"),
                        generators: { [G.sampleModes]: mode, ...LONG_RELEASE }
                    }
                ]
            })
        ),
    midi: (m, [release, plain]) => {
        m.steps([release], { length: 1 });
        m.steps([plain], { start: 2, length: 0.5 });
    },
    verify: (r) => {
        r.check("silent while held", levelDb(r.at(0.02, 0.98)) < -90);
        const start = voiceStart(r, 0.99);
        const plain = voiceStart(r, 2);
        // The plateaus from 0.1 s on, so a smoothed start of the sample (spec section 8.1) does not matter
        for (let plateau = 5; plateau < 8; plateau++) {
            const t = (plateau * 1000 + 500) / 48_000;
            r.near(
                `plateau ${plateau + 1} against the plain note in dB`,
                levelDb(r.at(start + t - 0.005, start + t + 0.005)) -
                    levelDb(r.at(plain + t - 0.005, plain + t + 0.005)),
                0,
                0.3
            );
        }
    }
});

export const GEN_66 = defineTest({
    id: "GEN-66",
    title: "Start on release with ignoreNoteOff",
    section: "7.1",
    description:
        "The `sine` with `sampleModes` 2, `ignoreNoteOff` 1 and a decay to silence over 1 s, a note of 0.5 s.",
    pass: "Silent: the note off is ignored, so the sample never starts.",
    length: 2,
    bank: (b) => [
        b.tone("GEN-66 never starts", {
            [G.sampleModes]: 2,
            [G.ignoreNoteOff]: 1,
            [G.decayVolEnv]: 0,
            [G.sustainVolEnv]: 1000
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 0.5 }),
    verify: (r) => r.check("silent", levelDb(r.at(0, 1.9)) < -90)
});

export const GEN_67 = defineTest({
    id: "GEN-67",
    title: "Start on release: the envelope ran from the note on",
    section: "7.1",
    description:
        "The reference tone. Then the `sine` with `sampleModes` 2, a Volume Envelope attack of 0.5 s and a very long release, a note of 1 s.",
    pass: "At the note off the sample starts at once at the level of the reference tone: the attack ended while the key was held.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-67 envelope from the note on", {
            [G.sampleModes]: 2,
            [G.attackVolEnv]: -1200,
            ...LONG_RELEASE
        })
    ],
    midi: (m, [reference, release]) => {
        m.steps([reference]);
        m.steps([release], { start: 1, length: 1 });
    },
    verify: (r) => {
        const start = voiceStart(r, 1.99);
        r.near(
            // A synthesizer may smooth the start of the sample against clicks (spec section 8.1)
            "0.1 to 0.2 s after the note off, against the reference in dB",
            levelDb(r.at(start + 0.1, start + 0.2)) - sustainDb(r, 0),
            0,
            0.3
        );
    }
});

export const GEN_68 = defineTest({
    id: "GEN-68",
    title: "sampleModes 4, the alternating loop",
    section: "7.1",
    description:
        "The `ramp` (one rising ramp of 109 points, looped) with `sampleModes` 4, then with `sampleModes` 1.",
    pass: "The first note is a triangle wave with a period of `2 * (109 - 1)` = 216 points, 222.2 Hz: forward through the loop, then backward, each turn point played once. The second is a sawtooth of 109 points, 440.4 Hz.",
    length: 2,
    bank: (b) =>
        [4, 1].map((mode) =>
            b.preset({
                name: `GEN-68 mode ${mode}`,
                zones: [
                    {
                        sample: b.sample("ramp"),
                        generators: { [G.sampleModes]: mode }
                    }
                ]
            })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "alternating loop in Hz",
            frequency(r.at(0.1, 0.7)),
            48_000 / 216,
            0.1
        );
        r.near(
            "forward loop in Hz",
            frequency(r.at(1.1, 1.7)),
            48_000 / 109,
            0.1
        );
    }
});

/**
 * The largest step between two neighbouring points, against the peak of the stretch.
 */
function largestStep(x: Float32Array) {
    let step = 0;
    let peak = 0;
    for (let i = 1; i < x.length; i++) {
        step = Math.max(step, Math.abs(x[i] - x[i - 1]));
        peak = Math.max(peak, Math.abs(x[i]));
    }
    return step / peak;
}

export const GEN_69 = defineTest({
    id: "GEN-69",
    title: "The turn points of the alternating loop",
    section: "7.1",
    description:
        "A ramp of 109 points looped with `sampleModes` 4, where the 8 points before the loop start are at the top of the ramp and the 8 after the loop end at the bottom: the opposite sign of the turn points next to them. It plays at key 70, so the playback position falls between points.",
    pass: "A clean triangle whose peaks reach the first and last point of the loop. There is no spike or dip at the turns toward the points stored outside the loop: past a turn point, interpolation uses the points the position reaches next.",
    length: 1,
    bank: (b) => {
        const ramp = sampleData("ramp");
        const data = ramp.data.slice();
        // The guard points get the value of the opposite end of the loop
        data.fill(SAMPLE_PEAK, 0, ramp.loopStart);
        data.fill(-SAMPLE_PEAK, ramp.loopEnd);
        const sample = b.addSample(
            createSample("turn points", { ...ramp, data })
        );
        return [
            b.preset({
                name: "GEN-69 turn points",
                zones: [{ sample, generators: { [G.sampleModes]: 4 } }]
            })
        ];
    },
    midi: (m, presets) => m.steps(presets, { key: 70 }),
    verify: (r) => {
        // A triangle of 216 points at 1.0595 times the speed rises 2 * 1.0595 / 108 of its swing per point
        const step = largestStep(r.at(0.1, 0.7));
        r.check(
            "no point jumps more than three times the slope of the triangle",
            step < (3 * 2 * 1.0595) / 108,
            `${step.toFixed(4)} of the peak per point`
        );
    }
});

export const GEN_70 = defineTest({
    id: "GEN-70",
    title: "The alternating loop in the release",
    section: "7.1",
    description:
        "The `ramp` with `sampleModes` 4, a note of 1 s and a release of 1 s.",
    pass: "The triangle of 222.2 Hz goes on through the release: the alternating loop loops in the release phase too.",
    length: 2.5,
    bank: (b) => [
        b.preset({
            name: "GEN-70 release",
            zones: [
                {
                    sample: b.sample("ramp"),
                    generators: { [G.sampleModes]: 4, [G.releaseVolEnv]: 0 }
                }
            ]
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 1 }),
    verify: (r) =>
        r.near(
            "0.3 s into the release in Hz",
            frequency(r.at(1.2, 1.5)),
            48_000 / 216,
            0.1
        )
});

export const GEN_71 = defineTest({
    id: "GEN-71",
    title: "A loop of one point, and undefined sample modes",
    section: "7.1",
    description:
        "The `sine` with a loop of one point after 1000 points, with `sampleModes` 4 and then 1. Then the `sine` (1.1 s long) with `sampleModes` 5, 6, 7 and 8, each held for 1.5 s.",
    pass: "The first two notes are the same: a loop of one point plays like the value 1, a steady level after the first 21 ms. The last four play the sample once and are silent after 1.1 s, like the value 0.",
    length: 12,
    bank: (b) => {
        const sine = sampleData("sine");
        const sample = b.addSample(
            createSample("one point loop", {
                ...sine,
                loopStart: 1000,
                loopEnd: 1001
            })
        );
        return [
            ...[4, 1].map((mode) =>
                b.preset({
                    name: `GEN-71 one point mode ${mode}`,
                    zones: [{ sample, generators: { [G.sampleModes]: mode } }]
                })
            ),
            ...[5, 6, 7, 8].map((mode) =>
                b.preset({
                    name: `GEN-71 mode ${mode}`,
                    zones: [
                        {
                            sample: b.sample("sine"),
                            rawGenerators: { [G.sampleModes]: mode }
                        }
                    ]
                })
            )
        ];
    },
    midi: (m, presets) => m.steps(presets, { length: 1.5, spacing: 2 }),
    verify: (r) => {
        const one = levelDb(r.at(0.1, 0.9));
        r.check(
            "the one point loop holds a level",
            one > -60,
            `${one.toFixed(1)} dB`
        );
        r.db(
            "mode 4 against mode 1 with one point, in dB",
            one - levelDb(r.at(2.1, 2.9)),
            0
        );
        for (const [i, mode] of [5, 6, 7, 8].entries()) {
            const t = 4 + i * 2;
            r.check(
                `mode ${mode}: plays at first`,
                levelDb(r.at(t + 0.2, t + 0.8)) > -40
            );
            r.check(
                `mode ${mode}: silent after the sample, like 0`,
                levelDb(r.at(t + 1.15, t + 1.45)) < -90
            );
        }
    }
});

export const GEN_72 = defineTest({
    id: "GEN-72",
    title: "Swapped and empty loops",
    section: "8.1.1",
    description:
        "The `sine` (1.1 s long) with its loop end stored before its loop start and `sampleModes` 1. Then the `sine` with a loop of no points (loop start equal to loop end) and `sampleModes` 1, 3 and 4. Each note is held for 1.5 s.",
    pass: "The first note loops as if the two loop points were swapped: 440 Hz until the note off. The other three play the sample once and are silent after 1.1 s, as with `sampleModes` 0.",
    length: 8,
    bank: (b) => {
        const sine = sampleData("sine");
        const swapped = b.addSample(
            createSample("swapped loop", {
                ...sine,
                loopStart: sine.loopEnd,
                loopEnd: sine.loopStart
            })
        );
        const empty = b.addSample(
            createSample("empty loop", { ...sine, loopEnd: sine.loopStart })
        );
        return [
            b.preset({
                name: "GEN-72 swapped",
                zones: [{ sample: swapped, generators: { [G.sampleModes]: 1 } }]
            }),
            ...[1, 3, 4].map((mode) =>
                b.preset({
                    name: `GEN-72 empty mode ${mode}`,
                    zones: [
                        { sample: empty, generators: { [G.sampleModes]: mode } }
                    ]
                })
            )
        ];
    },
    midi: (m, presets) => m.steps(presets, { length: 1.5, spacing: 2 }),
    verify: (r) => {
        r.cents(
            "swapped loop: still 440 Hz at 1.3 s, in cents",
            pitchOver(r, 1.2, 1.45),
            0
        );
        for (const [i, mode] of [1, 3, 4].entries()) {
            const t = 2 + i * 2;
            r.check(
                `empty loop, mode ${mode}: silent after the sample`,
                levelDb(r.at(t + 1.15, t + 1.45)) < -90
            );
        }
    }
});

export const GEN_73 = defineTest({
    id: "GEN-73",
    title: "Address offsets beyond the sample",
    section: "8.1.1",
    description:
        "The `steps` (8000 points, no loop) plain. Then with `startAddrsOffset` 20000, past its end. Then with `startAddrsOffset` -5000, before its start. Then with `endAddrOffset` 20000, past its end.",
    pass: "Each point is limited to the sample. The second note plays nothing. The third and the fourth play the whole sample, exactly like the first: the same eight plateaus for 0.167 s.",
    length: 4,
    bank: (b) => {
        const steps = b.sample("steps");
        const offsets = [
            {},
            { [G.startAddrsOffset]: 20_000 },
            { [G.startAddrsOffset]: -5000 },
            { [G.endAddrOffset]: 20_000 }
        ];
        return offsets.map((rawGenerators, i) =>
            b.preset({
                name: `GEN-73 offsets ${i}`,
                zones: [
                    {
                        sample: steps,
                        generators: { [G.sampleModes]: 0 },
                        rawGenerators
                    }
                ]
            })
        );
    },
    midi: (m, presets) => m.steps(presets, { length: 0.5 }),
    verify: (r) => {
        r.check("start past the end: silent", levelDb(r.at(1, 1.9)) < -90);
        const plain = soundLength(r, 0);
        r.near(
            "the plain note lasts 8000 points, in s",
            plain,
            8000 / 48_000,
            0.003
        );
        r.near(
            "start before the sample: length in s",
            soundLength(r, 2),
            plain,
            0.001
        );
        r.db(
            "start before the sample: level against the plain note in dB",
            levelDb(r.at(2, 2.4)) - levelDb(r.at(0, 0.4)),
            0
        );
        r.near(
            "end past the end: length in s",
            soundLength(r, 3),
            plain,
            0.001
        );
    }
});

export const GEN_74 = defineTest({
    id: "GEN-74",
    title: "The sample links are not used",
    section: "6.2",
    description:
        "The `left` (440 Hz) and `right` (880 Hz) samples, linked as a stereo pair, in two zones panned hard left and hard right. The right zone has `fineTune` 700.",
    pass: "The left channel plays 440 Hz. Only the right channel moves, to 880 Hz plus 700 cents (1318.5 Hz): the left zone does not follow the generators of the right one.",
    length: 1,
    bank: (b) => [
        b.preset({
            name: "GEN-74 stereo pair",
            zones: [
                { sample: b.sample("left"), generators: { [G.pan]: -500 } },
                {
                    sample: b.sample("right"),
                    generators: { [G.pan]: 500, [G.fineTune]: 700 }
                }
            ]
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.cents(
            "left channel in cents from 440 Hz",
            pitchOver(r, 0.1, 0.7, "left"),
            0
        );
        r.cents(
            "right channel in cents from 440 Hz",
            pitchOver(r, 0.1, 0.7, "right"),
            1900
        );
    }
});

export const GEN_75 = defineTest({
    id: "GEN-75",
    title: "The wider range of fineTune",
    section: "7.1",
    description:
        "The `sine` at key 69 with `fineTune` 1200, -1200 and 150. Then at key 0 with `fineTune` 12700.",
    pass: "One octave up (880 Hz), one octave down (220 Hz), 150 cents up (479.8 Hz), and 12700 cents above key 0, the pitch of key 127 (12.5 kHz).",
    length: 4,
    bank: (b) =>
        [1200, -1200, 150, 12_700].map((tune) =>
            b.tone(`GEN-75 fine tune ${tune}`, { [G.fineTune]: tune })
        ),
    midi: (m, [up, down, small, top]) => {
        m.steps([up, down, small]);
        m.steps([top], { start: 3, key: 0 });
    },
    verify: (r) => {
        r.cents("1200 in cents", pitchOver(r, 0.1, 0.7), 1200);
        r.cents("-1200 in cents", pitchOver(r, 1.1, 1.7), -1200);
        r.cents("150 in cents", pitchOver(r, 2.1, 2.7), 150);
        r.near(
            "12700 at key 0, in cents from 440 Hz",
            pitchOver(r, 3.1, 3.7),
            12_700 - 6900,
            5
        );
    }
});

export const GEN_76 = defineTest({
    id: "GEN-76",
    title: "exclusiveClass is wider than 8 bits",
    section: "7.1",
    description:
        "A preset whose key 69 is in `exclusiveClass` 44 and key 81 (880 Hz) in class 300. Key 69 is held, and key 81 is struck 0.5 s later. Then a preset with classes 200 and 300, and one where both keys are in class 32767, played the same way.",
    pass: "In the first part both notes sound together: 300 is not 44, although its lowest 8 bits are. In the second part both sound too: 200 and 300 are different classes, which a clamp at 127 would merge. In the third part the 440 Hz note ends when key 81 is struck: class 32767 is a valid class.",
    length: 7,
    bank: (b) =>
        [
            [44, 300],
            [200, 300],
            [32_767, 32_767]
        ].map(([low, high]) =>
            b.preset({
                name: `GEN-76 classes ${low} and ${high}`,
                zones: [
                    {
                        sample: b.sample("sine"),
                        keys: [69, 69],
                        generators: { [G.exclusiveClass]: low }
                    },
                    {
                        sample: b.sample("sine"),
                        keys: [81, 81],
                        generators: { [G.exclusiveClass]: high }
                    }
                ]
            })
        ),
    midi: (m, presets) => {
        for (const [i, preset] of presets.entries()) {
            const t = i * 2.5;
            m.program(t, 0, preset);
            m.note(t, 1.8, { key: 69 });
            m.note(t + 0.5, 1.3, { key: 81 });
        }
    },
    verify: (r) => {
        r.near(
            "classes 44 and 300: 440 Hz against 880 Hz in dB",
            bandAgainst(r, 0.8, 1.6, 440, 880),
            0,
            1
        );
        r.near(
            "classes 200 and 300: 440 Hz against 880 Hz in dB",
            bandAgainst(r, 3.3, 4.1, 440, 880),
            0,
            1
        );
        r.check(
            "class 32767: the 440 Hz note ended",
            bandAgainst(r, 5.8, 6.6, 440, 880) < -40
        );
    }
});

export const GEN_77 = defineTest({
    id: "GEN-77",
    title: "The exclusive class reaches across a Program Change",
    section: "7.1",
    description:
        "A long note of the `sine` in `exclusiveClass` 7. Then a Program Change, and a note of another preset (880 Hz) in class 7, 0.5 s later.",
    pass: "The first note ends when the second one starts, with a very short release (should): the class is per channel, not per preset.",
    length: 2.5,
    bank: (b) => [
        b.tone("GEN-77 first", { [G.exclusiveClass]: 7 }),
        b.tone("GEN-77 second", { [G.exclusiveClass]: 7, [G.fineTune]: 1200 })
    ],
    midi: (m, [first, second]) => {
        m.program(0, 0, first);
        m.note(0, 2);
        m.program(0.5, 0, second);
        m.note(0.5, 1.5);
    },
    verify: (r) =>
        r.check(
            "the 440 Hz note ended",
            bandAgainst(r, 0.9, 1.8, 440, 880) < -40
        )
});

export const GEN_78 = defineTest({
    id: "GEN-78",
    title: "One note on does not end its own voices",
    section: "7.1",
    description:
        "One note on that starts two zones in `exclusiveClass` 7: the `sine` and the `sine` an octave up. The reference tone comes first.",
    pass: "Both voices sound for the whole note: 440 Hz and 880 Hz at the same level, together 3 dB above the reference tone.",
    length: 2,
    bank: (b) => [
        b.reference(),
        b.preset({
            name: "GEN-78 two zones",
            zones: [
                {
                    sample: b.sample("sine"),
                    generators: { [G.exclusiveClass]: 7 }
                },
                {
                    sample: b.sample("sine"),
                    generators: { [G.exclusiveClass]: 7, [G.fineTune]: 1200 }
                }
            ]
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.db(
            "both voices against the reference in dB",
            sustainDb(r, 1) - sustainDb(r, 0),
            3.01
        );
        r.near(
            "440 Hz against 880 Hz in dB",
            bandAgainst(r, 1.2, 1.7, 440, 880),
            0,
            1
        );
    }
});

export const GEN_87 = defineTest({
    id: "GEN-87",
    title: "Two note ons of one class at the same time",
    section: "7.1",
    description:
        "The `sine` in exclusive class 5. Key 69 and key 81 are struck at the same time, key 69 first, and both are held.",
    pass: "Only key 81 (880 Hz) keeps sounding: key 69 is a separate note on, so key 81 ends it like any other note of the class. A very short sound of key 69 at the start is allowed.",
    length: 1.5,
    bank: (b) => [b.tone("GEN-87 class 5", { [G.exclusiveClass]: 5 })],
    midi: (m, [preset]) => {
        m.program(0, 0, preset);
        m.note(0, 1.2, { key: 69 });
        m.note(0, 1.2, { key: 81 });
    },
    verify: (r) =>
        r.check(
            "the 440 Hz note ended",
            bandAgainst(r, 0.3, 1.1, 440, 880) < -40
        )
});

export const GEN_89 = defineTest({
    id: "GEN-89",
    title: "A modulator on overridingRootKey is ignored",
    section: "7.1",
    description:
        "The `sine` with `overridingRootKey` 69 and a modulator from CC 16 to `overridingRootKey` with the amount 12, at key 69. The first note with CC 16 at 0, the second with CC 16 at 127 before its note on, the third with CC 16 at 0 at its note on and at 127 0.35 s later.",
    pass: "440 Hz in all three notes (should). `overridingRootKey` is a plain value, so a synthesizer should ignore the modulator. One that applies it is allowed but not recommended, and plays the second note lower.",
    length: 3,
    bank: (b) =>
        b.tone("GEN-89 root key", { [G.overridingRootKey]: 69 }, [
            mod(cc(16), none(), G.overridingRootKey, 12)
        ]),
    midi: (m, preset) => {
        m.program(0, 0, preset);
        m.cc(0, 0, 16, 0);
        m.note(0.05, 0.8);
        m.cc(1, 0, 16, 127);
        m.note(1.05, 0.8);
        m.cc(2, 0, 16, 0);
        m.note(2.05, 0.8);
        m.cc(2.4, 0, 16, 127);
    },
    verify: (r) => {
        r.cents("CC 16 at 0, in cents", pitchOver(r, 0.3, 0.8), 0);
        r.cents("CC 16 at 127, in cents", pitchOver(r, 1.3, 1.8), 0);
        r.cents(
            "CC 16 moved during the note, in cents",
            pitchOver(r, 2.5, 2.8),
            0
        );
    }
});

export const GEN_90 = defineTest({
    id: "GEN-90",
    title: "A start past the loop end, an end inside the loop",
    section: "8.1.1",
    description:
        "The `tail` (a loop of 440 Hz from point 2400 to 50400, then 880 Hz to point 64800) with `sampleModes` 1, held for 1.5 s. First with `startAddrsCoarseOffset` 1 and `startAddrsOffset` 20000, so it starts at point 52768, past the loop end in the 880 Hz part. Then with `endAddrOffset` -30000, so the end is at point 34800, inside the loop.",
    pass: "Both notes play 440 Hz for as long as the key is held. The first start moves back by the loop length into the loop, so no 880 Hz plays. While a loop runs the end is not checked, so the second note goes on past 0.725 s, where it would have stopped at its end.",
    length: 3.5,
    bank: (b) => {
        const tail = b.sample("tail");
        return [
            {
                [G.startAddrsCoarseOffset]: 1,
                [G.startAddrsOffset]: 20_000
            },
            { [G.endAddrOffset]: -30_000 }
        ].map((rawGenerators, i) =>
            b.preset({
                name: `GEN-90 loop ${i}`,
                zones: [
                    {
                        sample: tail,
                        generators: { [G.sampleModes]: 1 },
                        rawGenerators
                    }
                ]
            })
        );
    },
    midi: (m, presets) => m.steps(presets, { length: 1.5, spacing: 2 }),
    verify: (r) => {
        r.cents(
            "start past the loop: 440 Hz, in cents",
            pitchOver(r, 0.3, 1.4),
            0
        );
        r.check(
            "start past the loop: no 880 Hz",
            bandAgainst(r, 0.1, 1.4, 880, 440) < -40
        );
        r.cents(
            "end inside the loop: 440 Hz after 0.725 s, in cents",
            pitchOver(r, 2.9, 3.4),
            0
        );
        r.db(
            "end inside the loop: still at full level after 0.725 s, in dB",
            levelDb(r.at(2.9, 3.4)) - levelDb(r.at(2.2, 2.6)),
            0
        );
    }
});

export const GEN_92 = defineTest({
    id: "GEN-92",
    title: "The address offsets take their modulators at the note on",
    section: "7.1",
    description:
        "The `tail` (440 Hz to point 50400, then 880 Hz to point 64800, 1.35 s in all) with `sampleModes` 0. First with a modulator from CC 16 to `startAddrsOffset` with the amount 32767: one note with CC 16 at 0, one with CC 16 at 127 before its note on, one with CC 16 at 0 at its note on and at 127 0.05 s later. Then with a modulator from CC 16 to `endAddrsOffset` with the amount -32767: one note with CC 16 at 0 at its note on and at 127 0.05 s later, then one with CC 16 at 127 before its note on.",
    pass: "Between 0.45 and 0.6 s into the first three notes: 440 Hz, then 880 Hz, then 440 Hz. At CC 16 = 127 the start moves the full 32767 points (0.68 s) on, so the 880 Hz part comes after 0.37 s. The fourth note plays its whole length and is still sounding 0.8 to 1 s in. The fifth ends 32767 points early, at 0.67 s, so it is silent 0.8 to 1 s in. The offsets are read once at the note on, so the changes during the third and fourth notes do nothing.",
    length: 8.5,
    bank: (b) =>
        (
            [
                ["start", G.startAddrsOffset, 32_767],
                ["end", G.endAddrOffset, -32_767]
            ] as const
        ).map(([name, destination, amount]) =>
            b.preset({
                name: `GEN-92 ${name} offset`,
                zones: [
                    {
                        sample: b.sample("tail"),
                        generators: { [G.sampleModes]: 0 },
                        modulators: [mod(cc(16), none(), destination, amount)]
                    }
                ]
            })
        ),
    // The note starts, 1.5 s apart, and CC 16 moves 0.05 s into the third and fourth notes
    midi: (m, [start, end]) => {
        const starts = [0.05, 1.55, 3.05, 4.55, 7.05];
        m.program(0, 0, start);
        m.cc(0, 0, 16, 0);
        m.note(starts[0], 1.2);
        m.cc(1.5, 0, 16, 127);
        m.note(starts[1], 1.2);
        m.cc(3, 0, 16, 0);
        m.note(starts[2], 1.2);
        m.cc(starts[2] + 0.05, 0, 16, 127);
        m.program(4.5, 0, end);
        m.cc(4.5, 0, 16, 0);
        m.note(starts[3], 2);
        m.cc(starts[3] + 0.05, 0, 16, 127);
        m.note(starts[4], 1.2);
        return starts;
    },
    verify: (r, _presets, starts) => {
        const noteWindow = (i: number) =>
            pitchOver(r, starts[i] + 0.45, starts[i] + 0.6);
        r.cents("start, CC 16 at 0, in cents", noteWindow(0), 0);
        r.cents("start, CC 16 at 127, in cents", noteWindow(1), 1200);
        r.cents(
            "start, CC 16 moved during the note, in cents",
            noteWindow(2),
            0
        );
        r.db(
            "end, CC 16 moved during the note: still sounding 0.8 to 1 s in, in dB",
            levelDb(r.at(starts[3] + 0.8, starts[3] + 1)) -
                levelDb(r.at(starts[3] + 0.2, starts[3] + 0.4)),
            0
        );
        r.check(
            "end, CC 16 at 127 at the note on: silent 0.8 to 1 s in",
            levelDb(r.at(starts[4] + 0.8, starts[4] + 1)) -
                levelDb(r.at(starts[4] + 0.2, starts[4] + 0.4)) <
                -40
        );
    }
});

export const GEN_93 = defineTest({
    id: "GEN-93",
    title: "scaleTuning follows its modulators during the note",
    section: "7.1",
    description:
        "The `sine` with `scaleTuning` 177 and a modulator from CC 16 to `scaleTuning` with the amount -127, at key 81, 12 keys above the root key. CC 16 is at 0 at the note on and moves to 127 0.6 s later.",
    pass: "The note starts 2124 cents above 440 Hz (177 cents per key) and drops to 600 cents above it when the controller moves: `scaleTuning` becomes 177 - 127 = 50 cents per key, since 127 is full scale.",
    length: 1.5,
    bank: (b) =>
        b.tone("GEN-93 scale tuning", { [G.scaleTuning]: 177 }, [
            mod(cc(16), none(), G.scaleTuning, -127)
        ]),
    midi: (m, preset) => {
        m.program(0, 0, preset);
        m.cc(0, 0, 16, 0);
        m.note(0.05, 1.3, { key: 81 });
        m.cc(0.65, 0, 16, 127);
    },
    verify: (r) => {
        r.cents("before the move, in cents", pitchOver(r, 0.2, 0.55), 12 * 177);
        r.cents("after the move, in cents", pitchOver(r, 0.85, 1.25), 12 * 50);
    }
});

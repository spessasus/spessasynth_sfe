import { GeneratorTypes as G } from "spessasynth_core";
import { constant } from "../../framework/bank_builder";
import { firstSound, peakDb } from "../../framework/measure";
import { defineTest, type TestRender } from "../../framework/types";
import { levelAround, pitchCrossing, voiceStart } from "./common";

/**
 * Where the first sound after a note time is, in points from the note time.
 */
function onsetPoints(r: TestRender, noteTime: number) {
    return firstSound(r.at(noteTime, noteTime + 0.05), -60);
}

/**
 * The peak in dB of the first 0.25 ms of a voice, against the peak of its steady part.
 */
function startPeak(r: TestRender, noteTime: number) {
    const start = voiceStart(r, noteTime);
    return (
        peakDb(r.at(start, start + 0.000_25)) -
        peakDb(r.at(start + 0.3, start + 0.4))
    );
}

/**
 * The 1 ms ramp of a voice, as the peak of each quarter millisecond against the steady peak.
 */
function ramp(r: TestRender, noteTime: number) {
    const start = voiceStart(r, noteTime);
    const steady = peakDb(r.at(start + 0.3, start + 0.4));
    return [0, 1, 2, 3].map(
        (q) =>
            peakDb(r.at(start + q * 0.000_25, start + (q + 1) * 0.000_25)) -
            steady
    );
}

export const GEN_58 = defineTest({
    id: "GEN-58",
    title: "Zero time and the 1 ms floor",
    section: "7.1",
    description:
        "The `cosine`, which starts at its peak, with `delayVolEnv` -32768 and `attackVolEnv` -32768, -32767, -20000, -12001 and -12000.",
    pass: "The first note is at full level from its first point: the voice starts at its peak. The other four start the same way as each other: every value from -32767 to -12001 counts as -12000, which is 1 ms (a synthesizer may round it to its update period).",
    length: 5,
    bank: (b) =>
        [-32_768, -32_767, -20_000, -12_001, -12_000].map((attack) =>
            b.preset({
                name: `GEN-58 attack ${attack}`,
                zones: [
                    {
                        sample: b.sample("cosine"),
                        generators: { [G.delayVolEnv]: -32_768 },
                        rawGenerators: { [G.attackVolEnv]: attack }
                    }
                ]
            })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "zero time: the first 0.25 ms against the steady peak in dB",
            startPeak(r, 0),
            0,
            0.5
        );
        const reference = ramp(r, 4);
        for (const i of [1, 2, 3]) {
            const steps = ramp(r, i);
            for (const [q, value] of steps.entries())
                r.near(
                    `note ${i + 1} against -12000, quarter ${q + 1} of the ramp in dB`,
                    value,
                    reference[q],
                    1
                );
        }
    }
});

export const GEN_59 = defineTest({
    id: "GEN-59",
    title: "Zero time by the sum of the instrument and the preset",
    section: "7.1",
    description:
        "The `cosine` with `delayVolEnv` -32768 and an instrument `attackVolEnv` of -12000. First with a preset offset of -20768 (a sum of -32768), then with -20000 (a sum of -32000), then with no preset offset.",
    pass: "The first note starts at its peak: the sum reaches -32768. The second starts like the third: -32000 counts as -12000, which is 1 ms (a synthesizer may round it to its update period).",
    length: 3,
    bank: (b) =>
        [-20_768, -20_000, 0].map((offset) =>
            b.preset({
                name: `GEN-59 offset ${offset}`,
                zones: [
                    {
                        sample: b.sample("cosine"),
                        generators: {
                            [G.delayVolEnv]: -32_768,
                            [G.attackVolEnv]: -12_000
                        }
                    }
                ],
                presetGenerators: { [G.attackVolEnv]: offset }
            })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "zero time by the sum, first 0.25 ms in dB",
            startPeak(r, 0),
            0,
            0.5
        );
        const plain = ramp(r, 2);
        for (const [q, value] of ramp(r, 1).entries())
            r.near(
                `-32000 against -12000, quarter ${q + 1} of the start in dB`,
                value,
                plain[q],
                1
            );
    }
});

export const GEN_85 = defineTest({
    id: "GEN-85",
    title: "Zero time reached through a modulator",
    section: "7.1",
    description:
        "The `cosine` with `delayVolEnv` -32768 and `attackVolEnv` -12000. First with a constant modulator of -32768 to `attackVolEnv` (a sum below -32768), then with one of -20000 (a sum of about -32000), then with no modulator.",
    pass: "The first note starts at its peak: the time is taken after the modulators, and the sum reaches -32768. The second starts like the third: -32000 counts as -12000, which is 1 ms (a synthesizer may round it to its update period).",
    length: 3,
    bank: (b) =>
        [-32_768, -20_000, 0].map((amount) =>
            b.preset({
                name: `GEN-85 modulator ${amount}`,
                zones: [
                    {
                        sample: b.sample("cosine"),
                        generators: {
                            [G.delayVolEnv]: -32_768,
                            [G.attackVolEnv]: -12_000
                        },
                        modulators:
                            amount === 0
                                ? undefined
                                : [constant(G.attackVolEnv, amount)]
                    }
                ]
            })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "zero time through the modulator, first 0.25 ms in dB",
            startPeak(r, 0),
            0,
            0.5
        );
        const plain = ramp(r, 2);
        for (const [q, value] of ramp(r, 1).entries())
            r.near(
                `-32000 against -12000, quarter ${q + 1} of the start in dB`,
                value,
                plain[q],
                1
            );
    }
});

export const GEN_60 = defineTest({
    id: "GEN-60",
    title: "A delay of -12000 is 1 ms",
    section: "7.1",
    description:
        "The `cosine` with `attackVolEnv` -32768 and `delayVolEnv` -32768, then the same with `delayVolEnv` -12000.",
    pass: "The second note does not start before the first. Informative: it starts 1 ms (48 points) later after its note on, since -12000 is 1 ms and not zero time, but a synthesizer may round times shorter than its update period.",
    length: 2,
    bank: (b) =>
        [-32_768, -12_000].map((delay) =>
            b.preset({
                name: `GEN-60 delay ${delay}`,
                zones: [
                    {
                        sample: b.sample("cosine"),
                        generators: {
                            [G.attackVolEnv]: -32_768,
                            [G.delayVolEnv]: delay
                        }
                    }
                ]
            })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const later = onsetPoints(r, 1) - onsetPoints(r, 0);
        r.check(
            "the second note does not start earlier (1 ms later is informative)",
            later >= 0,
            `${later} points later`
        );
    }
});

export const GEN_61 = defineTest({
    id: "GEN-61",
    title: "Zero time comes before the key scaling",
    section: "7.1",
    description:
        "Key 36 with `scaleTuning` 0, a key scaling of the hold of 400 per key (`keynumToVolEnvHold`), and a fall of 192 dB per second after the hold. First `holdVolEnv` -32768, then -20000. Then the same for the Modulation Envelope and the second Modulation Envelope, each to pitch with 1200 cents and falling to 0 after its hold.",
    pass: "With -32768 there is no hold at all. With -20000 the hold lasts 0.25 s: -20000 counts as -12000, and the scaling adds 400 * 24 = 9600 timecents to it. The same in the pitch of both Modulation Envelopes.",
    length: 6,
    bank: (b) => {
        const sine = b.sample("sine");
        const volume = (hold: number) =>
            b.preset({
                name: `GEN-61 volume hold ${hold}`,
                zones: [
                    {
                        sample: sine,
                        generators: {
                            [G.scaleTuning]: 0,
                            [G.keyNumToVolEnvHold]: 400,
                            [G.decayVolEnv]: -1200,
                            [G.sustainVolEnv]: 1000,
                            [G.attackVolEnv]: -32_768
                        },
                        rawGenerators: { [G.holdVolEnv]: hold }
                    }
                ]
            });
        const modEnv = (hold: number) =>
            b.preset({
                name: `GEN-61 mod env hold ${hold}`,
                zones: [
                    {
                        sample: sine,
                        generators: {
                            [G.scaleTuning]: 0,
                            [G.keyNumToModEnvHold]: 400,
                            [G.modEnvToPitch]: 1200,
                            [G.attackModEnv]: -32_768,
                            [G.sustainModEnv]: 1000
                        },
                        rawGenerators: { [G.holdModEnv]: hold }
                    }
                ]
            });
        const modEnv2 = (hold: number) =>
            b.preset({
                name: `GEN-61 mod env 2 hold ${hold}`,
                zones: [
                    {
                        sample: sine,
                        generators: {
                            [G.scaleTuning]: 0,
                            [G.keyNumToModEnv2Hold]: 400,
                            [G.modEnv2ToPitch]: 1200,
                            [G.sustainModEnv2]: 1000
                        },
                        rawGenerators: { [G.holdModEnv2]: hold }
                    }
                ]
            });
        return [
            volume(-32_768),
            volume(-20_000),
            modEnv(-32_768),
            modEnv(-20_000),
            modEnv2(-32_768),
            modEnv2(-20_000)
        ];
    },
    midi: (m, presets) => m.steps(presets, { key: 36 }),
    verify: (r) => {
        // Levels against earlier points of the same note, so the start of the envelope does not matter
        const level = (note: number, t: number) =>
            levelAround(r, voiceStart(r, note) + t, 0);
        // Points on the fall are 0.1 s or more into it, so a smoothed level (spec section 8.1) shifts both alike
        r.near(
            "volume, no hold: falling 192 dB per second from 0.1 s to 0.2 s, in dB",
            level(0, 0.2) - level(0, 0.1),
            -19.2,
            1
        );
        r.near(
            "volume, hold: flat from 0.05 s to 0.2 s, in dB",
            level(1, 0.2) - level(1, 0.05),
            0,
            0.3
        );
        r.near(
            "volume, hold: falling 192 dB per second after the hold, 0.4 s against 0.5 s in dB",
            level(1, 0.5) - level(1, 0.4),
            -19.2,
            1
        );
        for (const [label, note] of [
            ["Modulation Envelope", 2],
            ["second Modulation Envelope", 4]
        ] as const) {
            const none = voiceStart(r, note);
            r.near(
                `${label}, no hold: the octave ends after, in s`,
                pitchCrossing(r, none + 0.01, none + 0.6, 600, "down") - none,
                0.01,
                0.006
            );
            const held = voiceStart(r, note + 1);
            r.near(
                `${label}, hold: the octave ends after, in s`,
                pitchCrossing(r, held + 0.01, held + 0.6, 600, "down") - held,
                0.25,
                // The crossing is read in 5 ms steps from 20 ms windows, which costs about 5 ms itself
                0.02
            );
        }
    }
});

export const GEN_62 = defineTest({
    id: "GEN-62",
    title: "delayVoice and delayVolEnv at -32768 and -12000",
    section: "7.1",
    description:
        "The `click` with `delayVoice` -32768, then -12000. Then the `click` with zero-time attack and `delayVolEnv` -32768, then -12000.",
    pass: "In each pair the second click does not come before the first. Informative: it comes 1 ms (48 points) later after its note on, but a synthesizer may round times shorter than its update period.",
    length: 4,
    bank: (b) => [
        ...[-32_768, -12_000].map((delay) =>
            b.preset({
                name: `GEN-62 delayVoice ${delay}`,
                zones: [
                    {
                        sample: b.sample("click"),
                        generators: {
                            [G.sampleModes]: 0,
                            [G.delayVoice]: delay,
                            [G.delayVolEnv]: -32_768,
                            [G.attackVolEnv]: -32_768
                        }
                    }
                ]
            })
        ),
        ...[-32_768, -12_000].map((delay) =>
            b.preset({
                name: `GEN-62 delayVolEnv ${delay}`,
                zones: [
                    {
                        sample: b.sample("click"),
                        generators: {
                            [G.sampleModes]: 0,
                            [G.delayVolEnv]: delay,
                            [G.attackVolEnv]: -32_768
                        }
                    }
                ]
            })
        )
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        for (const [label, first] of [
            ["delayVoice", 0],
            ["delayVolEnv", 2]
        ] as const) {
            const later = onsetPoints(r, first + 1) - onsetPoints(r, first);
            r.check(
                `${label}: the second click does not come earlier (1 ms later is informative)`,
                later >= 0,
                `${later} points later`
            );
        }
    }
});

export const GEN_63 = defineTest({
    id: "GEN-63",
    title: "A fade of zero time",
    section: "7.1",
    description:
        "The `sine` with a square Modulation LFO (`modLfoWaveform` 3) at full depth (`modLfoToAmplitude` 1000) and no LFO delay (-32768). First `fadeModLFO` -32768, then -12000.",
    pass: "The first note starts at twice the amplitude at once. The second reaches it after a ramp of 1 ms. Informative: a synthesizer may round times shorter than its update period, so the second note may start at full depth too.",
    length: 2,
    bank: (b) =>
        [-32_768, -12_000].map((fade) =>
            b.tone(`GEN-63 fade ${fade}`, {
                [G.modLfoWaveform]: 3,
                [G.modLfoToAmplitude]: 1000,
                [G.delayModLFO]: -32_768,
                [G.fadeModLFO]: fade,
                [G.delayVolEnv]: -32_768,
                [G.attackVolEnv]: -32_768
            })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        // The square stays at 1 for the first half of its cycle (about 61 ms at the default 8.176 Hz)
        const start = voiceStart(r, 0);
        const first =
            peakDb(r.at(start, start + 0.001)) -
            peakDb(r.at(start + 0.01, start + 0.05));
        r.near(
            "zero fade: the first 1 ms against the top of the square in dB",
            first,
            0,
            0.5
        );
        const second = voiceStart(r, 1);
        const ramped =
            peakDb(r.at(second, second + 0.001)) -
            peakDb(r.at(second + 0.01, second + 0.05));
        r.check(
            "1 ms fade, informative: the first 1 ms is not louder than the top",
            ramped < 0.5,
            `${ramped.toFixed(1)} dB`
        );
    }
});

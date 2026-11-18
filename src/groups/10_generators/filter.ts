import { GeneratorTypes as G } from "spessasynth_core";
import {
    type BankBuilder,
    constant,
    type Generators
} from "../../framework/bank_builder";
import {
    bandEnergyDb,
    bandRatioDb,
    cents,
    envelopeDb,
    lowpassCutoffHz
} from "../../framework/measure";
import {
    absoluteCentsToHz,
    FILTER_TYPES,
    filterGainDb
} from "../../framework/spec_math";
import { defineTest, type TestRender } from "../../framework/types";
import { envelopeDifference, sustainDb, HZ_1 } from "./common";

/**
 * The cutoff of a lowpass on the `noise` note at the time, measured against the unfiltered note at 0.
 */
function measuredCutoff(r: TestRender, start: number, from = 0.1, to = 0.75) {
    return lowpassCutoffHz(r.at(start + from, start + to), r.at(from, to));
}

export const GEN_10 = defineTest({
    id: "GEN-10",
    title: "The five filter types",
    section: "7.1.1 #61",
    description:
        "The `noise` unfiltered, then through the lowpass, highpass, bandpass, peak and notch filters (`filterType` 0 to 4), all at 1480 Hz (9000) with `initialFilterQ` 100.",
    pass: "In a spectrum: the lowpass removes the highs, the highpass removes the lows, the bandpass keeps a band around 1480 Hz, the peak raises that band by about 13 dB above the rest, and the notch cuts a narrow hole there. Away from 1480 Hz the peak and the notch sit 5 dB below the unfiltered noise.",
    length: 6,
    bank: (b) => {
        const noise = b.sample("noise");
        return [
            b.preset({ name: "GEN-10 unfiltered", zones: [{ sample: noise }] }),
            ...FILTER_TYPES.map((type, i) =>
                b.preset({
                    name: `GEN-10 ${type}`,
                    zones: [
                        {
                            sample: noise,
                            generators: {
                                [G.filterType]: i,
                                [G.initialFilterFc]: 9000,
                                [G.initialFilterQ]: 100
                            }
                        }
                    ]
                })
            )
        ];
    },
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = r.at(0.1, 0.75);
        // A low band, the band of the cutoff and a high band
        const bands = [200, 1480, 8000];
        for (const [i, type] of FILTER_TYPES.entries()) {
            const filtered = r.at(i + 1.1, i + 1.75);
            for (const f of bands) {
                // Notches are narrow, so the measured band at the cutoff can't reach the analog zero
                const expected = filterGainDb(type, f, 9000, 100);
                const measured = bandRatioDb(filtered, reference, f, 1 / 12);
                if (expected < -30)
                    r.check(
                        `${type} at ${f} Hz is at least 25 dB down`,
                        measured < -25,
                        `${measured.toFixed(1)} dB`
                    );
                // The expected values are those of the analog filter. Near the Nyquist frequency a digital one
                // Drifts from them, by about 0.9 dB at 8 kHz for the bilinear transform, so the high band gets 2 dB.
                else
                    r.near(
                        `${type} at ${f} Hz in dB`,
                        measured,
                        expected,
                        f > 5000 ? 2 : 1
                    );
            }
        }
    }
});

export const GEN_11 = defineTest({
    id: "GEN-11",
    title: "The Q of a resonance of 0",
    section: "7.1.1 #61",
    description:
        "The reference tone. Then the `sine` on the cutoff (6900, 440 Hz) with `initialFilterQ` 0, through the lowpass and then the highpass.",
    pass: "Both filtered notes are 3 dB below the reference tone: a resonance of 0 is a Butterworth response, with no peak.",
    length: 3,
    bank: (b) => [
        b.reference(),
        ...[0, 1].map((type) =>
            b.tone(`GEN-11 type ${type}`, {
                [G.filterType]: type,
                [G.initialFilterFc]: 6900
            })
        )
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.db(
            "lowpass in dB",
            sustainDb(r, 1) - reference,
            filterGainDb("lowpass", 440, 6900, 0)
        );
        r.db(
            "highpass in dB",
            sustainDb(r, 2) - reference,
            filterGainDb("highpass", 440, 6900, 0)
        );
    }
});

export const GEN_12 = defineTest({
    id: "GEN-12",
    title: "The DC gain of the resonance",
    section: "7.1.1 #61",
    description:
        "The `sine` at key 33 (55 Hz), far below a lowpass cutoff of 13500, with `initialFilterQ` 0, 100, 200 and 400.",
    pass: "The notes are 0, 5, 10 and 20 dB below the first: the level drops by half of `initialFilterQ`, `q / 20` dB.",
    length: 4,
    bank: (b) =>
        [0, 100, 200, 400].map((q) =>
            b.tone(`GEN-12 Q ${q}`, {
                [G.initialFilterFc]: 13_500,
                [G.initialFilterQ]: q
            })
        ),
    midi: (m, presets) => m.steps(presets, { key: 33 }),
    verify: (r) => {
        for (const [i, q] of [100, 200, 400].entries())
            r.db(
                `Q ${q} in dB`,
                sustainDb(r, i + 1) - sustainDb(r, 0),
                filterGainDb("lowpass", 55, 13_500, q)
            );
    }
});

export const GEN_13 = defineTest({
    id: "GEN-13",
    title: "The gain of the bandpass and the peak at the cutoff",
    section: "7.1.1 #61",
    description:
        "The reference tone. Then the `sine` on the cutoff (6900) with `initialFilterQ` 100, through the bandpass and then the peak filter.",
    pass: "The bandpass note is 2 dB above the reference tone (`Q * 10^(-r/400)`), the peak note 8 dB above it (`2 * Q * 10^(-r/400)`).",
    length: 3,
    bank: (b) => [
        b.reference(),
        ...[2, 3].map((type) =>
            b.tone(`GEN-13 type ${type}`, {
                [G.filterType]: type,
                [G.initialFilterFc]: 6900,
                [G.initialFilterQ]: 100
            })
        )
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.db(
            "bandpass in dB",
            sustainDb(r, 1) - reference,
            filterGainDb("bandpass", 440, 6900, 100)
        );
        r.db(
            "peak in dB",
            sustainDb(r, 2) - reference,
            filterGainDb("peak", 440, 6900, 100)
        );
    }
});

export const GEN_14 = defineTest({
    id: "GEN-14",
    title: "The far ends of the peak and the notch",
    section: "7.1.1 #61",
    description:
        "The `sine` at key 33 (55 Hz) without a filter. Then the same note through the peak and the notch filter at 9000 (1480 Hz) with `initialFilterQ` 200. Then the reference tone, and the `sine` at key 69 on the cutoff of a notch at 6900.",
    pass: "The peak and notch notes at key 33 are both 10 dB below the unfiltered one. The last note, on the notch, is nearly silent next to the reference tone before it.",
    length: 5,
    bank: (b) => {
        const sine = b.sample("sine");
        const far = (type: number) =>
            b.preset({
                name: `GEN-14 type ${type}`,
                zones: [
                    {
                        sample: sine,
                        generators: {
                            [G.filterType]: type,
                            [G.initialFilterFc]: 9000,
                            [G.initialFilterQ]: 200
                        }
                    }
                ]
            });
        return {
            low: [b.reference(), far(3), far(4)],
            reference: b.reference(),
            notch: b.preset({
                name: "GEN-14 notch on the cutoff",
                zones: [
                    {
                        sample: sine,
                        generators: {
                            [G.filterType]: 4,
                            [G.initialFilterFc]: 6900,
                            [G.initialFilterQ]: 200
                        }
                    }
                ]
            })
        };
    },
    midi: (m, p) => {
        m.steps(p.low, { key: 33 });
        m.steps([p.reference, p.notch], { start: 3 });
    },
    verify: (r) => {
        const unfiltered = sustainDb(r, 0);
        r.db(
            "peak at 55 Hz in dB",
            sustainDb(r, 1) - unfiltered,
            filterGainDb("peak", 55, 9000, 200)
        );
        r.db(
            "notch at 55 Hz in dB",
            sustainDb(r, 2) - unfiltered,
            filterGainDb("notch", 55, 9000, 200)
        );
        const notch = sustainDb(r, 4) - sustainDb(r, 3);
        r.check(
            // 30 dB leaves room for a cutoff a few cents off, and is still far from a missing notch
            "the notch on the cutoff is at least 30 dB down",
            notch < -30,
            `${notch.toFixed(1)} dB`
        );
    }
});

export const GEN_15 = defineTest({
    id: "GEN-15",
    title: "A highpass at 13500 is not neutral",
    section: "7.1.1 #61",
    description:
        "The reference tone. Then the `sine` through a highpass at 13500 absolute cents (19.9 kHz) with `initialFilterQ` 0. Then through a lowpass with the same values.",
    pass: "The highpass note is nearly silent. The lowpass note has the level of the reference tone: only the lowpass may be skipped there.",
    length: 3,
    bank: (b) => [
        b.reference(),
        ...[1, 0].map((type) =>
            b.tone(`GEN-15 type ${type}`, {
                [G.filterType]: type,
                [G.initialFilterFc]: 13_500
            })
        )
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = sustainDb(r, 0);
        const highpass = sustainDb(r, 1) - reference;
        r.check(
            "the highpass is at least 40 dB down",
            highpass < -40,
            `${highpass.toFixed(1)} dB`
        );
        r.db("lowpass in dB", sustainDb(r, 2) - reference, 0);
    }
});

/**
 * A `noise` zone with a lowpass at r = 0 and the given generators.
 */
function noiseZone(b: BankBuilder, generators: Generators) {
    return [{ sample: b.sample("noise"), generators }];
}

export const GEN_16 = defineTest({
    id: "GEN-16",
    title: "The lower clamp of the cutoff comes before the excursions",
    section: "8.1.2",
    description:
        "The `noise` unfiltered. Then `initialFilterFc` 500 with a `modEnvToFilterFc` of 6000 and the Modulation Envelope held at its peak (its defaults). Then a plain lowpass at 7500 (622 Hz) for comparison.",
    pass: "The second and third notes sound the same, a lowpass at 622 Hz: 500 is clamped to 1500 before the envelope adds 6000. Without the clamp the cutoff would be 349 Hz.",
    length: 3,
    bank: (b) => [
        b.preset({ name: "GEN-16 unfiltered", zones: noiseZone(b, {}) }),
        b.preset({
            name: "GEN-16 clamp",
            zones: noiseZone(b, {
                [G.initialFilterFc]: 500,
                [G.modEnvToFilterFc]: 6000
            })
        }),
        b.preset({
            name: "GEN-16 at 7500",
            zones: noiseZone(b, { [G.initialFilterFc]: 7500 })
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "cutoff in cents from 622 Hz",
            cents(measuredCutoff(r, 1), absoluteCentsToHz(7500)),
            0,
            50
        );
        r.near(
            "against the plain lowpass, largest difference in dB",
            envelopeDifference(r, 1, 2, 0.75, 0.05),
            0,
            0.3
        );
    }
});

export const GEN_17 = defineTest({
    id: "GEN-17",
    title: "The upper clamp of the cutoff comes before the excursions",
    section: "8.1.2",
    description:
        "The `noise` unfiltered. Then `initialFilterFc` 13500 with a constant modulator that adds 5000, and a held `modEnvToFilterFc` of -6000. Then a plain lowpass at 7500 (622 Hz).",
    pass: "The second and third notes sound the same, a lowpass at 622 Hz: 18500 is clamped to 13500 before the envelope takes 6000 away. Without the clamp the cutoff would be 12500 (about 11.2 kHz).",
    length: 3,
    bank: (b) => [
        b.preset({ name: "GEN-17 unfiltered", zones: noiseZone(b, {}) }),
        b.preset({
            name: "GEN-17 clamp",
            zones: [
                {
                    sample: b.sample("noise"),
                    generators: {
                        [G.initialFilterFc]: 13_500,
                        [G.modEnvToFilterFc]: -6000
                    },
                    modulators: [constant(G.initialFilterFc, 5000)]
                }
            ]
        }),
        b.preset({
            name: "GEN-17 at 7500",
            zones: noiseZone(b, { [G.initialFilterFc]: 7500 })
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "cutoff in cents from 622 Hz",
            cents(measuredCutoff(r, 1), absoluteCentsToHz(7500)),
            0,
            50
        );
        r.near(
            "against the plain lowpass, largest difference in dB",
            envelopeDifference(r, 1, 2, 0.75, 0.05),
            0,
            0.3
        );
    }
});

export const GEN_18 = defineTest({
    id: "GEN-18",
    title: "maxFilterFc",
    section: "7.1.1 #62",
    description:
        "The `noise` unfiltered. Then `initialFilterFc` 13500 with `maxFilterFc` 13500, 10500, 9000 and 7500. Last, `initialFilterFc` 13500 with no `maxFilterFc` at all.",
    pass: "13500 sounds the same as no `maxFilterFc` at all: no ceiling. The others are lowpass filters at about 3.5 kHz, 1.5 kHz and 620 Hz.",
    length: 6,
    bank: (b) => [
        b.preset({ name: "GEN-18 unfiltered", zones: noiseZone(b, {}) }),
        ...[13_500, 10_500, 9000, 7500].map((max) =>
            b.preset({
                name: `GEN-18 max ${max}`,
                zones: noiseZone(b, {
                    [G.initialFilterFc]: 13_500,
                    [G.maxFilterFc]: max
                })
            })
        ),
        b.preset({
            name: "GEN-18 no ceiling",
            zones: noiseZone(b, { [G.initialFilterFc]: 13_500 })
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "13500 against no maxFilterFc, largest difference in dB",
            envelopeDifference(r, 1, 5, 0.75, 0.05),
            0,
            0.3
        );
        for (const [i, max] of [10_500, 9000, 7500].entries())
            r.near(
                `ceiling ${max}, cutoff in cents`,
                cents(measuredCutoff(r, i + 2), absoluteCentsToHz(max)),
                0,
                50
            );
    }
});

export const GEN_19 = defineTest({
    id: "GEN-19",
    title: "maxFilterFc stops a sweep",
    section: "7.1.1 #62, 8.1.2",
    description:
        "The `noise` unfiltered for 2.8 s. Then a lowpass at `initialFilterFc` 6000 with a `modEnvToFilterFc` of 6000, `maxFilterFc` 9000, and the Modulation Envelope delayed by 0.5 s with an attack of 1 s.",
    pass: "For half a second the lowpass is at about 260 Hz (6000). Then the cutoff sweeps up and stops at about 1.5 kHz (9000) for the rest of the note, where 12000 would be about 8.4 kHz.",
    length: 5.8,
    bank: (b) => [
        b.preset({ name: "GEN-19 unfiltered", zones: noiseZone(b, {}) }),
        b.preset({
            name: "GEN-19 sweep",
            zones: noiseZone(b, {
                [G.initialFilterFc]: 6000,
                [G.modEnvToFilterFc]: 6000,
                [G.delayModEnv]: -1200,
                [G.attackModEnv]: 0,
                [G.maxFilterFc]: 9000
            })
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 2.8, spacing: 3 }),
    verify: (r) => {
        // The same stretch of both notes, so the noise is the same
        const end = lowpassCutoffHz(r.at(3 + 2.2, 3 + 2.75), r.at(2.2, 2.75));
        r.near(
            "cutoff at the end in cents from 1480 Hz",
            cents(end, absoluteCentsToHz(9000)),
            0,
            50
        );
        const start = lowpassCutoffHz(
            r.at(3 + 0.05, 3 + 0.45),
            r.at(0.05, 0.45)
        );
        r.near(
            "cutoff during the delay in cents from 260 Hz",
            cents(start, absoluteCentsToHz(6000)),
            0,
            50
        );
    }
});

export const GEN_20 = defineTest({
    id: "GEN-20",
    title: "maxFilterFc takes a preset offset and has a minimum",
    section: "7.1.1 #62",
    description:
        "The `noise` with an instrument `maxFilterFc` of 13500 and a preset offset of -4500, next to a plain lowpass at 9000. Then a stored `maxFilterFc` of 500 next to a plain lowpass at 1500.",
    pass: "Each pair sounds the same: a ceiling at 9000 (1.5 kHz), then a ceiling at 1500 (20 Hz), the minimum, which leaves almost nothing of the noise.",
    length: 4,
    bank: (b) => [
        b.preset({
            name: "GEN-20 preset offset",
            zones: noiseZone(b, {
                [G.initialFilterFc]: 13_500,
                [G.maxFilterFc]: 13_500
            }),
            presetGenerators: { [G.maxFilterFc]: -4500 }
        }),
        b.preset({
            name: "GEN-20 at 9000",
            zones: noiseZone(b, { [G.initialFilterFc]: 9000 })
        }),
        b.preset({
            name: "GEN-20 stored 500",
            zones: [
                {
                    sample: b.sample("noise"),
                    generators: { [G.initialFilterFc]: 13_500 },
                    rawGenerators: { [G.maxFilterFc]: 500 }
                }
            ]
        }),
        b.preset({
            name: "GEN-20 at 1500",
            zones: noiseZone(b, { [G.initialFilterFc]: 1500 })
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "offset ceiling against 9000, largest difference in dB",
            envelopeDifference(r, 0, 1, 0.75, 0.05),
            0,
            0.3
        );
        r.near(
            "stored 500 against 1500, level difference in dB",
            sustainDb(r, 2) - sustainDb(r, 3),
            0,
            0.3
        );
    }
});

export const GEN_21 = defineTest({
    id: "GEN-21",
    title: "No ceiling at 13500 for every type",
    section: "7.1.1 #62",
    description:
        "Through a bandpass with `initialFilterQ` 100: `initialFilterFc` 13000 with a held `modEnvToFilterFc` of -3000, next to `initialFilterFc` 10000 alone, both with `maxFilterFc` 13500. Then the first again with `maxFilterFc` 9000, next to `initialFilterFc` 9000 alone. Last, `initialFilterFc` 13500 with a held excursion of +300 (23.7 kHz) with `maxFilterFc` 13500, next to the same with `maxFilterFc` 13499.",
    pass: "The first pair sounds the same, a baseline with both cutoffs below every ceiling. The second pair sounds the same too: the ceiling of 9000 caps the final cutoff of 10000. In the last pair the first note has more of the highest frequencies (should): 13500 lets the cutoff go past 13500, as far as the synthesizer can compute, where 13499 is a ceiling.",
    length: 6,
    bank: (b) => {
        const bandpass = { [G.filterType]: 2, [G.initialFilterQ]: 100 };
        return [
            b.preset({
                name: "GEN-21 13000 minus 3000",
                zones: noiseZone(b, {
                    ...bandpass,
                    [G.initialFilterFc]: 13_000,
                    [G.modEnvToFilterFc]: -3000,
                    [G.maxFilterFc]: 13_500
                })
            }),
            b.preset({
                name: "GEN-21 at 10000",
                zones: noiseZone(b, {
                    ...bandpass,
                    [G.initialFilterFc]: 10_000,
                    [G.maxFilterFc]: 13_500
                })
            }),
            b.preset({
                name: "GEN-21 capped",
                zones: noiseZone(b, {
                    ...bandpass,
                    [G.initialFilterFc]: 13_000,
                    [G.modEnvToFilterFc]: -3000,
                    [G.maxFilterFc]: 9000
                })
            }),
            b.preset({
                name: "GEN-21 at 9000",
                zones: noiseZone(b, { ...bandpass, [G.initialFilterFc]: 9000 })
            }),
            ...[13_500, 13_499].map((max) =>
                b.preset({
                    name: `GEN-21 past 13500 with ${max}`,
                    zones: noiseZone(b, {
                        ...bandpass,
                        [G.initialFilterFc]: 13_500,
                        [G.modEnvToFilterFc]: 300,
                        [G.maxFilterFc]: max
                    })
                })
            )
        ];
    },
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.near(
            "13500 pair, largest difference in dB",
            envelopeDifference(r, 0, 1, 0.75, 0.05),
            0,
            0.3
        );
        r.near(
            "capped pair, largest difference in dB",
            envelopeDifference(r, 2, 3, 0.75, 0.05),
            0,
            0.3
        );
        const highs = (t: number) =>
            bandEnergyDb(r.at(t + 0.15, t + 0.75), 21_000, 23_900);
        r.check(
            "past 13500: more energy from 21 kHz up than with a ceiling of 13499",
            highs(4) - highs(5) > 1,
            `${(highs(4) - highs(5)).toFixed(1)} dB more`
        );
    }
});

/**
 * GEN-22's lowpass gain on its cutoff for a filterQOffset, with no initialFilterQ part.
 */
function onCutoff(offset: number) {
    return filterGainDb("lowpass", 440, 6900, offset, 0);
}

export const GEN_22 = defineTest({
    id: "GEN-22",
    title: "filterQOffset",
    section: "7.1.1 #63",
    description:
        "The `sine` at key 69 (440 Hz) on the cutoff (6900) of a lowpass with `initialFilterQ` 0 and `filterQOffset` -100, 0 and 100. Then the `sine` at key 33 (55 Hz), far below a lowpass cutoff of 13500, with `filterQOffset` 0 and 200.",
    pass: "On the cutoff the first note is 10 dB quieter than the second and the third 10 dB louder, since the lowpass passes Q at its cutoff. Far below the cutoff the last two notes have the same level: `filterQOffset` moves the resonance and does not lower the gain.",
    length: 5,
    bank: (b) => [
        ...[-100, 0, 100].map((offset) =>
            b.tone(`GEN-22 cutoff offset ${offset}`, {
                [G.initialFilterFc]: 6900,
                [G.filterQOffset]: offset
            })
        ),
        ...[0, 200].map((offset) =>
            b.tone(`GEN-22 below offset ${offset}`, {
                [G.initialFilterFc]: 13_500,
                [G.filterQOffset]: offset
            })
        )
    ],
    midi: (m, presets) => {
        m.steps(presets.slice(0, 3), { key: 69 });
        m.steps(presets.slice(3), { start: 3, key: 33 });
    },
    verify: (r) => {
        r.db(
            "on the cutoff, offset -100 in dB",
            sustainDb(r, 0) - sustainDb(r, 1),
            onCutoff(-100) - onCutoff(0)
        );
        r.db(
            "on the cutoff, offset 100 in dB",
            sustainDb(r, 2) - sustainDb(r, 1),
            onCutoff(100) - onCutoff(0)
        );
        r.db(
            "far below the cutoff, offset 200 against 0 in dB",
            sustainDb(r, 4) - sustainDb(r, 3),
            0
        );
    }
});

export const GEN_23 = defineTest({
    id: "GEN-23",
    title: "Each part of the resonance is clamped by itself",
    section: "7.1.1 #63",
    description:
        "The `sine` at key 33 (55 Hz) under a lowpass at 13500 without resonance, then three pairs under the same lowpass. `initialFilterQ` 0 with a constant modulator of -500 to it and `filterQOffset` 100, next to `filterQOffset` 100 alone. `initialFilterQ` 2000 (stored beyond its range) next to 960. `initialFilterQ` 960 with `filterQOffset` -2000 (stored beyond its range), next to `initialFilterQ` 960 with `filterQOffset` -960.",
    pass: "Each pair has the same level: -500 is clamped to 0 before the offset is added, and each part stops at its limit on its own. The pairs are 0, 48 and 48 dB below the first note, half of the `initialFilterQ` part. A synthesizer that does not clamp the offset of -2000 plays the sixth note tens of dB quieter still.",
    length: 7,
    bank: (b) => {
        const sine = b.sample("sine");
        const fc = { [G.initialFilterFc]: 13_500 };
        return [
            b.preset({
                name: "GEN-23 no resonance",
                zones: [{ sample: sine, generators: fc }]
            }),
            b.preset({
                name: "GEN-23 minus 500 plus offset",
                zones: [
                    {
                        sample: sine,
                        generators: { ...fc, [G.filterQOffset]: 100 },
                        modulators: [constant(G.initialFilterQ, -500)]
                    }
                ]
            }),
            b.preset({
                name: "GEN-23 offset 100",
                zones: [
                    {
                        sample: sine,
                        generators: { ...fc, [G.filterQOffset]: 100 }
                    }
                ]
            }),
            b.preset({
                name: "GEN-23 Q 2000",
                zones: [
                    {
                        sample: sine,
                        generators: fc,
                        rawGenerators: { [G.initialFilterQ]: 2000 }
                    }
                ]
            }),
            b.preset({
                name: "GEN-23 Q 960",
                zones: [
                    {
                        sample: sine,
                        generators: { ...fc, [G.initialFilterQ]: 960 }
                    }
                ]
            }),
            b.preset({
                name: "GEN-23 offset -2000",
                zones: [
                    {
                        sample: sine,
                        generators: { ...fc, [G.initialFilterQ]: 960 },
                        rawGenerators: { [G.filterQOffset]: -2000 }
                    }
                ]
            }),
            b.preset({
                name: "GEN-23 offset -960",
                zones: [
                    {
                        sample: sine,
                        generators: {
                            ...fc,
                            [G.initialFilterQ]: 960,
                            [G.filterQOffset]: -960
                        }
                    }
                ]
            })
        ];
    },
    midi: (m, presets) => m.steps(presets, { key: 33 }),
    verify: (r) => {
        // The q of each pair is its initialFilterQ part, the only one that lowers the level
        const pairs = [
            { label: "clamped -500 plus offset 100 against offset 100", q: 0 },
            { label: "initialFilterQ 2000 against 960", q: 960 },
            { label: "filterQOffset -2000 against -960", q: 960 }
        ];
        const plain = sustainDb(r, 0);
        for (const [i, pair] of pairs.entries()) {
            const a = sustainDb(r, 2 * i + 1);
            r.db(`${pair.label} in dB`, a - sustainDb(r, 2 * i + 2), 0);
            // Far below the cutoff a lowpass passes 10^(-q / 400), spec section 8.1.2
            r.near(
                `${pair.label}, the level against no resonance in dB`,
                a - plain,
                -pair.q / 20,
                0.3
            );
        }
    }
});

export const GEN_24 = defineTest({
    id: "GEN-24",
    title: "filterQOffset drives every type",
    section: "7.1.1 #63",
    description:
        "The reference tone. Then the `sine` on the cutoff (6900) of a bandpass with `initialFilterQ` 0 and `filterQOffset` 100.",
    pass: "The second note is 7 dB above the reference tone: the bandpass passes Q (2.24) at its cutoff, and `filterQOffset` does not lower the gain the way `initialFilterQ` 100 does in GEN-13.",
    length: 2,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-24 bandpass offset", {
            [G.filterType]: 2,
            [G.initialFilterFc]: 6900,
            [G.filterQOffset]: 100
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) =>
        r.db(
            "bandpass in dB",
            sustainDb(r, 1) - sustainDb(r, 0),
            filterGainDb("bandpass", 440, 6900, 100, 0)
        )
});

/**
 * Checks that the band of each note moves, so two notes that both ignore the LFOs can't pass as equal. The noise
 * alone moves a 1/16 s window by a dB or two, a sweep of an octave or more by far more.
 */
function checkSweeps(r: TestRender, notes: number[]) {
    for (const t of notes) {
        const env = envelopeDb(r.at(t + 0.1, t + 1.7), 1 / 16);
        const swing = Math.max(...env) - Math.min(...env);
        r.check(
            `the band of the note at ${t} s sweeps`,
            swing > 6,
            `${swing.toFixed(1)} dB`
        );
    }
}

export const GEN_25 = defineTest({
    id: "GEN-25",
    title: "vibLfoToFilterFc",
    section: "7.1.1 #64",
    description:
        "The `noise` through a bandpass at 9000 with `initialFilterQ` 100. First the Vibrato LFO at 1 Hz with `vibLfoToFilterFc` 2400, then the Modulation LFO at 1 Hz with `modLfoToFilterFc` 2400. Each note lasts 1.8 s, and they are 2 s apart.",
    pass: "Both notes sweep the band the same way, two octaves up and down once a second.",
    length: 4,
    bank: (b) => {
        const bandpass = {
            [G.filterType]: 2,
            [G.initialFilterFc]: 9000,
            [G.initialFilterQ]: 100
        };
        return [
            b.preset({
                name: "GEN-25 vibrato LFO",
                zones: noiseZone(b, {
                    ...bandpass,
                    [G.freqVibLFO]: HZ_1,
                    [G.vibLfoToFilterFc]: 2400
                })
            }),
            b.preset({
                name: "GEN-25 modulation LFO",
                zones: noiseZone(b, {
                    ...bandpass,
                    [G.freqModLFO]: HZ_1,
                    [G.modLfoToFilterFc]: 2400
                })
            })
        ];
    },
    midi: (m, presets) => m.steps(presets, { length: 1.8, spacing: 2 }),
    verify: (r) => {
        r.near(
            "largest envelope difference in dB",
            envelopeDifference(r, 0, 2, 1.75, 0.05),
            0,
            0.5
        );
        checkSweeps(r, [0, 2]);
    }
});

export const GEN_26 = defineTest({
    id: "GEN-26",
    title: "The cutoff excursions of both LFOs add",
    section: "8.1.7",
    description:
        "The `noise` through a bandpass at 9000 with `initialFilterQ` 100, both LFOs at 1 Hz. `modLfoToFilterFc` 1200 with `vibLfoToFilterFc` -1200, next to no LFO. Then both at 1200, next to the Modulation LFO alone at 2400. Each note lasts 1.8 s, and they are 2 s apart.",
    pass: "The first pair sounds the same, a steady band: the two excursions cancel. The second pair sounds the same, a sweep of two octaves: they add.",
    length: 8,
    bank: (b) => {
        const base = {
            [G.filterType]: 2,
            [G.initialFilterFc]: 9000,
            [G.initialFilterQ]: 100,
            [G.freqModLFO]: HZ_1,
            [G.freqVibLFO]: HZ_1
        };
        return [
            b.preset({
                name: "GEN-26 cancel",
                zones: noiseZone(b, {
                    ...base,
                    [G.modLfoToFilterFc]: 1200,
                    [G.vibLfoToFilterFc]: -1200
                })
            }),
            b.preset({ name: "GEN-26 still", zones: noiseZone(b, base) }),
            b.preset({
                name: "GEN-26 add",
                zones: noiseZone(b, {
                    ...base,
                    [G.modLfoToFilterFc]: 1200,
                    [G.vibLfoToFilterFc]: 1200
                })
            }),
            b.preset({
                name: "GEN-26 single",
                zones: noiseZone(b, { ...base, [G.modLfoToFilterFc]: 2400 })
            })
        ];
    },
    midi: (m, presets) => m.steps(presets, { length: 1.8, spacing: 2 }),
    verify: (r) => {
        r.near(
            "cancelled against still, largest difference in dB",
            envelopeDifference(r, 0, 2, 1.75, 0.05),
            0,
            0.5
        );
        r.near(
            "summed against single, largest difference in dB",
            envelopeDifference(r, 4, 6, 1.75, 0.05),
            0,
            0.5
        );
        checkSweeps(r, [4, 6]);
    }
});

import { GeneratorTypes as G } from "spessasynth_core";
import { constant, mod, none, src } from "../../framework/bank_builder";
import { frequency } from "../../framework/measure";
import { defineTest } from "../../framework/types";
import { envelopeDifference, sustainDb } from "./common";

export const GEN_01 = defineTest({
    id: "GEN-01",
    title: "initialAttenuation in true centibels",
    section: "7.1",
    description:
        "Seven notes of the `sine` with `initialAttenuation` 0, 20, 40, 60, 80, 100 and 120.",
    pass: "Each note is 2 dB quieter than the one before, 12 dB from the first to the last. SoundFont 2's factor of 0.4 would give 0.8 dB steps.",
    length: 7,
    bank: (b) =>
        [0, 20, 40, 60, 80, 100, 120].map((value) =>
            b.tone(`GEN-01 attenuation ${value}`, {
                [G.initialAttenuation]: value
            })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r, presets) => {
        const levels = presets.map((_, i) => sustainDb(r, i));
        for (let i = 1; i < levels.length; i++)
            r.db(`step ${i} in dB`, levels[i] - levels[i - 1], -2);
        r.db("first to last in dB", levels[6] - levels[0], -12);
    }
});

export const GEN_02 = defineTest({
    id: "GEN-02",
    title: "Modulator amounts to initialAttenuation are centibels",
    section: "7.1",
    description:
        "The reference tone, then the `sine` with a constant modulator (No Controller to `initialAttenuation`) with the amount 480.",
    pass: "The second note is 48 dB quieter than the first: the amount of a modulator is in true centibels too.",
    length: 2,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-02 modulator 480", {}, [
            constant(G.initialAttenuation, 480)
        ])
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) =>
        r.db(
            "second note against the reference in dB",
            sustainDb(r, 1) - sustainDb(r, 0),
            -48
        )
});

export const GEN_03 = defineTest({
    id: "GEN-03",
    title: "The attenuation reaches 1440 and clamps there",
    section: "7.1, 7.1.1 #86",
    description:
        "The reference tone. Then `initialAttenuation` 1440 with `gain` 1440. Then the same with a constant modulator that adds 500 to `initialAttenuation`.",
    pass: "All three notes have the same level. 1440 cB of attenuation are allowed, and 1940 is clamped to 1440 before the gain is subtracted.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-03 1440 and gain", {
            [G.initialAttenuation]: 1440,
            [G.gain]: 1440
        }),
        b.tone(
            "GEN-03 1440 plus 500",
            {
                [G.initialAttenuation]: 1440,
                [G.gain]: 1440
            },
            [constant(G.initialAttenuation, 500)]
        )
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.db(
            "1440 with gain 1440 against the reference in dB",
            sustainDb(r, 1) - reference,
            0
        );
        r.db(
            "1940 with gain 1440 against the reference in dB",
            sustainDb(r, 2) - reference,
            0
        );
    }
});

export const GEN_04 = defineTest({
    id: "GEN-04",
    title: "gain",
    section: "7.1.1 #86",
    description:
        "Five notes of the `sine` with `gain` -120, -60, 0, 60 and 120.",
    pass: "Each note is 6 dB louder than the one before. The third note has no gain, and the last two play above the level of the sample.",
    length: 5,
    bank: (b) =>
        [-120, -60, 0, 60, 120].map((value) =>
            b.tone(`GEN-04 gain ${value}`, { [G.gain]: value })
        ),
    midi: (m, presets) => m.steps(presets),
    verify: (r, presets) => {
        for (let i = 1; i < presets.length; i++)
            r.db(`step ${i} in dB`, sustainDb(r, i) - sustainDb(r, i - 1), 6);
    }
});

export const GEN_05 = defineTest({
    id: "GEN-05",
    title: "gain cancels initialAttenuation and sums across levels",
    section: "7.1.1 #86",
    description:
        "The reference tone. Then `gain` 100 with `initialAttenuation` 100. Then an instrument `gain` of 60 with a preset `gain` of 60.",
    pass: "The second note has the level of the reference tone. The third is 12 dB above it.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-05 gain and attenuation", {
            [G.gain]: 100,
            [G.initialAttenuation]: 100
        }),
        b.preset({
            name: "GEN-05 gain on both levels",
            zones: [{ sample: b.sample("sine"), generators: { [G.gain]: 60 } }],
            presetGenerators: { [G.gain]: 60 }
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.db(
            "gain 100 with attenuation 100 in dB",
            sustainDb(r, 1) - reference,
            0
        );
        r.db("gain 60 plus 60 in dB", sustainDb(r, 2) - reference, 12);
    }
});

export const GEN_06 = defineTest({
    id: "GEN-06",
    title: "Generator sums saturate",
    section: "7.1",
    description:
        "The reference tone. Then an instrument `gain` of 20000 plus a preset `gain` of 20000, with `initialAttenuation` 1440. Both gains are stored beyond their range.",
    pass: "Both notes have the same level: the sum saturates at 32767 and the gain is clamped to 1440. A sum that wraps to a negative number is silent.",
    length: 2,
    bank: (b) => [
        b.reference(),
        b.preset({
            name: "GEN-06 saturating gain",
            zones: [
                {
                    sample: b.sample("sine"),
                    generators: { [G.initialAttenuation]: 1440 },
                    rawGenerators: { [G.gain]: 20_000 }
                }
            ],
            presetGenerators: { [G.gain]: 20_000 }
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) =>
        r.db(
            "saturated sum against the reference in dB",
            sustainDb(r, 1) - sustainDb(r, 0),
            0
        )
});

export const GEN_07 = defineTest({
    id: "GEN-07",
    title: "The limits apply once, after the modulators",
    section: "7.1",
    description:
        "The reference tone. Then a stored `gain` of 3000, beyond its range, with a constant modulator of -3000 to `gain`.",
    pass: "Both notes have the same level: 3000 plus -3000 is 0. Clamping the stored value to 1440 before the modulator would give -1560, clamped to -1440, which is silent.",
    length: 2,
    bank: (b) => [
        b.reference(),
        b.preset({
            name: "GEN-07 limits once",
            zones: [
                {
                    sample: b.sample("sine"),
                    rawGenerators: { [G.gain]: 3000 },
                    modulators: [constant(G.gain, -3000)]
                }
            ]
        })
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) =>
        r.db(
            "against the reference in dB",
            sustainDb(r, 1) - sustainDb(r, 0),
            0
        )
});

export const GEN_08 = defineTest({
    id: "GEN-08",
    title: "Preset offsets of SFe generators",
    section: "7.1",
    description:
        "Two pairs. The `sine` on a lowpass cutoff of 440 Hz (6900) with an instrument `filterQOffset` of 50 plus a preset offset of 50, then with an instrument `filterQOffset` of 100. Then `modLfoToAmplitude` 250 plus a preset offset of 250, then 500 alone.",
    pass: "The two notes of each pair sound the same: preset values add to the instrument values for SFe generators too.",
    length: 4,
    bank: (b) => {
        const sine = b.sample("sine");
        const filter = { [G.initialFilterFc]: 6900 };
        return [
            b.preset({
                name: "GEN-08 Q offset 50 plus 50",
                zones: [
                    {
                        sample: sine,
                        generators: { ...filter, [G.filterQOffset]: 50 }
                    }
                ],
                presetGenerators: { [G.filterQOffset]: 50 }
            }),
            b.preset({
                name: "GEN-08 Q offset 100",
                zones: [
                    {
                        sample: sine,
                        generators: { ...filter, [G.filterQOffset]: 100 }
                    }
                ]
            }),
            b.preset({
                name: "GEN-08 amplitude 250 plus 250",
                zones: [
                    { sample: sine, generators: { [G.modLfoToAmplitude]: 250 } }
                ],
                presetGenerators: { [G.modLfoToAmplitude]: 250 }
            }),
            b.preset({
                name: "GEN-08 amplitude 500",
                zones: [
                    { sample: sine, generators: { [G.modLfoToAmplitude]: 500 } }
                ]
            })
        ];
    },
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.db("filterQOffset pair in dB", sustainDb(r, 0) - sustainDb(r, 1), 0);
        r.db(
            "modLfoToAmplitude pair, largest envelope difference in dB",
            envelopeDifference(r, 2, 3, 0.75),
            0
        );
    }
});

/**
 * The SFe generators at the defaults of the specification's table (section 7.1.2).
 */
const SFE_DEFAULTS = {
    [G.filterType]: 0,
    [G.maxFilterFc]: 13_500,
    [G.filterQOffset]: 0,
    [G.vibLfoToFilterFc]: 0,
    [G.vibLfoToVolume]: 0,
    [G.modLfoToAmplitude]: 0,
    [G.vibLfoToAmplitude]: 0,
    [G.fadeModLFO]: -32_768,
    [G.fadeVibLFO]: -32_768,
    [G.modLfoWaveform]: 0,
    [G.vibLfoWaveform]: 0,
    [G.modLfoStartPhase]: 0,
    [G.vibLfoStartPhase]: 0,
    [G.modEnv2ToPitch]: 0,
    [G.modEnv2ToFilterFc]: 0,
    [G.delayModEnv2]: -32_768,
    [G.attackModEnv2]: -32_768,
    [G.holdModEnv2]: -32_768,
    [G.decayModEnv2]: -12_000,
    [G.sustainModEnv2]: 0,
    [G.releaseModEnv2]: -12_000,
    [G.keyNumToModEnv2Hold]: 0,
    [G.keyNumToModEnv2Decay]: 0,
    [G.decay2VolEnv]: -12_000,
    [G.sustain2VolEnv]: 0,
    [G.gain]: 0,
    [G.delayVoice]: -32_768,
    [G.ignoreNoteOff]: 0,
    [G.variationEffectsSend]: 0
};

export const GEN_09 = defineTest({
    id: "GEN-09",
    title: "Every SFe generator at its default",
    section: "8.1",
    description:
        "A `sine` zone with a lowpass at 2 kHz, a vibrato of the Modulation LFO and a decaying Volume Envelope. Then the same zone with all 29 SFe generators written at their defaults.",
    pass: "The two notes sound the same: an SFe generator at its default leaves the SoundFont 2 voice alone.",
    length: 2,
    bank: (b) => {
        const base = {
            [G.initialFilterFc]: 9500,
            [G.modLfoToPitch]: 50,
            [G.decayVolEnv]: 0,
            [G.sustainVolEnv]: 200
        };
        const sine = b.sample("sine");
        return [
            b.preset({
                name: "GEN-09 without",
                zones: [{ sample: sine, generators: base }]
            }),
            b.preset({
                name: "GEN-09 with defaults",
                zones: [
                    { sample: sine, generators: { ...base, ...SFE_DEFAULTS } }
                ]
            })
        ];
    },
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        r.db(
            "largest envelope difference in dB",
            envelopeDifference(r, 0, 1, 0.75),
            0
        );
        r.near(
            "pitch difference in Hz",
            frequency(r.at(0.1, 0.7)) - frequency(r.at(1.1, 1.7)),
            0,
            0.5
        );
    }
});

/**
 * The No Controller source as a bipolar source, which outputs 1 as the unipolar one does.
 */
function bipolarNone() {
    return src(0, { bipolar: true });
}

export const GEN_88 = defineTest({
    id: "GEN-88",
    title: "Modulators add up before one saturation",
    section: "7.1",
    description:
        "The reference tone. Then the `sine` with four constant modulators to `gain`, in this order: +32767, +32767, -32767 and -32767. They differ in their sources (the No Controller source, unipolar or bipolar, as the source and the amount source), so no two are identical, and each outputs exactly its amount.",
    pass: "The second note has the level of the reference tone: the four outputs add up to 0 before the sum is limited once. A synthesizer that limits after each modulator reaches 32767, then 0, then -32767, and plays the note 144 dB down, which is silence.",
    length: 2,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-88 four modulators", {}, [
            mod(none(), none(), G.gain, 32_767),
            mod(bipolarNone(), none(), G.gain, 32_767),
            mod(none(), bipolarNone(), G.gain, -32_767),
            mod(bipolarNone(), bipolarNone(), G.gain, -32_767)
        ])
    ],
    midi: (m, presets) => m.steps(presets),
    verify: (r) =>
        r.db(
            "against the reference in dB",
            sustainDb(r, 1) - sustainDb(r, 0),
            0
        )
});

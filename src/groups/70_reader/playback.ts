import { GeneratorTypes as G } from "spessasynth_core";
import { centsFrom440, envelopeDb, frequency } from "../../framework/measure";
import { hzToAbsoluteCents } from "../../framework/spec_math";
import { defineTest, type Group, type TestRender } from "../../framework/types";
import { readerGroup } from "./common";

const CON_16 = defineTest({
    id: "CON-16",
    title: "A compressed sample next to a PCM one",
    section: "6.2",
    description:
        "The `vorbis` sample (the `tail` sample compressed as Ogg Vorbis: the looped 440 Hz with 880 Hz after the loop end, its loop given in decoded points) and the PCM `sine` in one file, each for 1.8 s.",
    pass: "Both play 440 Hz for the whole note at the same level, also around the first wrap of the loop at 1.05 s: the loop points of the compressed sample are decoded points from its start. A loop read in bytes, or from `dwStart`, reaches the 880 Hz.",
    length: 4,
    bank: (b) => [
        b.preset({ name: "vorbis", zones: [{ sample: b.sample("vorbis") }] }),
        b.reference()
    ],
    midi: (m, presets) => m.steps(presets, { length: 1.8, spacing: 2 }),
    verify: (r: TestRender) => {
        for (const [i, name] of ["vorbis", "PCM"].entries())
            // 0.98 s spans the first wrap of the loop, at 1.05 s
            for (const t of [0.2, 0.98, 1.6])
                r.cents(
                    `${name} at ${t} s, in cents`,
                    centsFrom440(frequency(r.at(i * 2 + t, i * 2 + t + 0.15))),
                    0
                );
        const vorbis = envelopeDb(r.at(0.2, 1.7), 0.05);
        const pcm = envelopeDb(r.at(2.2, 3.7), 0.05);
        let worst = 0;
        for (let i = 0; i < Math.min(vorbis.length, pcm.length); i++)
            worst = Math.max(worst, Math.abs(vorbis[i] - pcm[i]));
        r.near("the levels, largest difference in dB", worst, 0, 0.5);
    }
});

/**
 * The CON-17 pairs: a stored value outside the enumeration, and the default it must play as.
 */
const ENUM_PAIRS: {
    label: string;
    generator:
        | typeof G.filterType
        | typeof G.modLfoWaveform
        | typeof G.ignoreNoteOff
        | typeof G.sampleModes;
    stored: number;
    base: Record<number, number>;
    /**
     * The note length. The `sampleModes` pair plays longer than its sample, so a loop would show.
     */
    length: number;
}[] = [
    {
        label: "filterType 9",
        length: 0.6,
        generator: G.filterType,
        stored: 9,
        base: { [G.initialFilterFc]: 5700, [G.initialFilterQ]: 200 }
    },
    {
        label: "modLfoWaveform 7",
        length: 0.6,
        generator: G.modLfoWaveform,
        stored: 7,
        base: {
            [G.freqModLFO]: hzToAbsoluteCents(2),
            [G.modLfoToAmplitude]: 500
        }
    },
    {
        label: "ignoreNoteOff 5",
        length: 0.6,
        generator: G.ignoreNoteOff,
        stored: 5,
        base: { [G.decayVolEnv]: 1200, [G.sustainVolEnv]: 1000 }
    },
    {
        label: "sampleModes 0x8001",
        length: 1.5,
        generator: G.sampleModes,
        // 0x8001 as the signed WORD it is stored in
        stored: 0x80_01 - 0x1_00_00,
        base: {}
    }
];

const CON_17 = defineTest({
    id: "CON-17",
    title: "Stored enumerations outside their values",
    section: "7.1",
    description:
        "Pairs of notes, each a stored value outside an enumeration next to the default: `filterType` 9 next to 0 (the `sine` an octave above a cutoff of 220 Hz with `initialFilterQ` 200, where each of the five types gives another level), `modLfoWaveform` 7 next to 0 (a tremolo at 2 Hz), `ignoreNoteOff` 5 next to 0 (a note that would decay over 2 s), and `sampleModes` 0x8001 next to 0 (the `sine` of 1.1 s played once, in notes of 1.5 s). The other notes last 0.6 s.",
    pass: "The two notes of each pair are the same: a stored value outside the defined values is the default. So the first pair is the lowpass, the second a triangle, the third ends at its note off and the fourth plays its sample once and is silent after 1.1 s.",
    length: ENUM_PAIRS.length * 4,
    bank: (b) =>
        ENUM_PAIRS.map((pair) =>
            [pair.stored, 0].map((value) =>
                b.preset({
                    name: `CON-17 ${pair.label} ${value}`,
                    zones: [
                        {
                            sample: b.sample("sine"),
                            generators: pair.base,
                            rawGenerators: { [pair.generator]: value }
                        }
                    ]
                })
            )
        ),
    midi: (m, pairs) =>
        pairs.map((pair, i) =>
            m.steps(pair, {
                start: i * 4,
                spacing: 2,
                length: ENUM_PAIRS[i].length
            })
        ),
    verify: (r, _pairs, times) => {
        for (const [i, pair] of ENUM_PAIRS.entries()) {
            const [a, b] = times[i].map((t) =>
                envelopeDb(r.at(t, t + 1.95), 2 / 440)
            );
            let worst = 0;
            for (let k = 0; k < Math.min(a.length, b.length); k++)
                if (a[k] > -80 || b[k] > -80)
                    worst = Math.max(worst, Math.abs(a[k] - b[k]));
            r.near(
                `${pair.label}: the pair, largest difference in dB`,
                worst,
                0,
                0.5
            );
        }
    }
});

/**
 * A compressed sample, and stored enumerations out of range.
 */
export const PLAYBACK_GROUPS: Group[] = [
    readerGroup({
        number: 89,
        slug: "vorbis",
        title: "A compressed sample",
        sections: "6.2",
        intro: "A bank with an Ogg Vorbis sample and a PCM one.",
        test: CON_16
    }),
    readerGroup({
        number: 90,
        slug: "enums",
        title: "Stored enumerations out of range",
        sections: "7.1",
        intro: "A bank with stored values of the enumerations outside their values.",
        test: CON_17
    })
];

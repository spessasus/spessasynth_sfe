import { GeneratorTypes as G } from "spessasynth_core";
import {
    type BankBuilder,
    cc,
    DECAY_AT_ONCE,
    mod,
    none
} from "../../framework/bank_builder";
import { centsFrom440, frequency, levelDb } from "../../framework/measure";
import { lfoValue } from "../../framework/spec_math";
import { defineTest, type TestRender } from "../../framework/types";
import {
    checkDecayGoesOn,
    checkModel,
    DEFAULT_DELAY,
    factor,
    HZ_1_5,
    levelAround,
    sustainDb,
    voiceStart
} from "./common";

/**
 * The start of every sound after a time: the first point above -60 dBFS after each stretch of silence.
 */
function onsets(r: TestRender, from: number, to: number) {
    const x = r.at(from, to);
    const out = new Array<number>();
    let silent = 0;
    // A stretch of 50 ms below the threshold separates two sounds
    const gap = 0.05 * r.sampleRate;
    for (let i = 0; i < x.length; i++) {
        if (Math.abs(x[i]) > 0.001) {
            if (silent >= gap || out.length === 0)
                out.push(from + i / r.sampleRate);
            silent = 0;
        } else silent++;
    }
    return out;
}

const SECOND = 0;
const QUARTER = -2400;
const HALF = -1200;

export const GEN_51 = defineTest({
    id: "GEN-51",
    title: "delayVoice",
    section: "7.1.1 #87",
    description:
        "One note on starts four zones of the `click`, with `delayVoice` 0 (-32768), 0.25 s, 0.5 s and 1 s.",
    pass: "Four clicks, at the note on and 0.25, 0.5 and 1 s after it, each as close to its time as the synthesizer can (should).",
    length: 1.5,
    bank: (b) => [
        b.preset({
            name: "GEN-51 delayed clicks",
            zones: [-32_768, QUARTER, HALF, SECOND].map((delay) => ({
                sample: b.sample("click"),
                generators: { [G.sampleModes]: 0, [G.delayVoice]: delay }
            }))
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 1.2 }),
    verify: (r) => {
        const found = onsets(r, 0, 1.4);
        r.check(
            "four clicks",
            found.length === 4,
            found.map((t) => t.toFixed(4)).join(", ")
        );
        for (const [i, delay] of [0.25, 0.5, 1].entries())
            r.near(
                `click ${i + 2} after the first in s`,
                (found[i + 1] ?? Number.NaN) - found[0],
                delay,
                // A synthesizer starts a voice as close to its time as it can, often on a block grid
                0.01
            );
    }
});

export const GEN_52 = defineTest({
    id: "GEN-52",
    title: "The envelopes and LFOs start with the delayed voice",
    section: "7.1.1 #87",
    description:
        "The reference tone. Then the `sine` with `delayVoice` 1 s, a Volume Envelope attack of 0.5 s, and `modLfoToAmplitude` 500 with the Modulation LFO at 1.5 Hz. The note is held for 2 s.",
    pass: "The second note is silent for 1 s, then fades in over 0.5 s. 0.6 s after the voice starts the tremolo is at 0.8 times the reference tone (on its way down). An LFO that had run since the note on would be at 1.2 times there.",
    length: 3.1,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-52 delayed voice", {
            [G.delayVoice]: SECOND,
            [G.attackVolEnv]: HALF,
            [G.freqModLFO]: HZ_1_5,
            [G.modLfoToAmplitude]: 500
        })
    ],
    midi: (m, [reference, delayed]) => {
        m.steps([reference]);
        m.steps([delayed], { start: 1, length: 2 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        r.check(
            "silent before the voice starts",
            levelDb(r.at(1.05, 1.95)) < -90
        );
        // The attack starts from silence, so the voice is timed from its nominal start
        const start = 2;
        r.check(
            "sounding 20 ms after the delay",
            levelDb(r.at(2.01, 2.03)) > -90
        );
        // The default LFO delay is 1 ms. At 1.5 Hz, 0.6 s is p = 0.9, where the triangle is at -0.4.
        checkModel(
            r,
            "tremolo",
            2,
            reference,
            [0.6],
            (t) => factor(500, lfoValue(0, (t - DEFAULT_DELAY) * 1.5)),
            0.03,
            start
        );
        r.check(
            "the attack rises",
            levelAround(r, start + 0.05, reference) < -6,
            `${levelAround(r, start + 0.05, reference).toFixed(1)} dB at 50 ms`
        );
    }
});

export const GEN_53 = defineTest({
    id: "GEN-53",
    title: "A note off before the delayed voice starts",
    section: "7.1.1 #87, 8.1",
    description:
        "The reference tone. Then the `cosine` with `delayVoice` 1 s, zero-time `delayVolEnv` and `attackVolEnv` (-32768), a release of 0.5 s, and a note off after 0.2 s.",
    pass: "The second note is silent for 1 s, then starts at full level and releases, falling 96 dB in 0.5 s: the note off counts as if it came when the voice started. A synthesizer may hold the voice for a minimum time against clicks first (spec section 8.1). The release is measured from 0.1 s after the voice start, so a minimum time up to 0.1 s passes and a longer one fails here.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.preset({
            name: "GEN-53 early note off",
            zones: [
                {
                    sample: b.sample("cosine"),
                    generators: {
                        [G.delayVoice]: SECOND,
                        [G.delayVolEnv]: -32_768,
                        [G.attackVolEnv]: -32_768,
                        [G.releaseVolEnv]: HALF
                    }
                }
            ]
        })
    ],
    midi: (m, [reference, delayed]) => {
        m.steps([reference]);
        m.steps([delayed], { start: 1, length: 0.2 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        const start = voiceStart(r, 1.9, 0.2);
        // A synthesizer starts a voice on its own grid, so a few milliseconds late is fine
        r.near("the voice starts after the note on in s", start - 1, 1, 0.01);
        // The release may start after a short minimum time, here up to 0.1 s, so its slope is measured after that
        r.near(
            "the release from 0.1 s to 0.2 s, in dB",
            levelAround(r, start + 0.2, reference) -
                levelAround(r, start + 0.1, reference),
            -19.2,
            1
        );
        const late = levelAround(r, start + 0.2, reference);
        r.check(
            "the release started within 0.1 s of the voice start",
            late < -19.2 + 1,
            `${late.toFixed(1)} dB 0.2 s in`
        );
    }
});

/**
 * The preset of GEN-54 and GEN-84: key 69 at once and key 81 an octave up after 1 s, both in class 5.
 */
function delayedClass(b: BankBuilder, name: string) {
    return b.preset({
        name,
        zones: [
            {
                sample: b.sample("sine"),
                keys: [69, 69],
                generators: { [G.exclusiveClass]: 5 }
            },
            {
                sample: b.sample("sine"),
                keys: [81, 81],
                generators: { [G.exclusiveClass]: 5, [G.delayVoice]: SECOND }
            }
        ]
    });
}

export const GEN_54 = defineTest({
    id: "GEN-54",
    title: "A delayed voice joins its exclusive class at the note on",
    section: "7.1.1 #87, 7.1",
    description:
        "One preset with two zones in `exclusiveClass` 5: key 69 plays the `sine` at once, key 81 plays it an octave up with `delayVoice` 1 s. Key 69 is struck, and key 81 0.5 s later.",
    pass: "The 440 Hz note ends at 0.5 s, when key 81 is struck, not at 1.5 s when its voice starts. The 880 Hz note then plays from 1.5 s.",
    length: 3.1,
    bank: (b) => [delayedClass(b, "GEN-54 delayed class")],
    midi: (m, [preset]) => {
        m.program(0, 0, preset);
        m.note(0, 2.5, { key: 69 });
        m.note(0.5, 2.5, { key: 81 });
    },
    verify: (r) => {
        r.check(
            // The ended voice may take a short release (spec section 7.1), so the window starts 0.4 s after it
            "silent from 0.9 s to 1.4 s",
            levelDb(r.at(0.9, 1.4)) < -60,
            `${levelDb(r.at(0.9, 1.4)).toFixed(1)} dB`
        );
        r.cents(
            "the delayed voice from 1.6 s, in cents from 440 Hz",
            centsFrom440(frequency(r.at(1.6, 2.5))),
            1200
        );
    }
});

export const GEN_84 = defineTest({
    id: "GEN-84",
    title: "A delayed voice ended before it starts",
    section: "7.1.1 #87, 7.1",
    description:
        "The preset of GEN-54. Key 81 is struck first, with its voice delayed by 1 s, and key 69 0.5 s later.",
    pass: "The 880 Hz voice never sounds: key 69 ends it before it starts. Only the 440 Hz note plays.",
    length: 3.1,
    bank: (b) => [delayedClass(b, "GEN-84 delayed class")],
    midi: (m, [preset]) => {
        m.program(0, 0, preset);
        m.note(0, 2.5, { key: 81 });
        m.note(0.5, 1.5, { key: 69 });
    },
    verify: (r) => {
        r.cents(
            "from 1 s, in cents from 440 Hz",
            centsFrom440(frequency(r.at(1, 1.9))),
            0
        );
        r.db(
            "the level of one voice in dB",
            levelDb(r.at(1, 1.9)) - levelDb(r.at(0.6, 0.9)),
            0
        );
    }
});

export const GEN_55 = defineTest({
    id: "GEN-55",
    title: "ignoreNoteOff",
    section: "7.1.1 #88",
    description:
        "The reference tone. Then a note of 0.1 s with `ignoreNoteOff` 1 and a Volume Envelope that decays to silence over 2 s (48 dB per second) from the first sound (zero time for its delay, attack and hold). Then the same note without `ignoreNoteOff`.",
    pass: "The second note plays its whole decay: it falls by 48 dB per second from its first sound (9.6 dB from 0.3 s to 0.5 s in) and is gone after 2 s. The third stops after its note off.",
    length: 6,
    bank: (b) => {
        const decay = {
            ...DECAY_AT_ONCE,
            [G.decayVolEnv]: 1200,
            [G.sustainVolEnv]: 1000
        };
        return [
            b.reference(),
            b.tone("GEN-55 ignore note off", {
                ...decay,
                [G.ignoreNoteOff]: 1
            }),
            b.tone("GEN-55 plain", decay)
        ];
    },
    midi: (m, [reference, ignore, plain]) => {
        m.steps([reference]);
        m.steps([ignore], { start: 1, length: 0.1 });
        m.steps([plain], { start: 4, length: 0.1 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        checkDecayGoesOn(r, "ignoreNoteOff", voiceStart(r, 1), reference);
        r.check(
            "the plain note is gone 0.5 s in",
            levelDb(r.at(4.45, 4.55)) < -90
        );
    }
});

/**
 * A long note with `ignoreNoteOff` and a release of 0.2 s.
 */
const HELD = {
    [G.ignoreNoteOff]: 1,
    [G.exclusiveClass]: 9,
    [G.releaseVolEnv]: -2786
};

export const GEN_56 = defineTest({
    id: "GEN-56",
    title: "What ends a voice with ignoreNoteOff",
    section: "7.1.1 #88, 11.5",
    description:
        "Five notes of 0.2 s with `ignoreNoteOff` 1 and `exclusiveClass` 9, each ended 0.6 s after its note on by: CC 123, CC 123 while CC 64 is down, CC 120, a note of key 81 in the same class (a zone that is far too quiet to hear), and a GS Reset. The first two play key 70, whose zone has a release of 1 s, the others key 69 with a release of 0.2 s.",
    pass: "The first two release at once, also with the pedal down: between 0.1 and 0.3 s after CC 123 the level falls by 17 dB, the slope of the 1 s release. CC 120 cuts the third at once, silent 0.1 s later. The note of the same class ends the fourth, with a very short release (should). The GS Reset ends or releases the last one. Each note sounds until its ending message, after its note off.",
    length: 5,
    bank: (b) => [
        b.preset({
            name: "GEN-56 ended",
            zones: [
                { sample: b.sample("sine"), keys: [69, 69], generators: HELD },
                {
                    sample: b.sample("sine"),
                    keys: [70, 70],
                    generators: { ...HELD, [G.releaseVolEnv]: 0 }
                },
                {
                    sample: b.sample("sine"),
                    keys: [81, 81],
                    generators: {
                        ...HELD,
                        [G.initialAttenuation]: 1440,
                        [G.gain]: -1440
                    }
                }
            ]
        })
    ],
    midi: (m, [preset]) => {
        m.program(0, 0, preset);
        for (let i = 0; i < 5; i++) m.note(i, 0.2, { key: i < 2 ? 70 : 69 });
        m.cc(0.6, 0, 123, 0);
        m.cc(1, 0, 64, 127);
        m.cc(1.6, 0, 123, 0);
        m.cc(1.9, 0, 64, 0);
        m.cc(2.6, 0, 120, 0);
        m.note(3.6, 0.2, { key: 81 });
        m.gsReset(4.6);
    },
    verify: (r) => {
        const sustain = levelDb(r.at(0.3, 0.55));
        for (const [i, label] of [
            "CC 123",
            "CC 123 with the pedal"
        ].entries()) {
            r.check(
                `${label}: still sounding after the note off`,
                levelDb(r.at(i + 0.3, i + 0.55)) - sustain > -0.5
            );
            // From 0.1 s after CC 123, so a smoothed start of the release (spec section 8.1) does not matter
            r.near(
                `${label}: the release falls from 0.1 s to 0.28 s after, in dB`,
                levelDb(r.at(i + 0.88, i + 0.9)) -
                    levelDb(r.at(i + 0.7, i + 0.72)),
                -96 * 0.18,
                1.5
            );
        }
        r.check(
            "CC 120: still sounding after the note off",
            levelDb(r.at(2.3, 2.55)) - sustain > -0.5
        );
        // A synthesizer may smooth the cut against clicks (spec section 8.1)
        const cut = levelDb(r.at(2.7, 2.75)) - sustain;
        r.check("CC 120: cut within 0.1 s", cut < -60, `${cut.toFixed(1)} dB`);
        r.check(
            "the exclusive class: still sounding after the note off",
            levelDb(r.at(3.3, 3.55)) - sustain > -0.5
        );
        // The class ends the voice. A very short release is a "should", so only the end is checked.
        const ended = levelDb(r.at(3.9, 3.95)) - sustain;
        r.check(
            "the exclusive class: ended within 0.3 s",
            ended < -60,
            `${ended.toFixed(1)} dB`
        );
        const reset = levelDb(r.at(4.9, 4.95)) - sustain;
        r.check(
            "the GS Reset ends or releases it within 0.3 s",
            reset < -60,
            `${reset.toFixed(1)} dB`
        );
    }
});

export const GEN_57 = defineTest({
    id: "GEN-57",
    title: "ignoreNoteOff is read when the note off arrives",
    section: "7.1.1 #88",
    description:
        "The reference tone. Then the `sine` with a decay to silence over 2 s from the first sound (zero time for the delay, attack and hold) and a modulator from CC 16 to `ignoreNoteOff` with the amount 2. CC 16 is 0 at the note on and 127 0.1 s later, before the note off at 0.2 s. Then the same note with CC 16 at 0 throughout.",
    pass: "The second note plays its whole decay, 9.6 dB lower 0.5 s in than 0.3 s in: when the note off arrives, CC 16 has set `ignoreNoteOff` (2, clamped to its range of 0 to 1). The third note stops after its note off.",
    length: 6,
    bank: (b) => [
        b.reference(),
        b.tone(
            "GEN-57 from CC 16",
            {
                ...DECAY_AT_ONCE,
                [G.decayVolEnv]: 1200,
                [G.sustainVolEnv]: 1000
            },
            [mod(cc(16), none(), G.ignoreNoteOff, 2)]
        )
    ],
    midi: (m, [reference, preset]) => {
        m.steps([reference]);
        m.program(1, 0, preset);
        m.cc(1, 0, 16, 0);
        m.note(1, 0.2);
        m.cc(1.1, 0, 16, 127);
        m.cc(3.5, 0, 16, 0);
        m.note(4, 0.2);
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        checkDecayGoesOn(r, "CC 16 at 127", voiceStart(r, 1), reference);
        r.check(
            "the note with CC 16 at 0 is gone 0.5 s in",
            levelDb(r.at(4.45, 4.55)) < -90
        );
    }
});

export const GEN_86 = defineTest({
    id: "GEN-86",
    title: "The exclusive class is per channel",
    section: "7.1",
    description:
        "The `sine` in exclusive class 5 on channels 1 and 2. Key 69 on channel 1, then key 81 on channel 2 0.5 s later, both held.",
    pass: "Both notes keep sounding: an exclusive class ends voices on its own channel only. The two notes together are 3 dB louder than the first alone.",
    length: 2.1,
    channels: [0, 1],
    bank: (b) => [b.tone("GEN-86 class 5", { [G.exclusiveClass]: 5 })],
    midi: (m, [preset]) => {
        m.program(0, 0, preset);
        m.program(0, 1, preset);
        m.note(0, 2, { key: 69 });
        m.note(0.5, 1.5, { ch: 1, key: 81 });
    },
    verify: (r) =>
        // Two sines of other pitches add in power
        r.near(
            "both notes against the first alone, in dB",
            levelDb(r.at(0.8, 1.8)) - levelDb(r.at(0.15, 0.45)),
            10 * Math.log10(2),
            0.3
        )
});

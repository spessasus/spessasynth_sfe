import { GeneratorTypes as G } from "spessasynth_core";
import { cc, DECAY_AT_ONCE, mod, none } from "../../framework/bank_builder";
import { levelDb } from "../../framework/measure";
import { lfoValue } from "../../framework/spec_math";
import { defineTest, type TestRender } from "../../framework/types";
import {
    AMPLITUDE_WINDOW,
    checkModel,
    checkShape,
    DEFAULT_DELAY,
    envelopeDifference,
    factor,
    checkPitchModel,
    fitModel,
    levelAround,
    sustainDb,
    voiceStart,
    HZ_1,
    HZ_1_5,
    HZ_2,
    HZ_3
} from "./common";

/**
 * The swing of a level in dB over a stretch of a note: the loudest window minus the quietest.
 */
function swingDb(
    r: TestRender,
    from: number,
    to: number,
    window = AMPLITUDE_WINDOW
) {
    // Windows overlap in steps of 1 ms, so the tips are not missed between two windows
    const levels = new Array<number>();
    for (let t = from; t + window <= to; t += 0.001)
        levels.push(levelDb(r.at(t, t + window)));
    return Math.max(...levels) - Math.min(...levels);
}

export const GEN_27 = defineTest({
    id: "GEN-27",
    title: "vibLfoToVolume",
    section: "7.1.1 #65",
    description:
        "Notes of 1.8 s, 2 s apart. The `sine` with the Vibrato LFO at 2 Hz and `vibLfoToVolume` 60. Then with the Modulation LFO at 2 Hz and `modLfoToVolume` 60.",
    pass: "Both notes have the same tremolo, 6 dB up and down (12 dB from the quietest to the loudest point), twice a second.",
    length: 4,
    bank: (b) => [
        b.tone("GEN-27 vibrato LFO", {
            [G.freqVibLFO]: HZ_2,
            [G.vibLfoToVolume]: 60
        }),
        b.tone("GEN-27 modulation LFO", {
            [G.freqModLFO]: HZ_2,
            [G.modLfoToVolume]: 60
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 1.8, spacing: 2 }),
    verify: (r) => {
        r.near(
            "swing of the Vibrato LFO in dB",
            swingDb(r, 0.05, 1.05),
            12,
            // Each tip may be read one update step low, so 0.6 dB leaves room for a coarser update than core's
            0.6
        );
        r.near(
            "the two LFOs, largest difference in dB",
            envelopeDifference(r, 0, 2, 1.7, AMPLITUDE_WINDOW),
            0,
            0.5
        );
    }
});

export const GEN_28 = defineTest({
    id: "GEN-28",
    title: "modLfoToAmplitude",
    section: "7.1.1 #66",
    description:
        "The reference tone, then the `sine` with the Modulation LFO at 2 Hz and `modLfoToAmplitude` 500.",
    pass: "In a linear view the amplitude of the second note is a triangle between 0.5 and 1.5 times the reference tone, with straight sides, starting upward.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-28 amplitude 500", {
            [G.freqModLFO]: HZ_2,
            [G.modLfoToAmplitude]: 500
        })
    ],
    midi: (m, [reference, lfo]) => {
        m.steps([reference]);
        m.steps([lfo], { start: 1, length: 1.8 });
    },
    verify: (r) => checkShape(r, "triangle", 1, sustainDb(r, 0), 2, 500, 0)
});

export const GEN_29 = defineTest({
    id: "GEN-29",
    title: "Full and negative amplitude depths",
    section: "7.1.1 #66",
    description:
        "The reference tone, then the `sine` with the Modulation LFO at 2 Hz and `modLfoToAmplitude` 1000, then -500.",
    pass: "The second note swings from silence to twice the amplitude of the reference tone. The third swings between 0.5 and 1.5 times, but starts downward.",
    length: 5,
    bank: (b) => [
        b.reference(),
        ...[1000, -500].map((depth) =>
            b.tone(`GEN-29 amplitude ${depth}`, {
                [G.freqModLFO]: HZ_2,
                [G.modLfoToAmplitude]: depth
            })
        )
    ],
    midi: (m, [reference, full, negative]) => {
        m.steps([reference]);
        m.steps([full, negative], { start: 1, length: 1.8, spacing: 2 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        checkShape(r, "depth 1000", 1, reference, 2, 1000, 0);
        checkShape(r, "depth -500", 3, reference, 2, -500, 0);
        // The trough of the second cycle
        checkModel(
            r,
            "depth 1000 trough",
            1,
            reference,
            [DEFAULT_DELAY + 1.75 / 2],
            (t) => factor(1000, lfoValue(0, (t - DEFAULT_DELAY) * 2)),
            // Near silence a few points of the 16 bit grid weigh more
            0.05
        );
    }
});

export const GEN_30 = defineTest({
    id: "GEN-30",
    title: "One clamp after the sum of both amplitude depths",
    section: "7.1.1 #66, #67",
    description:
        "The reference tone. Then both LFOs at 2 Hz, with `modLfoToAmplitude` 1000 and `vibLfoToAmplitude` 1000. Then with 1000 and -1000.",
    pass: "The second note has flat tops at twice the amplitude of the reference tone and flat stretches of silence between them: the depths add to 2000 and one clamp limits the factor to 0 to 2. The third note has no tremolo at all: the two depths cancel before the clamp.",
    length: 5,
    bank: (b) => [
        b.reference(),
        ...[1000, -1000].map((vib) =>
            b.tone(`GEN-30 1000 and ${vib}`, {
                [G.freqModLFO]: HZ_2,
                [G.freqVibLFO]: HZ_2,
                [G.modLfoToAmplitude]: 1000,
                [G.vibLfoToAmplitude]: vib
            })
        )
    ],
    midi: (m, [reference, sum, cancel]) => {
        m.steps([reference]);
        m.steps([sum, cancel], { start: 1, length: 1.8, spacing: 2 });
    },
    verify: (r) => {
        // The sum is 1 + 2 * triangle, so the top is flat from p = 0.125 to 0.375 and the bottom from 0.625 to 0.875
        const times = [0.15, 0.25, 0.35, 0.65, 0.75, 0.85].map(
            (p) => DEFAULT_DELAY + (1 + p) / 2
        );
        checkModel(r, "summed depths", 1, sustainDb(r, 0), times, (t) =>
            factor(2000, lfoValue(0, (t - DEFAULT_DELAY) * 2))
        );
        r.near("cancelled depths, swing in dB", swingDb(r, 3.15, 4.7), 0, 0.3);
    }
});

export const GEN_31 = defineTest({
    id: "GEN-31",
    title: "vibLfoToAmplitude",
    section: "7.1.1 #67",
    description:
        "The reference tone, then the `sine` with the Vibrato LFO at 3 Hz and `vibLfoToAmplitude` 500.",
    pass: "As GEN-28 at 3 Hz: a triangle between 0.5 and 1.5 times the reference tone, starting upward.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-31 vibrato amplitude", {
            [G.freqVibLFO]: HZ_3,
            [G.vibLfoToAmplitude]: 500
        })
    ],
    midi: (m, [reference, lfo]) => {
        m.steps([reference]);
        m.steps([lfo], { start: 1, length: 1.8 });
    },
    verify: (r) =>
        checkShape(r, "triangle at 3 Hz", 1, sustainDb(r, 0), 3, 500, 0)
});

export const GEN_32 = defineTest({
    id: "GEN-32",
    title: "The amplitude factor multiplies the other level factors",
    section: "8.1.3",
    description:
        "Three notes with `initialAttenuation` 200 and a decay of 24 dB per second (`decayVolEnv` 2400) to a sustain of 24 dB. Without an LFO, with `modLfoToAmplitude` 1000 at 2 Hz, and with `modLfoToAmplitude` 1000 and `modLfoToVolume` 60 together.",
    pass: "Against the first note, the tops of the second are 6 dB higher at every moment, while it decays, and the tops of the third 12 dB higher: the factors multiply.",
    length: 3,
    bank: (b) => {
        const base = {
            [G.initialAttenuation]: 200,
            [G.decayVolEnv]: 2400,
            [G.sustainVolEnv]: 240,
            [G.freqModLFO]: HZ_2
        };
        return [
            b.tone("GEN-32 plain", base),
            b.tone("GEN-32 amplitude", {
                ...base,
                [G.modLfoToAmplitude]: 1000
            }),
            b.tone("GEN-32 amplitude and volume", {
                ...base,
                [G.modLfoToAmplitude]: 1000,
                [G.modLfoToVolume]: 60
            })
        ];
    },
    midi: (m, presets) => m.steps(presets),
    verify: (r) => {
        const starts = [0, 1, 2].map((t) => voiceStart(r, t));
        const level = (note: number, t: number) =>
            levelDb(
                r.at(
                    starts[note] + t - AMPLITUDE_WINDOW / 2,
                    starts[note] + t + AMPLITUDE_WINDOW / 2
                )
            );
        // The tops of the LFO, at p = 0.25 and 1.25. The tip is read as the largest difference within 20 ms of it,
        // In steps of 1 ms, so an LFO that lags the voice start a little is not marked down.
        const tip = (note: number, top: number) => {
            let best = -Infinity;
            for (let d = -0.02; d <= 0.02; d += 0.001) {
                const t = DEFAULT_DELAY + top + d;
                best = Math.max(best, level(note, t) - level(0, t));
            }
            return best;
        };
        for (const top of [0.125, 0.625]) {
            r.near(`amplitude at ${top} s in dB`, tip(1, top), 6.02, 0.3);
            r.near(
                `amplitude and volume at ${top} s in dB`,
                tip(2, top),
                12.02,
                0.3
            );
        }
    }
});

export const GEN_33 = defineTest({
    id: "GEN-33",
    title: "The LFO delay and fade",
    section: "7.1.1 #68, #69",
    description:
        "The reference tone. Then the `sine` with `modLfoToAmplitude` 1000 at 3 Hz, `delayModLFO` 0.5 s and `fadeModLFO` 1 s. Then the same on the Vibrato LFO (`vibLfoToAmplitude`, `delayVibLFO`, `fadeVibLFO`). Each note lasts 2.5 s.",
    pass: "No tremolo for the first 0.5 s. Then its depth grows in a straight line for one second: close to halfway through, the tops are about 1.4 times the reference tone. The delay is one and a half cycles, so an LFO that ran during it would be at zero and falling when the fade begins, the opposite of one that starts there. After that the tremolo goes from silence to twice the amplitude.",
    length: 7,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-33 modulation LFO", {
            [G.freqModLFO]: HZ_3,
            [G.delayModLFO]: -1200,
            [G.fadeModLFO]: 0,
            [G.modLfoToAmplitude]: 1000
        }),
        b.tone("GEN-33 vibrato LFO", {
            [G.freqVibLFO]: HZ_3,
            [G.delayVibLFO]: -1200,
            [G.fadeVibLFO]: 0,
            [G.vibLfoToAmplitude]: 1000
        })
    ],
    midi: (m, [reference, modulation, vibrato]) => {
        m.steps([reference]);
        m.steps([modulation, vibrato], { start: 1, length: 2.5, spacing: 3 });
    },
    verify: (r) => {
        const reference = sustainDb(r, 0);
        const rate = 3;
        // The LFO starts after its delay of 0.5 s and fades in over 1 s
        const model = (t: number) => {
            if (t < 0.5) return 1;
            const fade = Math.min(1, t - 0.5);
            return factor(1000 * fade, lfoValue(0, (t - 0.5) * rate));
        };
        // The delay, and the tops of the second cycle (in the fade) and of the fifth (after it)
        const times = [0.3, 0.5 + 1.25 / rate, 0.5 + 4.25 / rate];
        checkModel(r, "Modulation LFO", 1, reference, times, model, 0.05);
        checkModel(r, "Vibrato LFO", 4, reference, times, model, 0.05);
    }
});

/**
 * The pitch of GEN-34: a triangle at 3 Hz of 200 cents, after a delay of 0.5 s and a fade of 1 s.
 */
function fadedPitch(t: number) {
    if (t < 0.5) return 0;
    return 200 * Math.min(1, t - 0.5) * lfoValue(0, (t - 0.5) * 3);
}

export const GEN_34 = defineTest({
    id: "GEN-34",
    title: "The fade scales every depth",
    section: "7.1.1 #68",
    description:
        "The Modulation LFO at 3 Hz with `delayModLFO` 0.5 s and `fadeModLFO` 1 s, on three notes of 2.5 s: `modLfoToPitch` 200 on the `sine`, `modLfoToVolume` 60 on the `sine`, and `modLfoToFilterFc` 2400 on the `noise` through a lowpass at 9000.",
    pass: "In each note the vibrato, the tremolo or the filter sweep is absent for 0.5 s, then grows over the same second to its full depth: 200 cents, 6 dB and two octaves.",
    length: 8.5,
    bank: (b) => {
        const lfo = {
            [G.freqModLFO]: HZ_3,
            [G.delayModLFO]: -1200,
            [G.fadeModLFO]: 0
        };
        return [
            b.tone("GEN-34 pitch", { ...lfo, [G.modLfoToPitch]: 200 }),
            b.tone("GEN-34 volume", { ...lfo, [G.modLfoToVolume]: 60 }),
            b.preset({
                name: "GEN-34 filter",
                zones: [
                    {
                        sample: b.sample("noise"),
                        generators: {
                            ...lfo,
                            [G.initialFilterFc]: 9000,
                            [G.modLfoToFilterFc]: 2400
                        }
                    }
                ]
            })
        ];
    },
    midi: (m, presets) => m.steps(presets, { length: 2.5, spacing: 3 }),
    verify: (r) => {
        // A top in the middle of the fade and one after it. The pitch is read from 20 ms of zero crossings.
        checkPitchModel(
            r,
            0,
            [0.3, 0.5 + 1.25 / 3, 0.5 + 4.25 / 3],
            fadedPitch,
            4
        );
        r.near(
            "volume swing during the delay in dB",
            swingDb(r, 3.15, 3.45),
            0,
            0.3
        );
        r.near(
            "volume swing after the fade in dB",
            swingDb(r, 4.6, 5.45),
            12,
            0.6
        );
        // The tremolo in the middle of the fade, in dB from the level during the delay: 6 dB times the fade
        const volume = voiceStart(r, 3);
        const base = levelDb(r.at(volume + 0.15, volume + 0.45));
        const times = [0.75, 0.917, 1.083, 1.25];
        const fit = fitModel(
            times,
            times.map((t) =>
                levelAround(r, volume + t, base, AMPLITUDE_WINDOW)
            ),
            (t) => (fadedPitch(t) * 6) / 200,
            AMPLITUDE_WINDOW
        );
        for (const [i, t] of times.entries())
            r.near(
                `tremolo during the fade at ${t} s (LFO ${(fit.lag * 1000).toFixed(1)} ms late), in dB`,
                levelAround(r, volume + t, base, AMPLITUDE_WINDOW),
                fit.values[i],
                0.4
            );
        const still = swingDb(r, 6.05, 6.45, 1 / 16);
        const moving = swingDb(r, 7.55, 8.45, 1 / 16);
        const fading = swingDb(r, 6.75, 7.25, 1 / 16);
        r.check(
            "the filter sweep grows during the fade",
            fading > still + 1.5 && fading < moving - 2,
            `${fading.toFixed(1)} dB between ${still.toFixed(1)} and ${moving.toFixed(1)} dB`
        );
        r.check(
            "the filter is still during the delay and sweeps after the fade",
            // The noise alone moves a 1/16 s window by a dB or two
            still < 3 && moving > 6,
            `${still.toFixed(1)} dB, then ${moving.toFixed(1)} dB`
        );
    }
});

export const GEN_35 = defineTest({
    id: "GEN-35",
    title: "The four LFO waveforms",
    section: "7.1.1 #70, #71",
    description:
        "The reference tone. Then the `sine` with `modLfoToAmplitude` 500 at 2 Hz and `modLfoWaveform` 0, 1, 2 and 3. Then the same four with the Vibrato LFO (`vibLfoToAmplitude`, `vibLfoWaveform`).",
    pass: "The amplitude shows, twice in each note: a triangle, a rising sawtooth, a sine and a square, each between 0.5 and 1.5 times the reference tone and starting at the middle (the square starts at the top).",
    length: 9,
    bank: (b) => [
        b.reference(),
        ...[0, 1, 2, 3].map((w) =>
            b.tone(`GEN-35 modulation waveform ${w}`, {
                [G.freqModLFO]: HZ_2,
                [G.modLfoToAmplitude]: 500,
                [G.modLfoWaveform]: w
            })
        ),
        ...[0, 1, 2, 3].map((w) =>
            b.tone(`GEN-35 vibrato waveform ${w}`, {
                [G.freqVibLFO]: HZ_2,
                [G.vibLfoToAmplitude]: 500,
                [G.vibLfoWaveform]: w
            })
        )
    ],
    midi: (m, presets) => m.steps(presets, { length: 0.95, spacing: 1 }),
    verify: (r) => {
        const reference = sustainDb(r, 0);
        for (let i = 0; i < 8; i++)
            checkShape(
                r,
                `${i < 4 ? "Modulation" : "Vibrato"} LFO waveform ${i % 4}`,
                i + 1,
                reference,
                2,
                500,
                i % 4
            );
    }
});

const PHASES = [0, 90, 180, 270, 360];

export const GEN_36 = defineTest({
    id: "GEN-36",
    title: "The LFO start phase",
    section: "7.1.1 #72, #73",
    description:
        "The `sine` with `modLfoToAmplitude` 500 at 2 Hz and a zero-time volume delay, attack and hold, for each waveform with `modLfoStartPhase` 0, 90, 180, 270 and 360 (20 notes of 0.5 s). Then the same 20 with the Vibrato LFO. The reference tone comes first.",
    pass: "Where each note starts: triangle and sine at the middle and rising (0), at the top (90), at the middle and falling (180), at the bottom (270), and as 0 again (360). The sawtooth starts at 0, 0.5, -1, -0.5 and 0 of its swing, the square at 1, 1, -1, -1 and 1.",
    length: 41,
    bank: (b) => {
        const presets = [b.reference()];
        for (const lfo of ["modulation", "vibrato"] as const)
            for (const w of [0, 1, 2, 3])
                for (const phase of PHASES)
                    presets.push(
                        b.tone(
                            `GEN-36 ${lfo} ${w} phase ${phase}`,
                            lfo === "modulation"
                                ? {
                                      ...DECAY_AT_ONCE,
                                      [G.freqModLFO]: HZ_2,
                                      [G.modLfoToAmplitude]: 500,
                                      [G.modLfoWaveform]: w,
                                      [G.modLfoStartPhase]: phase
                                  }
                                : {
                                      ...DECAY_AT_ONCE,
                                      [G.freqVibLFO]: HZ_2,
                                      [G.vibLfoToAmplitude]: 500,
                                      [G.vibLfoWaveform]: w,
                                      [G.vibLfoStartPhase]: phase
                                  }
                        )
                    );
        return presets;
    },
    midi: (m, presets) => m.steps(presets, { length: 0.5 }),
    verify: (r) => {
        // The notes are 0.5 s, so the reference is measured before its release
        const reference = levelDb(r.at(0.1, 0.45));
        let i = 1;
        for (const lfo of ["Modulation", "Vibrato"])
            for (const w of [0, 1, 2, 3])
                for (const phase of PHASES) {
                    // 20 ms in, away from the first edge of the square. The volume attack is zero time, which spec
                    // Section 8.1 keeps exact, so the level is full from the start
                    checkModel(
                        r,
                        `${lfo} LFO waveform ${w} phase ${phase}`,
                        i,
                        reference,
                        [0.02],
                        (t) =>
                            factor(
                                500,
                                lfoValue(
                                    w,
                                    phase / 360 + (t - DEFAULT_DELAY) * 2
                                )
                            )
                    );
                    i++;
                }
    }
});

export const GEN_37 = defineTest({
    id: "GEN-37",
    title: "The start phase after the delay",
    section: "8.1.5",
    description:
        "The reference tone, then the `sine` with `modLfoToAmplitude` 500 at 3 Hz, `delayModLFO` 0.5 s and `modLfoStartPhase` 90.",
    pass: "The second note has the level of the reference tone for 0.5 s, then jumps to 1.5 times it and falls from there: the LFO starts at its peak when the delay ends. An LFO that had run during the delay would be at its trough there, since the delay is one and a half cycles.",
    length: 3,
    bank: (b) => [
        b.reference(),
        b.tone("GEN-37 delay and phase", {
            [G.freqModLFO]: HZ_3,
            [G.modLfoToAmplitude]: 500,
            [G.delayModLFO]: -1200,
            [G.modLfoStartPhase]: 90
        })
    ],
    midi: (m, [reference, lfo]) => {
        m.steps([reference]);
        m.steps([lfo], { start: 1, length: 1.8 });
    },
    verify: (r) =>
        checkModel(
            r,
            "delayed from the peak",
            1,
            sustainDb(r, 0),
            [0.3, 0.6, 0.5 + 1 / 6],
            (t) =>
                t < 0.5 ? 1 : factor(500, lfoValue(0, 0.25 + (t - 0.5) * 3))
        )
});

export const GEN_38 = defineTest({
    id: "GEN-38",
    title: "The start phase is read once",
    section: "7.1.1 #72",
    description:
        "The `sine` with `modLfoToAmplitude` 500 at 2 Hz and a modulator from CC 16 to `modLfoStartPhase` with the amount 180. CC 16 is 0 at the note on and goes to 127 after 0.6 s. Then the same note without the controller change.",
    pass: "The two notes are the same: the tremolo does not jump when CC 16 moves, because the start phase is read when the voice starts.",
    length: 4,
    bank: (b) => [
        b.tone(
            "GEN-38 phase from CC 16",
            {
                [G.freqModLFO]: HZ_2,
                [G.modLfoToAmplitude]: 500
            },
            [mod(cc(16), none(), G.modLfoStartPhase, 180)]
        )
    ],
    midi: (m, [preset]) => {
        m.program(0, 0, preset);
        m.cc(0, 0, 16, 0);
        m.note(0, 1.8);
        m.cc(0.6, 0, 16, 127);
        m.cc(1.9, 0, 16, 0);
        m.note(2, 1.8);
    },
    verify: (r) =>
        r.near(
            "largest envelope difference in dB",
            envelopeDifference(r, 0, 2, 1.75, AMPLITUDE_WINDOW),
            0,
            0.5
        )
});

/**
 * The pitch of GEN-39: both envelopes held (300 cents) plus a triangle at 1 Hz and one at 1.5 Hz.
 */
function pitchSum(t: number) {
    return (
        300 +
        50 * lfoValue(0, t - DEFAULT_DELAY) +
        30 * lfoValue(0, 1.5 * (t - DEFAULT_DELAY))
    );
}

export const GEN_39 = defineTest({
    id: "GEN-39",
    title: "The pitch sum of both LFOs and both Modulation Envelopes",
    section: "8.1.7",
    description:
        "The `sine` with `modEnvToPitch` 100 and `modEnv2ToPitch` 200, both envelopes held at their peak, the Modulation LFO at 1 Hz with `modLfoToPitch` 50 and the Vibrato LFO at 1.5 Hz with `vibLfoToPitch` 30, held for 1.9 s.",
    pass: "The pitch is 300 cents above 440 Hz plus the two triangles: it starts at 300 cents, peaks near 365 cents a quarter second in, and moves in the shape the sum of the two triangles gives.",
    length: 2,
    bank: (b) => [
        b.tone("GEN-39 pitch sum", {
            [G.modEnvToPitch]: 100,
            [G.modEnv2ToPitch]: 200,
            [G.freqModLFO]: HZ_1,
            [G.modLfoToPitch]: 50,
            [G.freqVibLFO]: HZ_1_5,
            [G.vibLfoToPitch]: 30
        })
    ],
    midi: (m, presets) => m.steps(presets, { length: 1.9 }),
    verify: (r) => {
        checkPitchModel(
            r,
            0,
            Array.from({ length: 17 }, (_, i) => 0.1 * (i + 1)),
            pitchSum,
            3
        );
    }
});

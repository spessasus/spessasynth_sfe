import { hzToAbsoluteCents, lfoValue } from "../../framework/spec_math";
import {
    centsFrom440,
    envelopeDb,
    firstSound,
    frequency,
    lastSound,
    levelDb
} from "../../framework/measure";
import type { TestRender } from "../../framework/types";

/**
 * The sustain level in dB of the note that starts at the time (notes of 0.8 s). With the default spacing of
 * `Timeline.steps`, note `i` starts at `i` seconds.
 */
export function sustainDb(r: TestRender, start: number) {
    return levelDb(r.at(start + 0.2, start + 0.7));
}

/**
 * The largest difference in dB between the envelopes of two notes, in windows of the given length.
 */
export function envelopeDifference(
    r: TestRender,
    a: number,
    b: number,
    length: number,
    window = 0.01
) {
    const x = envelopeDb(r.at(a, a + length), window);
    const y = envelopeDb(r.at(b, b + length), window);
    let max = 0;
    for (let i = 0; i < Math.min(x.length, y.length); i++)
        max = Math.max(max, Math.abs(x[i] - y[i]));
    return max;
}

/**
 * Two cycles of 440 Hz, so an RMS window holds whole cycles of the `sine` and follows fast LFOs.
 */
export const AMPLITUDE_WINDOW = 2 / 440;

/**
 * The amplitude around a time, as a factor of the reference level (a level in dB).
 */
export function amplitudeAt(r: TestRender, time: number, referenceDb: number) {
    const level = levelDb(
        r.at(time - AMPLITUDE_WINDOW / 2, time + AMPLITUDE_WINDOW / 2)
    );
    return 10 ** ((level - referenceDb) / 20);
}

/**
 * The pitch in cents from 440 Hz around a time, from 20 ms of zero crossings.
 */
export function pitchAt(r: TestRender, time: number) {
    return centsFrom440(frequency(r.at(time - 0.01, time + 0.01)));
}

/**
 * The first time from `from` on, in steps of 5 ms, where the pitch passes the threshold in the given direction.
 */
export function pitchCrossing(
    r: TestRender,
    from: number,
    to: number,
    threshold: number,
    direction: "up" | "down"
) {
    for (let t = from; t < to; t += 0.005) {
        const p = pitchAt(r, t);
        if (direction === "up" ? p >= threshold : p <= threshold) return t;
    }
    return Number.NaN;
}

/**
 * The level in dB of a short window around a time, against a reference level.
 */
export function levelAround(
    r: TestRender,
    time: number,
    referenceDb: number,
    window = 5 / 440
) {
    return levelDb(r.at(time - window / 2, time + window / 2)) - referenceDb;
}

/**
 * Checks that a voice with a decay of 48 dB/s from its first sound (`decayVolEnv` 1200) is still decaying 0.3 s in:
 * clearly audible there, and 9.6 dB lower 0.2 s later. Both points are on the same slope, so a synthesizer that smooths
 * the level (spec section 8.1) moves them alike, and a voice that stopped at its note off is silent at both.
 */
export function checkDecayGoesOn(
    r: TestRender,
    label: string,
    start: number,
    referenceDb: number
) {
    const early = levelAround(r, start + 0.3, referenceDb);
    r.check(
        `${label}: still sounding 0.3 s in, at least -30 dB`,
        early > -30,
        `${early.toFixed(1)} dB`
    );
    r.near(
        `${label}: from 0.3 to 0.5 s in, in dB`,
        levelAround(r, start + 0.5, referenceDb) - early,
        -9.6,
        1
    );
}

/**
 * When the voice of a note that starts at the time really starts: the first point above -60 dBFS within the
 * window. Synthesizers start voices on their own block grid, so LFO and envelope times are measured from here.
 */
export function voiceStart(r: TestRender, noteTime: number, window = 0.05) {
    const index = firstSound(r.at(noteTime, noteTime + window), -60);
    if (index === -1)
        throw new Error(
            `${r.id}: no sound in the ${window} s after ${noteTime} s`
        );
    return noteTime + index / r.sampleRate;
}

/**
 * The mean of a function over a window around a time, which is what a measurement over that window sees.
 */
export function windowMean(
    model: (t: number) => number,
    time: number,
    window: number
) {
    let sum = 0;
    for (let k = 0; k < 32; k++)
        sum += model(time + ((k + 0.5) / 32 - 0.5) * window);
    return sum / 32;
}

/**
 * LFO frequencies in absolute cents.
 */
export const HZ_1 = hzToAbsoluteCents(1);
export const HZ_1_5 = hzToAbsoluteCents(1.5);
export const HZ_2 = hzToAbsoluteCents(2);
export const HZ_3 = hzToAbsoluteCents(3);

/**
 * The default LFO delay of SoundFont 2, -12000 timecents.
 */
export const DEFAULT_DELAY = 0.001;

/**
 * The amplitude factor of a linear LFO depth, clamped as spec section 7.1.1 #66 says.
 */
export function factor(depth: number, value: number) {
    return Math.min(2, Math.max(0, 1 + (depth / 1000) * value));
}

/**
 * The longest lag of an LFO behind the heard start of its voice that the model allows. A synthesizer may round the
 * 1 ms default delay up to its update period.
 */
const MAX_LAG = 0.01;

/**
 * The model at each time, averaged over the measurement window, with the LFO late by the lag between 0 and 10 ms
 * that fits the measured values best. A synthesizer may round the 1 ms default LFO delay up to its update period.
 */
export function fitModel(
    times: number[],
    measured: number[],
    model: (t: number) => number,
    window: number
) {
    const expected = (lag: number) =>
        times.map((t) => windowMean(model, t - lag, window));
    let best = { lag: 0, error: Infinity, values: expected(0) };
    for (let lag = 0; lag <= MAX_LAG + 1e-9; lag += 0.0005) {
        const values = expected(lag);
        const error = Math.max(
            ...values.map((e, i) => Math.abs(e - measured[i]))
        );
        if (error < best.error) best = { lag, error, values };
    }
    return best;
}

/**
 * Checks the amplitude of a note against a model of the LFO factor, at times measured from the voice start
 * (the heard start, unless it is given). The model is averaged over the measurement window, as the measurement
 * is, and the LFO may lag by up to 10 ms.
 */
export function checkModel(
    r: TestRender,
    label: string,
    noteTime: number,
    referenceDb: number,
    times: number[],
    model: (t: number) => number,
    tolerance = 0.03,
    start = voiceStart(r, noteTime)
) {
    const measured = times.map((t) => amplitudeAt(r, start + t, referenceDb));
    const fit = fitModel(times, measured, model, AMPLITUDE_WINDOW);
    for (const [i, t] of times.entries())
        r.near(
            `${label} at ${t.toFixed(3)} s (LFO ${(fit.lag * 1000).toFixed(1)} ms late), amplitude factor`,
            measured[i],
            fit.values[i],
            tolerance
        );
}

/**
 * Checks the pitch of a note against a model in cents, from 20 ms windows at times measured from the voice start.
 * The LFO may lag by up to 10 ms, as in `checkModel`.
 */
export function checkPitchModel(
    r: TestRender,
    noteTime: number,
    times: number[],
    model: (t: number) => number,
    tolerance: number
) {
    const start = voiceStart(r, noteTime);
    const measured = times.map((t) => pitchAt(r, start + t));
    const fit = fitModel(times, measured, model, 0.02);
    for (const [i, t] of times.entries())
        r.near(
            `pitch at ${t.toFixed(3)} s (LFO ${(fit.lag * 1000).toFixed(1)} ms late), in cents`,
            measured[i],
            fit.values[i],
            tolerance
        );
}

/**
 * Checks one cycle of an LFO at a few points between the edges of the square, where every waveform is defined.
 */
export function checkShape(
    r: TestRender,
    label: string,
    noteTime: number,
    referenceDb: number,
    rate: number,
    depth: number,
    waveform: number
) {
    // From the second quarter on, so the first point is 0.1 s or more after the start (spec section 8.1 lets a
    // Synthesizer lengthen the default attack), and the last before the note off of a note of 0.95 s at 2 Hz
    const times = [0.375, 0.625, 0.875, 1.125].map(
        (p) => DEFAULT_DELAY + p / rate
    );
    checkModel(r, label, noteTime, referenceDb, times, (t) =>
        factor(depth, lfoValue(waveform, (t - DEFAULT_DELAY) * rate))
    );
}

/**
 * The time from the first to the last sound of a note, in seconds.
 */
export function soundLength(r: TestRender, noteTime: number) {
    // From the heard start, so the start latency of the synthesizer is not part of the length
    const start = voiceStart(r, noteTime);
    return lastSound(r.at(start, noteTime + 0.9), -60) / r.sampleRate;
}

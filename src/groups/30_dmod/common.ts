import { BasicSoundBank } from "spessasynth_core";
import { balanceDb, periodTrack } from "../../framework/measure";
import { SAMPLE_RATE } from "../../framework/samples";
import type { TestRender } from "../../framework/types";

/**
 * The default modulator list of a new bank, read once. Every expected number of group 30 is computed from it.
 */
export const DEFAULTS = new BasicSoundBank().defaultModulators;

/**
 * The swing of the pitch in cents, half the distance from the lowest to the highest period, over a stretch.
 */
export function vibratoDepth(r: TestRender, from: number, to: number) {
    const cents = periodTrack(r.at(from, to)).map(
        (p) => 1200 * Math.log2(p.hz / 440)
    );
    return (Math.max(...cents) - Math.min(...cents)) / 2;
}

/**
 * The depth that `vibratoDepth` reads from an ideal triangle vibrato of the given depth at the default LFO rate of
 * 8.176 Hz. Every period it measures averages over a part of the cycle, so it reads the peaks slightly low, and an
 * expected value goes through the same measurement.
 */
export function trackedVibratoDepth(depthCents: number) {
    const rate = 8.176;
    const x = new Float32Array(SAMPLE_RATE);
    let phase = 0;
    for (let i = 0; i < x.length; i++) {
        const p = (i / SAMPLE_RATE) * rate;
        const triangle = Math.abs(((p + 0.75) % 1) * 4 - 2) - 1;
        phase +=
            (2 * Math.PI * 440 * 2 ** ((depthCents * triangle) / 1200)) /
            SAMPLE_RATE;
        x[i] = Math.sin(phase);
    }
    const cents = periodTrack(x).map((p) => 1200 * Math.log2(p.hz / 440));
    return (Math.max(...cents) - Math.min(...cents)) / 2;
}

/**
 * The balance in dB, right against left, of the note that starts at the time.
 */
export function noteBalance(r: TestRender, time: number) {
    return balanceDb(
        r.at(time + 0.25, time + 0.75, "left"),
        r.at(time + 0.25, time + 0.75, "right")
    );
}

export { stepLevelDb } from "../../framework/steps";

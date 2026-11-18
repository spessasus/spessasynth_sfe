import { levelDb } from "../../framework/measure";
import type { Timeline } from "../../framework/midi_writer";
import type { PresetRef, TestRender } from "../../framework/types";

/**
 * The sweep of the curve tests: CC 16 from 0 to 127 in 4 s, one message per value, with a pause on each value that
 * a test checks.
 */
export const SWEEP_SECONDS = 4;

/**
 * How long the sweep stays on a checked value. The level is measured in its last 0.15 s, so a synthesizer may
 * smooth a level change (spec section 8.1).
 */
export const HOLD_SECONDS = 0.3;

/**
 * The level in dB while the sweep holds a value, against a reference level, from 0.15 s after the value to the
 * next one. Most level checks of this group allow 0.3 dB, a little more than the usual 0.2 dB.
 */
export function holdLevel(
    r: TestRender,
    holdStart: number,
    referenceDb: number
) {
    return (
        levelDb(r.at(holdStart + 0.15, holdStart + HOLD_SECONDS)) - referenceDb
    );
}

/**
 * The test length for a sweep that holds the given number of values.
 */
export function sweepLength(holds: number) {
    return Math.ceil(1.2 + SWEEP_SECONDS + holds * HOLD_SECONDS + 0.8);
}

export type Points = [number, number][];

/**
 * Eight equal steps, `y` from 0 to 14336 in steps of 2048 (MOD-02).
 */
export const STAIRCASE: Points = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((step) => [
    [step * 2048, step * 2048],
    [(step + 1) * 2048, step * 2048]
]);

/**
 * 16384 everywhere, the full amount.
 */
export const FULL: Points = [
    [0, 16_384],
    [16_384, 16_384]
];

/**
 * The linear custom curve: `x / 16384`.
 */
export const LINEAR: Points = [
    [0, 0],
    [16_384, 16_384]
];

/**
 * The reference tone, then one held note while CC 16 sweeps from 0 to 127 in 4 s, pausing on each checked value.
 * Returns when each checked value starts.
 */
export function sweepMidi(
    m: Timeline,
    reference: PresetRef,
    preset: PresetRef,
    holds: readonly number[]
) {
    m.steps([reference]);
    m.program(1, 0, preset);
    m.cc(1, 0, 16, 0);
    const holdStarts = new Map<number, number>();
    let t = 1.2;
    for (let v = 0; v <= 127; v++) {
        m.cc(t, 0, 16, v);
        if (holds.includes(v)) {
            holdStarts.set(v, t);
            t += HOLD_SECONDS;
        }
        t += SWEEP_SECONDS / 127;
    }
    m.note(1.05, t - 1.05 + 0.2);
    return holdStarts;
}

export { stepLevelDb, stepNotes } from "../../framework/steps";

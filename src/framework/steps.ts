import { levelDb } from "./measure";
import type { Timeline } from "./midi_writer";
import type { PresetRef, TestRender } from "./types";

/**
 * One step of `stepNotes`: messages sent just before its note, and the preset of the note when it is not the
 * first one.
 */
export type Step =
    ((t: number) => void) | { preset?: PresetRef; at?: (t: number) => void };

/**
 * The grid of `stepNotes`: step `i` starts at `(i + 1) * STEP_SECONDS`, and its note a little later.
 */
const STEP_SECONDS = 1;
const NOTE_DELAY = 0.05;

/**
 * The first preset at 0 as the comparison note, then one note per step from 1 s on, a second apart. Each step
 * selects its preset and sends its messages just before its note.
 */
export function stepNotes(
    m: Timeline,
    first: PresetRef,
    steps: Step[],
    options: { key?: number; length?: number } = {}
) {
    m.steps([first], { key: options.key });
    for (const [i, step] of steps.entries()) {
        const t = (i + 1) * STEP_SECONDS;
        const { preset, at } =
            typeof step === "function" ? { preset: first, at: step } : step;
        m.program(t, 0, preset ?? first);
        at?.(t);
        m.note(t + NOTE_DELAY, options.length ?? 0.75, { key: options.key });
    }
}

/**
 * The level in dB of the note of step `index` of `stepNotes` against the comparison note at 0.
 */
export function stepLevelDb(r: TestRender, index: number) {
    const t = (index + 1) * STEP_SECONDS;
    return levelDb(r.at(t + 0.25, t + 0.75)) - levelDb(r.at(0.25, 0.75));
}

import { levelDb } from "./measure";
import type { Layout } from "./midi_writer";
import { SAMPLE_RATE } from "./samples";
import { CENTS_TOLERANCE, DB_TOLERANCE, type TestRender } from "./types";

/**
 * The level below which the end of a test slot counts as silent.
 */
const SILENCE_DB = -90;

/**
 * Collects errors and warnings, so one run reports all of them.
 */
export class Report {
    public readonly errors = new Array<string>();
    public readonly warnings = new Array<string>();

    public error(message: string) {
        this.errors.push(message);
        console.error(`  ERROR ${message}`);
    }

    public warn(message: string) {
        this.warnings.push(message);
        console.warn(`  WARN  ${message}`);
    }
}

/**
 * The render of one test with its measurements, as `verify` sees it.
 */
export class Measurements implements TestRender {
    public readonly id: string;
    public readonly origin: number;
    public readonly sampleRate = SAMPLE_RATE;
    public readonly left: Float32Array;
    public readonly right: Float32Array;
    public readonly failures = new Array<string>();
    public readonly lines = new Array<string>();

    public constructor(
        id: string,
        origin: number,
        left: Float32Array,
        right: Float32Array
    ) {
        this.id = id;
        this.origin = origin;
        this.left = left;
        this.right = right;
    }

    public at(
        from: number,
        to: number,
        channel: "left" | "right" | "mid" = "mid"
    ) {
        const start = Math.round((this.origin + from) * SAMPLE_RATE);
        const end = Math.round((this.origin + to) * SAMPLE_RATE);
        if (start < 0 || end > this.left.length || end <= start)
            throw new Error(
                `${this.id}: the range ${from} to ${to} s is outside the render`
            );
        if (channel === "left") return this.left.subarray(start, end);
        if (channel === "right") return this.right.subarray(start, end);
        const mid = new Float32Array(end - start);
        for (let i = 0; i < mid.length; i++)
            mid[i] = (this.left[start + i] + this.right[start + i]) / 2;
        return mid;
    }

    public near(
        label: string,
        actual: number,
        expected: number,
        tolerance: number
    ) {
        const ok = Math.abs(actual - expected) <= tolerance;
        const line = `${label}: ${actual.toFixed(3)}, expected ${expected.toFixed(3)} ± ${Number(tolerance.toFixed(3))}`;
        this.lines.push(`${ok ? "ok  " : "FAIL"} ${line}`);
        if (!ok) this.failures.push(line);
    }

    public db(
        label: string,
        actual: number,
        expected: number,
        tolerance = DB_TOLERANCE
    ) {
        this.near(label, actual, expected, tolerance);
    }

    public cents(
        label: string,
        actual: number,
        expected: number,
        tolerance = CENTS_TOLERANCE
    ) {
        this.near(label, actual, expected, tolerance);
    }

    public check(label: string, condition: boolean, detail = "") {
        const line = detail ? `${label} (${detail})` : label;
        this.lines.push(`${condition ? "ok  " : "FAIL"} ${line}`);
        if (!condition) this.failures.push(line);
    }
}

/**
 * Checks that every slot ends in silence and runs the `verify` of every test, with the rules of `coreFinding`.
 */
export function verifyTests(
    layout: Layout[],
    handles: unknown[],
    results: unknown[],
    left: Float32Array,
    right: Float32Array,
    report: Report
) {
    for (const [i, slot] of layout.entries()) {
        const test = slot.test;
        // The end of every slot must be silent, or the test leaks into the next one
        const from = Math.round((slot.end - 0.3) * SAMPLE_RATE);
        const to = Math.round(slot.end * SAMPLE_RATE);
        if (to > left.length)
            throw new Error(
                `${test.id}: the end of its slot is outside the render`
            );
        const tail = Math.max(
            levelDb(left.subarray(from, to)),
            levelDb(right.subarray(from, to))
        );
        if (tail > SILENCE_DB)
            report.error(
                `${test.id}: still sounding at ${tail.toFixed(1)} dB before the next test (its length is too short)`
            );

        if (!test.verify) {
            if (test.coreFinding)
                report.error(
                    `${test.id}: a coreFinding note needs a verify that shows it`
                );
            continue;
        }
        const r = new Measurements(test.id, slot.origin, left, right);
        try {
            test.verify(r, handles[i], results[i]);
            if (r.lines.length === 0)
                r.failures.push("its verify measured nothing");
        } catch (error) {
            r.failures.push(
                error instanceof Error ? error.message : String(error)
            );
        }
        console.info(`  ${test.id} ${test.title}`);
        for (const line of r.lines) console.info(`    ${line}`);
        if (test.coreFinding) {
            if (r.failures.length > 0)
                report.warn(
                    `${test.id}: fails in core as noted (${test.coreFinding})`
                );
            else
                report.error(
                    `${test.id}: core now passes, remove its coreFinding note`
                );
        } else
            for (const failure of r.failures)
                report.error(
                    failure.startsWith(`${test.id}:`)
                        ? failure
                        : `${test.id}: ${failure}`
                );
    }
}

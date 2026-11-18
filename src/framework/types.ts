import type { BasicSoundBank } from "spessasynth_core";
import type { BankBuilder } from "./bank_builder";
import type { Timeline } from "./midi_writer";
import type { RIFFFile } from "./patch";

/**
 * The four values that select a preset (spec section 11.2.1), plus its name.
 */
export interface PresetRef {
    program: number;
    bankMSB: number;
    bankLSB: number;
    drum: boolean;
    name: string;
}

/**
 * The render of one test, handed to its `verify`.
 * Times are in seconds from the start of the test's own events.
 */
export interface TestRender {
    id: string;
    /**
     * Where the test's own events start in the file, in seconds.
     */
    origin: number;
    sampleRate: number;
    left: Float32Array;
    right: Float32Array;
    /**
     * A slice of the render. "mid" is the average of both channels.
     */
    at(
        from: number,
        to: number,
        channel?: "left" | "right" | "mid"
    ): Float32Array;
    /**
     * Records a failure when `actual` is further than `tolerance` from `expected`.
     */
    near(
        label: string,
        actual: number,
        expected: number,
        tolerance: number
    ): void;
    /**
     * `near` for a level in dB, with the default tolerance of 0.2 dB.
     */
    db(
        label: string,
        actual: number,
        expected: number,
        tolerance?: number
    ): void;
    /**
     * `near` for a pitch in cents, with the default tolerance of 2 cents.
     */
    cents(
        label: string,
        actual: number,
        expected: number,
        tolerance?: number
    ): void;
    /**
     * Records a failure when the condition is false.
     */
    check(label: string, condition: boolean, detail?: string): void;
}

/**
 * The default tolerances of a measurement.
 */
export const DB_TOLERANCE = 0.2;
export const CENTS_TOLERANCE = 2;

/**
 * One test. The page and TESTS.md are generated from its texts.
 * The value that `bank` returns is handed to `midi` and `verify`, and the value that `midi` returns (the times of
 * its notes, for example) is handed to `verify`, so a time is computed in one place.
 */
export interface Test<T = unknown, M = void> {
    id: string;
    title: string;
    /**
     * The specification section, for example "7.1.1 #66".
     */
    section: string;
    /**
     * What it plays, in Markdown.
     */
    description: string;
    /**
     * What a compliant synthesizer does, in Markdown.
     */
    pass: string;
    /**
     * Seconds the test's own events need, the release included. It may be fractional.
     */
    length: number;
    /**
     * The channels the test uses, 0-based. The preamble zeroes the sends on them. Default [0].
     */
    channels?: number[];
    /**
     * Set when core fails this test while the test follows the specification.
     * The build then warns instead of failing, and fails once core passes.
     */
    coreFinding?: string;
    /**
     * A question for the owner about what the test should expect. The test stays out of the build until it is
     * answered.
     */
    openQuestion?: string;
    bank(b: BankBuilder): T;
    midi(m: Timeline, p: T): M;
    verify?(r: TestRender, p: T, m: M): void;
}

/**
 * Any test, whatever its handles are.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTest = Test<any, any>;

function idNumber(test: AnyTest) {
    return Number(test.id.split("-")[1]);
}

/**
 * The tests of the modules, sorted by the number of their id, so a group plays in id order whatever file a test
 * lives in. Every export of the modules must be a test.
 */
export function testsOf(...modules: Record<string, unknown>[]) {
    const tests = modules.flatMap((module) =>
        Object.entries(module).map(([name, value]) => {
            if (
                typeof value !== "object" ||
                value === null ||
                !("id" in value) ||
                !("midi" in value)
            )
                throw new Error(
                    `${name} is exported from a test file but is not a test. Test files export tests only.`
                );
            return value as AnyTest;
        })
    );
    return tests.toSorted((a, b) => idNumber(a) - idNumber(b));
}

/**
 * Helps TypeScript infer the handle types of a test.
 */
export function defineTest<T, M = void>(test: Test<T, M>) {
    return test;
}

/**
 * A set of a bank, a MIDI file and a reference render.
 */
export interface Group {
    number: number;
    slug: string;
    title: string;
    /**
     * The specification sections the group covers.
     */
    sections: string;
    /**
     * The introduction on the page and in TESTS.md, in Markdown.
     */
    intro: string;
    /**
     * The default modulators: none, the list of a new bank, or set by the group.
     */
    dmod:
        "empty" | "default" | ((bank: BasicSoundBank, b: BankBuilder) => void);
    /**
     * What each test starts with. Default "gs-reset".
     */
    preamble?: "gs-reset" | "keep-sends" | "none";
    effects?: boolean;
    /**
     * The channel of the start click, 0-based. Default 15, null for no click.
     */
    clickChannel?: number | null;
    rf64?: boolean;
    /**
     * Byte level changes to the written bank (reader rule groups).
     */
    patch?(riff: RIFFFile): void;
    /**
     * Whether a reader loads the bank. Default "load". A rejected bank has no reference.
     */
    expect?: "load" | "reject" | "reject-should";
    /**
     * Checks on the bank as core loads it, for a reader rule that does not show in the sound (a name, for example).
     * Each string it returns is a problem.
     */
    checkLoaded?(bank: BasicSoundBank): string[];
    /**
     * Set when core loads a bank that the specification says to reject. The build then warns.
     */
    coreFinding?: string;
    /**
     * What the player must do beyond playing the file, for the groups that need it.
     */
    playerNote?: string;
    tests: AnyTest[];
}

/**
 * The base name of a group's files.
 */
export function groupBaseName(group: Group) {
    return `sfe4-${group.number}-${group.slug}`;
}

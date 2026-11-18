import { GeneratorTypes as G } from "spessasynth_core";
import {
    type BankBuilder,
    cc,
    mod,
    none,
    src,
    type ZoneSpec
} from "../../framework/bank_builder";
import { centsFrom440, frequency } from "../../framework/measure";
import type { Timeline } from "../../framework/midi_writer";
import { fourteenBitX, sevenBitX } from "../../framework/spec_math";
import type { PresetRef, TestRender } from "../../framework/types";

/**
 * The cents a probe moves for one 7-bit step of its source below 64: 6400 over the source range. Above 64 a step is
 * 6400 / 126, about 50.8 cents (spec section 7.2).
 */
const STEP_CENTS = 50;
const PROBE_AMOUNT = STEP_CENTS * 128;

/**
 * The `fineTune` that brings a controller probe back to 440 Hz at a 7-bit value.
 */
function probeOffset(value: number) {
    return -Math.round((PROBE_AMOUNT * sevenBitX(value)) / 16_384);
}

/**
 * The 7-bit defaults of spec section 11.3. Every other controller defaults to 0.
 */
export const CC_DEFAULTS: Record<number, number> = {
    7: 100,
    8: 64,
    10: 64,
    11: 127,
    71: 64,
    72: 64,
    73: 64,
    74: 64,
    75: 64,
    76: 64,
    77: 64,
    78: 64,
    81: 64,
    83: 64,
    91: 40
};

/**
 * The default of a controller.
 */
export function ccDefault(controller: number) {
    return CC_DEFAULTS[controller] ?? 0;
}

/**
 * A preset whose pitch shows a controller: about 50 cents per step away from its default, so the default plays
 * 440 Hz.
 */
export function ccProbe(b: BankBuilder, controller: number) {
    return b.tone(
        `probe CC ${controller}`,
        {
            [G.fineTune]: probeOffset(ccDefault(controller))
        },
        [mod(cc(controller), none(), G.fineTune, PROBE_AMOUNT)]
    );
}

/**
 * Other sources and their raw defaults (spec section 11.3): pitch wheel, channel pressure, poly pressure (7-bit
 * values times 128), Pitch Wheel Sensitivity (2 semitones) and Modulation Depth Range (50 cents).
 */
export const SOURCE_DEFAULTS = {
    pitchWheel: { index: 14, value: 8192 },
    channelPressure: { index: 13, value: 0 },
    polyPressure: { index: 10, value: 0 },
    sensitivity: { index: 16, value: 256 },
    depthRange: { index: 17, value: 512 }
} as const;

export type SourceName = keyof typeof SOURCE_DEFAULTS;

/**
 * A preset whose pitch shows a source other than a controller, 50 cents per 128 of its 14-bit value away from its
 * default.
 */
export function sourceProbe(b: BankBuilder, name: SourceName) {
    const { index, value } = SOURCE_DEFAULTS[name];
    return b.tone(
        `probe ${name}`,
        {
            [G.fineTune]: Math.round((-PROBE_AMOUNT * value) / 16_384)
        },
        [mod(src(index), none(), G.fineTune, PROBE_AMOUNT)]
    );
}

/**
 * The cents a source probe shows for a 14-bit value.
 */
export function sourceCents(name: SourceName, value: number) {
    // The defaults are at most 8192, where the source value is the 14-bit value itself
    return (
        (PROBE_AMOUNT * (fourteenBitX(value) - SOURCE_DEFAULTS[name].value)) /
        16_384
    );
}

/**
 * The cents a controller probe shows for a 7-bit value.
 */
export function ccCents(controller: number, value: number) {
    return (
        (PROBE_AMOUNT * sevenBitX(value)) / 16_384 +
        probeOffset(ccDefault(controller))
    );
}

/**
 * The keyed preset: every key from 45 to 93 has its own zone with `scaleTuning` 0, at 50 cents per key from 440 Hz
 * at key 69, so the key that plays shows in the pitch.
 */
export function keyedPreset(
    b: BankBuilder,
    options: {
        drum?: boolean;
        program?: number;
        name?: string;
        withCC7?: boolean;
    } = {}
) {
    // With CC 7 the pitch also moves with CC 7 as a controller probe does, centered on its default of 100
    const offset = options.withCC7 ? probeOffset(100) : 0;
    const zones = new Array<ZoneSpec>();
    for (let key = 45; key <= 93; key++)
        zones.push({
            sample: b.sample("sine"),
            keys: [key, key],
            generators: {
                [G.scaleTuning]: 0,
                [G.fineTune]: STEP_CENTS * (key - 69) + offset
            },
            modulators: options.withCC7
                ? [mod(cc(7), none(), G.fineTune, PROBE_AMOUNT)]
                : undefined
        });
    return b.preset({
        name: options.name ?? "keyed",
        program: options.program,
        drum: options.drum,
        zones
    });
}

/**
 * The cents of the keyed preset for a key.
 */
export function keyedCents(key: number) {
    return STEP_CENTS * (key - 69);
}

/**
 * A probe note: a Program Change to the preset and a note of 0.15 s. Returns its time.
 */
export function probeNote(
    m: Timeline,
    time: number,
    preset: PresetRef,
    options: { ch?: number; key?: number } = {}
) {
    m.program(time, options.ch ?? 0, preset);
    m.note(time, 0.15, { ch: options.ch, key: options.key });
    return time;
}

/**
 * The pitch in cents from 440 Hz of a probe note at the time.
 */
export function probePitch(r: TestRender, time: number) {
    return centsFrom440(frequency(r.at(time + 0.04, time + 0.13)));
}

/**
 * The seconds between two probe notes.
 */
export const PROBE_SPACING = 0.25;

/**
 * The controllers of the defaults table (MID-01).
 */
export const NONZERO_CCS = Object.keys(CC_DEFAULTS).map(Number);

/**
 * The controllers that default to 0 (MID-02).
 */
export const ZERO_CCS = [1, 2, 16, 70, 93, 94];

/**
 * The controllers whose LSB controller (32 above) is probed. The LSB controllers are sources of their own.
 */
export const LSB_CCS = [1, 7, 10, 11, 16];

/**
 * The number of probes of MID-01 and MID-02 together, one per default.
 */
export const DEFAULT_PROBE_COUNT =
    NONZERO_CCS.length +
    ZERO_CCS.length +
    LSB_CCS.length +
    Object.keys(SOURCE_DEFAULTS).length;

/**
 * Every probe of a bank, made once, so the probes stay on bank 0 below program 127 where every mode can select
 * them.
 */
export interface ProbeSet {
    cc: Map<number, PresetRef>;
    lsb: Map<number, PresetRef>;
    source: Map<SourceName, PresetRef>;
    /**
     * The keyed preset as the GM/GS drum preset at program 0, with CC 7 shown in the pitch as well.
     */
    drum: PresetRef;
}

/**
 * The probes of the bank, made on the first call.
 */
export function probes(b: BankBuilder) {
    return b.shared("probes", (): ProbeSet => ({
        cc: new Map(
            [...NONZERO_CCS, ...ZERO_CCS].map((c) => [c, ccProbe(b, c)])
        ),
        lsb: new Map(LSB_CCS.map((c) => [c, ccProbe(b, c + 32)])),
        source: new Map(
            (Object.keys(SOURCE_DEFAULTS) as SourceName[]).map((name) => [
                name,
                sourceProbe(b, name)
            ])
        ),
        drum: keyedPreset(b, {
            drum: true,
            program: 0,
            name: "keyed drum",
            withCC7: true
        })
    }));
}

/**
 * One probe note in a list of probes to play and check.
 */
interface ProbeEntry {
    label: string;
    preset: PresetRef;
}

/**
 * Every probe of the defaults: the controllers, the LSBs and the other sources.
 */
export function defaultProbes(set: ProbeSet) {
    const entries = new Array<ProbeEntry>();
    for (const [c, preset] of set.cc)
        entries.push({ label: `CC ${c}`, preset });
    for (const [c, preset] of set.lsb)
        entries.push({ label: `CC ${c + 32}`, preset });
    for (const [name, preset] of set.source)
        entries.push({ label: name, preset });
    return entries;
}

/**
 * Plays every probe one after the other from the time. Returns the time after the last one.
 */
export function playProbes(m: Timeline, time: number, entries: ProbeEntry[]) {
    for (const [i, entry] of entries.entries())
        probeNote(m, time + i * PROBE_SPACING, entry.preset);
    return time + entries.length * PROBE_SPACING;
}

/**
 * Checks that every probe played from the time is at 440 Hz: each source at its default.
 */
export function checkProbes(
    r: TestRender,
    time: number,
    entries: ProbeEntry[],
    prefix: string
) {
    for (const [i, entry] of entries.entries())
        r.cents(
            `${prefix}${entry.label} at its default, in cents`,
            probePitch(r, time + i * PROBE_SPACING),
            0
        );
}

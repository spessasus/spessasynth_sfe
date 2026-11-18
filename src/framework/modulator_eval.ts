import {
    CustomCurve,
    type GeneratorType,
    type Modulator,
    type ModulatorSource
} from "spessasynth_core";
import { customCurveOutput, fourteenBitX, sevenBitX } from "./spec_math";

/**
 * The raw value of every source a modulator can read: CCs by number, the others by their source index. 7-bit values
 * are stored times 128, the pitch wheel and the two range sources as their 14-bit value.
 */
export interface SourceState {
    cc: Record<number, number>;
    other: Record<number, number>;
}

/**
 * The state a synthesizer starts in and returns to on a system reset (spec section 11.3), as raw values (see
 * `SourceState`).
 * Velocity and key are those of a note at key 69 and velocity 127.
 */
export function defaultState(): SourceState {
    const cc: Record<number, number> = {};
    for (let i = 0; i < 128; i++) cc[i] = 0;
    for (const [controller, value] of Object.entries({
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
    }))
        cc[Number(controller)] = value * 128;
    return {
        cc,
        other: {
            // Velocity, key, poly pressure, channel pressure, pitch wheel, its range, the depth range
            2: 127 * 128,
            3: 69 * 128,
            10: 0,
            13: 0,
            14: 8192,
            16: 256,
            17: 512
        }
    };
}

/**
 * The SoundFont 2 concave curve on a unipolar value from 0 to 1: `-20/96 * log10((1 - u)^2)`, at most 1.
 */
function concave(u: number) {
    if (u >= 1) return 1;
    return Math.min(1, Math.max(0, (-40 / 96) * Math.log10(1 - u)));
}

/**
 * The output of a source for its source value x, from 0 to 16384, as SoundFont 2 section 8.2 and spec section 7.2
 * define it.
 */
export function sourceOutput(source: ModulatorSource, x: number) {
    const curve = source.curve;
    if (curve instanceof CustomCurve)
        return customCurveOutput(
            curve.points.map((p) => [p.x, p.y] as [number, number]),
            x,
            { negative: source.isNegative, bipolar: source.isBipolar }
        );
    // The switch reads x itself (spec section 7.2). It is on from 8192, and off from 8192 with the negative direction
    if (source.curveType === 3) {
        const on = x >= 8192 !== source.isNegative;
        if (source.isBipolar) return on ? 1 : -1;
        return on ? 1 : 0;
    }
    // The direction first, as spec section 7.2.1 does for custom curves: 16384 - x
    const u = (source.isNegative ? 16_384 - x : x) / 16_384;
    const shape = (v: number) => {
        switch (source.curveType) {
            case 0: {
                return v;
            }
            case 1: {
                return concave(v);
            }
            case 2: {
                return 1 - concave(1 - v);
            }
            default: {
                // The switch is handled above
                return v;
            }
        }
    };
    if (!source.isBipolar) return shape(u);
    // A bipolar SoundFont 2 curve is the unipolar one mirrored around its center
    if (source.curveType === 0) return 2 * u - 1;
    return u >= 0.5 ? shape(2 * u - 1) : -shape(1 - 2 * u);
}

/**
 * The general sources that are 14-bit values: the pitch wheel, its range and the depth range. The others hold a
 * 7-bit value times 128.
 */
const FOURTEEN_BIT_SOURCES = new Set([14, 16, 17]);

/**
 * The source value x a source reads from the state, mapped as spec section 7.2 says: 64 (or 8192) is the center and
 * 127 (or 16383) is exactly 16384.
 */
function sourceValue(source: ModulatorSource, state: SourceState) {
    if (source.isCC) return sevenBitX(state.cc[source.index] / 128);
    if (source.index === 0) return 16_384;
    const raw = state.other[source.index] ?? 0;
    return FOURTEEN_BIT_SOURCES.has(source.index)
        ? fourteenBitX(raw)
        : sevenBitX(raw / 128);
}

/**
 * The output of one modulator in a state.
 */
export function modulatorOutput(modulator: Modulator, state: SourceState) {
    const value =
        modulator.transformAmount *
        sourceOutput(
            modulator.primarySource,
            sourceValue(modulator.primarySource, state)
        ) *
        sourceOutput(
            modulator.secondarySource,
            sourceValue(modulator.secondarySource, state)
        );
    // The transform applies to the whole output, amount included, as in SoundFont 2
    return modulator.transformType === 2 ? Math.abs(value) : value;
}

/**
 * The sum of the modulators of a list on one destination, in a state.
 */
export function destinationSum(
    modulators: readonly Modulator[],
    destination: GeneratorType,
    state: SourceState
) {
    return modulators
        .filter((m) => m.destination === destination)
        .reduce((sum, m) => sum + modulatorOutput(m, state), 0);
}

/**
 * A state with some sources changed, given as 7-bit CC values and raw other values: 7-bit values times 128, and
 * the 14-bit value for the pitch wheel and the two range sources.
 */
export function withState(changes: {
    cc?: Record<number, number>;
    other?: Record<number, number>;
}) {
    const state = defaultState();
    for (const [controller, value] of Object.entries(changes.cc ?? {}))
        state.cc[Number(controller)] = value * 128;
    for (const [index, value] of Object.entries(changes.other ?? {}))
        state.other[Number(index)] = value;
    return state;
}

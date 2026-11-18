/**
 * Formulas of the specification, for expected values that are computed instead of typed in.
 */

/**
 * Absolute cents to Hz: 6900 is 440 Hz.
 */
export function absoluteCentsToHz(cents: number) {
    return 440 * 2 ** ((cents - 6900) / 1200);
}

/**
 * The linear Q of a resonance in centibels (spec section 7.1.1 #61).
 */
export function linearQ(r: number) {
    return 10 ** ((r - 30.1) / 200);
}

export type FilterType = "lowpass" | "highpass" | "bandpass" | "peak" | "notch";

export const FILTER_TYPES: FilterType[] = [
    "lowpass",
    "highpass",
    "bandpass",
    "peak",
    "notch"
];

/**
 * The gain in dB of a filter type at a frequency, from the responses of spec section 7.1.1 #61,
 * scaled by `10^(-q / 400)`. `r` is the whole resonance and `q` the part of it from `initialFilterQ`,
 * the only part that lowers the gain. Without `filterQOffset` the two are the same.
 */
export function filterGainDb(
    type: FilterType,
    frequencyHz: number,
    cutoffCents: number,
    r: number,
    q = r
) {
    const w = 2 * Math.PI * absoluteCentsToHz(cutoffCents);
    const o = 2 * Math.PI * frequencyHz;
    const linear = linearQ(r);
    // D = s^2 + w s / Q + w^2 with s = j o
    const dRe = w * w - o * o;
    const dIm = (o * w) / linear;
    const d = Math.hypot(dRe, dIm);
    let numerator: number;
    switch (type) {
        case "lowpass": {
            numerator = w * w;
            break;
        }
        case "highpass": {
            numerator = o * o;
            break;
        }
        case "bandpass": {
            numerator = o * w;
            break;
        }
        case "peak": {
            numerator = w * w + o * o;
            break;
        }
        case "notch": {
            numerator = Math.abs(w * w - o * o);
            break;
        }
    }
    return 20 * Math.log10(numerator / d) - q / 20;
}

/**
 * The output of an LFO waveform at the position `p` in its cycle (spec section 7.1.1 #70).
 * 0 is the triangle, 1 the rising sawtooth, 2 the sine and 3 the square.
 */
export function lfoValue(waveform: number, p: number) {
    const x = p - Math.floor(p);
    switch (waveform) {
        case 0: {
            if (x < 0.25) return 4 * x;
            if (x < 0.75) return 2 - 4 * x;
            return 4 * x - 4;
        }
        case 1: {
            return x < 0.5 ? 2 * x : 2 * x - 2;
        }
        case 2: {
            return Math.sin(2 * Math.PI * x);
        }
        default: {
            return x < 0.5 ? 1 : -1;
        }
    }
}

/**
 * The absolute cents of an LFO frequency generator for a frequency in Hz.
 */
export function hzToAbsoluteCents(hz: number) {
    return Math.round(6900 + 1200 * Math.log2(hz / 440));
}

/**
 * A custom curve at a 14-bit source value, as spec section 7.2.1 steps 2 to 4 define it. Returns the output of the
 * source: 0 to 1 for a unipolar source, -1 to 1 for a bipolar one.
 */
export function customCurveOutput(
    points: readonly [number, number][],
    sourceValue: number,
    options: { negative?: boolean; bipolar?: boolean } = {}
) {
    const x = options.negative ? 16_384 - sourceValue : sourceValue;
    let y: number;
    if (x < points[0][0]) y = points[0][1];
    else if (x >= points[points.length - 1][0])
        y = points[points.length - 1][1];
    else {
        // The last point at or below x, so the last of several points with the same x gives the value there
        let i = 0;
        while (i + 1 < points.length && points[i + 1][0] <= x) i++;
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        y = x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return options.bipolar ? (y - 8192) / 8192 : y / 16_384;
}

/**
 * The source value x of a 7-bit MIDI value (spec section 7.2): 128 * v up to 64, then up to exactly 16384 at 127.
 */
export function sevenBitX(v: number) {
    return v <= 64 ? 128 * v : Math.round(8192 + (8192 * (v - 64)) / 63);
}

/**
 * The source value x of a 14-bit value (spec section 7.2): w up to 8192, then up to exactly 16384 at 16383.
 */
export function fourteenBitX(w: number) {
    return w <= 8192 ? w : Math.round(8192 + (8192 * (w - 8192)) / 8191);
}

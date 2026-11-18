import { SAMPLE_RATE } from "./samples";

/**
 * RMS level in dB (1.0 is 0 dB).
 */
export function levelDb(x: Float32Array) {
    let sum = 0;
    for (const v of x) sum += v * v;
    const rms = Math.sqrt(sum / Math.max(1, x.length));
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * Peak level in dB.
 */
export function peakDb(x: Float32Array) {
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * Frequency in Hz from the rising zero crossings, interpolated between points.
 */
export function frequency(x: Float32Array) {
    let first = -1;
    let last = -1;
    let crossings = 0;
    for (let i = 1; i < x.length; i++) {
        if (x[i - 1] <= 0 && x[i] > 0) {
            const t = i - 1 + -x[i - 1] / (x[i] - x[i - 1]);
            if (first < 0) first = t;
            else crossings++;
            last = t;
        }
    }
    return crossings > 0 ? (crossings * SAMPLE_RATE) / (last - first) : 0;
}

/**
 * The distance from b to a in cents.
 */
export function cents(a: number, b: number) {
    return 1200 * Math.log2(a / b);
}

/**
 * Cents from 440 Hz (key 69) to the frequency.
 */
export function centsFrom440(frequencyHz: number) {
    return cents(frequencyHz, 440);
}

/**
 * The RMS level in dB of consecutive windows.
 */
export function envelopeDb(x: Float32Array, windowSeconds: number) {
    const size = Math.max(1, Math.round(windowSeconds * SAMPLE_RATE));
    const count = Math.floor(x.length / size);
    const out = new Float64Array(count);
    for (let w = 0; w < count; w++)
        out[w] = levelDb(x.subarray(w * size, (w + 1) * size));
    return out;
}

/**
 * The slope in dB per second of a falling level, measured between the times it passes two levels
 * below its start. For example (20, 40) times the fall from -20 dB to -40 dB under the first window.
 */
export function slopeDbPerSecond(
    x: Float32Array,
    fromDb: number,
    toDb: number,
    windowSeconds = 0.005
) {
    const env = envelopeDb(x, windowSeconds);
    const top = env[0];
    const a = env.findIndex((v) => v <= top - fromDb);
    const b = env.findIndex((v) => v <= top - toDb);
    if (a === -1 || b === -1 || b < a) return Number.NaN;
    // Both levels passed in the same window: faster than the window can tell
    if (b === a) return -Infinity;
    return -(toDb - fromDb) / ((b - a) * windowSeconds);
}

/**
 * Energy in dB of the band between two frequencies, from a Hann-windowed FFT of the whole slice
 * (cut to a power of two).
 */
export function bandEnergyDb(x: Float32Array, lowHz: number, highHz: number) {
    const spectrum = powerSpectrum(x);
    const size = (spectrum.length - 1) * 2;
    let sum = 0;
    for (let k = 0; k < spectrum.length; k++) {
        const f = (k * SAMPLE_RATE) / size;
        if (f >= lowHz && f < highHz) sum += spectrum[k];
    }
    return sum > 0 ? 10 * Math.log10(sum) : -Infinity;
}

/**
 * Power spectrum of a Hann-windowed slice, cut to the largest power of two.
 */
export function powerSpectrum(x: Float32Array) {
    let n = 1;
    while (n * 2 <= x.length) n *= 2;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++)
        re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    fft(re, im);
    const out = new Float64Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k++)
        out[k] = (re[k] * re[k] + im[k] * im[k]) / n;
    return out;
}

/**
 * In-place radix-2 FFT.
 */
function fft(re: Float64Array, im: Float64Array) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const angle = (-2 * Math.PI) / len;
        for (let i = 0; i < n; i += len) {
            for (let k = 0; k < len / 2; k++) {
                const wr = Math.cos(angle * k);
                const wi = Math.sin(angle * k);
                const a = i + k;
                const b = a + len / 2;
                const tr = re[b] * wr - im[b] * wi;
                const ti = re[b] * wi + im[b] * wr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
            }
        }
    }
}

/**
 * The level of the right channel against the left, in dB.
 */
export function balanceDb(left: Float32Array, right: Float32Array) {
    return levelDb(right) - levelDb(left);
}

/**
 * Index of the first point louder than the threshold, or -1.
 */
export function firstSound(x: Float32Array, thresholdDb = -60) {
    const threshold = 10 ** (thresholdDb / 20);
    return x.findIndex((v) => Math.abs(v) > threshold);
}

/**
 * Index of the last point louder than the threshold, or -1.
 */
export function lastSound(x: Float32Array, thresholdDb = -60) {
    const threshold = 10 ** (thresholdDb / 20);
    for (let i = x.length - 1; i >= 0; i--)
        if (Math.abs(x[i]) > threshold) return i;
    return -1;
}

/**
 * The power of a spectrum in the band of the given width (in octaves) around a frequency.
 */
function bandPower(
    spectrum: Float64Array,
    centerHz: number,
    widthOctaves: number
) {
    const size = (spectrum.length - 1) * 2;
    const low = centerHz * 2 ** (-widthOctaves / 2);
    const high = centerHz * 2 ** (widthOctaves / 2);
    let sum = 0;
    for (
        let k = Math.ceil((low * size) / SAMPLE_RATE);
        k <= Math.floor((high * size) / SAMPLE_RATE);
        k++
    )
        sum += spectrum[k] ?? 0;
    return sum;
}

/**
 * The level of a filtered signal against the unfiltered one in a band around a frequency, in dB.
 * Both slices should hold the same material, such as the same looped noise.
 */
export function bandRatioDb(
    filtered: Float32Array,
    reference: Float32Array,
    centerHz: number,
    widthOctaves = 1 / 6
) {
    return (
        10 *
        Math.log10(
            bandPower(powerSpectrum(filtered), centerHz, widthOctaves) /
                bandPower(powerSpectrum(reference), centerHz, widthOctaves)
        )
    );
}

/**
 * The cutoff of a lowpass with no resonance: where the filtered signal falls 3 dB below its level at 50 Hz,
 * against the unfiltered one, scanned in steps of 1/48 octave and interpolated.
 */
export function lowpassCutoffHz(
    filtered: Float32Array,
    reference: Float32Array
) {
    const a = powerSpectrum(filtered);
    const b = powerSpectrum(reference);
    const ratio = (f: number) =>
        10 * Math.log10(bandPower(a, f, 1 / 6) / bandPower(b, f, 1 / 6));
    const target =
        10 * Math.log10(bandPower(a, 50, 1) / bandPower(b, 50, 1)) - 3;
    let previous = 50;
    let previousRatio = ratio(previous);
    for (let f = 50 * 2 ** (1 / 48); f < 20_000; f *= 2 ** (1 / 48)) {
        const current = ratio(f);
        if (current <= target) {
            const t = (previousRatio - target) / (previousRatio - current);
            return previous * (f / previous) ** t;
        }
        previous = f;
        previousRatio = current;
    }
    return Number.NaN;
}

/**
 * The pitch of every period, from one rising zero crossing to the next, interpolated. Returns the time of each
 * period's middle in seconds from the start of the slice and its frequency in Hz. Fast vibrato shows in it.
 */
export function periodTrack(x: Float32Array) {
    const crossings = new Array<number>();
    for (let i = 1; i < x.length; i++)
        if (x[i - 1] <= 0 && x[i] > 0)
            crossings.push(i - 1 + -x[i - 1] / (x[i] - x[i - 1]));
    const out = new Array<{ time: number; hz: number }>();
    for (let i = 1; i < crossings.length; i++)
        out.push({
            time: (crossings[i] + crossings[i - 1]) / 2 / SAMPLE_RATE,
            hz: SAMPLE_RATE / (crossings[i] - crossings[i - 1])
        });
    return out;
}

import { BasicSample, SampleTypes, type SampleType } from "spessasynth_core";

export const SAMPLE_RATE = 48_000;

/**
 * -12 dBFS, the peak of every sample.
 */
export const SAMPLE_PEAK = 10 ** (-12 / 20);

export type SampleName =
    | "sine"
    | "cosine"
    | "noise"
    | "ramp"
    | "tail"
    | "steps"
    | "click"
    | "left"
    | "right";

/**
 * The points of a sample and its loop, before it becomes a BasicSample.
 */
export interface SampleData {
    data: Float32Array;
    loopStart: number;
    loopEnd: number;
    rootKey: number;
}

function tone(frequency: number, length: number, phase = 0) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++)
        data[i] =
            SAMPLE_PEAK *
            Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE + phase);
    return data;
}

/**
 * Points before the loop start and after the loop end. SoundFont 2 asks for at least 8, and 2400 are 50 ms, a
 * whole number of cycles of 440 Hz and 880 Hz, so the loop of a tone stays seamless.
 */
export const GUARD = 2400;

/**
 * A looped tone of one second, with guard cycles on both sides of the loop.
 */
function loopedTone(frequency: number, phase = 0) {
    return {
        data: tone(frequency, SAMPLE_RATE + 2 * GUARD, phase),
        loopStart: GUARD,
        loopEnd: GUARD + SAMPLE_RATE,
        rootKey: 69
    };
}

/**
 * Wraps a loop in copies of its own ends, so the points around the loop continue it.
 */
function wrapLoop(loop: Float32Array, guard: number) {
    const data = new Float32Array(loop.length + 2 * guard);
    data.set(loop.subarray(loop.length - guard), 0);
    data.set(loop, guard);
    data.set(loop.subarray(0, guard), guard + loop.length);
    return {
        data,
        loopStart: guard,
        loopEnd: guard + loop.length,
        rootKey: 69
    };
}

/**
 * The data of each generated sample.
 */
export function sampleData(name: SampleName) {
    switch (name) {
        case "sine":
        case "left": {
            // 440 whole cycles in one second, so the loop is seamless
            return loopedTone(440);
        }
        case "right": {
            return loopedTone(880);
        }
        case "cosine": {
            // The loop start is a whole number of cycles in, so it starts at the peak too
            return loopedTone(440, Math.PI / 2);
        }
        case "noise": {
            const loop = new Float32Array(SAMPLE_RATE);
            // A 32-bit LCG with a fixed seed, so every build writes the same noise
            let seed = 12_345;
            for (let i = 0; i < loop.length; i++) {
                seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
                loop[i] = SAMPLE_PEAK * ((seed / 2 ** 32) * 2 - 1);
            }
            return wrapLoop(loop, GUARD);
        }
        case "ramp": {
            // 109 points at 48 kHz are about 440 Hz
            const loop = new Float32Array(109);
            for (let i = 0; i < loop.length; i++)
                loop[i] = SAMPLE_PEAK * (-1 + (2 * i) / (loop.length - 1));
            return wrapLoop(loop, 8);
        }
        case "tail": {
            // The looped second of 440 Hz, then 0.3 s of 880 Hz after the loop end
            const looped = loopedTone(440);
            const after = tone(880, Math.round(SAMPLE_RATE * 0.3));
            const data = new Float32Array(looped.loopEnd + after.length);
            data.set(looped.data.subarray(0, looped.loopEnd));
            data.set(after, looped.loopEnd);
            return { ...looped, data };
        }
        case "steps": {
            // Eight plateaus of 1000 points, each one quieter than the last
            const data = new Float32Array(8000);
            for (let i = 0; i < data.length; i++)
                data[i] = (SAMPLE_PEAK * (8 - Math.floor(i / 1000))) / 8;
            return { data, loopStart: 0, loopEnd: 0, rootKey: 69 };
        }
        case "click": {
            // One cycle of 1 kHz
            return {
                data: tone(1000, SAMPLE_RATE / 1000),
                loopStart: 0,
                loopEnd: 0,
                rootKey: 69
            };
        }
    }
}

/**
 * Creates a new BasicSample from the data of a sample.
 */
export function createSample(
    name: string,
    data: SampleData,
    type: SampleType = SampleTypes.monoSample
) {
    const sample = new BasicSample(
        name,
        SAMPLE_RATE,
        data.rootKey,
        0,
        type,
        data.loopStart,
        data.loopEnd
    );
    sample.setAudioData(data.data, SAMPLE_RATE);
    return sample;
}

import flacFactory from "libflacjs";
import { Encoder } from "libflacjs/lib/encoder";
import { exportFlacData } from "libflacjs/lib/utils/flac-utils";
import { SAMPLE_RATE } from "./samples";

// The asm.js build: the wasm build fetches its binary by path, which Node refuses
const Flac = flacFactory();
await new Promise<void>((resolve) => {
    if (Flac.isReady()) resolve();
    else Flac.on("ready", () => resolve());
});

/**
 * Points encoded per call (10 s), which keeps the encoder's memory small for long renders.
 */
const CHUNK = SAMPLE_RATE * 10;

function toInt16(x: Float32Array, from: number, to: number) {
    const out = new Int32Array(to - from);
    for (let i = 0; i < out.length; i++)
        out[i] = Math.max(
            -32_768,
            Math.min(32_767, Math.round(x[from + i] * 32_767))
        );
    return out;
}

/**
 * Encodes a stereo render as a lossless 16 bit FLAC file at 48 kHz.
 */
export async function encodeFLAC(left: Float32Array, right: Float32Array) {
    const encoder = new Encoder(Flac, {
        sampleRate: SAMPLE_RATE,
        channels: 2,
        bitsPerSample: 16,
        compression: 5,
        verify: true
    });
    try {
        for (let from = 0; from < left.length; from += CHUNK) {
            const to = Math.min(left.length, from + CHUNK);
            if (
                !encoder.encode([
                    toInt16(left, from, to),
                    toInt16(right, from, to)
                ])
            )
                throw new Error(
                    `FLAC encoding failed in state ${encoder.getState()}`
                );
        }
        // The last call flushes the encoder, and fails when the last frames do
        if (!encoder.encode())
            throw new Error(
                `FLAC finish failed in state ${encoder.getState()}`
            );
        const metadata = encoder.metadata;
        if (!metadata) throw new Error("The FLAC encoder gave no metadata");
        const data = await exportFlacData(encoder.rawData, metadata, false);
        return data;
    } finally {
        encoder.destroy();
    }
}

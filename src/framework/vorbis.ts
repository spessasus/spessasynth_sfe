import { createOggEncoder } from "wasm-media-encoders";
import { SAMPLE_RATE, sampleData } from "./samples";

/**
 * Encodes mono audio as an Ogg Vorbis file. A fixed serial number keeps the output the same in every build.
 * It has the shape of a `compressionFunction` for `BasicSoundBank.setSampleFormat`.
 */
export async function encodeVorbis(
    audioData: Float32Array,
    sampleRate: number
) {
    const encoder = await createOggEncoder();
    encoder.configure({
        channels: 1,
        sampleRate,
        vbrQuality: 6,
        oggSerialNo: 1
    });
    // The encoder reuses its output buffer, so each part is copied
    const body = encoder.encode([audioData]).slice();
    const end = encoder.finalize().slice();
    const out = new Uint8Array(body.length + end.length);
    out.set(body);
    out.set(end, body.length);
    return out;
}

/**
 * The `tail` sample encoded once for the `vorbis` sample: the looped 440 Hz, then 880 Hz after the loop end.
 * Its loop points are the ones of the `sine`, in decoded points, which are zero crossings. A loop read in the
 * wrong place reaches the 880 Hz and is heard.
 */
export const VORBIS_SAMPLE = await (async () => {
    const tail = sampleData("tail");
    return { ...tail, ogg: await encodeVorbis(tail.data, SAMPLE_RATE) };
})();

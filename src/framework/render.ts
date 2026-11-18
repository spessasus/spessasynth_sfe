import {
    BasicMIDI,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "spessasynth_core";
import { SAMPLE_RATE } from "./samples";

// Core warns about channels that look for presets before the bank is added
SpessaLog.setLogLevel(false, false, false);

const BLOCK = 128;

/**
 * Reads a written bank back, as a synthesizer would.
 */
export function loadBank(bytes: Uint8Array) {
    return SoundBankLoader.fromArrayBuffer(toArrayBuffer(bytes));
}

function toArrayBuffer(bytes: Uint8Array) {
    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
}

/**
 * Plays the written MIDI file with the written bank through core, until the end of
 * the MIDI plus 2 s, or the given minimum when that is later.
 * Both files are read back from their bytes, so the writers and the readers are in the loop.
 */
export async function renderFiles(
    bank: Uint8Array,
    midi: Uint8Array,
    options: { effects: boolean; minimumSeconds: number }
) {
    const soundBank = loadBank(bank);
    const midiFile = BasicMIDI.fromArrayBuffer(toArrayBuffer(midi));
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        effectsEnabled: options.effects,
        eventsEnabled: false
    });
    synth.setSystemParameter("autoAllocateVoices", true);
    synth.soundBankManager.addSoundBank(soundBank, "main");
    await synth.ready;

    const sequencer = new SpessaSynthSequencer(synth);
    sequencer.skipToFirstNoteOn = false;
    sequencer.loadNewSongList([midiFile]);
    sequencer.play();

    const length = Math.ceil(
        SAMPLE_RATE * Math.max(midiFile.duration + 2, options.minimumSeconds)
    );
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let done = 0; done < length; done += BLOCK) {
        sequencer.processTick();
        synth.process(left, right, done, Math.min(BLOCK, length - done));
    }
    return { left, right };
}

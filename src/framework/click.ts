import { GeneratorTypes } from "spessasynth_core";
import type { BankBuilder } from "./bank_builder";
import type { Timeline } from "./midi_writer";
import type { PresetRef } from "./types";

/**
 * The start click: program 127, bank MSB 0, LSB 127. `BankBuilder` never hands out its number, and the build adds
 * it before any test preset, so it is the first preset in `PHDR`. The preset selection groups rely on both.
 */
export const CLICK_PRESET: PresetRef = {
    program: 127,
    bankMSB: 0,
    bankLSB: 127,
    drum: false,
    name: "start click"
};

/**
 * The channel of the click unless a group picks another, 0-based.
 */
export const DEFAULT_CLICK_CHANNEL = 15;

/**
 * Adds the click preset: one cycle of 1 kHz, not looped.
 */
export function addClick(b: BankBuilder) {
    b.preset({
        ...CLICK_PRESET,
        zones: [
            {
                sample: b.sample("click"),
                generators: { [GeneratorTypes.sampleModes]: 0 }
            }
        ]
    });
}

/**
 * Plays the click on the channel at the time.
 */
export function playClick(m: Timeline, time: number, ch: number) {
    m.program(time, ch, CLICK_PRESET);
    m.note(time, 0.1, { ch, key: 69 });
}

import type { Group } from "../../framework/types";
import * as t from "./tests";

const INTRO =
    'Each step sends its messages on channel 1 or 10 and then plays a note there. Every preset of the bank plays the `sine` with `scaleTuning` 0 and a `coarseTune` of its own, so the pitch of the note names the preset. A marker in the MIDI file names the expected preset of each step, and the pass criterion lists the expected pitch in cents from 440 Hz. Rules 1 and 2 are required. The fallback lists of rule 3 are a recommendation (spec 11.2.3): without an exact match a synthesizer may select another preset, or none, and the answers marked "should" only hold for one that follows the lists. On XG channel 10 a fallback should not be a melodic preset while the file has a drum preset.';

/**
 * The fields the six selection groups share.
 */
const COMMON = {
    sections: "6.1, 11.2, 11.6",
    dmod: "empty"
} as const;

export const SELECT_FULL_GROUP: Group = {
    ...COMMON,
    number: 60,
    slug: "select-full",
    title: "Preset selection: the full bank",
    intro: `${INTRO} This bank holds melodic presets over several programs and banks, GM/GS drum presets, XG drum presets at bank MSB 120 and 127, a preset at bank MSB 126 and two presets with the same four values. It passes the XG test.`,
    tests: [
        t.SEL_01,
        t.SEL_02,
        t.SEL_03,
        t.SEL_04,
        t.SEL_05,
        t.SEL_06,
        t.SEL_07,
        t.SEL_08,
        t.SEL_09,
        t.SEL_10,
        t.SEL_11,
        t.SEL_12,
        t.SEL_13,
        t.SEL_14,
        t.SEL_15,
        t.SEL_16,
        t.SEL_17,
        t.SEL_18,
        t.SEL_19,
        t.SEL_21
    ]
};

export const SELECT_XG_DRUMS_GROUP: Group = {
    ...COMMON,
    number: 61,
    slug: "select-xgdrums",
    title: "Preset selection: XG drum presets only",
    intro: `${INTRO} This bank holds the melodic presets and the XG drum presets of the full bank, and no GM/GS drum preset.`,
    tests: [t.SEL_07_XG]
};

export const SELECT_GS_DRUMS_GROUP: Group = {
    ...COMMON,
    number: 62,
    slug: "select-gsdrums",
    title: "Preset selection: GM/GS drum presets only",
    intro: `${INTRO} This bank holds the melodic presets and the GM/GS drum presets of the full bank, and no XG drum preset.`,
    tests: [t.SEL_08_GS]
};

export const SELECT_NO_DRUMS_GROUP: Group = {
    ...COMMON,
    number: 63,
    slug: "select-nodrums",
    title: "Preset selection: no drum presets",
    intro: `${INTRO} This bank holds only the melodic presets of the full bank.`,
    tests: [t.SEL_07_NONE, t.SEL_08_NONE]
};

export const SELECT_XG_FAIL_GROUP: Group = {
    ...COMMON,
    number: 64,
    slug: "select-xgfail",
    title: "Preset selection: a bank that fails the XG test",
    intro: `${INTRO} This bank is the full bank plus a preset at bank MSB 127, program 10, with the drum flag set. Program 10 is not an XG kit, so the bank fails the XG test and its presets at bank MSB 120 and 127 are melodic.`,
    tests: [t.SEL_12_FAIL, t.SEL_13_FAIL]
};

export const SELECT_EMPTY_GROUP: Group = {
    ...COMMON,
    number: 65,
    slug: "select-empty",
    title: "Preset selection: a bank without presets",
    intro: "A bank without any preset. There is no start click either, since the click needs a preset of its own.",
    clickChannel: null,
    tests: [t.SEL_20]
};

export const SELECT_WBANK_GROUP: Group = {
    ...COMMON,
    number: 91,
    slug: "wbank",
    title: "Bit 15 of wBank",
    sections: "6.1",
    intro: "The full selection bank of group 60 with bit 15 of `wBank` set in every preset header. It belongs to the reader rules, and lives with the selection groups since it plays their bank.",
    tests: [t.CON_18],
    patch: (riff) => {
        const phdr = riff.find("LIST:pdta/phdr");
        const view = new DataView(phdr.data.buffer, phdr.data.byteOffset);
        // Every preset header but the terminal one
        for (let o = 0; o + 38 < phdr.data.length; o += 38)
            view.setUint16(
                o + 22,
                view.getUint16(o + 22, true) | 0x80_00,
                true
            );
    }
};

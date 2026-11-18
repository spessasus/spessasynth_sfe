import type { Group } from "../../framework/types";
import * as curves from "./curves";
import * as sources from "./sources";
import { MOD_14, MOD_25, MOD_31, modulatorDefaults } from "./supersession";

export const MODULATORS_GROUP: Group = {
    number: 20,
    slug: "modulators",
    title: "Modulators",
    sections: "5.3 to 5.5, 7.2, 7.2.1, 7.3, 7.4",
    intro: "Custom curves, the source values and the modulator rules. Most curve tests send CC 16 through a curve to `gain` with -240, so the curve shows as a level from 0 to 24 dB below the reference tone. A sweep pauses 0.3 s on each value a test checks, and the level is measured in the last 0.15 s of the pause, so a synthesizer may smooth level changes (spec section 8.1). Smoothing that takes longer than 0.15 s changes the result. The bank's `DMOD` holds only the default modulators of MOD-14, MOD-25 and MOD-31, on CC 20 to 24, which the other tests leave at 0.",
    dmod: modulatorDefaults,
    tests: [
        curves.MOD_01,
        curves.MOD_02,
        curves.MOD_03,
        curves.MOD_04,
        curves.MOD_05,
        curves.MOD_06,
        curves.MOD_07,
        curves.MOD_08,
        curves.MOD_09,
        curves.MOD_10,
        curves.MOD_11,
        curves.MOD_12,
        curves.MOD_13,
        MOD_14,
        curves.MOD_15,
        curves.MOD_16,
        curves.MOD_17,
        sources.MOD_18,
        sources.MOD_19,
        sources.MOD_20,
        sources.MOD_21,
        sources.MOD_22,
        sources.MOD_23,
        sources.MOD_24,
        MOD_25,
        sources.MOD_26,
        sources.MOD_27,
        sources.MOD_28,
        sources.MOD_29,
        sources.MOD_30,
        MOD_31
    ]
};

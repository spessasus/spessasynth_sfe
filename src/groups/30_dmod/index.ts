import { type Group, testsOf } from "../../framework/types";
import * as defaults from "./defaults";
import { DEF_14, DEF_15, ownDefaults } from "./lists";

export const DEFAULTS_GROUP: Group = {
    number: 30,
    slug: "dmod",
    title: "Default modulators",
    sections: "7.3, 10",
    intro: "The bank holds the default modulator list of a new SFe bank, untouched. Every expected number is computed from that list, so it stays right if the list changes before the format is frozen.",
    dmod: "default",
    tests: testsOf(defaults)
};

export const EMPTY_DEFAULTS_GROUP: Group = {
    number: 31,
    slug: "dmod-empty",
    title: "An empty default modulator list",
    sections: "7.3",
    intro: "The bank's `DMOD` holds only the terminal record, so it has no default modulators at all.",
    dmod: "empty",
    tests: [DEF_14]
};

export const OWN_DEFAULTS_GROUP: Group = {
    number: 32,
    slug: "dmod-custom",
    title: "A default modulator list of the bank's own",
    sections: "7.3",
    intro: "The bank's `DMOD` holds two modulators of its own in place of the usual list.",
    dmod: ownDefaults,
    tests: [DEF_15]
};

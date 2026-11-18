import { type Group, testsOf } from "../../framework/types";
import * as envelopes from "./envelopes";
import * as filter from "./filter";
import * as level from "./level";
import * as enums from "./enums";
import * as lfo from "./lfo";
import * as playback from "./playback";
import * as times from "./times";
import * as voice from "./voice";

export const GENERATORS_GROUP: Group = {
    number: 10,
    slug: "generators",
    title: "Generators",
    sections: "7.1, 7.1.1, 8.1",
    intro: "The SFe generators and the changed SoundFont 2 rules, one preset per test. The bank has no default modulators, so velocity, volume and the pitch wheel do nothing unless a test says so.",
    dmod: "empty",
    tests: testsOf(level, filter, lfo, envelopes, voice, times, playback, enums)
};

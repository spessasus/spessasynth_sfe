import { type Group, testsOf } from "../../framework/types";
import * as channelMode from "./channel_mode";
import { MID_23 } from "./ports";
import * as resets from "./resets";
import * as rpn from "./rpn";
import { MID_24 } from "./startup";
import * as sysex from "./sysex";

const INTRO =
    "The bank has no default modulators. It holds probe presets: each maps one source (a controller, the pitch wheel, a pressure, the Pitch Wheel Sensitivity or the Modulation Depth Range) to the pitch through its own modulator with the amount 6400, tuned so that the default of spec section 11.3 plays 440 Hz. A step of a 7-bit value is 50 cents below 64 and about 50.8 cents above it (spec section 7.2). The keyed drum preset has a zone per key with `scaleTuning` 0, 50 cents apart, so the key that plays shows in the pitch.";

export const MIDI_GROUP: Group = {
    number: 50,
    slug: "midi",
    title: "MIDI behavior",
    sections: "11.1, 11.3 to 11.6",
    intro: `${INTRO} The preamble does not zero CC 91 and CC 93, since their defaults are tested.`,
    dmod: "empty",
    preamble: "keep-sends",
    tests: testsOf(resets, rpn, channelMode, sysex)
};

export const MIDI_PORTS_GROUP: Group = {
    number: 51,
    slug: "midi-ports",
    title: "MIDI ports",
    sections: "11.6.2, 11.6.3",
    intro: INTRO,
    playerNote:
        "This MIDI file uses two ports. Play it with a player that maps the MIDI port meta event of each track to a group of 16 channels, which is a convention outside the specification.",
    dmod: "empty",
    preamble: "keep-sends",
    tests: [MID_23]
};

export const MIDI_STARTUP_GROUP: Group = {
    number: 52,
    slug: "midi-startup",
    title: "The starting state",
    sections: "11.1, 11.3",
    intro: `${INTRO} This file sends no reset message.`,
    playerNote:
        "Play this file on a freshly started synthesizer, with nothing played on it before.",
    dmod: "empty",
    preamble: "none",
    tests: [MID_24]
};

import type { Group } from "../framework/types";
import { SENDS_GROUP } from "./40_sends";
import {
    SELECT_EMPTY_GROUP,
    SELECT_FULL_GROUP,
    SELECT_GS_DRUMS_GROUP,
    SELECT_NO_DRUMS_GROUP,
    SELECT_WBANK_GROUP,
    SELECT_XG_DRUMS_GROUP,
    SELECT_XG_FAIL_GROUP
} from "./60_select";
import { READER_GROUPS } from "./70_reader";
import { MIDI_GROUP, MIDI_PORTS_GROUP, MIDI_STARTUP_GROUP } from "./50_midi";
import { GENERATORS_GROUP } from "./10_generators";
import { MODULATORS_GROUP } from "./20_modulators";
import {
    DEFAULTS_GROUP,
    EMPTY_DEFAULTS_GROUP,
    OWN_DEFAULTS_GROUP
} from "./30_dmod";

/**
 * Every group as written, open questions included.
 */
export const ALL_GROUPS: Group[] = [
    GENERATORS_GROUP,
    MODULATORS_GROUP,
    DEFAULTS_GROUP,
    EMPTY_DEFAULTS_GROUP,
    OWN_DEFAULTS_GROUP,
    SENDS_GROUP,
    MIDI_GROUP,
    MIDI_PORTS_GROUP,
    MIDI_STARTUP_GROUP,
    SELECT_FULL_GROUP,
    SELECT_XG_DRUMS_GROUP,
    SELECT_GS_DRUMS_GROUP,
    SELECT_NO_DRUMS_GROUP,
    SELECT_XG_FAIL_GROUP,
    SELECT_EMPTY_GROUP,
    // Group 91 plays the selection bank, so it lives with the selection groups but sits between the reader groups
    ...[...READER_GROUPS, SELECT_WBANK_GROUP].toSorted(
        (a, b) => a.number - b.number
    )
];

/**
 * Every group, in number order, without the tests that wait for an answer from the owner. A group whose every
 * test waits is left out as a whole.
 */
export const GROUPS: Group[] = ALL_GROUPS.map((group) => ({
    ...group,
    tests: group.tests.filter((test) => test.openQuestion === undefined)
})).filter((group) => group.tests.length > 0);

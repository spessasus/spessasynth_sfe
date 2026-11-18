import type { Group } from "../../framework/types";
import { CONTAINER_GROUPS } from "./container";
import { CURVE_GROUPS } from "./curves";
import { IGNORED_GROUPS } from "./ignored";
import { INDEX_MSB_GROUPS } from "./index_msb";
import { PLAYBACK_GROUPS } from "./playback";
import { XDTA_GROUPS } from "./xdta";
import { XMOD_GROUPS } from "./xmod";

/**
 * The reader rule groups, one bank each, by topic. `src/groups/index.ts` puts them in number order around group 91.
 */
export const READER_GROUPS: Group[] = [
    ...CONTAINER_GROUPS,
    ...XMOD_GROUPS,
    ...XDTA_GROUPS,
    ...CURVE_GROUPS,
    ...IGNORED_GROUPS,
    ...PLAYBACK_GROUPS,
    ...INDEX_MSB_GROUPS
];

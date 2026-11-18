import { GeneratorTypes as G } from "spessasynth_core";
import { type Group } from "../../framework/types";
import { patchMod } from "../../framework/records";
import {
    pitchPreset,
    plain,
    readerGroup,
    type Statement,
    statementTest,
    viaCC11
} from "./common";

/**
 * The CON-15 modulators, each patched into something a reader must ignore. Each zone also has a constant
 * modulator of 260 cents. `cc` is a controller set to 127 before the note, so a source that is wrongly read
 * would move the pitch.
 */
const IGNORED: {
    label: string;
    amount: number;
    field: "source" | "amountSource" | "destination" | "transform";
    value: number;
    cc?: number;
}[] = [
    // The Link sources have the direction bit, so a reader that reads them as 0 gets 1 and moves the pitch
    {
        label: "the Link source",
        amount: 370,
        field: "source",
        value: 0x1_7f
    },
    {
        label: "the Link amount source",
        amount: 375,
        field: "amountSource",
        value: 0x1_7f
    },
    {
        label: "a destination with bit 15",
        amount: 380,
        field: "destination",
        // A link to the other modulator of the zone, an index in range
        value: 0x80_01
    },
    {
        label: "a destination with bit 15 on the number of fineTune",
        amount: 387,
        field: "destination",
        // A reader that masks bit 15 would act on fineTune
        value: 0x80_00 | G.fineTune
    },
    { label: "the transform 1", amount: 385, field: "transform", value: 1 },
    { label: "the transform 3", amount: 390, field: "transform", value: 3 },
    {
        label: "the destination 60",
        amount: 395,
        field: "destination",
        value: 60
    },
    {
        label: "the destination 92",
        amount: 400,
        field: "destination",
        value: 92
    },
    {
        label: "the unused destination 14",
        amount: 405,
        field: "destination",
        value: 14
    },
    // A general controller (CC flag clear) with a reserved index. Read as the No Controller source it would act.
    {
        label: "the reserved general controller 20 as the source",
        amount: 450,
        field: "source",
        value: 20
    },
    {
        label: "the reserved general controller 20 as the amount source",
        amount: 455,
        field: "amountSource",
        value: 20
    },
    // CC 98 and CC 120 are not sent, since CC 120 would end the note.
    // With the negative direction a source read at 0 gives 1, so a reader that plays them acts.
    ...[98, 120].map((controller, i) => ({
        label: `CC ${controller} as the source`,
        amount: 470 + i * 10,
        field: "source" as const,
        value: 0x1_00 | 0x80 | controller
    })),
    ...[0, 6, 32, 38].flatMap((controller, i) => [
        {
            label: `CC ${controller} as the source`,
            amount: 410 + i * 10,
            field: "source" as const,
            value: 0x80 | controller,
            cc: controller
        },
        {
            label: `CC ${controller} as the amount source`,
            amount: 415 + i * 10,
            field: "amountSource" as const,
            value: 0x80 | controller,
            cc: controller
        }
    ])
];

/**
 * The amount of the CON-15 modulator on CC 40, a valid source (spec section 7.4), which must act.
 */
const VALID_LSB_SOURCE = 460;

const CON_15 = statementTest({
    id: "CON-15",
    title: "Modulators that are ignored",
    section: "7.2, 7.4",
    description:
        "Zones each with a constant modulator of 260 cents and a modulator of CC 11 to `fineTune` changed into one that must be ignored: the Link source and the Link amount source (both with the negative direction), a destination with bit 15 (once linking to the other modulator, once on the number of `fineTune`), the transforms 1 and 3, the destinations 60, 92 and 14 (unknown), the reserved general controller 20 as source and as amount source, the illegal controllers 0, 6, 32 and 38 as source and as amount source, and the illegal CC 98 and CC 120 as source with the negative direction. First, CC 40 with the negative direction as the only modulator of a zone, which must act: the controllers 33 to 63 are valid sources. CC 0, 6, 32 and 38 are at 127 during their notes, and CC 40 stays at 0.",
    pass: "The CC 40 modulator acts. None of the changed modulators acts: every other note plays the constant modulator alone. Spec 7.4 lists the illegal controllers of SoundFont 2 section 8.2.1, CC 0, 6, 32 and 38 among them.",
    statements: [
        {
            label: "CC 40 as the source, which is valid and acts",
            cents: VALID_LSB_SOURCE,
            build: (b) =>
                pitchPreset(b, "CC 40 source", [
                    viaCC11(VALID_LSB_SOURCE).modulator
                ])
        },
        ...IGNORED.map((item): Statement => ({
            label: item.label,
            cents: plain(260).cents,
            cc: item.cc === undefined ? undefined : [item.cc, 127],
            build: (b) =>
                pitchPreset(b, item.label, [
                    viaCC11(item.amount).modulator,
                    plain(260).modulator
                ])
        }))
    ]
});

/**
 * Modulators that a reader must ignore.
 */
export const IGNORED_GROUPS: Group[] = [
    readerGroup({
        number: 88,
        slug: "ignored",
        title: "Modulators that are ignored",
        sections: "7.2, 7.4",
        intro: "A bank of modulators a reader must ignore.",
        test: CON_15,
        patch: (riff) => {
            const imod = riff.find("LIST:pdta/imod");
            patchMod(imod, VALID_LSB_SOURCE, (r) => {
                r.source = 0x1_00 | 0x80 | 40;
            });
            for (const item of IGNORED)
                patchMod(imod, item.amount, (r) => {
                    r[item.field] = item.value;
                });
        }
    })
];

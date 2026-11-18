import {
    BasicInstrument,
    BasicPreset,
    GeneratorTypes as G
} from "spessasynth_core";
import { constant } from "../../framework/bank_builder";
import { levelDb } from "../../framework/measure";
import { defineTest, type Group } from "../../framework/types";
import type { RIFFFile } from "../../framework/patch";
import {
    patchGen,
    patchMod,
    setVersion,
    withSourceType
} from "../../framework/records";
import {
    curved,
    pitchPreset,
    plain,
    readerGroup,
    type Statement,
    statementTest,
    viaCC11
} from "./common";

/**
 * Puts an unknown INFO sub-chunk of 7 bytes into the bank, so a pad byte follows it. A reader skips unknown
 * sub-chunks inside INFO (SoundFont 2 section 10.2).
 */
function oddChunk(riff: RIFFFile) {
    riff.find("LIST:INFO").insertBefore(
        riff.find("LIST:INFO/DMOD"),
        "unkn",
        new Uint8Array(7)
    );
}

/**
 * Plain statements that every reader must play: a constant modulator, a custom curve modulator and a custom curve
 * modulator in a preset zone. The container tests use them.
 */
const BASIC: Statement[] = [
    {
        label: "a constant modulator",
        cents: plain(300).cents,
        build: (b) => pitchPreset(b, "constant", [plain(300).modulator])
    },
    {
        label: "a custom curve modulator",
        cents: (1200 * 8192) / 16_384,
        build: (b) => pitchPreset(b, "curve", [curved(b, 8192, 1200).modulator])
    },
    {
        label: "a custom curve modulator in a preset zone",
        cents: (1200 * 4096) / 16_384,
        build: (b) =>
            pitchPreset(
                b,
                "preset curve",
                [],
                [curved(b, 4096, 1200).modulator]
            )
    }
];

const CON_01 = statementTest({
    id: "CON-01",
    title: "64-bit chunk sizes",
    section: "3.1",
    description:
        "The probe bank written with 64-bit chunk sizes: the file starts with `RIFS` and every chunk has a 12-byte header. INFO holds an unknown sub-chunk of 7 bytes, so a pad byte follows it.",
    pass: "The bank loads and plays the pitches below: the unknown sub-chunk and its pad byte are skipped.",
    statements: BASIC
});

const CON_02 = statementTest({
    id: "CON-02",
    title: "Pad bytes",
    section: "3.1",
    description:
        "The probe bank with 32-bit chunk sizes. INFO holds an unknown sub-chunk of 7 bytes, so a pad byte follows it.",
    pass: "The bank loads and plays the pitches below: the unknown sub-chunk and its pad byte are skipped.",
    statements: BASIC
});

/**
 * The zones of the filler instrument and preset of CON-03, enough to push every index past 65535.
 */
const FILLER_ZONES = 65_600;

const CON_03 = statementTest({
    id: "CON-03",
    title: "Indices past 65535 through xdta",
    section: "5.5",
    description: `A filler instrument with ${FILLER_ZONES} zones and a filler preset with ${FILLER_ZONES} zones come first, each zone on key 0 only, with a key range and one modulator of its own. Then a preset whose bags, generators and modulators are past the 65536th at both levels: \`fineTune\` 100 and a custom curve modulator of 600 cents in its instrument zone, and a constant modulator of 200 cents in its preset zone. The 16-bit indices of \`pdta\` only reach it with the top bits of \`xdta\`.`,
    pass: "The last preset plays its own tone, 900 cents up. A reader that ignores the top 16 bits reaches a filler zone and plays nothing or a wrong pitch.",
    statements: [
        {
            label: "the preset past 65535",
            cents: 100 + 600 + plain(200).cents,
            build: (b) => {
                const sine = b.sample("sine");
                const filler = new BasicInstrument();
                filler.name = "filler";
                for (let i = 0; i < FILLER_ZONES; i++) {
                    const zone = filler.createZone(sine);
                    zone.keyRange = { min: 0, max: 0 };
                    zone.setGenerator(G.coarseTune, 1);
                    zone.addModulators(constant(G.pan, (i % 100) + 1));
                }
                b.bank.addInstruments(filler);
                const fillerPreset = new BasicPreset(b.bank);
                fillerPreset.name = "filler";
                fillerPreset.program = 0;
                fillerPreset.bankMSB = 100;
                for (let i = 0; i < FILLER_ZONES; i++) {
                    const zone = fillerPreset.createZone(filler);
                    zone.keyRange = { min: 0, max: 0 };
                    zone.addModulators(constant(G.pan, (i % 100) + 1));
                }
                b.bank.addPresets(fillerPreset);
                return b.preset({
                    name: "past 65535",
                    zones: [
                        {
                            sample: sine,
                            generators: { [G.fineTune]: 100 },
                            modulators: [curved(b, 8192, 1200).modulator]
                        }
                    ],
                    presetModulators: [plain(200).modulator]
                });
            }
        }
    ]
});

/**
 * Amounts of the CON-04 modulators that the patch makes unknown.
 */
const CON_04_AMOUNTS = {
    generator: 777,
    type5: 310,
    type63: 320,
    type5Positive: 315,
    type63Positive: 325,
    transform: 330,
    destination: 340,
    curveDestination: 1210
};

const CON_04 = statementTest({
    id: "CON-04",
    title: "A later minor version and what it may add",
    section: "5.1, 7.4",
    description:
        "`ifil` is 4.1. INFO holds an unknown sub-chunk. One zone has an unknown generator (200) with the value 777. Six zones each have a modulator of CC 11 to `fineTune` that is unknown: source type 5 and source type 63, each once with the negative direction (a source read as 0 would act) and once with the positive one (a source read as a plain CC 11 would act), transform 4 and destination 95, next to a constant modulator that must stay. One zone has a custom curve modulator with the unknown destination 99, then a valid custom curve modulator.",
    pass: "The bank loads. The unknown generator, sub-chunk and modulators do nothing, and the modulators next to them act. The valid custom curve modulator after the unknown one gets its own curve: the unknown one still takes its extended record.",
    statements: [
        {
            label: "an unknown generator",
            cents: 0,
            build: (b) =>
                b.tone("unknown generator", {
                    [G.fineTune]: CON_04_AMOUNTS.generator
                })
        },
        ...(
            [
                ["source type 5", CON_04_AMOUNTS.type5, 150],
                ["source type 63", CON_04_AMOUNTS.type63, 160],
                ["source type 5, positive", CON_04_AMOUNTS.type5Positive, 155],
                [
                    "source type 63, positive",
                    CON_04_AMOUNTS.type63Positive,
                    165
                ],
                ["transform 4", CON_04_AMOUNTS.transform, 170],
                ["destination 95", CON_04_AMOUNTS.destination, 180]
            ] as const
        ).map(([label, unknown, kept]): Statement => ({
            label,
            cents: plain(kept).cents,
            build: (b) =>
                pitchPreset(b, label, [
                    viaCC11(unknown).modulator,
                    plain(kept).modulator
                ])
        })),
        {
            label: "a curve modulator with destination 99, then a valid one",
            cents: (1220 * 12_288) / 16_384,
            build: (b) =>
                pitchPreset(b, "unknown curve destination", [
                    curved(b, 4096, CON_04_AMOUNTS.curveDestination).modulator,
                    curved(b, 12_288, 1220).modulator
                ])
        }
    ]
});

const CON_05 = statementTest({
    id: "CON-05",
    rejected: true,
    title: "A later major version",
    section: "5.1",
    description: "The probe bank with `ifil` 5.0.",
    pass: "The bank is rejected (should). There is no reference render.",
    statements: BASIC
});

const CON_06 = statementTest({
    id: "CON-06",
    rejected: true,
    title: "No DMOD",
    section: "7.3",
    description: "The probe bank without a `DMOD` sub-chunk.",
    pass: "The bank is rejected: an SFe file without `DMOD` is not valid. There is no reference render.",
    statements: BASIC
});

const CON_07 = defineTest({
    id: "CON-07",
    title: "A DMOD of zero bytes",
    section: "7.3",
    description:
        "A bank written with the default modulator list of a new bank, then its `DMOD` cut to zero bytes and its `XMOD` removed. The `sine` at velocity 127, at velocity 40, and at velocity 127 after CC 7 at 0 and CC 11 at 0.",
    pass: "The bank loads with no default modulators: all three notes have the same level, since neither velocity nor CC 7 and CC 11 change anything.",
    length: 2,
    bank: (b) => b.reference(),
    midi: (m, reference) => {
        m.program(0, 0, reference);
        m.note(0.05, 0.4);
        m.note(0.55, 0.4, { vel: 40 });
        m.cc(1, 0, 7, 0);
        m.cc(1, 0, 11, 0);
        m.note(1.05, 0.4);
    },
    verify: (r) => {
        const level = (t: number) => levelDb(r.at(t + 0.1, t + 0.35));
        r.db("velocity 40 against 127, in dB", level(0.55) - level(0.05), 0);
        r.db("CC 7 and CC 11 at 0, in dB", level(1.05) - level(0.05), 0);
    }
});

/**
 * The container rules: 64-bit sizes, pad bytes, large indices, versions and `DMOD`.
 */
export const CONTAINER_GROUPS: Group[] = [
    readerGroup({
        number: 70,
        slug: "rifs",
        title: "64-bit chunk sizes",
        sections: "3.1",
        intro: "The probe bank written as a `RIFS` file.",
        test: CON_01,
        rf64: true,
        patch: oddChunk
    }),
    readerGroup({
        number: 71,
        slug: "pad",
        title: "Pad bytes",
        sections: "3.1",
        intro: "The probe bank with an unknown INFO sub-chunk of odd length.",
        test: CON_02,
        patch: oddChunk
    }),
    readerGroup({
        number: 72,
        slug: "xdta",
        title: "Indices past 65535",
        sections: "5.5",
        intro: "A bank of more than 65536 zones at both levels.",
        test: CON_03
    }),
    readerGroup({
        number: 73,
        slug: "minor",
        title: "A later minor version",
        sections: "5.1, 7.4",
        intro: "A bank of version 4.1 with things a reader of 4.0 doesn't know.",
        test: CON_04,
        patch: (riff) => {
            setVersion(riff, 4, 1);
            const a = CON_04_AMOUNTS;
            patchGen(
                riff.find("LIST:pdta/igen"),
                G.fineTune,
                a.generator,
                (r) => (r.operator = 200)
            );
            const imod = riff.find("LIST:pdta/imod");
            patchMod(
                imod,
                a.type5,
                // With the negative direction, so a reader that reads the source as 0 gets 1
                (r) => (r.source = withSourceType(r.source | 0x1_00, 5))
            );
            patchMod(
                imod,
                a.type63,
                (r) => (r.source = withSourceType(r.source | 0x1_00, 63))
            );
            // The positive twins act in a reader that reads an unknown type as a plain linear source
            patchMod(
                imod,
                a.type5Positive,
                (r) => (r.source = withSourceType(r.source, 5))
            );
            patchMod(
                imod,
                a.type63Positive,
                (r) => (r.source = withSourceType(r.source, 63))
            );
            patchMod(imod, a.transform, (r) => (r.transform = 4));
            patchMod(imod, a.destination, (r) => (r.destination = 95));
            patchMod(imod, a.curveDestination, (r) => (r.destination = 99));
            const info = riff.find("LIST:INFO");
            info.insertBefore(
                riff.find("LIST:INFO/DMOD"),
                "xnew",
                new Uint8Array(6)
            );
        }
    }),
    readerGroup({
        number: 74,
        slug: "major5",
        title: "A later major version",
        sections: "5.1",
        intro: "The probe bank with version 5.0.",
        test: CON_05,
        expect: "reject-should",
        patch: (riff) => setVersion(riff, 5, 0)
    }),
    readerGroup({
        number: 75,
        slug: "nodmod",
        title: "No DMOD",
        sections: "7.3",
        intro: "The probe bank without `DMOD`.",
        test: CON_06,
        expect: "reject",
        patch: (riff) => riff.find("LIST:INFO/DMOD").remove()
    }),
    readerGroup({
        number: 76,
        slug: "dmod-zero",
        title: "A DMOD of zero bytes",
        sections: "7.3",
        intro: "A bank whose `DMOD` has no bytes at all.",
        test: CON_07,
        dmod: "default",
        // XMOD goes too, so the cut DMOD is the only thing out of order
        patch: (riff) => {
            riff.find("LIST:INFO/DMOD").setData(new Uint8Array(0));
            riff.find("LIST:INFO/XMOD").remove();
        }
    })
];

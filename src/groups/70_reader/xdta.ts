import {
    BasicSoundBank,
    GeneratorTypes as G,
    ModulatorSource
} from "spessasynth_core";
import { type BankBuilder, mod } from "../../framework/bank_builder";
import { sevenBitX } from "../../framework/spec_math";
import { defineTest, type Group } from "../../framework/types";
import {
    EXTENDED_FLAG,
    patchMod,
    setDword,
    withoutLastRecord,
    XMOD_SIZE
} from "../../framework/records";
import {
    curved,
    editMods,
    pitchPreset,
    plain,
    readerGroup,
    type Statement,
    statementTest,
    viaCC11
} from "./common";

/**
 * The amounts of the modulators the xdta tests flag by hand.
 */
const FLAGGED_PLAIN = 350;

/**
 * The default modulator of CC 16 through a linear custom curve, and the zone modulator identical to it that must
 * be ignored, of CON-09 and CON-10.
 */
const SUPERSEDE = { default: 600, zone: 1000 };

/**
 * A new CC 16 source through the linear curve of the CON-09 and CON-10 `DMOD`. CC 16 is 0 unless a statement
 * sets it, so the default modulator only acts on that statement.
 */
function supersedeSource(bank: BasicSoundBank) {
    const curve = bank.customCurves.find((c) => c.name === "CC 16");
    if (!curve) throw new Error("CON-09: the CC 16 curve of DMOD is missing");
    return new ModulatorSource(16, curve, true, false, false);
}

/**
 * The statements of the tests where `xdta` is missing or ignored.
 */
function xdtaIgnored(): Statement[] {
    return [
        {
            label: "a custom curve modulator",
            cents: plain(190).cents,
            build: (b) =>
                pitchPreset(b, "curve", [
                    curved(b, 4096, 1230).modulator,
                    plain(190).modulator
                ])
        },
        {
            label: "a modulator with the flag and no curve",
            cents: plain(200).cents,
            build: (b) =>
                pitchPreset(b, "flag", [
                    viaCC11(FLAGGED_PLAIN).modulator,
                    plain(200).modulator
                ])
        },
        {
            label: "a custom curve modulator in a preset zone",
            cents: plain(210).cents,
            build: (b) =>
                pitchPreset(
                    b,
                    "preset curve",
                    [plain(210).modulator],
                    [curved(b, 4096, 440).modulator]
                )
        },
        {
            label: "a default modulator, and an ignored zone modulator identical to it",
            cents: (SUPERSEDE.default * sevenBitX(127)) / 16_384,
            cc: [16, 127],
            build: (b) =>
                pitchPreset(b, "supersede", [
                    mod(
                        supersedeSource(b.bank),
                        new ModulatorSource(),
                        G.fineTune,
                        SUPERSEDE.zone
                    )
                ])
        }
    ];
}

/**
 * The DMOD of CON-09 and CON-10: CC 16 through a linear custom curve to `fineTune`.
 */
function supersedeDefaults(bank: BasicSoundBank, b: BankBuilder) {
    b.curve(
        [
            [0, 0],
            [16_384, 16_384]
        ],
        "CC 16"
    );
    bank.defaultModulators = [
        mod(
            supersedeSource(bank),
            new ModulatorSource(),
            G.fineTune,
            SUPERSEDE.default
        )
    ];
}

const XDTA_IGNORED_TEXT = {
    section: "5.5, 5.5.1, 7.3",
    pass: "The modulators with the flag or a custom curve are ignored, in instrument and preset zones, and the others act. The default modulator acts: the ignored zone modulator identical to it supersedes nothing."
};

const XDTA_IGNORED_DESCRIPTION =
    "`DMOD` holds one modulator, CC 16 through a linear custom curve to `fineTune` with 600, and its record in `XMOD`. Zones with a custom curve modulator, with a modulator that has the flag and no custom curve, with a custom curve modulator in the preset zone, and with a modulator identical to the default one (amount 1000, flagged), with CC 16 at 127. Each zone with a constant modulator that stays.";

const CON_09 = statementTest({
    id: "CON-09",
    title: "No xdta",
    description: `The bank has no \`xdta\` list. ${XDTA_IGNORED_DESCRIPTION}`,
    ...XDTA_IGNORED_TEXT,
    statements: xdtaIgnored()
});

function unsoundTest(part: string, what: string) {
    return statementTest({
        id: "CON-10",
        title: `A structurally unsound xdta (${part})`,
        description: `The \`xdta\` list ${what}, so it is structurally unsound. ${XDTA_IGNORED_DESCRIPTION}`,
        ...XDTA_IGNORED_TEXT,
        pass: `The whole \`xdta\` is ignored, as in CON-09. ${XDTA_IGNORED_TEXT.pass}`,
        statements: xdtaIgnored()
    });
}

/**
 * The CON-11 test, played by three banks whose `xdta` `imod` can't be matched in three ways.
 */
const conElevenTest = (part: string, what: string) =>
    statementTest({
        id: "CON-11",
        title: `Extended records that can't be matched at one level (${part})`,
        section: "5.5.1",
        description: `The \`imod\` of \`xdta\` ${what}, and its \`pmod\` is intact. Two zones each with a custom curve modulator and a constant one, and a preset whose preset zone has a custom curve modulator of 230 cents.`,
        pass: "Both custom curve modulators of the instrument zones are ignored, also the first, whose record is still there: the records of `imod` can't be matched. The one of the preset zone acts.",
        statements: [
            {
                label: "an instrument custom curve modulator",
                cents: plain(220).cents,
                build: (b) =>
                    pitchPreset(b, "instrument curve", [
                        curved(b, 4096, 1240).modulator,
                        plain(220).modulator
                    ])
            },
            {
                label: "another instrument custom curve modulator",
                cents: plain(225).cents,
                build: (b) =>
                    pitchPreset(b, "instrument curve 2", [
                        curved(b, 12_288, 1245).modulator,
                        plain(225).modulator
                    ])
            },
            {
                label: "a preset custom curve modulator",
                cents: plain(230).cents + 230,
                build: (b) =>
                    pitchPreset(
                        b,
                        "preset curve",
                        [plain(230).modulator],
                        [curved(b, 8192, 460).modulator]
                    )
            }
        ]
    });

/**
 * The amounts of the CON-12 modulators the patch changes, each followed in its zone by a normal custom curve
 * modulator.
 */
const CON_12_AMOUNTS = {
    reserved: 1250,
    flagOnly: 360,
    curveNoFlag: 1280,
    transform: 1300,
    amountIndex: 1320
};

const CON_12 = statementTest({
    id: "CON-12",
    title: "Extended records that are taken but not used",
    section: "5.5.1",
    description:
        "Five zones, each with a modulator that has something wrong with its extended record, followed by a normal custom curve modulator with a curve of its own: a record with a non-zero reserved byte, a modulator with the flag and no custom curve (its record is zeros), a custom curve modulator without the flag (and without a record), a custom curve modulator with the transform 0x8001, and a custom curve modulator whose record also gives a curve index for its amount source, which is not of type 4.",
    pass: "The first four are ignored, and the fifth acts with its own curve. Every following modulator gets its own curve: each flagged modulator takes its record, also when it is ignored.",
    statements: [
        {
            label: "a non-zero reserved byte",
            cents: (1260 * 12_288) / 16_384,
            build: (b) =>
                pitchPreset(b, "reserved", [
                    curved(b, 4096, CON_12_AMOUNTS.reserved).modulator,
                    curved(b, 12_288, 1260).modulator
                ])
        },
        {
            label: "the flag without a custom curve",
            cents: (1270 * 8192) / 16_384,
            build: (b) =>
                pitchPreset(b, "flag only", [
                    viaCC11(CON_12_AMOUNTS.flagOnly).modulator,
                    curved(b, 8192, 1270).modulator
                ])
        },
        {
            label: "a custom curve without the flag",
            cents: (1290 * 12_288) / 16_384,
            build: (b) =>
                pitchPreset(b, "curve without flag", [
                    curved(b, 4096, CON_12_AMOUNTS.curveNoFlag).modulator,
                    curved(b, 12_288, 1290).modulator
                ])
        },
        {
            label: "the transform 0x8001",
            cents: (1310 * 4096) / 16_384,
            build: (b) =>
                pitchPreset(b, "transform 1", [
                    curved(b, 8192, CON_12_AMOUNTS.transform).modulator,
                    curved(b, 4096, 1310).modulator
                ])
        },
        {
            label: "a curve index for an amount source of another type",
            cents:
                (CON_12_AMOUNTS.amountIndex * 8192) / 16_384 +
                (1330 * 12_288) / 16_384,
            build: (b) =>
                pitchPreset(b, "amount index", [
                    curved(b, 8192, CON_12_AMOUNTS.amountIndex).modulator,
                    curved(b, 12_288, 1330).modulator
                ])
        }
    ]
});

/**
 * The names of CON-20: one that continues in `xdta`, and a short one whose `xdta` half the patch fills.
 */
const LONG_NAME = "CON-20 a preset name of 32 chars";
const SHORT_NAME = "CON-20 short";
const XDTA_GARBAGE = "not part of the name";

/**
 * The size of a `phdr` record, and of its name field.
 */
const PHDR_SIZE = 38;
const NAME_SIZE = 20;

/**
 * The name field of a `phdr` record as text, up to its first zero byte.
 */
function recordName(data: Uint8Array, index: number) {
    const field = data.subarray(
        index * PHDR_SIZE,
        index * PHDR_SIZE + NAME_SIZE
    );
    const end = field.indexOf(0);
    return String.fromCodePoint(
        ...(end === -1 ? field : field.subarray(0, end))
    );
}

const CON_20 = defineTest({
    id: "CON-20",
    title: "Names continued in xdta",
    section: "5.5",
    description: `Two presets of the \`sine\`. One is named "${LONG_NAME}": its first 20 characters fill the \`pdta\` name and the rest is in \`xdta\`. The other is named "${SHORT_NAME}", which ends with a zero byte in \`pdta\`, and its \`xdta\` name field holds "${XDTA_GARBAGE}" anyway. Both play 440 Hz.`,
    pass: `The preset list shows "${LONG_NAME}" and "${SHORT_NAME}": the \`xdta\` half is appended only when the \`pdta\` half fills all 20 characters with no zero byte. A reader that always appends it shows "${SHORT_NAME}${XDTA_GARBAGE}", and one that ignores \`xdta\` shows "${LONG_NAME.slice(0, 20)}".`,
    length: 2,
    bank: (b) => [
        b.preset({ name: LONG_NAME, zones: [{ sample: b.sample("sine") }] }),
        b.preset({ name: SHORT_NAME, zones: [{ sample: b.sample("sine") }] })
    ],
    midi: (m, presets) => m.steps(presets)
});

/**
 * The `xdta` list and its extended modulator records.
 */
export const XDTA_GROUPS: Group[] = [
    readerGroup({
        number: 95,
        slug: "xdta-names",
        title: "Names continued in xdta",
        sections: "5.5",
        intro: "A bank with a preset name continued in `xdta`, and a short one whose `xdta` name field is not empty.",
        test: CON_20,
        patch: (riff) => {
            const pdta = riff.find("LIST:pdta/phdr").data;
            const xdta = riff.find("LIST:INFO/LIST:xdta/phdr");
            const data = new Uint8Array(xdta.data);
            const count = pdta.length / PHDR_SIZE;
            let index = -1;
            for (let i = 0; i < count; i++)
                if (recordName(pdta, i) === SHORT_NAME) index = i;
            if (index === -1)
                throw new Error("CON-20: the short preset name is not in phdr");
            const bytes = [...XDTA_GARBAGE].map((c) => c.codePointAt(0) ?? 0);
            data.set(bytes.slice(0, NAME_SIZE), index * PHDR_SIZE);
            xdta.setData(data);
        },
        checkLoaded: (bank) => {
            const names = bank.presets.map((p) => p.name);
            const problems = new Array<string>();
            for (const name of [LONG_NAME, SHORT_NAME])
                if (!names.includes(name))
                    problems.push(
                        `CON-20: no preset named "${name}" (${names.join(", ")})`
                    );
            return problems;
        }
    }),
    readerGroup({
        number: 81,
        slug: "xdta-missing",
        title: "No xdta",
        sections: "5.5.1",
        intro: "A bank without the `xdta` list.",
        test: CON_09,
        dmod: supersedeDefaults,
        patch: (riff) => {
            patchMod(
                riff.find("LIST:pdta/imod"),
                FLAGGED_PLAIN,
                (r) => (r.transform |= EXTENDED_FLAG)
            );
            riff.find("LIST:INFO/LIST:xdta").remove();
        }
    }),
    readerGroup({
        number: 82,
        slug: "xdta-unsound",
        title: "An xdta without its pgen",
        sections: "5.5",
        intro: "A bank whose `xdta` list has no `pgen`.",
        test: unsoundTest("a sub-chunk missing", "has no `pgen` sub-chunk"),
        dmod: supersedeDefaults,
        patch: (riff) => {
            // With a record of its own, so the records still match and only the broken xdta is wrong
            editMods(riff, "imod", (find) => {
                find(FLAGGED_PLAIN).record.transform |= EXTENDED_FLAG;
            });
            riff.find("LIST:INFO/LIST:xdta/pgen").remove();
        }
    }),
    readerGroup({
        number: 83,
        slug: "xdta-size",
        title: "An xdta with an ibag of another size",
        sections: "5.5",
        intro: "A bank whose `xdta` list has an `ibag` one record longer than the one of `pdta`.",
        test: unsoundTest(
            "an ibag of another size",
            "has an `ibag` one record longer than the `ibag` of `pdta`"
        ),
        dmod: supersedeDefaults,
        patch: (riff) => {
            // With a record of its own, so the records still match and only the broken xdta is wrong
            editMods(riff, "imod", (find) => {
                find(FLAGGED_PLAIN).record.transform |= EXTENDED_FLAG;
            });
            const ibag = riff.find("LIST:INFO/LIST:xdta/ibag");
            ibag.setData(new Uint8Array([...ibag.data, 0, 0, 0, 0]));
        }
    }),
    readerGroup({
        number: 84,
        slug: "xrec-count",
        title: "Too few extended records",
        sections: "5.5.1",
        intro: "A bank whose `xdta` `imod` holds one record too few.",
        test: conElevenTest(
            "one too few",
            "holds one record too few (the last is missing)"
        ),
        patch: (riff) => {
            // The last record before the terminal one goes
            const imod = riff.find("LIST:INFO/LIST:xdta/imod");
            imod.setData(withoutLastRecord(imod.data, XMOD_SIZE));
        }
    }),
    readerGroup({
        number: 92,
        slug: "xrec-many",
        title: "One extended record too many",
        sections: "5.5.1",
        intro: "A bank whose `xdta` `imod` holds one record too many.",
        test: conElevenTest(
            "one too many",
            "holds one record of zeros too many, before the terminal one"
        ),
        patch: (riff) => {
            const imod = riff.find("LIST:INFO/LIST:xdta/imod");
            imod.setData(
                new Uint8Array([...new Uint8Array(XMOD_SIZE), ...imod.data])
            );
        }
    }),
    readerGroup({
        number: 93,
        slug: "xrec-size",
        title: "Extended records of a size that isn't a multiple of 16",
        sections: "5.5.1",
        intro: "A bank whose `xdta` `imod` is 5 bytes longer than its records.",
        test: conElevenTest(
            "not a multiple of 16",
            "is 5 bytes longer than its records, so its size is not a multiple of 16"
        ),
        patch: (riff) => {
            const imod = riff.find("LIST:INFO/LIST:xdta/imod");
            imod.setData(new Uint8Array([...imod.data, 0, 0, 0, 0, 0]));
        }
    }),
    readerGroup({
        number: 85,
        slug: "xrec",
        title: "Extended records that are taken but not used",
        sections: "5.5.1",
        intro: "A bank with extended records that a reader must take and not use.",
        test: CON_12,
        patch: (riff) =>
            editMods(riff, "imod", (find) => {
                const a = CON_12_AMOUNTS;
                find(a.reserved).extended![8] = 1;
                find(a.flagOnly).record.transform |= EXTENDED_FLAG;
                const noFlag = find(a.curveNoFlag);
                noFlag.record.transform &= ~EXTENDED_FLAG;
                noFlag.extended = undefined;
                find(a.transform).record.transform = EXTENDED_FLAG | 1;
                setDword(find(a.amountIndex).extended!, 4, 1);
            })
    })
];

import { type Group } from "../../framework/types";
import { readCurves, setDword, writeCurves } from "../../framework/records";
import {
    curved,
    editMods,
    pitchPreset,
    plain,
    readerGroup,
    type Statement,
    statementTest
} from "./common";

/**
 * What the CON-13 patch writes in place of some curves, by curve index. The modulator of each curve is in its own
 * zone, in the order of the curves.
 */
const CON_13_CURVES: [string, [number, number][] | undefined][] = [
    ["valid", undefined],
    ["no points", []],
    ["valid", undefined],
    ["one point", [[0, 8192]]],
    ["valid", undefined],
    [
        "a decreasing x",
        [
            [0, 0],
            [16_384, 16_384],
            [8192, 4096]
        ]
    ],
    [
        "an x above 16384",
        [
            [0, 0],
            [20_000, 16_384]
        ]
    ],
    [
        "a y above 16384",
        [
            [0, 0],
            [16_384, 20_000]
        ]
    ],
    ["valid", undefined],
    ["valid, but its modulator names a curve past the end", undefined]
];

/**
 * The amount of the CON-13 modulator whose curve index the patch moves past the end.
 */
const PAST_THE_END = 1430;

const CURVE_YS = [4096, 8192, 12_288];

function curveStatements(
    curves: [string, [number, number][] | undefined][],
    valid: (index: number) => boolean,
    firstAmount: number,
    kept: number
): Statement[] {
    return curves.map(([label], i) => {
        const y = CURVE_YS[i % 3];
        const amount = firstAmount + i * 10;
        return {
            label: `curve ${i}, ${label}`,
            cents: plain(kept).cents + (valid(i) ? (amount * y) / 16_384 : 0),
            build: (b) =>
                pitchPreset(b, `curve ${i}`, [
                    curved(b, y, amount).modulator,
                    plain(kept).modulator
                ])
        };
    });
}

const CON_13 = statementTest({
    id: "CON-13",
    title: "Invalid and missing curves",
    section: "5.4",
    description:
        "`CURV` holds ten curves. Curves 1, 3, 5, 6 and 7 are invalid: no points, one point, a decreasing `x`, an `x` above 16384 and a `y` above 16384. The others are valid flat curves. Each curve has a modulator in its own zone, next to a constant modulator, and the modulator of curve 9 names curve 50, past the end.",
    pass: "The modulators on the invalid curves and on the missing curve are ignored. The valid curves keep their numbers, so each modulator on a valid curve gets its own curve.",
    statements: curveStatements(
        CON_13_CURVES,
        (i) => CON_13_CURVES[i][1] === undefined && i !== 9,
        1340,
        240
    )
});

/**
 * The number of curves of CON-14 that are fully stored. The third is cut in the middle, and `dwCurveCount` names
 * two more after it.
 */
const SHORT_CURVES = 2;

const CON_14 = statementTest({
    id: "CON-14",
    rejected: true,
    title: "A CURV that ends early",
    section: "5.4",
    description:
        "`dwCurveCount` is 5, but `CURV` ends in the middle of the third curve.",
    pass: "The bank is rejected: a `CURV` sub-chunk that ends before all of its curves is malformed, and an SFe file with a malformed `CURV` is not valid. There is no reference render.",
    statements: curveStatements(
        [
            ["stored", undefined],
            ["stored", undefined],
            ["cut", undefined],
            ["missing", undefined],
            ["missing", undefined]
        ],
        // The bank is rejected, so the statements only build it and their pitches never play
        () => false,
        1440,
        250
    )
});

const CON_19 = statementTest({
    id: "CON-19",
    rejected: true,
    title: "A CURV with bytes after its curves",
    section: "5.4",
    description:
        "`dwCurveCount` is 3 and the three curves are whole, but `CURV` holds 4 more bytes after the last one.",
    pass: "The bank is rejected: a `CURV` sub-chunk with bytes after its last curve is malformed, and an SFe file with a malformed `CURV` is not valid. There is no reference render.",
    statements: curveStatements(
        [
            ["stored", undefined],
            ["stored", undefined],
            ["stored", undefined]
        ],
        // The bank is rejected, so the statements only build it and their pitches never play
        () => false,
        1440,
        250
    )
});

/**
 * Invalid, missing and malformed custom curves.
 */
export const CURVE_GROUPS: Group[] = [
    readerGroup({
        number: 86,
        slug: "curv",
        title: "Invalid and missing curves",
        sections: "5.4",
        intro: "A bank with invalid curves between valid ones.",
        test: CON_13,
        patch: (riff) => {
            const curv = riff.find("LIST:INFO/CURV");
            const { curves } = readCurves(curv.data);
            for (const [i, [, points]] of CON_13_CURVES.entries())
                if (points) curves[i].points = points;
            curv.setData(writeCurves(curves));
            editMods(riff, "imod", (find) =>
                setDword(find(PAST_THE_END).extended!, 0, 50)
            );
        }
    }),
    readerGroup({
        number: 87,
        slug: "curv-short",
        title: "A CURV that ends early",
        sections: "5.4",
        intro: "A bank whose `CURV` ends in the middle of a curve.",
        test: CON_14,
        expect: "reject",
        patch: (riff) => {
            const curv = riff.find("LIST:INFO/CURV");
            const { curves } = readCurves(curv.data);
            // The third curve loses its last point, and the count names two more curves after it
            const data = writeCurves(
                curves.slice(0, SHORT_CURVES + 1),
                SHORT_CURVES + 3
            );
            curv.setData(data.subarray(0, -4));
        }
    }),
    readerGroup({
        number: 94,
        slug: "curv-long",
        title: "A CURV with bytes after its curves",
        sections: "5.4",
        intro: "A bank whose `CURV` holds 4 bytes after its last curve.",
        test: CON_19,
        expect: "reject",
        patch: (riff) => {
            const curv = riff.find("LIST:INFO/CURV");
            curv.setData(new Uint8Array([...curv.data, 0, 0, 0, 0]));
        }
    })
];

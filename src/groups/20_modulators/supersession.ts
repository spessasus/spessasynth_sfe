import { type BasicSoundBank, GeneratorTypes as G } from "spessasynth_core";
import {
    type BankBuilder,
    cc,
    constant,
    mod,
    none,
    src
} from "../../framework/bank_builder";
import type { Timeline } from "../../framework/midi_writer";
import { defineTest, type PresetRef } from "../../framework/types";
import {
    FULL,
    LINEAR,
    stepLevelDb,
    type Points,
    STAIRCASE,
    stepNotes
} from "./common";

const HALF: Points = [
    [0, 8192],
    [16_384, 8192]
];

/**
 * The default modulators of group 20: only the ones MOD-14, MOD-25 and MOD-31 name, on CC 20
 * to 24, which no other test of the group moves.
 */
export function modulatorDefaults(bank: BasicSoundBank, b: BankBuilder) {
    const staircase = b.curve(STAIRCASE, "DMOD staircase");
    const full = b.curve(FULL, "DMOD full");
    bank.defaultModulators = [
        mod(
            cc(20, { curve: staircase }),
            src(0, { curve: full }),
            G.gain,
            -240
        ),
        ...[21, 22, 23].map((controller) =>
            mod(cc(controller), none(), G.gain, -120)
        ),
        // Two identical modulators for MOD-31: the later one applies
        mod(cc(24), none(), G.gain, -240),
        mod(cc(24), none(), G.gain, -120)
    ];
}

/**
 * One note per step, each with its controller values sent just before it. The reference tone comes first.
 */
function controllerSteps(
    m: Timeline,
    reference: PresetRef,
    steps: [PresetRef, Record<number, number>][]
) {
    stepNotes(
        m,
        reference,
        steps.map(([preset, values]) => ({
            preset,
            at: (t: number) => {
                for (const [controller, value] of Object.entries(values))
                    m.cc(t, 0, Number(controller), value);
            }
        }))
    );
}

/**
 * CC 21 to 23 at 0, apart from one at 127.
 */
function only(controller: number) {
    return { 21: 0, 22: 0, 23: 0, [controller]: 127 };
}

export const MOD_14 = defineTest({
    id: "MOD-14",
    title: "Custom curve modulators are identical only with the same points",
    section: "7.2.1, 7.3",
    description:
        "The bank's `DMOD` holds CC 20 through the staircase of MOD-02, with the No Controller source through a flat full curve as the amount source, to `gain` with -240. With CC 20 at 127: a zone without modulators, then zone A with the same modulator built on other curve entries with the same points and the amount -120, zone B with other points on CC 20 (the linear curve), and zone C where only the amount source's curve differs (flat at half).",
    pass: "The plain zone is 21 dB below the reference tone. Zone A replaces the default modulator, 10.5 dB down: curves with the same points are the same. Zones B and C add to it, 33 and 26.3 dB down.",
    length: 6,
    bank: (b) => {
        const sine = b.sample("sine");
        const zone = (name: string, source: Points, amount: Points) =>
            b.preset({
                name: `MOD-14 ${name}`,
                zones: [
                    {
                        sample: sine,
                        modulators: [
                            mod(
                                cc(20, {
                                    curve: b.curve(
                                        source,
                                        `MOD-14 ${name} source`
                                    )
                                }),
                                src(0, {
                                    curve: b.curve(
                                        amount,
                                        `MOD-14 ${name} amount`
                                    )
                                }),
                                G.gain,
                                -120
                            )
                        ]
                    }
                ]
            });
        return [
            b.reference(),
            b.preset({ name: "MOD-14 plain", zones: [{ sample: sine }] }),
            zone("A", STAIRCASE, FULL),
            zone("B", LINEAR, FULL),
            zone("C", STAIRCASE, HALF)
        ];
    },
    midi: (m, [reference, ...presets]) =>
        controllerSteps(
            m,
            reference,
            presets.map((p) => [p, { 20: 127 }])
        ),
    verify: (r) => {
        const step = 14_336 / 16_384;
        r.near("plain zone in dB", stepLevelDb(r, 0), -24 * step, 0.3);
        r.near("zone A replaces it, in dB", stepLevelDb(r, 1), -12 * step, 0.3);
        r.near("zone B adds, in dB", stepLevelDb(r, 2), -24 * step - 12, 0.3);
        r.near(
            "zone C adds, in dB",
            stepLevelDb(r, 3),
            -24 * step - 12 * step * 0.5,
            0.3
        );
    }
});

export const MOD_25 = defineTest({
    id: "MOD-25",
    title: "Zone modulators against default modulators",
    section: "7.3",
    description:
        "The bank's `DMOD` holds CC 21, CC 22 and CC 23, each linear to `gain` with -120. Each pair of notes moves one of them to 127, first on a zone without modulators, then on a zone with: an instrument zone modulator CC 21 to `gain` with -240, an instrument zone modulator CC 22 to `gain` with 0, and a preset zone modulator CC 23 to `gain` with -120.",
    pass: "The plain zone is 12 dB below the reference tone each time. The CC 21 zone is 24 dB down: an identical instrument modulator replaces the default. The CC 22 zone has the reference level: an amount of 0 switches the default off. The CC 23 zone is 24 dB down: a preset modulator adds to the default.",
    length: 7,
    bank: (b) => {
        const sine = b.sample("sine");
        return {
            reference: b.reference(),
            plain: b.preset({
                name: "MOD-25 plain",
                zones: [{ sample: sine }]
            }),
            replace: b.preset({
                name: "MOD-25 replace",
                zones: [
                    {
                        sample: sine,
                        modulators: [mod(cc(21), none(), G.gain, -240)]
                    }
                ]
            }),
            off: b.preset({
                name: "MOD-25 off",
                zones: [
                    {
                        sample: sine,
                        modulators: [mod(cc(22), none(), G.gain, 0)]
                    }
                ]
            }),
            add: b.preset({
                name: "MOD-25 add",
                zones: [{ sample: sine }],
                presetModulators: [mod(cc(23), none(), G.gain, -120)]
            })
        };
    },
    midi: (m, p) => {
        controllerSteps(m, p.reference, [
            [p.plain, only(21)],
            [p.replace, only(21)],
            [p.plain, only(22)],
            [p.off, only(22)],
            [p.plain, only(23)],
            [p.add, only(23)]
        ]);
    },
    verify: (r) => {
        const one = -12;
        for (const [i, label] of ["CC 21", "CC 22", "CC 23"].entries())
            r.near(
                `${label} on the plain zone, in dB`,
                stepLevelDb(r, i * 2),
                one,
                0.3
            );
        r.near("CC 21 replaced, in dB", stepLevelDb(r, 1), 2 * one, 0.3);
        r.near("CC 22 switched off, in dB", stepLevelDb(r, 3), 0, 0.3);
        r.near(
            "CC 23 added by the preset zone, in dB",
            stepLevelDb(r, 5),
            2 * one,
            0.3
        );
    }
});

export const MOD_31 = defineTest({
    id: "MOD-31",
    title: "Of two identical modulators the earlier one is ignored",
    section: "7.3, 7.4",
    description:
        "The reference tone. Then an instrument zone with two constant modulators to `gain`, -120 and then -240. Then a preset zone with the same two. Then a zone without modulators while CC 24 is at 127. The bank's `DMOD` holds CC 24 to `gain` twice, -240 and then -120.",
    pass: "The first two notes are 24 dB below the reference tone and the third is 12 dB below it. In a zone and in `DMOD` the later of two identical modulators applies and the earlier one is ignored. Adding them up would give 36 dB, and keeping the first 12 dB in a zone and 24 dB in `DMOD`.",
    length: 4,
    bank: (b) => {
        const sine = b.sample("sine");
        return {
            reference: b.reference(),
            zone: b.preset({
                name: "MOD-31 zone",
                zones: [
                    {
                        sample: sine,
                        modulators: [
                            constant(G.gain, -120),
                            constant(G.gain, -240)
                        ]
                    }
                ]
            }),
            presetZone: b.preset({
                name: "MOD-31 preset zone",
                zones: [{ sample: sine }],
                presetModulators: [
                    constant(G.gain, -120),
                    constant(G.gain, -240)
                ]
            }),
            plain: b.preset({
                name: "MOD-31 plain",
                zones: [{ sample: sine }]
            })
        };
    },
    midi: (m, p) =>
        controllerSteps(m, p.reference, [
            [p.zone, {}],
            [p.presetZone, {}],
            [p.plain, { 24: 127 }]
        ]),
    verify: (r) => {
        r.db("instrument zone, in dB", stepLevelDb(r, 0), -24);
        r.db("preset zone, in dB", stepLevelDb(r, 1), -24);
        r.db("DMOD, in dB", stepLevelDb(r, 2), -12);
    }
});

import {
    BasicSoundBank,
    CustomCurve,
    GeneratorTypes as G,
    Modulator,
    ModulatorSource
} from "spessasynth_core";
import { destinationSum, withState } from "../../framework/modulator_eval";
import { levelDb } from "../../framework/measure";
import { defineTest, type Group } from "../../framework/types";
import type { RIFFFile } from "../../framework/patch";
import { withoutLastRecord, XMOD_SIZE } from "../../framework/records";
import { readerGroup } from "./common";

/**
 * The default modulators with a custom curve, which the XMOD tests make ignored. The tests name them by their
 * controllers, so the build stops if the list changes.
 */
function curvedDefaults() {
    const list = new BasicSoundBank().defaultModulators.filter(
        (m) =>
            m.primarySource.curve instanceof CustomCurve ||
            m.secondarySource.curve instanceof CustomCurve
    );
    const controllers = list.map((m) => m.primarySource.index as number);
    if (
        controllers.length !== 3 ||
        ![72, 73, 75].every((c) => controllers.includes(c))
    )
        throw new Error(
            `CON-08: the default modulators with a custom curve are on CC ${controllers.join(", ")}, the test expects 72, 73 and 75`
        );
}

/**
 * The level of CC 7 at 64 against 100 in dB, from the default list.
 */
function volumeStep() {
    const defaults = new BasicSoundBank().defaultModulators;
    const at = (v: number) =>
        destinationSum(
            defaults,
            G.initialAttenuation,
            withState({ cc: { 7: v } })
        );
    // Against its reset value of 100
    return -(at(64) - at(100)) / 10;
}

/**
 * The XMOD test: one test, played by the four banks whose XMOD is broken in four ways.
 */
function xmodTest(part: string) {
    return defineTest({
        id: "CON-08",
        title: `A broken XMOD (${part})`,
        section: "5.3, 7.3",
        description:
            "`DMOD` holds the default modulator list of a new bank, whose modulators of CC 72, 73 and 75 have custom curves and the extended flag. Their records in `XMOD` can't be matched. The `sine` with an attack of 0.1 s and CC 73 at 127. Then the `sine` with a release of 0.1 s, CC 72 at 127 and a note off. Then a zone with `decayVolEnv` -1200 and `sustainVolEnv` 240, with CC 75 at 127. Then the `sine` with CC 7 at its reset value of 100 and at 64. Last, a zone with a modulator identical to the default one of CC 73, whose own record in `xdta` is intact, with CC 73 at 127.",
        pass: `CC 72, 73 and 75 do nothing: the first note has the same level 0.25 s and 0.5 s in (its attack of 0.1 s is over), the second is at least 30 dB down 0.15 s after its note off, the third is 24 dB down 0.3 s in. CC 7 still works: ${volumeStep().toFixed(2)} dB at 64 against 100. The zone modulator acts and gives a slow attack: at least 3 dB down 50 ms in.`,
        length: 7,
        bank: (b) => {
            curvedDefaults();
            const attack = b.bank.defaultModulators.find(
                (m) => m.primarySource.index === 73
            )!;
            // A copy of a default source gets a copy of its curve, which the bank must hold
            const source = ModulatorSource.copyFrom(attack.primarySource);
            if (
                source.curve instanceof CustomCurve &&
                !b.bank.customCurves.includes(source.curve)
            )
                b.bank.addCustomCurves(source.curve);
            return {
                plain: b.reference(),
                // 0.1 s, so a working CC 73 or CC 72 at 127 stretches it to about 10.5 s or 0.77 s
                slowAttack: b.tone("CON-08 attack 0.1 s", {
                    [G.attackVolEnv]: -3986
                }),
                slowRelease: b.tone("CON-08 release 0.1 s", {
                    [G.releaseVolEnv]: -3986
                }),
                decay: b.tone("CON-08 decay", {
                    [G.decayVolEnv]: -1200,
                    [G.sustainVolEnv]: 240
                }),
                attack: b.tone("CON-08 own attack modulator", {}, [
                    new Modulator(
                        source,
                        ModulatorSource.copyFrom(attack.secondarySource),
                        attack.destination,
                        attack.transformAmount,
                        attack.transformType
                    )
                ])
            };
        },
        midi: (m, p) => {
            m.program(0, 0, p.slowAttack);
            m.cc(0, 0, 73, 127);
            m.note(0.05, 0.6);
            m.cc(0.9, 0, 73, 64);
            m.program(1, 0, p.slowRelease);
            m.cc(1, 0, 72, 127);
            m.note(1.05, 0.3);
            m.cc(1.9, 0, 72, 64);
            m.program(2, 0, p.decay);
            m.cc(2, 0, 75, 127);
            m.note(2.05, 0.6);
            m.cc(2.9, 0, 75, 64);
            m.program(3, 0, p.plain);
            m.note(3.05, 0.4);
            m.cc(3.5, 0, 7, 64);
            m.note(3.55, 0.4);
            m.cc(3.98, 0, 7, 100);
            m.program(4, 0, p.attack);
            m.cc(4, 0, 73, 127);
            m.note(4.05, 1.5);
            m.cc(6.9, 0, 73, 64);
        },
        verify: (r) => {
            const level = (from: number, to: number) => levelDb(r.at(from, to));
            const full = level(3.15, 3.4);
            // The attack of 0.1 s is over by 0.15 s. A working CC 73 at 127 stretches it to about 10.5 s.
            const risen = level(0.3, 0.35) - level(0.5, 0.6);
            r.check(
                "CC 73 does nothing: the same level 0.25 s and 0.5 s in",
                risen > -1,
                `${risen.toFixed(1)} dB`
            );
            // The note off is at 1.35 s. A working CC 72 at 127 stretches the release of 0.1 s to about 0.77 s.
            r.check(
                "CC 72 does nothing: at least 30 dB down 0.15 to 0.2 s after the note off",
                level(1.5, 1.55) - full < -30,
                `${(level(1.5, 1.55) - full).toFixed(1)} dB`
            );
            r.near(
                "CC 75 does nothing: 0.3 s in, in dB",
                level(2.34, 2.36) - full,
                -24,
                0.5
            );
            r.db("CC 7 at 64, in dB", level(3.65, 3.9) - full, volumeStep());
            r.check(
                "the zone modulator acts: a slow attack",
                level(4.09, 4.11) - level(5.3, 5.5) < -3,
                `${(level(4.09, 4.11) - level(5.3, 5.5)).toFixed(1)} dB`
            );
        }
    });
}

/**
 * Broken `XMOD` sub-chunks.
 */
export const XMOD_GROUPS: Group[] = [
    ...(
        [
            [
                77,
                "xmod-missing",
                "no `XMOD`",
                (riff: RIFFFile) => riff.find("LIST:INFO/XMOD").remove()
            ],
            [
                78,
                "xmod-few",
                "one record too few",
                (riff: RIFFFile) => {
                    const xmod = riff.find("LIST:INFO/XMOD");
                    xmod.setData(withoutLastRecord(xmod.data, XMOD_SIZE));
                }
            ],
            [
                79,
                "xmod-many",
                "one record too many",
                (riff: RIFFFile) => {
                    const xmod = riff.find("LIST:INFO/XMOD");
                    xmod.setData(
                        new Uint8Array([
                            ...xmod.data,
                            ...new Uint8Array(XMOD_SIZE)
                        ])
                    );
                }
            ],
            [
                80,
                "xmod-size",
                "5 bytes too long",
                (riff: RIFFFile) => {
                    const xmod = riff.find("LIST:INFO/XMOD");
                    xmod.setData(new Uint8Array([...xmod.data, 0, 0, 0, 0, 0]));
                }
            ]
        ] as const
    ).map(([number, slug, what, patch]) =>
        readerGroup({
            number: number,
            slug: slug,
            title: `A broken XMOD: ${what}`,
            sections: "5.3, 7.3",
            intro: `The default modulator list of a new bank in \`DMOD\`, with ${what} in \`XMOD\`.`,
            test: xmodTest(what),
            dmod: "default",
            patch
        })
    )
];

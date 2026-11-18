import { type BasicSoundBank, GeneratorTypes as G } from "spessasynth_core";
import { mod, none, src } from "../../framework/bank_builder";
import { centsFrom440, frequency, levelDb } from "../../framework/measure";
import { destinationSum, withState } from "../../framework/modulator_eval";
import { defineTest } from "../../framework/types";
import { noteBalance, stepLevelDb, vibratoDepth } from "./common";

export const DEF_14 = defineTest({
    id: "DEF-14",
    title: "An empty DMOD",
    section: "7.3",
    description:
        "In a bank whose `DMOD` holds only the terminal record: the `sine` at velocity 127, then at velocity 16, with CC 7 at 0, with the pitch wheel fully up, with CC 10 at 0, and with CC 1 at 127.",
    pass: "All six notes are the same: the same level, 440 Hz, centered, no vibrato. The synthesizer adds no default modulator of its own.",
    length: 6,
    bank: (b) => [b.reference()],
    midi: (m, [reference]) => {
        m.steps([reference]);
        const steps: ((t: number) => void)[] = [
            () => undefined,
            (t) => m.cc(t, 0, 7, 0),
            (t) => m.pitchWheel(t, 0, 16_383),
            (t) => m.cc(t, 0, 10, 0),
            (t) => m.cc(t, 0, 1, 127)
        ];
        for (const [i, step] of steps.entries()) {
            const t = i + 1;
            m.program(t, 0, reference);
            step(t);
            m.note(t + 0.05, 0.75, { vel: i === 0 ? 16 : 127 });
        }
    },
    verify: (r) => {
        const balance = (t: number) => noteBalance(r, t);
        for (const [i, label] of [
            "velocity 16",
            "CC 7 at 0",
            "the pitch wheel up",
            "CC 10 at 0",
            "CC 1 at 127"
        ].entries()) {
            r.db(`${label}: level in dB`, stepLevelDb(r, i), 0);
            r.cents(
                `${label}: pitch in cents`,
                centsFrom440(frequency(r.at(i + 1.25, i + 1.75))),
                0
            );
            r.db(`${label}: balance in dB`, balance(i + 1) - balance(0), 0);
            // A vibrato of the synthesizer's own would not move the mean pitch, so its swing is checked too
            r.cents(
                `${label}: vibrato to each side in cents`,
                vibratoDepth(r, i + 1.2, i + 1.8),
                0
            );
        }
    }
});

/**
 * The list of group 32: velocity to `fineTune`, and velocity to `initialAttenuation` with 480 in place of 960.
 */
function ownList() {
    return [
        mod(src(2), none(), G.fineTune, 1200),
        mod(
            src(2, { curve: "concave", negative: true }),
            none(),
            G.initialAttenuation,
            480
        )
    ];
}

/**
 * Sets the list of group 32 as the bank's default modulators.
 */
export function ownDefaults(bank: BasicSoundBank) {
    bank.defaultModulators = ownList();
}

const VELOCITIES = [127, 96, 64, 32];

export const DEF_15 = defineTest({
    id: "DEF-15",
    title: "A DMOD of the bank's own",
    section: "7.3",
    description:
        "In a bank whose `DMOD` holds Note-On Velocity to `fineTune` with 1200, and Note-On Velocity to `initialAttenuation` with 480 in place of 960: the `sine` at velocities 127, 96, 64 and 32.",
    pass: "The pitch rises with the velocity (600 cents at 64, an octave at 127), and the level follows a 48 dB concave curve: half as far down as with the usual list, 6 dB at 64.",
    length: 4,
    bank: (b) => [b.reference()],
    midi: (m, [reference]) => {
        for (const [i, v] of VELOCITIES.entries()) {
            m.program(i, 0, reference);
            m.note(i, 0.8, { vel: v });
        }
    },
    verify: (r) => {
        const list = ownList();
        for (const [i, v] of VELOCITIES.entries()) {
            const state = withState({ other: { 2: v * 128 } });
            r.cents(
                `velocity ${v}: pitch in cents`,
                centsFrom440(frequency(r.at(i + 0.25, i + 0.75))),
                destinationSum(list, G.fineTune, state)
            );
            const attenuation =
                destinationSum(list, G.initialAttenuation, state) -
                destinationSum(list, G.initialAttenuation, withState({}));
            r.db(
                `velocity ${v}: level against 127 in dB`,
                levelDb(r.at(i + 0.25, i + 0.75)) - levelDb(r.at(0.25, 0.75)),
                -attenuation / 10
            );
        }
    }
});

import { GeneratorTypes as G } from "spessasynth_core";
import type { BankBuilder } from "../../framework/bank_builder";
import { levelDb } from "../../framework/measure";
import type { Timeline } from "../../framework/midi_writer";
import { defineTest, type TestRender } from "../../framework/types";
import {
    ccCents,
    ccProbe,
    probeNote,
    probePitch,
    probes,
    PROBE_SPACING,
    sourceCents
} from "./probes";

/**
 * The level in dB of a stretch against the level of a held note at the start of the test.
 */
function levelAgainstHeld(r: TestRender, from: number, to: number) {
    return levelDb(r.at(from, to)) - levelDb(r.at(0.15, 0.3));
}

/**
 * Checks that the long release (48 dB/s) runs from a message at the time: still clearly audible 0.2 s later, and
 * 14.4 dB lower 0.5 s after the message than 0.2 s after it. Both points are on the release, so a synthesizer that
 * smooths the level (spec section 8.1) moves them alike. A cut is silent at both, and a note that goes on does not
 * fall.
 */
function checkReleased(r: TestRender, label: string, time: number) {
    const early = levelAgainstHeld(r, time + 0.15, time + 0.25);
    r.check(
        `${label}: still sounding 0.2 s later, at least -30 dB`,
        early > -30,
        `${early.toFixed(1)} dB`
    );
    r.near(
        `${label}: from 0.2 to 0.5 s after it, in dB`,
        levelAgainstHeld(r, time + 0.45, time + 0.55) - early,
        -14.4,
        1.5
    );
}

/**
 * A `sine` with a release of 2 s, so a release and a cut look different. Made once per bank.
 */
function longRelease(b: BankBuilder) {
    return b.shared("long release", () =>
        b.tone("long release", { [G.releaseVolEnv]: 1200 })
    );
}

export const MID_12 = defineTest({
    id: "MID-12",
    title: "The sustain pedal holds from 64",
    section: "11.5",
    description:
        "A note of the `sine` of 0.3 s with a release of 0.1 s and CC 64 at 63. Then the same note with CC 64 at 64, and the pedal released about 0.65 s after its note off.",
    pass: "With 63 the note ends right after its note off. With 64 it is held after its note off and ends when the pedal goes up.",
    length: 3.5,
    bank: (b) => b.reference(),
    midi: (m, reference) => {
        m.program(0, 0, reference);
        m.cc(0, 0, 64, 63);
        m.note(0.05, 0.3);
        m.cc(1.5, 0, 64, 64);
        m.note(1.55, 0.3);
        m.cc(2.5, 0, 64, 0);
    },
    verify: (r) => {
        r.check(
            "63: ended after the note off",
            levelAgainstHeld(r, 0.6, 0.9) < -60
        );
        r.db(
            "64: held after the note off, in dB",
            levelAgainstHeld(r, 2, 2.4),
            0
        );
        r.check(
            "64: ended after the pedal went up",
            levelAgainstHeld(r, 2.8, 3.2) < -60
        );
    }
});

export const MID_13 = defineTest({
    id: "MID-13",
    title: "All Sound Off cuts, All Notes Off releases",
    section: "11.5",
    description:
        "A held note with a release of 2 s, ended by CC 120. Then the same note ended by CC 123.",
    pass: "CC 120 cuts the note at once, silent 0.1 s later. CC 123 releases it: it falls 48 dB per second, 14.4 dB from 0.2 s to 0.5 s after the message. A synthesizer may smooth the cut against clicks (spec section 8.1), and a cut that takes longer than 0.1 s fails here.",
    length: 4,
    bank: (b) => longRelease(b),
    midi: (m, preset) => {
        m.program(0, 0, preset);
        m.note(0.05, 3.5);
        m.cc(0.5, 0, 120, 0);
        m.noteOn(1.5, 0, 69, 127);
        m.cc(2, 0, 123, 0);
    },
    verify: (r) => {
        r.check(
            "CC 120: cut within 0.1 s",
            levelAgainstHeld(r, 0.6, 0.65) < -60
        );
        checkReleased(r, "CC 123", 2);
    }
});

export const MID_14 = defineTest({
    id: "MID-14",
    title: "All Notes Off with the pedal down",
    section: "11.5",
    description:
        "A note with a release of 0.1 s and CC 64 at 127. CC 123 at 0.5 s, the pedal released at 1.5 s, the note off at 2 s.",
    pass: "The note goes on after CC 123 and ends when the pedal goes up: All Notes Off acts as a note off, which the pedal holds.",
    length: 3,
    bank: (b) => b.reference(),
    midi: (m, reference) => {
        m.program(0, 0, reference);
        m.cc(0, 0, 64, 127);
        m.noteOn(0.05, 0, 69, 127);
        m.cc(0.5, 0, 123, 0);
        m.cc(1.5, 0, 64, 0);
        m.noteOff(2, 0, 69);
    },
    verify: (r) => {
        r.db("held after CC 123, in dB", levelAgainstHeld(r, 0.8, 1.4), 0);
        r.check(
            "ended after the pedal went up",
            levelAgainstHeld(r, 1.8, 1.95) < -60
        );
    }
});

const MODE_MESSAGES = [124, 125, 126, 127];

export const MID_15 = defineTest({
    id: "MID-15",
    title: "Omni and mono messages",
    section: "11.5",
    description:
        "A held note with a release of 2 s, ended by CC 124, then by CC 125, CC 126 and CC 127.",
    pass: "All four release the note, as CC 123 does: it falls 48 dB per second, 14.4 dB from 0.2 s to 0.5 s after the message. CC 126 and 127 do not cut it, as MIDI 1.0 has them act as All Notes Off.",
    length: 8,
    bank: (b) => longRelease(b),
    midi: (m, preset) => {
        m.program(0, 0, preset);
        // The times of the mode messages
        return MODE_MESSAGES.map((controller, i) => {
            m.noteOn(i * 2 + 0.05, 0, 69, 127);
            m.cc(i * 2 + 0.5, 0, controller, 0);
            m.noteOff(i * 2 + 1.9, 0, 69);
            return i * 2 + 0.5;
        });
    },
    verify: (r, _preset, messages) => {
        for (const [i, controller] of MODE_MESSAGES.entries()) {
            checkReleased(r, `CC ${controller}`, messages[i]);
        }
    }
});

/**
 * The controllers that Reset All Controllers sets back, and the ones it keeps (spec section 11.5).
 */
const RESET = [1, 11, 33, 43, 64, 65, 66, 67];
const KEPT = [
    7, 10, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 91, 92, 93, 94, 95
];

/**
 * The value each controller is moved to before CC 121.
 */
function moved(controller: number) {
    return controller === 10 ? 20 : 30;
}

/**
 * Plays the probes of MID-16 from the time.
 */
function playChecks(
    m: Timeline,
    time: number,
    p: ReturnType<typeof MID_16.bank>
) {
    let t = time;
    for (const preset of [
        ...p.reset,
        ...p.kept,
        p.wheel,
        p.channelPressure,
        p.polyPressure,
        p.sensitivity
    ]) {
        probeNote(m, t, preset);
        t += PROBE_SPACING;
    }
}

export const MID_16 = defineTest({
    id: "MID-16",
    title: "Reset All Controllers",
    section: "11.5",
    description:
        "A preset of its own is selected (300 cents up), RPN 0 is set to 4 semitones, and every controller, the pitch wheel and both pressures are moved. RPN 0 stays selected. Then CC 121, a data entry MSB of 12, and a note without a Program Change. Then probes for CC 1, 11, 33, 43 and 64 to 67, for CC 7, 10, 70 to 79 and 91 to 95, for the pitch wheel, both pressures and the Pitch Wheel Sensitivity.",
    pass: "The note after CC 121 plays the selected preset, 300 cents up: the bank and the program are kept. The probes of CC 1, 11, 33, 43, 64 to 67, the pitch wheel and both pressures play 440 Hz: they are reset. The probes of CC 7, 10, 70 to 79 and 91 to 95 keep their moved values, and the sensitivity probe plays 100 cents up: the data entry after CC 121 went nowhere, since the selected parameter became null, and RPN 0 kept its 4 semitones.",
    length: 8,
    bank: (b) => {
        const set = probes(b);
        return {
            own: b.preset({
                name: "MID-16 own preset",
                program: 120,
                bankMSB: 5,
                zones: [
                    {
                        sample: b.sample("sine"),
                        generators: { [G.fineTune]: 300 }
                    }
                ]
            }),
            reset: RESET.map((c) => set.cc.get(c) ?? ccProbe(b, c)),
            kept: KEPT.map((c) => set.cc.get(c) ?? ccProbe(b, c)),
            wheel: set.source.get("pitchWheel")!,
            channelPressure: set.source.get("channelPressure")!,
            polyPressure: set.source.get("polyPressure")!,
            sensitivity: set.source.get("sensitivity")!
        };
    },
    midi: (m, p) => {
        m.program(0, 0, p.own);
        m.rpn(0, 0, [0, 0], 4, 0);
        for (const c of [...RESET, ...KEPT]) m.cc(0.02, 0, c, moved(c));
        m.pitchWheel(0.02, 0, 12_000);
        m.channelPressure(0.02, 0, 60);
        m.polyPressure(0.02, 0, 69, 60);
        m.cc(0.1, 0, 121, 0);
        m.cc(0.15, 0, 6, 12);
        m.note(0.2, 0.15);
        playChecks(m, 0.5, p);
    },
    verify: (r) => {
        r.cents(
            "the selected preset after CC 121, in cents",
            probePitch(r, 0.2),
            300
        );
        let t = 0.5;
        for (const c of RESET) {
            r.cents(`CC ${c} is reset, in cents`, probePitch(r, t), 0);
            t += PROBE_SPACING;
        }
        for (const c of KEPT) {
            r.cents(
                `CC ${c} is kept, in cents`,
                probePitch(r, t),
                ccCents(c, moved(c))
            );
            t += PROBE_SPACING;
        }
        for (const label of [
            "pitch wheel",
            "channel pressure",
            "poly pressure"
        ]) {
            r.cents(`the ${label} is reset, in cents`, probePitch(r, t), 0);
            t += PROBE_SPACING;
        }
        r.cents(
            "RPN 0 is kept at 4 semitones, in cents",
            probePitch(r, t),
            sourceCents("sensitivity", 512)
        );
    }
});

export const MID_22 = defineTest({
    id: "MID-22",
    title: "A Note On with the velocity 0 is a note off",
    section: "11.5",
    description:
        "The reference tone at key 69, held from 0.05 s with its own note off at 1.5 s. At 0.6 s a Note On for key 69 with the velocity 0.",
    pass: "The note ends at 0.6 s and is silent from 0.7 s on: the Note On with the velocity 0 is its note off. A synthesizer that ignores it, or starts a new note with it, keeps a note sounding after 0.6 s.",
    length: 2,
    bank: (b) => b.reference(),
    midi: (m, preset) => {
        m.program(0, 0, preset);
        m.noteOn(0.05, 0, 69);
        m.noteOn(0.6, 0, 69, 0);
        m.noteOff(1.5, 0, 69);
    },
    verify: (r) => {
        const level = levelAgainstHeld(r, 0.7, 1.4);
        r.check(
            "silent from 0.7 s on, 60 dB or more below the held note",
            level < -60,
            `${level.toFixed(1)} dB`
        );
    }
});

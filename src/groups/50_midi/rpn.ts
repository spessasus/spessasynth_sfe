import { defineTest } from "../../framework/types";
import { ccCents, probeNote, probePitch, probes, sourceCents } from "./probes";

/**
 * The 14-bit value of the Pitch Wheel Sensitivity for semitones and cents, rounded down (spec section 7.2).
 */
function sensitivity(semitones: number, cents: number) {
    return Math.min(16_383, Math.floor((semitones + cents / 100) * 128));
}

export const MID_07 = defineTest({
    id: "MID-07",
    title: "A data entry applies with either half",
    section: "11.4",
    description:
        "RPN 0 selected and only a data entry MSB of 4 sent, then the Pitch Wheel Sensitivity probe. Then RPN 0 selected again and only a data entry LSB of 50 sent, then the probe.",
    pass: "The first probe plays 100 cents up (4 semitones). The second plays 75 cents down (0 semitones and 50 cents): each half applies when it arrives, and selecting the parameter set the stored MSB to 0.",
    length: 1,
    bank: (b) => probes(b).source.get("sensitivity")!,
    midi: (m, probe) => {
        m.cc(0, 0, 101, 0);
        m.cc(0, 0, 100, 0);
        m.cc(0, 0, 6, 4);
        probeNote(m, 0.05, probe);
        m.cc(0.5, 0, 101, 0);
        m.cc(0.5, 0, 100, 0);
        m.cc(0.5, 0, 38, 50);
        probeNote(m, 0.55, probe);
    },
    verify: (r) => {
        r.cents(
            "MSB only, in cents",
            probePitch(r, 0.05),
            sourceCents("sensitivity", sensitivity(4, 0))
        );
        r.cents(
            "LSB only, in cents",
            probePitch(r, 0.55),
            sourceCents("sensitivity", sensitivity(0, 50))
        );
    }
});

const DEPTHS: [number, number][] = [
    [1, 64],
    [0, 32],
    [2, 0]
];

export const MID_08 = defineTest({
    id: "MID-08",
    title: "Modulation Depth Range",
    section: "11.4",
    description:
        "The Modulation Depth Range probe with RPN 5 at 1 semitone and LSB 64, 0 semitones and LSB 32, and 2 semitones.",
    pass: "400 cents up, 100 cents down and 600 cents up: the range is the MSB in semitones plus the LSB in 100/128 cents, read as `min(16383, 8 * v)`.",
    length: 1.5,
    bank: (b) => probes(b).source.get("depthRange")!,
    midi: (m, probe) =>
        DEPTHS.map(([msb, lsb], i) => {
            m.rpn(i * 0.5, 0, [0, 5], msb, lsb);
            return probeNote(m, i * 0.5 + 0.05, probe);
        }),
    verify: (r, _probe, notes) => {
        for (const [i, [msb, lsb]] of DEPTHS.entries())
            r.cents(
                `RPN 5 at ${msb} and ${lsb} in cents`,
                probePitch(r, notes[i]),
                sourceCents(
                    "depthRange",
                    Math.min(16_383, 8 * (msb * 128 + lsb))
                )
            );
    }
});

export const MID_09 = defineTest({
    id: "MID-09",
    title: "The null parameter, and selecting resets the data entry",
    section: "11.4",
    description:
        "RPN 0 selected with a data entry of MSB 12 and LSB 64, then the Pitch Wheel Sensitivity probe. Then RPN null (127, 127) selected with a data entry MSB of 5, and the probe. Then RPN 0 selected again and only a data entry MSB of 2 sent, and the probe.",
    pass: "531.6 cents up twice: 12 semitones and 64 cents (12.64 times 128 is 1617.9, rounded down), and the data entry after the null parameter does nothing. Then 440 Hz: 2 semitones and 0 cents, since selecting RPN 0 set the stored LSB of 64 back to 0.",
    length: 1.5,
    bank: (b) => probes(b).source.get("sensitivity")!,
    midi: (m, probe) => {
        m.rpn(0, 0, [0, 0], 12, 64);
        probeNote(m, 0.05, probe);
        m.rpn(0.5, 0, [0x7f, 0x7f], 5);
        probeNote(m, 0.55, probe);
        m.rpn(1, 0, [0, 0], 2);
        probeNote(m, 1.05, probe);
    },
    verify: (r) => {
        const twelveSixtyFour = sourceCents("sensitivity", sensitivity(12, 64));
        r.cents(
            "RPN 0 at 12 and 64, in cents",
            probePitch(r, 0.05),
            twelveSixtyFour
        );
        r.cents(
            "after a data entry to the null parameter, in cents",
            probePitch(r, 0.55),
            twelveSixtyFour
        );
        r.cents(
            "RPN 0 selected again with only an MSB of 2, in cents",
            probePitch(r, 1.05),
            0
        );
    }
});

export const MID_10 = defineTest({
    id: "MID-10",
    title: "The last selected parameter gets the data entry",
    section: "11.4",
    description:
        "RPN 0 selected with a data entry MSB of 4. Then the NRPN for CC 74 (1, 32) selected with a data entry MSB of 100. Then the CC 74 probe and the Pitch Wheel Sensitivity probe.",
    pass: "The CC 74 probe plays 1828.5 cents up (CC 74 at 100) and the sensitivity probe 100 cents up (still 4 semitones): the NRPN got the second data entry and the RPN kept its value.",
    length: 1,
    bank: (b) => ({
        cc74: probes(b).cc.get(74)!,
        sensitivity: probes(b).source.get("sensitivity")!
    }),
    midi: (m, p) => {
        m.rpn(0, 0, [0, 0], 4);
        m.nrpn(0.02, 0, [0x01, 0x20], 100);
        probeNote(m, 0.05, p.cc74);
        probeNote(m, 0.55, p.sensitivity);
    },
    verify: (r) => {
        r.cents("CC 74 probe in cents", probePitch(r, 0.05), ccCents(74, 100));
        r.cents(
            "sensitivity probe in cents",
            probePitch(r, 0.55),
            sourceCents("sensitivity", sensitivity(4, 0))
        );
    }
});

/**
 * The non-registered parameters that set a controller (spec section 11.4).
 */
const NRPNS: [number, number][] = [
    [0x08, 76],
    [0x09, 77],
    [0x0a, 78],
    [0x20, 74],
    [0x21, 71],
    [0x63, 73],
    [0x64, 75],
    [0x66, 72]
];

export const MID_11 = defineTest({
    id: "MID-11",
    title: "The NRPNs that set a controller",
    section: "11.4",
    description:
        "For each of the eight NRPNs (1, 8), (1, 9), (1, 10), (1, 32), (1, 33), (1, 99), (1, 100) and (1, 102): the NRPN with a data entry MSB of 90 and the probe of its controller. Then the controller set back to 64, the controller itself sent at 90, and the probe.",
    pass: "Each pair plays the same pitch, 1320.7 cents up (90): the NRPN sets CC 76, 77, 78, 74, 71, 73, 75 and 72 to its data MSB.",
    length: 8,
    bank: (b) => NRPNS.map(([, controller]) => probes(b).cc.get(controller)!),
    midi: (m, presets) => {
        for (const [i, [lsb, controller]] of NRPNS.entries()) {
            const t = i;
            m.nrpn(t, 0, [0x01, lsb], 90);
            probeNote(m, t + 0.05, presets[i]);
            m.cc(t + 0.4, 0, controller, 64);
            m.cc(t + 0.45, 0, controller, 90);
            probeNote(m, t + 0.5, presets[i]);
            m.cc(t + 0.9, 0, controller, 64);
        }
    },
    verify: (r) => {
        for (const [i, [lsb, controller]] of NRPNS.entries()) {
            r.cents(
                `NRPN (1, ${lsb}) in cents`,
                probePitch(r, i + 0.05),
                ccCents(controller, 90)
            );
            r.cents(
                `CC ${controller} in cents`,
                probePitch(r, i + 0.5),
                ccCents(controller, 90)
            );
        }
    }
});

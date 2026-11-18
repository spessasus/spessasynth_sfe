import { MODE_MESSAGES, type Timeline } from "../../framework/midi_writer";
import { defineTest } from "../../framework/types";
import {
    DEFAULT_PROBE_COUNT,
    ccCents,
    checkProbes,
    defaultProbes,
    LSB_CCS,
    NONZERO_CCS,
    playProbes,
    PROBE_SPACING,
    probeNote,
    probePitch,
    probes,
    ZERO_CCS
} from "./probes";

export const MID_01 = defineTest({
    id: "MID-01",
    title: "Controller defaults after a reset",
    section: "11.3",
    description:
        "After the GS Reset of the preamble, one probe note per controller of the defaults table (CC 7, 8, 10, 11, 71 to 78, 81, 83 and 91). Each probe maps its controller to the pitch, tuned so that the default of spec section 11.3 plays 440 Hz, and each step away from it 50 cents.",
    pass: "Every probe plays 440 Hz.",
    length: NONZERO_CCS.length * PROBE_SPACING + 0.5,
    bank: (b) => {
        const set = probes(b);
        return NONZERO_CCS.map((c) => ({
            label: `CC ${c}`,
            preset: set.cc.get(c)!
        }));
    },
    midi: (m, entries) => playProbes(m, 0, entries),
    verify: (r, entries) => checkProbes(r, 0, entries, "")
});

export const MID_02 = defineTest({
    id: "MID-02",
    title: "Defaults of 0, the LSBs and the other sources",
    section: "11.3",
    description:
        "After the GS Reset, probes for the controllers that default to 0 (CC 1, 2, 16, 70, 93 and 94), for CC 33, 39, 42, 43 and 48 (named the LSBs of CC 1, 7, 10, 11 and 16, but sources of their own), and for the pitch wheel, the channel pressure, the poly pressure, the Pitch Wheel Sensitivity and the Modulation Depth Range.",
    pass: "Every probe plays 440 Hz: the controllers, CC 33 to 63 included, at 0, the pitch wheel at its center, both pressures at 0, a sensitivity of 2 semitones and a Modulation Depth Range of 50 cents.",
    length: (DEFAULT_PROBE_COUNT - NONZERO_CCS.length) * PROBE_SPACING + 0.5,
    bank: (b) =>
        defaultProbes(probes(b)).filter(
            (entry) => !NONZERO_CCS.some((c) => entry.label === `CC ${c}`)
        ),
    midi: (m, entries) => playProbes(m, 0, entries),
    verify: (r, entries) => checkProbes(r, 0, entries, "")
});

/**
 * Moves every source away from its default: the controllers, CC 33 to 63, the pitch wheel, the pressures, and RPN
 * 0 and 5.
 */
function moveEverything(m: Timeline, time: number) {
    for (const c of [...NONZERO_CCS, ...ZERO_CCS])
        m.cc(time, 0, c, c === 10 ? 20 : 30);
    for (const c of LSB_CCS) m.cc(time, 0, c + 32, 5);
    m.pitchWheel(time, 0, 12_000);
    m.channelPressure(time, 0, 60);
    m.polyPressure(time, 0, 69, 60);
    m.rpn(time, 0, [0, 0], 5, 0);
    m.rpn(time, 0, [0, 5], 3, 0);
}

/**
 * The eight messages that set a mode and reset the synthesizer (spec section 11.1).
 */
const RESETS = Object.entries(MODE_MESSAGES).map(([name, send]) => ({
    name,
    send
}));

/**
 * The seconds one reset of MID-03 takes: the moves, the message, then every probe.
 */
const RESET_SECONDS = Math.ceil(
    0.5 + DEFAULT_PROBE_COUNT * PROBE_SPACING + 0.5
);

export const MID_03 = defineTest({
    id: "MID-03",
    title: "Each of the eight mode messages is a full system reset",
    section: "11.1",
    description:
        "For each of the eight messages of spec section 11.1: every controller, CC 33 to 63, the pitch wheel, both pressures and RPN 0 and 5 are moved, the message is sent, and every probe of MID-01 and MID-02 plays.",
    pass: "After each message every probe plays 440 Hz: each message puts every source back to its default.",
    length: 1 + RESETS.length * RESET_SECONDS,
    bank: (b) => defaultProbes(probes(b)),
    midi: (m, entries) => {
        for (const [i, reset] of RESETS.entries()) {
            const t = 1 + i * RESET_SECONDS;
            moveEverything(m, t);
            reset.send(m, t + 0.1);
            playProbes(m, t + 0.4, entries);
        }
    },
    verify: (r, entries) => {
        for (const [i, reset] of RESETS.entries()) {
            const t = 1 + i * RESET_SECONDS;
            checkProbes(r, t + 0.4, entries, `${reset.name}: `);
        }
    }
});

export const MID_04 = defineTest({
    id: "MID-04",
    title: "GS System Mode Set",
    section: "11.1",
    description:
        "CC 74 moved to 80, then GS System Mode Set with `m` = 0, and the CC 74 probe. The same with `m` = 1. Then CC 74 to 80 again and the message with `m` = 2, and the probe.",
    pass: "After `m` = 0 and `m` = 1 the probe plays 440 Hz: both reset. After `m` = 2 it plays 813 cents up (CC 74 at 80): that message is ignored.",
    length: 3,
    bank: (b) => probes(b).cc.get(74)!,
    midi: (m, probe) => {
        for (const [i, mode] of [0, 1, 2].entries()) {
            const t = i;
            m.cc(t, 0, 74, 80);
            m.gs(t + 0.1, [0x00, 0x00, 0x7f], [mode]);
            probeNote(m, t + 0.4, probe);
        }
    },
    verify: (r) => {
        r.cents("m = 0 in cents", probePitch(r, 0.4), 0);
        r.cents("m = 1 in cents", probePitch(r, 1.4), 0);
        r.cents(
            "m = 2, ignored, in cents",
            probePitch(r, 2.4),
            ccCents(74, 80)
        );
    }
});

const GS_DEVICES = [0x10, 0x11, 0x7f];
const UNIVERSAL_DEVICES = [0x7f, 0x00, 0x10];
const XG_DEVICES = [0, 1, 15];

export const MID_05 = defineTest({
    id: "MID-05",
    title: "Any device id",
    section: "11",
    description:
        "Three times each: CC 74 moved to 80 and a GS Reset with the device id 0x10, 0x11 and 0x7F, then the CC 74 probe. CC 74 moved to 80 and GM1 System On with the device id 0x7F, 0x00 and 0x10, then the CC 74 probe. GS PART LEVEL of channel 1 at 50 with the device id 0x10, 0x11 and 0x7F, then the CC 7 probe. XG VOLUME of part 0 at 50 with the device number 0, 1 and 15, then the CC 7 probe. A GS Reset with the usual id comes before each of the last two.",
    pass: "Every message is received: the CC 74 probe plays 440 Hz after each GS Reset and each GM1 System On, and the CC 7 probe plays 2529 cents down (CC 7 at 50) after each part parameter.",
    length: 13,
    bank: (b) => {
        const set = probes(b);
        return { cc74: set.cc.get(74)!, cc7: set.cc.get(7)! };
    },
    midi: (m, p) => {
        for (const [i, device] of GS_DEVICES.entries()) {
            m.cc(i, 0, 74, 80);
            m.gsReset(i + 0.1, device);
            probeNote(m, i + 0.4, p.cc74);
        }
        for (const [i, device] of UNIVERSAL_DEVICES.entries()) {
            const t = 4 + i;
            m.cc(t, 0, 74, 80);
            m.sysex(t + 0.1, [0xf0, 0x7e, device, 0x09, 0x01, 0xf7]);
            probeNote(m, t + 0.4, p.cc74);
        }
        for (const [i, device] of GS_DEVICES.entries()) {
            const t = 7 + i;
            m.gsReset(t);
            m.gs(t + 0.2, [0x40, 0x11, 0x19], [50], device);
            probeNote(m, t + 0.4, p.cc7);
        }
        for (const [i, device] of XG_DEVICES.entries()) {
            const t = 10 + i;
            m.gsReset(t);
            m.xg(t + 0.2, [0x08, 0x00, 0x0b], [50], device);
            probeNote(m, t + 0.4, p.cc7);
        }
    },
    verify: (r) => {
        for (const [i, device] of GS_DEVICES.entries())
            r.cents(
                `GS Reset, device 0x${device.toString(16)}, in cents`,
                probePitch(r, i + 0.4),
                0
            );
        for (const [i, device] of UNIVERSAL_DEVICES.entries())
            r.cents(
                `GM1 System On, device 0x${device.toString(16)}, in cents`,
                probePitch(r, 4 + i + 0.4),
                0
            );
        for (const [i, device] of GS_DEVICES.entries())
            r.cents(
                `GS PART LEVEL, device 0x${device.toString(16)}, in cents`,
                probePitch(r, 7 + i + 0.4),
                ccCents(7, 50)
            );
        for (const [i, device] of XG_DEVICES.entries())
            r.cents(
                `XG VOLUME, device number ${device}, in cents`,
                probePitch(r, 10 + i + 0.4),
                ccCents(7, 50)
            );
    }
});

export const MID_06 = defineTest({
    id: "MID-06",
    title: "CC 10 at 0 and at 127",
    section: "7.2, 11.3",
    description: "The CC 10 probe with CC 10 at 0, then at 1, then at 127.",
    pass: "3200 cents down, 3150 cents down and 3200 cents up: 0 is the low end of its own and is not treated as 1, and 127 is exactly as far above 64 as 0 is below it.",
    length: 1.5,
    bank: (b) => probes(b).cc.get(10)!,
    midi: (m, probe) => {
        for (const [i, v] of [0, 1, 127].entries()) {
            m.cc(i * 0.5, 0, 10, v);
            probeNote(m, i * 0.5, probe);
        }
    },
    verify: (r) => {
        for (const [i, v] of [0, 1, 127].entries())
            r.cents(
                `CC 10 at ${v}, in cents`,
                probePitch(r, i * 0.5),
                ccCents(10, v)
            );
    }
});

import { defineTest } from "../../framework/types";
import { ccCents, keyedCents, probePitch, probes } from "./probes";

export const MID_23 = defineTest({
    id: "MID-23",
    title: "The second group of 16 channels",
    section: "11.6.2, 11.6.3",
    description:
        "A MIDI file with two ports, channels 17 to 32 on the second. GS PART LEVEL at 50 with the address `50 11 19` (part 1 of the second group), then the CC 7 probe on channel 17 and on channel 1. After a GS Reset, XG VOLUME at 50 for part 16, then the CC 7 probe on channel 17 and on channel 1. After a GS Reset, key 70 on channel 26, channel 10 of the second group, which holds the keyed drum preset.",
    pass: "Channel 17 plays 2529 cents down (CC 7 at 50) both times and channel 1 stays at 440 Hz: the address `50` and the XG parts 16 to 31 reach the second group. Key 70 on channel 26 plays the drum preset, 50 cents up: channel 10 of every group of 16 channels is a drum channel after a reset.",
    length: 3,
    channels: [0, 16, 25],
    bank: (b) => ({ cc7: probes(b).cc.get(7)!, drum: probes(b).drum }),
    midi: (m, p) => {
        m.gs(0, [0x50, 0x11, 0x19], [50]);
        for (const [i, ch] of [16, 0].entries()) {
            m.program(0.05, ch, p.cc7);
            m.note(0.1 + i * 0.3, 0.15, { ch });
        }
        m.gsReset(1);
        m.xg(1.1, [0x08, 0x10, 0x0b], [50]);
        for (const [i, ch] of [16, 0].entries()) {
            m.program(1.15, ch, p.cc7);
            m.note(1.2 + i * 0.3, 0.15, { ch });
        }
        m.gsReset(2);
        m.note(2.2, 0.15, { ch: 25, key: 70 });
    },
    verify: (r) => {
        r.cents(
            "GS address 50: channel 17 in cents",
            probePitch(r, 0.1),
            ccCents(7, 50)
        );
        r.cents("GS address 50: channel 1 in cents", probePitch(r, 0.4), 0);
        r.cents(
            "XG part 16: channel 17 in cents",
            probePitch(r, 1.2),
            ccCents(7, 50)
        );
        r.cents("XG part 16: channel 1 in cents", probePitch(r, 1.5), 0);
        r.cents(
            "channel 26 plays the drum preset, in cents",
            probePitch(r, 2.2),
            keyedCents(70)
        );
    }
});

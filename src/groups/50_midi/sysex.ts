import { GeneratorTypes as G } from "spessasynth_core";
import type { BankBuilder } from "../../framework/bank_builder";
import { gsPart, type Timeline } from "../../framework/midi_writer";
import {
    defineTest,
    type PresetRef,
    type TestRender
} from "../../framework/types";
import {
    ccCents,
    probeNote,
    probePitch,
    probes,
    type ProbeSet,
    sourceCents
} from "./probes";

/**
 * Presets that only a bank select reaches, made once per bank: program 110 on bank MSB 6 (200 cents up) and on bank 0 (100 cents up),
 * and program 111 on bank LSB 3 (250 cents up) and on bank 0.
 */
function bankSelectPresets(b: BankBuilder) {
    const tuned = (
        name: string,
        program: number,
        bankMSB: number,
        bankLSB: number,
        cents: number
    ) =>
        b.preset({
            name,
            program,
            bankMSB,
            bankLSB,
            zones: [
                {
                    sample: b.sample("sine"),
                    generators: { [G.fineTune]: cents }
                }
            ]
        });
    return b.shared("bank select presets", () => ({
        msb6: tuned("MSB 6", 110, 6, 0, 200),
        capital: tuned("program 110", 110, 0, 0, 100),
        lsb3: tuned("LSB 3", 111, 0, 3, 250),
        capital111: tuned("program 111", 111, 0, 0, 50)
    }));
}

/**
 * A pair of a part parameter and the channel message it stands for: what each sends on channel 1 before its note,
 * the preset of the note (none when the message itself selects one) and the expected cents.
 */
interface Pair {
    name: string;
    message: (m: Timeline, t: number) => void;
    channel: (m: Timeline, t: number) => void;
    preset?: (set: ProbeSet) => PresetRef;
    cents: number;
}

/**
 * Plays each pair after a GS Reset of its own: the part parameter and a note, then the channel message and a note.
 */
function playPairs(
    m: Timeline,
    pairs: Pair[],
    set: ProbeSet,
    channelOf: (i: number) => number = () => 0
) {
    for (const [i, pair] of pairs.entries()) {
        const ch = channelOf(i);
        for (const [half, send] of [pair.message, pair.channel].entries()) {
            const t = i + half * 0.5;
            m.gsReset(t);
            const preset = pair.preset?.(set);
            if (preset) m.program(t + 0.1, ch, preset);
            send(m, t + 0.15);
            m.note(t + 0.2, 0.15, { ch });
        }
    }
}

/**
 * Checks that both notes of each pair play the expected pitch.
 */
function checkPairs(r: TestRender, pairs: Pair[]) {
    for (const [i, pair] of pairs.entries()) {
        r.cents(
            `${pair.name}: the part parameter in cents`,
            probePitch(r, i + 0.2),
            pair.cents
        );
        r.cents(
            `${pair.name}: the channel message in cents`,
            probePitch(r, i + 0.7),
            pair.cents
        );
    }
}

/**
 * A pair for a parameter that stands for a controller.
 */
function controllerPair(
    name: string,
    controller: number,
    value: number,
    message: (m: Timeline, t: number) => void
): Pair {
    return {
        name,
        message,
        channel: (m, t) => m.cc(t, 0, controller, value),
        preset: (set) => set.cc.get(controller)!,
        cents: ccCents(controller, value)
    };
}

/**
 * A GS part parameter of channel 1 at an address, `high` being 0x10, 0x20 or 0x40 for the three address blocks.
 */
function gs(address: number, high = 0x10) {
    return (data: number[]) => (m: Timeline, t: number) =>
        m.gs(t, [0x40, high | 0x01, address], data);
}

/**
 * An XG part parameter at an address, for a part.
 */
function xg(address: number) {
    return (part: number, data: number[]) => (m: Timeline, t: number) =>
        m.xg(t, [0x08, part, address], data);
}

/**
 * The GS part parameters of spec section 11.6.2 for channel 1, apart from USE FOR RHYTHM PART (preset selection).
 */
function gsPairs() {
    const tone = (address: number, controller: number) =>
        controllerPair(
            `TONE MODIFY ${address - 0x2f}`,
            controller,
            90,
            gs(address)([90])
        );
    return [
        {
            name: "TONE NUMBER",
            message: gs(0x00)([6, 110]),
            channel: (m, t) => {
                m.cc(t, 0, 0, 6);
                m.programChange(t, 0, 110);
            },
            cents: 200
        },
        controllerPair("PART LEVEL", 7, 50, gs(0x19)([50])),
        controllerPair("PART PANPOT", 10, 30, gs(0x1c)([30])),
        controllerPair("CHORUS SEND LEVEL", 93, 30, gs(0x21)([30])),
        controllerPair("REVERB SEND LEVEL", 91, 30, gs(0x22)([30])),
        controllerPair("DELAY SEND LEVEL", 94, 30, gs(0x2c)([30])),
        tone(0x30, 76),
        tone(0x31, 77),
        tone(0x32, 74),
        tone(0x33, 71),
        tone(0x34, 73),
        tone(0x35, 75),
        tone(0x36, 72),
        tone(0x37, 78),
        {
            name: "MOD LFO1 PITCH DEPTH",
            message: gs(0x04, 0x20)([20]),
            channel: (m, t) => m.rpn(t, 0, [0, 5], 1, 0),
            preset: (set) => set.source.get("depthRange")!,
            cents: sourceCents("depthRange", 8 * 128)
        },
        {
            name: "BEND PITCH CONTROL",
            message: gs(0x10, 0x20)([70]),
            channel: (m, t) => m.rpn(t, 0, [0, 0], 6, 0),
            preset: (set) => set.source.get("sensitivity")!,
            cents: sourceCents("sensitivity", 6 * 128)
        },
        {
            name: "TONE MAP NUMBER",
            message: (m, t) => {
                m.gs(t, [0x40, 0x41, 0x00], [3]);
                m.programChange(t + 0.01, 0, 111);
            },
            channel: (m, t) => {
                m.cc(t, 0, 32, 3);
                m.programChange(t + 0.01, 0, 111);
            },
            cents: 250
        }
    ] satisfies Pair[];
}

const GS_PAIRS = gsPairs();

export const MID_17 = defineTest({
    id: "MID-17",
    title: "The GS part parameters",
    section: "11.6.2",
    description:
        "Each GS part parameter of spec section 11.6.2 for channel 1, then the channel message it stands for, each after a GS Reset of its own and followed by a note on a probe. TONE NUMBER and TONE MAP NUMBER select presets that only their bank values reach. USE FOR RHYTHM PART belongs to the preset selection group.",
    pass: "The two notes of each pair have the same pitch: each parameter does exactly what its channel message does.",
    length: GS_PAIRS.length,
    bank: (b) => ({ set: probes(b), selection: bankSelectPresets(b) }),
    midi: (m, p) => playPairs(m, GS_PAIRS, p.set),
    verify: (r) => checkPairs(r, GS_PAIRS)
});

const CHANNELS = Array.from({ length: 16 }, (_, i) => i);

export const MID_18 = defineTest({
    id: "MID-18",
    title: "GS part numbering",
    section: "11.6.2",
    description:
        "For each of the 16 parts: a GS Reset, GS PART LEVEL at 50 for the part, and a note on the channel that part names, with the CC 7 probe (on channel 10 the drum preset, which shows CC 7 as well). Part 0 is channel 10, parts 1 to 9 are channels 1 to 9, and parts A to F are channels 11 to 16.",
    pass: "Every note plays 2529 cents down (CC 7 at 50): the parameter reached the channel its part number names.",
    length: CHANNELS.length * 0.5,
    channels: CHANNELS,
    bank: (b) => ({ cc7: probes(b).cc.get(7)!, drum: probes(b).drum }),
    midi: (m, p) =>
        CHANNELS.map((channel) => {
            const t = channel * 0.5;
            m.gsReset(t);
            m.program(t + 0.1, channel, channel === 9 ? p.drum : p.cc7);
            m.gs(t + 0.15, [0x40, 0x10 | gsPart(channel), 0x19], [50]);
            m.note(t + 0.2, 0.15, { ch: channel });
            return t + 0.2;
        }),
    verify: (r, _p, notes) => {
        for (const [i, channel] of CHANNELS.entries())
            r.cents(
                `part ${gsPart(channel).toString(16).toUpperCase()}, channel ${channel + 1}, in cents`,
                probePitch(r, notes[i]),
                ccCents(7, 50)
            );
    }
});

/**
 * The XG part parameters of spec section 11.6.3. Each one uses another part, skipping part 9 (channel 10, a drum
 * channel after the reset), so the part numbers 0 to 15 all take a turn.
 */
function xgPairs() {
    const parts = CHANNELS.filter((c) => c !== 9);
    const controllers: [number, number, string][] = [
        [0x0b, 7, "VOLUME"],
        [0x0e, 10, "PAN"],
        [0x12, 93, "CHORUS SEND"],
        [0x13, 91, "REVERB SEND"],
        [0x14, 94, "VARIATION SEND"],
        [0x15, 76, "VIBRATO RATE"],
        [0x16, 77, "VIBRATO DEPTH"],
        [0x17, 78, "VIBRATO DELAY"],
        [0x18, 74, "FILTER CUTOFF"],
        [0x19, 71, "FILTER RESONANCE"],
        [0x1a, 73, "EG ATTACK TIME"],
        [0x1b, 75, "EG DECAY TIME"],
        [0x1c, 72, "EG RELEASE TIME"]
    ];
    const list: ((part: number) => Pair)[] = [
        (part) => ({
            name: "BANK SELECT MSB and PROGRAM NUMBER",
            message: (m, t) => {
                xg(0x01)(part, [6])(m, t);
                xg(0x03)(part, [110])(m, t + 0.01);
            },
            channel: (m, t) => {
                m.cc(t, part, 0, 6);
                m.programChange(t + 0.01, part, 110);
            },
            cents: 200
        }),
        (part) => ({
            name: "BANK SELECT LSB and PROGRAM NUMBER",
            message: (m, t) => {
                xg(0x02)(part, [3])(m, t);
                xg(0x03)(part, [111])(m, t + 0.01);
            },
            channel: (m, t) => {
                m.cc(t, part, 32, 3);
                m.programChange(t + 0.01, part, 111);
            },
            cents: 250
        }),
        ...controllers.map(
            ([address, controller, name]) =>
                (part: number): Pair => ({
                    name,
                    message: xg(address)(part, [90]),
                    channel: (m, t) => m.cc(t, part, controller, 90),
                    preset: (set) => set.cc.get(controller)!,
                    cents: ccCents(controller, 90)
                })
        ),
        (part) => ({
            name: "MW LFO PMOD DEPTH",
            message: xg(0x20)(part, [20]),
            channel: (m, t) => m.rpn(t, part, [0, 5], 1, 0),
            preset: (set) => set.source.get("depthRange")!,
            cents: sourceCents("depthRange", 8 * 128)
        }),
        (part) => ({
            name: "BEND PITCH CONTROL",
            message: xg(0x23)(part, [70]),
            channel: (m, t) => m.rpn(t, part, [0, 0], 6, 0),
            preset: (set) => set.source.get("sensitivity")!,
            cents: sourceCents("sensitivity", 6 * 128)
        })
    ];
    return list.map((make, i) => ({
        pair: make(parts[i % parts.length]),
        part: parts[i % parts.length]
    }));
}

const XG_PAIRS = xgPairs();

export const MID_19 = defineTest({
    id: "MID-19",
    title: "The XG part parameters",
    section: "11.6.3",
    description:
        "Each XG part parameter of spec section 11.6.3, on parts 0 to 15 in turn (part 9 is skipped, channel 10 being a drum channel), then the channel message it stands for on the same channel, each after a GS Reset of its own and followed by a note on a probe. PART MODE belongs to the preset selection group.",
    pass: "The two notes of each pair have the same pitch: each parameter does exactly what its channel message does, and part `pp` is channel `pp + 1`.",
    length: XG_PAIRS.length,
    channels: CHANNELS,
    bank: (b) => ({ set: probes(b), selection: bankSelectPresets(b) }),
    midi: (m, p) =>
        playPairs(
            m,
            XG_PAIRS.map(({ pair }) => pair),
            p.set,
            (i) => XG_PAIRS[i].part
        ),
    verify: (r) =>
        checkPairs(
            r,
            XG_PAIRS.map(({ pair }) => pair)
        )
});

const LFO_DEPTHS = [1, 10, 127];
const BENDS = [60, 64, 88, 100];

export const MID_20 = defineTest({
    id: "MID-20",
    title: "The value rules of the part parameters",
    section: "11.6.2, 11.6.3",
    description:
        "GS MOD LFO1 PITCH DEPTH at 1, 10 and 127 and XG MW LFO PMOD DEPTH at 40 and 100, each read by the Modulation Depth Range probe. GS BEND PITCH CONTROL at 60, 64, 88 and 100, read by the Pitch Wheel Sensitivity probe.",
    pass: "The GS depths set RPN 5 to 6, 64 and 813 (`round(6.4 * value)`), and both XG depths to 256 (the value stops at 40). The bends are 0, 0, 24 and 24 semitones: `value - 64`, from 0 to 24.",
    length: 9,
    bank: (b) => probes(b),
    midi: (m, set) => {
        let t = 0;
        for (const value of LFO_DEPTHS) {
            m.gsReset(t);
            m.gs(t + 0.1, [0x40, 0x21, 0x04], [value]);
            probeNote(m, t + 0.2, set.source.get("depthRange")!);
            t += 1;
        }
        for (const value of [40, 100]) {
            m.gsReset(t);
            m.xg(t + 0.1, [0x08, 0x00, 0x20], [value]);
            probeNote(m, t + 0.2, set.source.get("depthRange")!);
            t += 1;
        }
        for (const value of BENDS) {
            m.gsReset(t);
            m.gs(t + 0.1, [0x40, 0x21, 0x10], [value]);
            probeNote(m, t + 0.2, set.source.get("sensitivity")!);
            t += 1;
        }
    },
    verify: (r) => {
        let t = 0.2;
        for (const value of LFO_DEPTHS) {
            const v = Math.round(6.4 * value);
            r.cents(
                `GS MOD LFO1 PITCH DEPTH ${value} in cents`,
                probePitch(r, t),
                sourceCents("depthRange", Math.min(16_383, 8 * v))
            );
            t += 1;
        }
        for (const value of [40, 100]) {
            r.cents(
                `XG MW LFO PMOD DEPTH ${value} in cents`,
                probePitch(r, t),
                sourceCents("depthRange", 8 * 256)
            );
            t += 1;
        }
        for (const value of BENDS) {
            const semitones = Math.min(24, Math.max(0, value - 64));
            r.cents(
                `GS BEND PITCH CONTROL ${value} in cents`,
                probePitch(r, t),
                sourceCents("sensitivity", semitones * 128)
            );
            t += 1;
        }
    }
});

export const MID_21 = defineTest({
    id: "MID-21",
    title: "What GM mode ignores",
    section: "11",
    description:
        "After GM1 System On: CC 0 at 6 with a Program Change to 110 (only bank 6 has the preset 200 cents up, bank 0 has it 100 cents up), and CC 32 at 3 with a Program Change to 111 (bank LSB 3 has it 250 cents up, bank 0 has it 50 cents up). The NRPN for CC 74 with 100, then the CC 74 probe. GS PART LEVEL and XG VOLUME at 50, then the CC 7 probe. Then RPN 0 at 4 semitones and the sensitivity probe, and a GS Reset, after which CC 0 at 6 with Program Change 110 again.",
    pass: "In GM both bank selects, the NRPN and both part parameters are ignored: 100 and 50 cents up, 440 Hz and 440 Hz. The RPN works (100 cents up), and the GS Reset works: afterwards the bank select is used again (200 cents up).",
    length: 9,
    bank: (b) => ({ set: probes(b), selection: bankSelectPresets(b) }),
    midi: (m, p) => {
        m.sysex(0.5, [0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]);
        m.cc(1, 0, 0, 6);
        m.programChange(1, 0, 110);
        m.note(1.05, 0.15);
        m.cc(1.5, 0, 32, 3);
        m.programChange(1.5, 0, 111);
        m.note(1.55, 0.15);
        m.nrpn(2, 0, [0x01, 0x20], 100);
        probeNote(m, 2.05, p.set.cc.get(74)!);
        m.gs(3, [0x40, 0x11, 0x19], [50]);
        m.xg(3, [0x08, 0x00, 0x0b], [50]);
        probeNote(m, 3.05, p.set.cc.get(7)!);
        m.rpn(5, 0, [0, 0], 4, 0);
        probeNote(m, 5.05, p.set.source.get("sensitivity")!);
        m.gsReset(7);
        m.cc(7.5, 0, 0, 6);
        m.programChange(7.5, 0, 110);
        m.note(7.55, 0.15);
    },
    verify: (r) => {
        r.cents("GM: bank select ignored, in cents", probePitch(r, 1.05), 100);
        r.cents("GM: bank LSB ignored, in cents", probePitch(r, 1.55), 50);
        r.cents("GM: NRPN ignored, in cents", probePitch(r, 2.05), 0);
        r.cents(
            "GM: GS and XG part parameters ignored, in cents",
            probePitch(r, 3.05),
            0
        );
        r.cents(
            "GM: RPN works, in cents",
            probePitch(r, 5.05),
            sourceCents("sensitivity", 512)
        );
        r.cents(
            "after the GS Reset the bank select works, in cents",
            probePitch(r, 7.55),
            200
        );
    }
});

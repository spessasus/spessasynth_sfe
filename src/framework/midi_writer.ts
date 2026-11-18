import { MIDIBuilder, type MIDIMessageType } from "spessasynth_core";
import {
    type AnyTest,
    type Group,
    groupBaseName,
    type PresetRef
} from "./types";

/**
 * 480 ticks per quarter at a fixed 120 BPM.
 */
export const TICKS_PER_SECOND = 960;

/**
 * Where a test's own events start after its marker, in seconds. The preamble fits before it.
 */
export const TEST_OFFSET = 0.5;

/**
 * The least silence after every test, in seconds. The next test starts on the next whole second after it.
 */
export const GAP = 1;

/**
 * The shortest note a test may play.
 */
const MIN_NOTE = 0.1;

const STATUS = {
    noteOff: 0x80,
    noteOn: 0x90,
    polyPressure: 0xa0,
    controller: 0xb0,
    program: 0xc0,
    channelPressure: 0xd0,
    pitchWheel: 0xe0,
    sysex: 0xf0,
    marker: 0x06
} as const;

interface TimedEvent {
    time: number;
    order: number;
    /**
     * The channel, 0 to 31, or -1 for the conductor track.
     */
    channel: number;
    status: number;
    data: number[];
}

/**
 * The Roland checksum of a GS message body, from the address on.
 */
export function rolandChecksum(addressAndData: number[]) {
    const sum = addressAndData.reduce((a, b) => a + b, 0);
    return (128 - (sum % 128)) % 128;
}

/**
 * The events of one test. Times are seconds from the start of the test's own events.
 */
export class Timeline {
    public readonly events = new Array<TimedEvent>();
    private readonly testId: string;
    private readonly length: number;
    private order = 0;
    /**
     * Allows events before 0, for the preamble only.
     */
    private allowPreamble = false;

    public constructor(testId: string, length: number) {
        this.testId = testId;
        this.length = length;
    }

    /**
     * A note of the given length.
     */
    public note(
        time: number,
        length: number,
        options: { ch?: number; key?: number; vel?: number } = {}
    ) {
        if (length < MIN_NOTE)
            throw new Error(
                `${this.testId}: a note of ${length} s is shorter than ${MIN_NOTE} s`
            );
        const ch = options.ch ?? 0;
        const key = options.key ?? 69;
        this.noteOn(time, ch, key, options.vel ?? 127);
        this.noteOff(time + length, ch, key);
    }

    public noteOn(time: number, ch: number, key: number, velocity = 127) {
        this.add(time, ch, STATUS.noteOn, [key, velocity]);
    }

    public noteOff(time: number, ch: number, key: number) {
        this.add(time, ch, STATUS.noteOff, [key, 64]);
    }

    public cc(time: number, ch: number, controller: number, value: number) {
        this.add(time, ch, STATUS.controller, [controller, value]);
    }

    /**
     * Moves a controller in a straight line, one message per value step.
     */
    public sweep(
        from: number,
        to: number,
        ch: number,
        controller: number,
        start: number,
        end: number
    ) {
        const steps = Math.abs(end - start);
        for (let i = 0; i <= steps; i++) {
            const value = start + Math.sign(end - start) * i;
            this.cc(
                from + ((to - from) * i) / Math.max(1, steps),
                ch,
                controller,
                value
            );
        }
    }

    /**
     * Bank select (CC 0 and CC 32) and a Program Change.
     */
    public program(time: number, ch: number, preset: PresetRef) {
        this.cc(time, ch, 0, preset.bankMSB);
        this.cc(time, ch, 32, preset.bankLSB);
        this.programChange(time, ch, preset.program);
    }

    /**
     * Plays one note per preset, one after the other: the usual "steps" of a test.
     * Returns the start time of each note.
     */
    public steps(
        presets: PresetRef[],
        options: {
            start?: number;
            length?: number;
            spacing?: number;
            ch?: number;
            key?: number;
            vel?: number;
        } = {}
    ) {
        const start = options.start ?? 0;
        const length = options.length ?? 0.8;
        const spacing = options.spacing ?? 1;
        const ch = options.ch ?? 0;
        return presets.map((preset, i) => {
            const time = start + i * spacing;
            this.program(time, ch, preset);
            this.note(time, length, { ch, key: options.key, vel: options.vel });
            return time;
        });
    }

    public programChange(time: number, ch: number, program: number) {
        this.add(time, ch, STATUS.program, [program]);
    }

    /**
     * The pitch wheel, 14 bits, 8192 is the center.
     */
    public pitchWheel(time: number, ch: number, value: number) {
        this.add(time, ch, STATUS.pitchWheel, [value & 0x7f, value >> 7]);
    }

    public channelPressure(time: number, ch: number, value: number) {
        this.add(time, ch, STATUS.channelPressure, [value]);
    }

    public polyPressure(time: number, ch: number, key: number, value: number) {
        this.add(time, ch, STATUS.polyPressure, [key, value]);
    }

    /**
     * Selects a registered parameter and sends its data entry. The LSB is only sent when given.
     */
    public rpn(
        time: number,
        ch: number,
        parameter: [number, number],
        dataMSB: number,
        dataLSB?: number
    ) {
        this.cc(time, ch, 101, parameter[0]);
        this.cc(time, ch, 100, parameter[1]);
        this.cc(time, ch, 6, dataMSB);
        if (dataLSB !== undefined) this.cc(time, ch, 38, dataLSB);
    }

    /**
     * Selects a non-registered parameter and sends its data entry MSB.
     */
    public nrpn(
        time: number,
        ch: number,
        parameter: [number, number],
        dataMSB: number
    ) {
        this.cc(time, ch, 99, parameter[0]);
        this.cc(time, ch, 98, parameter[1]);
        this.cc(time, ch, 6, dataMSB);
    }

    /**
     * A System Exclusive message, the whole message from 0xF0 to 0xF7. `port` 1 is the second port.
     */
    public sysex(time: number, bytes: number[], port = 0) {
        if (bytes[0] !== 0xf0 || bytes[bytes.length - 1] !== 0xf7)
            throw new Error(
                `${this.testId}: a SysEx must start with F0 and end with F7`
            );
        this.add(time, port * 16, STATUS.sysex, bytes.slice(1));
    }

    /**
     * A GS message (spec section 11.6) with its checksum.
     */
    public gs(
        time: number,
        address: [number, number, number],
        data: number[],
        device = 0x10,
        port = 0
    ) {
        const body = [...address, ...data];
        this.sysex(
            time,
            [
                0xf0,
                0x41,
                device,
                0x42,
                0x12,
                ...body,
                rolandChecksum(body),
                0xf7
            ],
            port
        );
    }

    /**
     * An XG parameter change (spec section 11.6).
     */
    public xg(
        time: number,
        address: [number, number, number],
        data: number[],
        deviceNumber = 0,
        port = 0
    ) {
        this.sysex(
            time,
            [0xf0, 0x43, 0x10 | deviceNumber, 0x4c, ...address, ...data, 0xf7],
            port
        );
    }

    public gsReset(time: number, device = 0x10) {
        this.gs(time, [0x40, 0x00, 0x7f], [0x00], device);
    }

    public marker(time: number, text: string) {
        this.add(time, -1, STATUS.marker, [...new TextEncoder().encode(text)]);
    }

    /**
     * Runs the callback with events before 0 allowed, for the preamble.
     */
    public preamble(callback: () => void) {
        this.allowPreamble = true;
        callback();
        this.allowPreamble = false;
    }

    private add(time: number, channel: number, status: number, data: number[]) {
        const min = this.allowPreamble ? -TEST_OFFSET : 0;
        if (time < min - 1e-9 || time > this.length + 1e-9)
            throw new Error(
                `${this.testId}: an event at ${time} s is outside the test (0 to ${this.length} s)`
            );
        // A SysEx ends with F7 and a marker holds UTF-8, every other data byte has 7 bits
        const body = status === STATUS.sysex ? data.slice(0, -1) : data;
        for (const byte of body)
            if (
                !Number.isInteger(byte) ||
                byte < 0 ||
                byte > (status === STATUS.marker ? 255 : 127)
            )
                throw new Error(
                    `${this.testId}: the data byte ${byte} is not valid`
                );
        this.events.push({ time, order: this.order++, channel, status, data });
    }
}

/**
 * Where each test of a group sits in the MIDI file.
 */
export interface Layout {
    test: AnyTest;
    /**
     * The marker of the test, a whole second.
     */
    start: number;
    /**
     * Where the test's own events start: `start + TEST_OFFSET`.
     */
    origin: number;
    /**
     * The start of the next test.
     */
    end: number;
}

/**
 * Puts the tests one after the other: each on a whole second, with the gap after it.
 */
export function layoutTests(tests: AnyTest[]) {
    const layout = new Array<Layout>();
    let start = 0;
    for (const test of tests) {
        const end = Math.ceil(start + TEST_OFFSET + test.length + GAP);
        layout.push({ test, start, origin: start + TEST_OFFSET, end });
        start = end;
    }
    return layout;
}

/**
 * Writes the group's MIDI file from the timelines of its tests.
 */
export function writeGroupMIDI(
    group: Group,
    timelines: { layout: Layout; timeline: Timeline }[]
) {
    const usesSecondPort = timelines.some((t) =>
        t.timeline.events.some((e) => e.channel >= 16)
    );
    const builder = new MIDIBuilder({
        name: groupBaseName(group),
        timeDivision: 480,
        initialTempo: 120,
        format: 1
    });
    // Track 0 is the conductor (tempo and markers), then one track per port
    builder.addTrack("port 1", 0);
    if (usesSecondPort) builder.addTrack("port 2", 1);

    const all = timelines.flatMap(({ layout, timeline }) =>
        timeline.events.map((e) => ({
            ...e,
            ticks: Math.round((layout.origin + e.time) * TICKS_PER_SECOND)
        }))
    );
    // Sorted by whole ticks, so events at the same tick keep the order they were written in
    all.sort((a, b) => a.ticks - b.ticks || a.order - b.order);
    for (const e of all) {
        if (e.channel < 0) {
            builder.addEvent(e.ticks, 0, e.status as MIDIMessageType, e.data);
            continue;
        }
        const track = e.channel >= 16 ? 2 : 1;
        const status =
            e.status === STATUS.sysex ? e.status : e.status | (e.channel % 16);
        builder.addEvent(e.ticks, track, status as MIDIMessageType, e.data);
    }
    // A player may stop every voice at the last channel event, so the file ends at the end of the last test
    // With a bank select LSB of 0: never a modulator source, and it changes nothing without a Program Change after it
    const end = Math.max(0, ...timelines.map(({ layout }) => layout.end));
    builder.addEvent(
        Math.round(end * TICKS_PER_SECOND),
        1,
        STATUS.controller,
        [32, 0]
    );
    builder.flush();
    return new Uint8Array(builder.writeMIDI());
}

/**
 * The eight messages that set a mode and reset the synthesizer (spec section 11.1), by name.
 */
export const MODE_MESSAGES = {
    "GM1 System On": (m: Timeline, t: number) =>
        m.sysex(t, [0xf0, 0x7e, 0x7f, 0x09, 0x01, 0xf7]),
    "GM System Off": (m: Timeline, t: number) =>
        m.sysex(t, [0xf0, 0x7e, 0x7f, 0x09, 0x02, 0xf7]),
    "GM2 System On": (m: Timeline, t: number) =>
        m.sysex(t, [0xf0, 0x7e, 0x7f, 0x09, 0x03, 0xf7]),
    "GS Reset": (m: Timeline, t: number) => m.gsReset(t),
    "GS Exit": (m: Timeline, t: number) => m.gs(t, [0x40, 0x00, 0x7f], [0x7f]),
    "GS System Mode Set": (m: Timeline, t: number) =>
        m.gs(t, [0x00, 0x00, 0x7f], [0x00]),
    "XG System On": (m: Timeline, t: number) =>
        m.xg(t, [0x00, 0x00, 0x7e], [0x00]),
    "XG All Parameter Reset": (m: Timeline, t: number) =>
        m.xg(t, [0x00, 0x00, 0x7f], [0x00])
};

export type ModeMessage = keyof typeof MODE_MESSAGES;

/**
 * The GS part number of a channel: 0 is channel 10, 1 to 9 are channels 1 to 9, A to F are channels 11 to 16
 * (spec section 11.6.2).
 */
export function gsPart(channel: number) {
    if (channel === 9) return 0;
    return channel < 9 ? channel + 1 : channel;
}

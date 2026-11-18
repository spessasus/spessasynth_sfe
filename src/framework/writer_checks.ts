import {
    EXTENDED_FLAG,
    GEN_SIZE,
    MOD_SIZE,
    readMods,
    XMOD_SIZE
} from "./records";
import type { BasicSoundBank } from "spessasynth_core";
import { type RIFFChunk, RIFFFile } from "./patch";
import { loadBank } from "./render";

const PDTA_ORDER = [
    "phdr",
    "pbag",
    "pmod",
    "pgen",
    "inst",
    "ibag",
    "imod",
    "igen",
    "shdr"
];
const RECORD_SIZES: Record<string, number> = {
    phdr: 38,
    pbag: 4,
    pmod: MOD_SIZE,
    pgen: GEN_SIZE,
    inst: 22,
    ibag: 4,
    imod: MOD_SIZE,
    igen: GEN_SIZE,
    shdr: 46
};

function view(data: Uint8Array) {
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Checks a list of modulator records: whole records, a terminal record of zeros, and the extended flag on every
 * modulator with a custom curve (spec sections 5.5.1 and 7.3).
 */
function checkModulators(name: string, records: Uint8Array, errors: string[]) {
    if (records.length % MOD_SIZE !== 0 || records.length === 0) {
        errors.push(
            `${name} is ${records.length} bytes, not whole records with a terminal record`
        );
        return;
    }
    if (records.subarray(-10).some((b) => b !== 0))
        errors.push(`${name} has no terminal record`);
    // Without the terminal record
    for (const [i, m] of readMods(records).slice(0, -1).entries())
        if (
            (m.source >> 10 === 4 || m.amountSource >> 10 === 4) &&
            !(m.transform & EXTENDED_FLAG)
        )
            errors.push(
                `${name} modulator ${i} uses a custom curve without the extended flag`
            );
}

/**
 * Checks extended records against their modulators: 16 bytes each, one per flagged modulator, curve indices 0
 * where the source is not a custom curve, reserved bytes 0 and a terminal record of zeros (spec section 5.5.1).
 */
function checkRecords(
    name: string,
    records: Uint8Array,
    modRecords: Uint8Array,
    curveCount: number,
    errors: string[]
) {
    if (records.length % XMOD_SIZE !== 0) {
        errors.push(`${name} is ${records.length} bytes, not a multiple of 16`);
        return;
    }
    const flagged = readMods(modRecords)
        .slice(0, -1)
        .filter((m) => m.transform & EXTENDED_FLAG);
    if (records.length / XMOD_SIZE !== flagged.length + 1) {
        errors.push(
            `${name} holds ${records.length / XMOD_SIZE} records, expected ${flagged.length + 1}`
        );
        return;
    }
    const v = view(records);
    for (const [i, m] of flagged.entries()) {
        const o = i * XMOD_SIZE;
        for (const [field, source, offset] of [
            ["source", m.source, 0],
            ["amount source", m.amountSource, 4]
        ] as const) {
            const index = v.getUint32(o + offset, true);
            if (source >> 10 === 4 && index >= curveCount)
                errors.push(
                    `${name} record ${i} names the ${field} curve ${index}, past the last curve`
                );
            if (source >> 10 !== 4 && index !== 0)
                errors.push(
                    `${name} record ${i} has a ${field} curve index without a custom curve`
                );
        }
        if (records.subarray(o + 8, o + XMOD_SIZE).some((b) => b !== 0))
            errors.push(`${name} record ${i} has a non-zero reserved byte`);
    }
    if (records.subarray(-16).some((b) => b !== 0))
        errors.push(`${name} has no terminal record`);
}

/**
 * The CURV rules of spec section 5.4. Returns the number of curves.
 */
function checkCurves(curv: RIFFChunk, errors: string[]) {
    const v = view(curv.data);
    if (curv.data.length < 4) {
        errors.push("CURV is shorter than its curve count");
        return 0;
    }
    const count = v.getUint32(0, true);
    let o = 4;
    for (let i = 0; i < count; i++) {
        if (o + 42 > curv.data.length) {
            errors.push(`CURV ends inside curve ${i}`);
            return i;
        }
        const points = v.getUint16(o + 40, true);
        if (o + 42 + 4 * points > curv.data.length) {
            errors.push(`CURV ends inside the points of curve ${i}`);
            return i;
        }
        o += 42;
        if (points < 2) errors.push(`Curve ${i} has ${points} points`);
        let lastX = 0;
        for (let p = 0; p < points; p++, o += 4) {
            const x = v.getUint16(o, true);
            const y = v.getUint16(o + 2, true);
            if (x > 16_384 || y > 16_384)
                errors.push(`Curve ${i} point ${p} is outside 0 to 16384`);
            if (x < lastX) errors.push(`Curve ${i} point ${p} goes back in x`);
            lastX = x;
        }
    }
    if (o !== curv.data.length)
        errors.push(`CURV has ${curv.data.length - o} bytes after its curves`);
    return count;
}

/**
 * Checks that a record of xdta only uses the fields the spec gives to it (names after 20 characters and the top
 * 16 bits of indices), given as byte ranges that may be non-zero.
 */
function checkUnusedFields(
    name: string,
    data: Uint8Array,
    size: number,
    used: [number, number][],
    errors: string[]
) {
    for (let o = 0; o < data.length; o += size)
        for (let b = 0; b < size; b++)
            if (
                data[o + b] !== 0 &&
                !used.some(([from, to]) => b >= from && b < to)
            ) {
                errors.push(
                    `xdta ${name} record ${o / size} has a non-zero byte at ${b}, a field xdta does not use`
                );
                return;
            }
}

/**
 * Names as a reader gives them back: at most 40 characters, without trailing spaces.
 */
function names(list: readonly { name: string }[]) {
    return list.map((item) => item.name.slice(0, 40).trimEnd());
}

/**
 * The rules for writers, on a bank that core wrote. Returns the problems found.
 */
export function checkWrittenBank(bytes: Uint8Array, source: BasicSoundBank) {
    const errors = new Array<string>();
    const riff = RIFFFile.parse(bytes);
    if (riff.root.listType !== "sfen")
        errors.push(`The form type is ${riff.root.listType}, not sfen`);

    const ifil = view(riff.find("LIST:INFO/ifil").data);
    if (ifil.getUint16(0, true) !== 4 || ifil.getUint16(2, true) !== 0)
        errors.push(
            `ifil is ${ifil.getUint16(0, true)}.${ifil.getUint16(2, true)}, not 4.0`
        );
    const isng = new TextDecoder()
        .decode(riff.find("LIST:INFO/isng").data)
        .replace(/\0+$/, "");
    if (isng !== "SFe 4") errors.push(`isng is "${isng}", not "SFe 4"`);

    const curv = riff.tryFind("LIST:INFO/CURV");
    const curveCount = curv ? checkCurves(curv, errors) : 0;

    const dmod = riff.tryFind("LIST:INFO/DMOD");
    const xmod = riff.tryFind("LIST:INFO/XMOD");
    if (dmod) {
        // A DMOD of zero bytes would be allowed, but core writes a terminal record and should keep doing so
        checkModulators("DMOD", dmod.data, errors);
        const flagged = readMods(dmod.data)
            .slice(0, -1)
            .some((m) => m.transform & EXTENDED_FLAG);
        if (xmod)
            checkRecords("XMOD", xmod.data, dmod.data, curveCount, errors);
        else if (flagged)
            errors.push(
                "DMOD has modulators with the extended flag and XMOD is missing"
            );
    } else errors.push("DMOD is missing");

    for (const id of PDTA_ORDER) {
        const chunk = riff.find(`LIST:pdta/${id}`);
        if (chunk.data.length % RECORD_SIZES[id] !== 0)
            errors.push(
                `pdta ${id} is ${chunk.data.length} bytes, not whole records`
            );
    }
    checkModulators("pmod", riff.find("LIST:pdta/pmod").data, errors);
    checkModulators("imod", riff.find("LIST:pdta/imod").data, errors);

    // The xdta-list chunk is optional (spec section 4.2)
    const xdta = riff.tryFind("LIST:INFO/LIST:xdta");
    if (xdta) {
        const ids = xdta.children.map((c) => c.id);
        if (ids.join(" ") !== PDTA_ORDER.join(" "))
            errors.push(`xdta holds ${ids.join(" ")}`);
        const part = (id: string) =>
            xdta.children.find((c) => c.id === id)?.data;
        for (const id of ["phdr", "pbag", "inst", "ibag", "shdr"]) {
            const ext = part(id);
            const base = riff.find(`LIST:pdta/${id}`);
            if (ext && ext.length !== base.data.length)
                errors.push(
                    `xdta ${id} is ${ext.length} bytes, pdta ${id} is ${base.data.length}`
                );
        }
        for (const id of ["pgen", "igen"]) {
            const ext = part(id);
            if (
                ext &&
                (ext.length !== RECORD_SIZES[id] || ext.some((b) => b !== 0))
            )
                errors.push(`xdta ${id} is not only a terminal record`);
        }
        for (const id of ["pmod", "imod"]) {
            const ext = part(id);
            if (ext)
                checkRecords(
                    `xdta ${id}`,
                    ext,
                    riff.find(`LIST:pdta/${id}`).data,
                    curveCount,
                    errors
                );
        }
        // Names, and the top 16 bits of the bag, generator, modulator and link indices
        const used: Record<string, [number, number][]> = {
            phdr: [
                [0, 20],
                [24, 26]
            ],
            pbag: [[0, 4]],
            inst: [[0, 22]],
            ibag: [[0, 4]],
            shdr: [
                [0, 20],
                [42, 44]
            ]
        };
        for (const [id, ranges] of Object.entries(used)) {
            const ext = part(id);
            if (ext)
                checkUnusedFields(id, ext, RECORD_SIZES[id], ranges, errors);
        }
    }

    const phdr = view(riff.find("LIST:pdta/phdr").data);
    for (let o = 0; o < phdr.byteLength; o += 38)
        if (phdr.getUint16(o + 22, true) & 0x80_00)
            errors.push(`Preset header ${o / 38} has bit 15 of wBank set`);

    const shdr = view(riff.find("LIST:pdta/shdr").data);
    const smpl = riff.find("LIST:sdta/smpl").data;
    for (let o = 0; o + 46 < shdr.byteLength; o += 46) {
        if (!(shdr.getUint16(o + 44, true) & 0x10)) continue;
        const start = shdr.getUint32(o + 20, true);
        if (String.fromCharCode(...smpl.subarray(start, start + 4)) !== "OggS")
            errors.push(`Compressed sample ${o / 46} is not an Ogg stream`);
    }

    // Names of up to 40 characters must come back whole. Readers trim trailing spaces, so they don't count.
    const loaded = loadBank(bytes);
    const pairs: [string, string[], string[]][] = [
        ["preset", names(source.presets), names(loaded.presets)],
        ["instrument", names(source.instruments), names(loaded.instruments)],
        ["sample", names(source.samples), names(loaded.samples)],
        ["curve", names(source.customCurves), names(loaded.customCurves)]
    ];
    for (const [kind, written, read] of pairs) {
        const missing = written.filter((n) => !read.includes(n));
        if (missing.length > 0)
            errors.push(
                `These ${kind} names did not come back: ${missing.join(", ")}`
            );
    }
    return errors;
}

import type { RIFFChunk, RIFFFile } from "./patch";

/**
 * The size of a modulator record in `pmod`, `imod` and `DMOD`.
 */
export const MOD_SIZE = 10;

/**
 * The size of an extended modulator record in `XMOD` and the `pmod` and `imod` of `xdta`.
 */
export const XMOD_SIZE = 16;

/**
 * The size of a generator record in `pgen` and `igen`.
 */
export const GEN_SIZE = 4;

/**
 * One modulator record (SoundFont 2 section 7.4).
 */
export interface ModRecord {
    source: number;
    destination: number;
    amount: number;
    amountSource: number;
    transform: number;
}

/**
 * The modulator records of a sub-chunk, the terminal record included.
 */
export function readMods(data: Uint8Array) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const records = new Array<ModRecord>();
    for (let o = 0; o + MOD_SIZE <= data.length; o += MOD_SIZE)
        records.push({
            source: view.getUint16(o, true),
            destination: view.getUint16(o + 2, true),
            amount: view.getInt16(o + 4, true),
            amountSource: view.getUint16(o + 6, true),
            transform: view.getUint16(o + 8, true)
        });
    return records;
}

export function writeMods(records: ModRecord[]) {
    const data = new Uint8Array(records.length * MOD_SIZE);
    const view = new DataView(data.buffer);
    for (const [i, r] of records.entries()) {
        const o = i * MOD_SIZE;
        view.setUint16(o, r.source, true);
        view.setUint16(o + 2, r.destination, true);
        view.setInt16(o + 4, r.amount, true);
        view.setUint16(o + 6, r.amountSource, true);
        view.setUint16(o + 8, r.transform, true);
    }
    return data;
}

/**
 * Changes the one modulator record of a chunk that has the amount. The tests give each modulator they patch an
 * amount of its own, so the amount finds it.
 */
export function patchMod(
    chunk: RIFFChunk,
    amount: number,
    change: (record: ModRecord) => void
) {
    const records = readMods(chunk.data);
    const found = records.filter((r) => r.amount === amount);
    if (found.length !== 1)
        throw new Error(
            `${found.length} modulators with the amount ${amount} in ${chunk.id}, expected 1`
        );
    change(found[0]);
    chunk.setData(writeMods(records));
}

/**
 * The extended flag of the transform (spec section 5.5.1).
 */
export const EXTENDED_FLAG = 0x80_00;

/**
 * Record data without its last record before the terminal one, so the count no longer matches.
 */
export function withoutLastRecord(data: Uint8Array, size: number) {
    return new Uint8Array([
        ...data.subarray(0, data.length - 2 * size),
        ...data.subarray(data.length - size)
    ]);
}

/**
 * Sets a DWORD of an extended record.
 */
export function setDword(record: Uint8Array, offset: number, value: number) {
    new DataView(record.buffer, record.byteOffset).setUint32(
        offset,
        value,
        true
    );
}

/**
 * The source type bits of a source enumerator.
 */
export function withSourceType(source: number, type: number) {
    return (source & 0x3_ff) | (type << 10);
}

/**
 * One generator record.
 */
export interface GenRecord {
    operator: number;
    amount: number;
}

function readGens(data: Uint8Array) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const records = new Array<GenRecord>();
    for (let o = 0; o + GEN_SIZE <= data.length; o += GEN_SIZE)
        records.push({
            operator: view.getUint16(o, true),
            amount: view.getInt16(o + 2, true)
        });
    return records;
}

function writeGens(records: GenRecord[]) {
    const data = new Uint8Array(records.length * GEN_SIZE);
    const view = new DataView(data.buffer);
    for (const [i, r] of records.entries()) {
        view.setUint16(i * GEN_SIZE, r.operator, true);
        view.setInt16(i * GEN_SIZE + 2, r.amount, true);
    }
    return data;
}

/**
 * Changes the one generator record of a chunk with the operator and amount. The callback also gets its index in the
 * records of the chunk, so it can move records around.
 */
export function patchGen(
    chunk: RIFFChunk,
    operator: number,
    amount: number,
    change: (record: GenRecord, index: number, records: GenRecord[]) => void
) {
    const records = readGens(chunk.data);
    const found = records.filter(
        (r) => r.operator === operator && r.amount === amount
    );
    if (found.length !== 1)
        throw new Error(
            `${found.length} generators ${operator} = ${amount} in ${chunk.id}, expected 1`
        );
    change(found[0], records.indexOf(found[0]), records);
    chunk.setData(writeGens(records));
}

/**
 * Sets the version of `ifil`.
 */
export function setVersion(riff: RIFFFile, major: number, minor: number) {
    const data = new Uint8Array(4);
    const view = new DataView(data.buffer);
    view.setUint16(0, major, true);
    view.setUint16(2, minor, true);
    riff.find("LIST:INFO/ifil").setData(data);
}

/**
 * One curve of `CURV`.
 */
export interface CurveRecord {
    name: string;
    points: [number, number][];
}

/**
 * The curves of a `CURV` sub-chunk as written, with the count it states.
 */
export function readCurves(data: Uint8Array) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const count = view.getUint32(0, true);
    const curves = new Array<CurveRecord>();
    let o = 4;
    for (let i = 0; i < count; i++) {
        const name = new TextDecoder()
            .decode(data.subarray(o, o + 40))
            .replace(/\0.*$/s, "");
        const pointCount = view.getUint16(o + 40, true);
        const points = new Array<[number, number]>();
        for (let p = 0; p < pointCount; p++)
            points.push([
                view.getUint16(o + 42 + p * 4, true),
                view.getUint16(o + 44 + p * 4, true)
            ]);
        curves.push({ name, points });
        o += 42 + pointCount * 4;
    }
    return { count, curves };
}

/**
 * Writes a `CURV` sub-chunk. The count may differ from the number of curves.
 */
export function writeCurves(curves: CurveRecord[], count = curves.length) {
    const size = 4 + curves.reduce((s, c) => s + 42 + c.points.length * 4, 0);
    const data = new Uint8Array(size);
    const view = new DataView(data.buffer);
    view.setUint32(0, count, true);
    let o = 4;
    for (const curve of curves) {
        data.set(new TextEncoder().encode(curve.name).subarray(0, 40), o);
        view.setUint16(o + 40, curve.points.length, true);
        for (const [p, [x, y]] of curve.points.entries()) {
            view.setUint16(o + 42 + p * 4, x, true);
            view.setUint16(o + 44 + p * 4, y, true);
        }
        o += 42 + curve.points.length * 4;
    }
    return data;
}

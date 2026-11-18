/**
 * One chunk of a RIFF or RIFS file. A `LIST` (or the root) has a list type and children, any other chunk
 * has data.
 */
export class RIFFChunk {
    public id: string;
    public listType?: string;
    public data: Uint8Array;
    public children = new Array<RIFFChunk>();
    public parent?: RIFFChunk;

    public constructor(
        id: string,
        data: Uint8Array = new Uint8Array(0),
        listType?: string
    ) {
        this.id = id;
        this.data = data;
        this.listType = listType;
    }

    public get isList() {
        return this.listType !== undefined;
    }

    /**
     * The name used in paths: `LIST:INFO` for a list, the FOURCC otherwise.
     */
    public get pathName() {
        return this.isList && this.id === "LIST"
            ? `LIST:${this.listType}`
            : this.id;
    }

    public setData(data: Uint8Array) {
        this.data = data;
    }

    public remove() {
        if (!this.parent) throw new Error("The root chunk can't be removed");
        this.parent.children.splice(this.parent.children.indexOf(this), 1);
        this.parent = undefined;
    }

    /**
     * Inserts a sub-chunk at the index of this list.
     */
    public insert(index: number, id: string, data: Uint8Array) {
        const chunk = new RIFFChunk(id, data);
        chunk.parent = this;
        this.children.splice(index, 0, chunk);
        return chunk;
    }

    /**
     * Inserts a sub-chunk right before another one.
     */
    public insertBefore(sibling: RIFFChunk, id: string, data: Uint8Array) {
        return this.insert(this.children.indexOf(sibling), id, data);
    }
}

/**
 * A parsed RIFF (32-bit sizes) or RIFS (64-bit sizes) file.
 */
export class RIFFFile {
    public root: RIFFChunk;
    public rf64: boolean;

    private constructor(root: RIFFChunk, rf64: boolean) {
        this.root = root;
        this.rf64 = rf64;
    }

    /**
     * Parses a file. The form is detected from the first FOURCC.
     */
    public static parse(bytes: Uint8Array) {
        const first = fourCC(bytes, 0);
        if (first !== "RIFF" && first !== "RIFS")
            throw new Error(`Not a RIFF file: it starts with ${first}`);
        const rf64 = first === "RIFS";
        const [root] = parseChunk(bytes, 0, rf64);
        return new RIFFFile(root, rf64);
    }

    /**
     * Finds a chunk by its path from the root, such as `LIST:INFO/DMOD` or `LIST:INFO/LIST:xdta/imod`.
     * Throws when it is missing.
     */
    public find(path: string) {
        const found = this.tryFind(path);
        if (!found) throw new Error(`The chunk ${path} is missing`);
        return found;
    }

    public tryFind(path: string) {
        let chunk: RIFFChunk | undefined = this.root;
        for (const part of path.split("/")) {
            chunk = chunk.children.find((c) => c.pathName === part);
            if (!chunk) return undefined;
        }
        return chunk;
    }

    /**
     * Writes the file, with every size computed again.
     */
    public write() {
        const parts = new Array<Uint8Array>();
        writeChunk(this.root, this.rf64, parts);
        const total = parts.reduce((a, p) => a + p.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const p of parts) {
            out.set(p, offset);
            offset += p.length;
        }
        return out;
    }
}

function fourCC(bytes: Uint8Array, offset: number) {
    return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/**
 * Parses the chunk at the offset and returns it with the offset after it (and its pad byte).
 */
function parseChunk(
    bytes: Uint8Array,
    offset: number,
    rf64: boolean
): [RIFFChunk, number] {
    const id = fourCC(bytes, offset);
    const headerSize = rf64 ? 12 : 8;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const size = rf64
        ? Number(view.getBigUint64(offset + 4, true))
        : view.getUint32(offset + 4, true);
    const start = offset + headerSize;
    const end = start + size;
    if (end > bytes.length)
        throw new Error(
            `The chunk ${id} at ${offset} runs past the end of the file`
        );
    const next = end + (size % 2);
    if (id === "RIFF" || id === "RIFS" || id === "LIST") {
        const chunk = new RIFFChunk(
            id,
            new Uint8Array(0),
            fourCC(bytes, start)
        );
        let position = start + 4;
        while (position + headerSize <= end) {
            const [child, after] = parseChunk(bytes, position, rf64);
            child.parent = chunk;
            chunk.children.push(child);
            position = after;
        }
        return [chunk, next];
    }
    return [new RIFFChunk(id, bytes.slice(start, end)), next];
}

function writeChunk(chunk: RIFFChunk, rf64: boolean, parts: Uint8Array[]) {
    const header = new Uint8Array(rf64 ? 12 : 8);
    header.set(new TextEncoder().encode(chunk.id));
    const view = new DataView(header.buffer);
    parts.push(header);
    let size: number;
    if (chunk.isList) {
        parts.push(new TextEncoder().encode(chunk.listType));
        size = 4;
        for (const child of chunk.children) {
            const before = parts.length;
            writeChunk(child, rf64, parts);
            for (let i = before; i < parts.length; i++) size += parts[i].length;
        }
    } else {
        parts.push(chunk.data);
        size = chunk.data.length;
        if (size % 2) parts.push(new Uint8Array(1));
    }
    if (rf64) view.setBigUint64(4, BigInt(size), true);
    else view.setUint32(4, size, true);
}

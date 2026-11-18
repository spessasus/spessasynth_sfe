/**
 * A model of preset selection, spec sections 11.1, 11.2 and 11.6. The tests compute the preset each note should
 * play with it, so the expected pitches follow the rules of the specification and not those of a synthesizer.
 */

export type Mode = "gm" | "gs" | "gm2" | "xg";

/**
 * A preset of a selection bank, in the order of `PHDR`.
 */
export interface SelectionPreset {
    name: string;
    program: number;
    msb: number;
    lsb: number;
    drum: boolean;
    /**
     * The pitch of the preset in cents from 440 Hz, so a note shows which preset plays.
     */
    cents: number;
}

/**
 * The XG drum kit programs (spec section 11.2.1), counted from 0.
 */
const XG_KITS = new Set([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 24, 25, 26, 27, 28, 29, 30, 31, 32,
    33, 40, 41, 48, 56, 57, 58, 64, 65, 66, 126, 127
]);

/**
 * The XG test: at least one preset at bank MSB 120 or 127, and every such preset on an XG kit program.
 */
export function passesXGTest(presets: readonly SelectionPreset[]) {
    const xg = presets.filter((p) => p.msb === 120 || p.msb === 127);
    return xg.length > 0 && xg.every((p) => XG_KITS.has(p.program));
}

function kind(preset: SelectionPreset, xgTest: boolean) {
    if (preset.drum) return "gmgs";
    if (xgTest && (preset.msb === 120 || preset.msb === 127)) return "xg";
    return "melodic";
}

/**
 * "The first" of spec section 11.2.1: by program, bank MSB and bank LSB, the GM/GS drum presets after the others,
 * and `PHDR` order for presets with the same four values.
 */
function first(
    list: readonly SelectionPreset[],
    all: readonly SelectionPreset[]
) {
    const order = (a: SelectionPreset, b: SelectionPreset) =>
        Number(a.drum) - Number(b.drum) ||
        a.program - b.program ||
        a.msb - b.msb ||
        a.lsb - b.lsb ||
        all.indexOf(a) - all.indexOf(b);
    let best = list[0];
    for (const p of list) if (order(p, best) < 0) best = p;
    return best;
}

/**
 * The request of a channel: program, bank MSB, bank LSB and drum flag.
 */
export interface Request {
    program: number;
    msb: number;
    lsb: number;
    drum: boolean;
}

function drumMSB(mode: Mode) {
    return mode === "gm2" ? 120 : 127;
}

/**
 * Selects a preset for a request, spec section 11.2.3.
 */
export function select(
    presets: readonly SelectionPreset[],
    request: Request,
    mode: Mode,
    channel10: boolean
) {
    if (presets.length === 0) return undefined;
    const xgTest = passesXGTest(presets);
    const xgLike = mode === "xg" || mode === "gm2";
    const { program } = request;
    let { msb, lsb, drum } = request;
    // Rule 1
    if (xgLike && drum) {
        drum = false;
        lsb = 0;
        msb = drumMSB(mode);
    }
    // Rule 2
    const exact = presets.find(
        (p) =>
            p.program === program &&
            p.msb === msb &&
            p.lsb === lsb &&
            p.drum === drum
    );
    if (
        exact &&
        !(
            xgLike &&
            (msb === 120 || msb === 127) &&
            kind(exact, xgTest) !== "xg"
        )
    )
        return exact;
    // Rule 3
    const pick = (...rules: ((p: SelectionPreset) => boolean)[]) => {
        for (const rule of rules) {
            const found = presets.filter((p) => rule(p));
            if (found.length > 0) return first(found, presets);
        }
        return first(presets, presets);
    };
    if (drum)
        return pick(
            (p) =>
                kind(p, xgTest) === "gmgs" &&
                p.program === program &&
                p.lsb === lsb,
            (p) => kind(p, xgTest) === "gmgs" && p.program === program,
            (p) =>
                kind(p, xgTest) !== "melodic" &&
                p.program === program &&
                (program < 49 || p.msb === 120),
            (p) => kind(p, xgTest) === "gmgs",
            (p) => kind(p, xgTest) !== "melodic"
        );
    if (
        (xgLike && (msb === 120 || msb === 127)) ||
        (mode === "xg" && channel10 && msb === 126)
    )
        return pick(
            (p) => kind(p, xgTest) === "xg" && p.program === program,
            (p) =>
                kind(p, xgTest) !== "melodic" &&
                p.program === program &&
                (program < 49 || mode === "gm2"),
            (p) => kind(p, xgTest) === "xg",
            (p) => kind(p, xgTest) !== "melodic"
        );
    const candidates = presets.filter(
        (p) => kind(p, xgTest) === "melodic" && p.program === program
    );
    if (candidates.length === 0) return first(presets, presets);
    const rules: ((p: SelectionPreset) => boolean)[] = xgLike
        ? [(p) => p.lsb === lsb]
        : [(p) => p.msb === 0 && p.lsb === lsb, (p) => p.msb === msb];
    const high = Math.max(msb, lsb);
    if (!(xgLike && lsb === 64))
        rules.push((p) => p.msb === high || p.lsb === high);
    for (const rule of rules) {
        const found = candidates.filter((p) => rule(p));
        if (found.length > 0) return first(found, presets);
    }
    return first(candidates, presets);
}

/**
 * One MIDI channel of the model.
 */
export class ModelChannel {
    public preset?: SelectionPreset;
    private request: Request = { program: 0, msb: 0, lsb: 0, drum: false };
    private partMode = 0;
    private readonly channel10: boolean;
    private readonly presets: readonly SelectionPreset[];
    private mode: Mode = "gs";

    public constructor(
        presets: readonly SelectionPreset[],
        channel10: boolean
    ) {
        this.presets = presets;
        this.channel10 = channel10;
    }

    /**
     * Whether the channel is a drum channel: its selected preset is a drum preset (spec section 11.2.2).
     */
    public get drumChannel() {
        return (
            this.preset !== undefined &&
            kind(this.preset, passesXGTest(this.presets)) !== "melodic"
        );
    }

    /**
     * A system reset into a mode (spec sections 11.1 and 11.2.2).
     */
    public reset(mode: Mode) {
        this.mode = mode;
        const defaultMSB = mode === "gm2" ? 121 : 0;
        this.request = { program: 0, lsb: 0, msb: defaultMSB, drum: false };
        if (this.channel10) {
            if (mode === "gm" || mode === "gs") this.request.drum = true;
            else this.request.msb = drumMSB(mode);
        }
        this.partMode = this.channel10 ? (mode === "xg" ? 2 : 1) : 0;
        this.selectNow();
    }

    public bankMSB(value: number) {
        if (this.mode === "gm") return;
        if (
            this.mode === "xg" &&
            this.channel10 &&
            value !== 120 &&
            value !== 126 &&
            value !== 127
        )
            return;
        this.request.msb = value;
    }

    public bankLSB(value: number) {
        if (this.mode === "gm") return;
        this.request.lsb = value;
    }

    public programChange(program: number) {
        this.request.program = program;
        this.selectNow();
    }

    /**
     * GS USE FOR RHYTHM PART or XG PART MODE (spec section 11.6).
     */
    public setPartMode(value: number) {
        if (this.mode === "gm") return;
        if (this.mode === "xg" && this.channel10 && value === 0) return;
        const before = this.partMode;
        this.partMode = value;
        if (this.mode === "gs") {
            const drum = value !== 0;
            if (value !== before || drum !== this.request.drum) {
                this.request = { program: 0, msb: 0, lsb: 0, drum };
                this.selectNow();
            }
            return;
        }
        const wasDrumChannel = this.drumChannel;
        const msbWasDrum = this.request.msb === 120 || this.request.msb === 127;
        this.request.drum = false;
        if (value === 0) this.request.msb = this.mode === "gm2" ? 121 : 0;
        else if (!msbWasDrum) this.request.msb = drumMSB(this.mode);
        if (!(value !== 0 && msbWasDrum)) this.selectNow();
        if (value !== 0 && !wasDrumChannel) {
            this.request.program = 0;
            this.selectNow();
        }
    }

    /**
     * The pitch a note on this channel plays, in cents from 440 Hz, or undefined for silence.
     */
    public noteCents() {
        if (!this.preset) return undefined;
        return this.preset.cents;
    }

    private selectNow() {
        this.preset = select(
            this.presets,
            this.request,
            this.mode,
            this.channel10
        );
    }
}

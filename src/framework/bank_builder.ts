import {
    BasicInstrument,
    BasicSample,
    BasicPreset,
    type BasicSoundBank,
    CustomCurve,
    type GeneratorType,
    GeneratorTypes,
    Modulator,
    type ModulatorCurveType,
    ModulatorCurveTypes,
    ModulatorSource,
    type ModulatorSourceIndex,
    SampleTypes
} from "spessasynth_core";
import {
    createSample,
    SAMPLE_RATE,
    type SampleName,
    sampleData
} from "./samples";
import { VORBIS_SAMPLE } from "./vorbis";
import { CLICK_PRESET } from "./click";

export type Generators = Partial<Record<GeneratorType, number>>;

/**
 * One zone of an instrument.
 */
export interface ZoneSpec {
    sample: BasicSample;
    keys?: [number, number];
    velocities?: [number, number];
    generators?: Generators;
    /**
     * Generators written as they are, without clamping to their limits.
     */
    rawGenerators?: Generators;
    modulators?: Modulator[];
}

/**
 * One preset, made of one instrument by default.
 */
export interface PresetSpec {
    name: string;
    /**
     * The instrument zones, or an instrument made earlier.
     */
    zones: ZoneSpec[] | BasicInstrument;
    presetGenerators?: Generators;
    presetModulators?: Modulator[];
    /**
     * More preset zones, each with its own instrument.
     */
    extraPresetZones?: {
        zones: ZoneSpec[] | BasicInstrument;
        generators?: Generators;
        keys?: [number, number];
    }[];
    program?: number;
    bankMSB?: number;
    bankLSB?: number;
    drum?: boolean;
}

/**
 * How a modulator source is read.
 */
export interface SourceOptions {
    cc?: boolean;
    curve?: "linear" | "concave" | "convex" | "switch" | CustomCurve;
    bipolar?: boolean;
    negative?: boolean;
}

const CURVES: Record<string, ModulatorCurveType> = {
    linear: ModulatorCurveTypes.linear,
    concave: ModulatorCurveTypes.concave,
    convex: ModulatorCurveTypes.convex,
    switch: ModulatorCurveTypes.switch
};

/**
 * Bank MSB values the automatic numbering skips: the XG drum banks, the SFX bank and GM2's melodic bank.
 */
const SKIPPED_MSB = new Set([120, 121, 126, 127]);

/**
 * Builds a modulator source.
 */
export function src(index: ModulatorSourceIndex, options: SourceOptions = {}) {
    const curve = options.curve ?? "linear";
    return new ModulatorSource(
        index,
        typeof curve === "string" ? CURVES[curve] : curve,
        options.cc ?? false,
        options.bipolar ?? false,
        options.negative ?? false
    );
}

/**
 * A CC source, the most common one in the tests.
 */
export function cc(
    controller: number,
    options: Omit<SourceOptions, "cc"> = {}
) {
    return src(controller as ModulatorSourceIndex, { ...options, cc: true });
}

/**
 * The No Controller source, for constant modulators.
 */
export function none() {
    return src(0);
}

/**
 * Builds a modulator.
 */
export function mod(
    source: ModulatorSource,
    amountSource: ModulatorSource,
    destination: GeneratorType,
    amount: number,
    transform: 0 | 2 = 0
) {
    return new Modulator(source, amountSource, destination, amount, transform);
}

/**
 * A modulator that adds a constant amount (the No Controller source is 16384, so exactly 1).
 */
export function constant(destination: GeneratorType, amount: number) {
    return mod(none(), none(), destination, amount);
}

/**
 * Helpers over BasicSoundBank: one preset per call, numbered in order.
 */
export class BankBuilder {
    public readonly bank: BasicSoundBank;
    private readonly samples = new Map<string, BasicSample>();
    private nextIndex = 0;
    /**
     * The four values of every preset made so far, and of those that `nextNumber` gave out, so a numbered preset
     * never shares its values with one that a test numbered itself.
     */
    private readonly taken = new Set<string>();
    private readonly numbered = new Set<string>();
    private readonly made = new Map<string, unknown>();
    private instrumentCount = 0;

    public constructor(bank: BasicSoundBank) {
        this.bank = bank;
    }

    /**
     * Adds a sample of samples.ts once and returns it.
     * The `left` and `right` samples are added together, as a linked stereo pair. The `vorbis` sample is the `tail`
     * compressed as Ogg Vorbis.
     */
    public sample(name: SampleName | "vorbis") {
        const existing = this.samples.get(name);
        if (existing) return existing;
        if (name === "left" || name === "right") {
            const left = createSample(
                "left",
                sampleData("left"),
                SampleTypes.leftSample
            );
            const right = createSample(
                "right",
                sampleData("right"),
                SampleTypes.rightSample
            );
            left.setLinkedSample(right, SampleTypes.leftSample);
            this.bank.addSamples(left, right);
            this.samples.set("left", left);
            this.samples.set("right", right);
            return name === "left" ? left : right;
        }
        if (name === "vorbis") {
            const sample = new BasicSample(
                "vorbis",
                SAMPLE_RATE,
                VORBIS_SAMPLE.rootKey,
                0,
                SampleTypes.monoSample,
                VORBIS_SAMPLE.loopStart,
                VORBIS_SAMPLE.loopEnd
            );
            sample.setCompressedData(VORBIS_SAMPLE.ogg);
            this.bank.addSamples(sample);
            this.samples.set(name, sample);
            return sample;
        }
        const sample = createSample(name, sampleData(name));
        this.bank.addSamples(sample);
        this.samples.set(name, sample);
        return sample;
    }

    /**
     * Adds a sample made by the test itself.
     */
    public addSample(sample: BasicSample) {
        this.bank.addSamples(sample);
        return sample;
    }

    /**
     * Adds an instrument. Every zone loops and has a release of 0.1 s unless it says otherwise.
     */
    public instrument(name: string, zones: ZoneSpec[]) {
        const inst = new BasicInstrument();
        inst.name = name;
        for (const spec of zones) {
            const zone = inst.createZone(spec.sample);
            if (spec.keys)
                zone.keyRange = { min: spec.keys[0], max: spec.keys[1] };
            if (spec.velocities)
                zone.velRange = {
                    min: spec.velocities[0],
                    max: spec.velocities[1]
                };
            zone.setGenerator(GeneratorTypes.sampleModes, 1);
            zone.setGenerator(GeneratorTypes.releaseVolEnv, -3986);
            for (const [type, value] of Object.entries(spec.generators ?? {}))
                zone.setGenerator(Number(type) as GeneratorType, value);
            for (const [type, value] of Object.entries(
                spec.rawGenerators ?? {}
            ))
                zone.setGenerator(Number(type) as GeneratorType, value, false);
            if (spec.modulators) zone.addModulators(...spec.modulators);
        }
        this.bank.addInstruments(inst);
        this.instrumentCount++;
        return inst;
    }

    /**
     * Adds a preset and returns how to select it. Without a program, the next free number on bank 0 upward is used.
     */
    public preset(spec: PresetSpec) {
        const preset = new BasicPreset(this.bank);
        preset.name = spec.name;
        const inst = this.toInstrument(spec.name, spec.zones);
        const zone = preset.createZone(inst);
        // Preset values are offsets, so the limits of the generators don't apply to them
        for (const [type, value] of Object.entries(spec.presetGenerators ?? {}))
            zone.setGenerator(Number(type) as GeneratorType, value, false);
        if (spec.presetModulators) zone.addModulators(...spec.presetModulators);
        for (const extra of spec.extraPresetZones ?? []) {
            const extraZone = preset.createZone(
                this.toInstrument(spec.name, extra.zones)
            );
            if (extra.keys)
                extraZone.keyRange = { min: extra.keys[0], max: extra.keys[1] };
            for (const [type, value] of Object.entries(extra.generators ?? {}))
                extraZone.setGenerator(
                    Number(type) as GeneratorType,
                    value,
                    false
                );
        }

        if (spec.program === undefined) {
            const next = this.nextNumber();
            preset.program = next.program;
            preset.bankMSB = next.bankMSB;
            preset.bankLSB = 0;
            preset.isGMGSDrum = false;
            this.numbered.add(presetKey(preset));
        } else {
            preset.program = spec.program;
            preset.bankMSB = spec.bankMSB ?? 0;
            preset.bankLSB = spec.bankLSB ?? 0;
            preset.isGMGSDrum = spec.drum ?? false;
            // Two presets a test numbers itself may share their values on purpose, one it shares with a numbered
            // Preset is a mistake
            if (this.numbered.has(presetKey(preset)))
                throw new Error(
                    `The preset "${preset.name}" has the same program and bank as a preset numbered before it. Create the presets with fixed numbers first`
                );
        }
        this.taken.add(presetKey(preset));
        this.bank.addPresets(preset);
        return {
            program: preset.program,
            bankMSB: preset.bankMSB,
            bankLSB: preset.bankLSB,
            drum: preset.isGMGSDrum,
            name: preset.name
        };
    }

    /**
     * Makes something once per bank: the first call with a key runs `make`, later calls return its result. For
     * presets that several tests of a group share.
     */
    public shared<T>(key: string, make: () => T) {
        if (!this.made.has(key)) this.made.set(key, make());
        return this.made.get(key) as T;
    }

    /**
     * The reference tone: the `sine` with no generator set apart from its loop and
     * release. The preset is made once per bank.
     */
    public reference() {
        return this.shared("reference tone", () =>
            this.preset({
                name: "reference tone",
                zones: [{ sample: this.sample("sine") }]
            })
        );
    }

    /**
     * A preset of one `sine` zone with the generators and modulators, the most common test preset.
     */
    public tone(
        name: string,
        generators: Generators = {},
        modulators?: Modulator[]
    ) {
        return this.preset({
            name,
            zones: [{ sample: this.sample("sine"), generators, modulators }]
        });
    }

    /**
     * Adds a custom curve to the bank and returns it.
     */
    public curve(points: [number, number][], name = "") {
        const curve = new CustomCurve(
            points.map(([x, y]) => ({ x, y })),
            name
        );
        this.bank.addCustomCurves(curve);
        return curve;
    }

    private toInstrument(name: string, zones: ZoneSpec[] | BasicInstrument) {
        return zones instanceof BasicInstrument
            ? zones
            : this.instrument(
                  `${name} ${this.instrumentCount}`.slice(0, 40).trimEnd(),
                  zones
              );
    }

    private nextNumber() {
        for (;;) {
            const index = this.nextIndex++;
            const program = index % 128;
            const bankMSB = Math.floor(index / 128);
            if (SKIPPED_MSB.has(bankMSB)) continue;
            if (
                bankMSB === CLICK_PRESET.bankMSB &&
                program === CLICK_PRESET.program
            )
                continue;
            if (
                this.taken.has(
                    presetKey({
                        program,
                        bankMSB,
                        bankLSB: 0,
                        isGMGSDrum: false
                    })
                )
            )
                continue;
            return { program, bankMSB };
        }
    }
}

/**
 * A Volume Envelope that starts its decay at once: zero time (-32768) for the delay, the attack and the hold. Zero time
 * stays exact under the limits a synthesizer may add against artifacts (spec section 8.1), so a level read at a fixed
 * time after the first sound does not depend on them.
 */
export const DECAY_AT_ONCE = {
    [GeneratorTypes.delayVolEnv]: -32_768,
    [GeneratorTypes.attackVolEnv]: -32_768,
    [GeneratorTypes.holdVolEnv]: -32_768
};

/**
 * The four values that select a preset (spec section 11.2.1), as one key.
 */
function presetKey(preset: {
    program: number;
    bankMSB: number;
    bankLSB: number;
    isGMGSDrum: boolean;
}) {
    return `${preset.program} ${preset.bankMSB} ${preset.bankLSB} ${preset.isGMGSDrum}`;
}

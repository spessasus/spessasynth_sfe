import { GeneratorTypes as G } from "spessasynth_core";
import { firstSound } from "../../framework/measure";
import type { Timeline } from "../../framework/midi_writer";
import { sevenBitX } from "../../framework/spec_math";
import { defineTest, type Group, type TestRender } from "../../framework/types";

/**
 * The seconds between two clicks, long enough for every tail to die away.
 */
const SPACING = 6;

/**
 * The first click comes 4 s after the test origin, so the tail of the start click (sent with CC 91 at its reset
 * value) is gone before it.
 */
const LEAD = 4;

/**
 * The `gain` of the click zones, 29 dB, so even a quarter send leaves a tail well above the floor of the 16 bit
 * file. The click and the full sends then stay below full scale.
 */
const GAIN = 290;

/**
 * The wet signal starts this long after the first sound of a click. The `click` is one cycle of 1 kHz, so the dry
 * sound has ended by then, and no effects processor answers sooner.
 */
const DRY_SECONDS = 0.003;

/**
 * The energy of the wet signal after the click at the time, both channels summed, from the end of the dry click
 * to 3 s. The whole tail of both channels counts, so a processor whose sound changes over time, or between the
 * channels, is measured the same way.
 */
function wetEnergy(r: TestRender, time: number) {
    const start = firstSound(r.at(time, time + 0.1, "mid"), -60);
    if (start === -1) throw new Error(`${r.id}: no click at ${time} s`);
    const from = time + start / r.sampleRate + DRY_SECONDS;
    let sum = 0;
    for (const channel of ["left", "right"] as const)
        for (const v of r.at(from, time + 3, channel)) sum += v * v;
    return sum;
}

/**
 * The wet level after each click in dB against the one at the given index.
 */
function wetLevels(r: TestRender, count: number, reference: number) {
    const energies = Array.from({ length: count }, (_, i) =>
        wetEnergy(r, LEAD + i * SPACING)
    );
    return energies.map((e) => 10 * Math.log10(e / energies[reference]));
}

/**
 * Sets the controllers of the three sends, the one under test to its value and the others to 0, so a reset value
 * (CC 91 is 40 after a reset) adds no other effect.
 */
function setSends(
    m: Timeline,
    time: number,
    controller: number,
    value: number
) {
    for (const other of [91, 93, 94])
        m.cc(time, 0, other, other === controller ? value : 0);
}

/**
 * The send of a generator in 0.1 % against a full send, in dB, as the wet level should follow it.
 */
function sendDb(amount: number) {
    return 20 * Math.log10(amount / 1000);
}

type Send = "reverb" | "chorus" | "variation";

const SENDS: Record<
    Send,
    { name: string; generator: 15 | 16 | 89; controller: number }
> = {
    reverb: {
        name: "reverbEffectsSend",
        generator: G.reverbEffectsSend,
        controller: 91
    },
    chorus: {
        name: "chorusEffectsSend",
        generator: G.chorusEffectsSend,
        controller: 93
    },
    variation: {
        name: "variationEffectsSend",
        generator: G.variationEffectsSend,
        controller: 94
    }
};

/**
 * The 0.5 dB tolerance, wider than the usual 0.2 dB, leaves room for a processor whose output varies a little
 * from click to click, for example a modulated chorus.
 */
const TOLERANCE = 0.5;

const NO_PROCESSOR =
    " A synthesizer may have no third effects processor. It then ignores the send and plays no tail.";

const AMOUNTS = [1000, 500, 250, 0];
const VALUES = [127, 64, 32, 0];

/**
 * The tests of one send: the generator at 1000, 500, 250 and 0 with its controller at 0, then the controller at
 * 127, 64, 32 and 0 with the generator at 0.
 */
function sendTests(
    send: Send,
    generatorId: string,
    controllerId: string,
    extraStored = false
) {
    const { name: plainName, generator, controller } = SENDS[send];
    const amounts = extraStored ? [2000, ...AMOUNTS] : AMOUNTS;
    const name = `\`${plainName}\``;
    const generatorTest = defineTest({
        id: generatorId,
        title: plainName,
        section:
            send === "variation" ? "7.1.1 #89, 7.1.2, 8.1.4" : "8.1.4, 10.2",
        description: `The \`click\` with ${name} at ${amounts.join(", ")}, 6 s apart, with the controllers of all three sends at 0.${extraStored ? " The value 2000 is stored beyond the range." : ""}`,
        pass: `The ${send} tail after each click follows the send: the send scales the amplitude, so the tail is 6 dB weaker for half the amount and 12 dB for a quarter (within about 0.5 dB), and there is none at 0. 1000 is a full send.${extraStored ? " 2000 is limited to 1000, so the first two tails are the same." : ""}${send === "variation" ? NO_PROCESSOR : ""}`,
        length: LEAD + amounts.length * SPACING,
        bank: (b) =>
            amounts.map((amount) =>
                b.preset({
                    name: `${generatorId} send ${amount}`,
                    zones: [
                        {
                            sample: b.sample("click"),
                            generators: { [G.sampleModes]: 0, [G.gain]: GAIN },
                            rawGenerators: { [generator]: amount }
                        }
                    ]
                })
            ),
        midi: (m, presets) => {
            for (const [i, preset] of presets.entries()) {
                const t = LEAD + i * SPACING;
                m.program(t, 0, preset);
                setSends(m, t, controller, 0);
                m.note(t + 0.05, 0.1);
            }
        },
        verify: (r) => {
            // The send of 1000 is the reference
            const levels = wetLevels(r, amounts.length, amounts.indexOf(1000));
            for (const [i, amount] of amounts.entries()) {
                const wet = levels[i];
                if (amount === 0)
                    r.check(
                        "send 0: no tail",
                        wet < -60,
                        `${wet.toFixed(1)} dB`
                    );
                else
                    r.near(
                        `send ${amount} against 1000, in dB`,
                        wet,
                        sendDb(Math.min(1000, amount)),
                        TOLERANCE
                    );
            }
        }
    });
    const controllerTest = defineTest({
        id: controllerId,
        title: `CC ${controller} as the ${send} send`,
        section:
            send === "variation"
                ? "7.1.1 #89, 7.2, 7.3, 10.2"
                : "7.2, 7.3, 10.2",
        description: `First the \`click\` with ${name} at 1000 and the send controllers at 0, as the full send. Then, 6 s apart, the \`click\` with ${name} at 0 and CC ${controller} at 127, 64, 32 and 0, the other send controllers at 0. The default modulator sends CC ${controller} to it with 1000.`,
        pass: `Each tail is compared with the first one. The controller works in the same range as the generator: CC ${controller} at 127 is a full send, 64 half of it (6 dB weaker in amplitude), 32 a quarter (12 dB), 0 none, each within about 0.5 dB. The send of an SFe file is not multiplied as a SoundFont 2 one may be.${send === "variation" ? NO_PROCESSOR : ""}`,
        length: LEAD + VALUES.length * SPACING + SPACING,
        bank: (b) => [
            b.preset({
                name: `${controllerId} generator`,
                zones: [
                    {
                        sample: b.sample("click"),
                        generators: {
                            [G.sampleModes]: 0,
                            [G.gain]: GAIN,
                            [generator]: 1000
                        }
                    }
                ]
            }),
            b.preset({
                name: `${controllerId} controller`,
                zones: [
                    {
                        sample: b.sample("click"),
                        generators: { [G.sampleModes]: 0, [G.gain]: GAIN }
                    }
                ]
            })
        ],
        midi: (m, [full, plain]) => {
            m.program(LEAD, 0, full);
            setSends(m, LEAD, controller, 0);
            m.note(LEAD + 0.05, 0.1);
            for (const [i, value] of VALUES.entries()) {
                const t = LEAD + (i + 1) * SPACING;
                m.program(t, 0, plain);
                setSends(m, t, controller, value);
                m.note(t + 0.05, 0.1);
            }
        },
        verify: (r) => {
            const levels = wetLevels(r, VALUES.length + 1, 0);
            for (const [i, value] of VALUES.entries()) {
                const wet = levels[i + 1];
                if (value === 0)
                    r.check(
                        `CC ${controller} at 0: no tail`,
                        wet < -60,
                        `${wet.toFixed(1)} dB`
                    );
                else
                    r.near(
                        `CC ${controller} at ${value} against the full generator, in dB`,
                        wet,
                        sendDb((1000 * sevenBitX(value)) / 16_384),
                        TOLERANCE
                    );
            }
        }
    });
    return [generatorTest, controllerTest];
}

export const SENDS_GROUP: Group = {
    number: 40,
    slug: "sends",
    title: "Effects sends",
    sections: "7.1.1 #89, 7.2, 7.3, 8.1.4, 10.2",
    intro: "The effects are on in this render, and the preamble leaves the sends alone. The effects processors are the synthesizer's own, so the criterion is the amount of wet signal after each click, not its sound: the energy of the whole tail in both channels, from 3 ms after the click, when the dry click has ended. The bank holds the default modulator list of a new bank.",
    dmod: "default",
    preamble: "keep-sends",
    effects: true,
    tests: [
        ...sendTests("reverb", "SND-01", "SND-02"),
        ...sendTests("chorus", "SND-03", "SND-04"),
        ...sendTests("variation", "SND-05", "SND-06", true)
    ]
};

import { GeneratorTypes as G } from "spessasynth_core";
import { defineTest } from "../../framework/types";
import {
    DEFAULT_PROBE_COUNT,
    checkProbes,
    defaultProbes,
    playProbes,
    PROBE_SPACING,
    probePitch,
    probes
} from "./probes";

export const MID_24 = defineTest({
    id: "MID-24",
    title: "The state a synthesizer starts in",
    section: "11.1, 11.3",
    description:
        "No reset message at all. Every probe of MID-01 and MID-02, then a request of bank MSB 0, bank LSB 8 and program 112, then one of bank MSB 8, bank LSB 0 and program 112. The bank holds program 112 on bank 0 (100 cents up) and on bank MSB 8 (200 cents up), but nothing on LSB 8.",
    pass: "Every probe plays 440 Hz. The first request plays the preset on bank 0, 100 cents up (should, a fallback of rule 3): the synthesizer starts in GS, where the request falls back to the same MSB (XG would pick bank MSB 8). The second plays the preset on bank MSB 8, 200 cents up (GM would ignore the bank select).",
    length: DEFAULT_PROBE_COUNT * PROBE_SPACING + 1.5,
    bank: (b) => {
        const tuned = (bankMSB: number, cents: number) =>
            b.preset({
                name: `MID-24 bank ${bankMSB}`,
                program: 112,
                bankMSB,
                zones: [
                    {
                        sample: b.sample("sine"),
                        generators: { [G.fineTune]: cents }
                    }
                ]
            });
        return {
            entries: defaultProbes(probes(b)),
            capital: tuned(0, 100),
            msb8: tuned(8, 200)
        };
    },
    midi: (m, p) => {
        const end = playProbes(m, 0, p.entries);
        m.cc(end, 0, 0, 0);
        m.cc(end, 0, 32, 8);
        m.programChange(end, 0, 112);
        m.note(end + 0.05, 0.15);
        m.cc(end + 0.4, 0, 0, 8);
        m.cc(end + 0.4, 0, 32, 0);
        m.programChange(end + 0.4, 0, 112);
        m.note(end + 0.45, 0.15);
    },
    verify: (r, p) => {
        checkProbes(r, 0, p.entries, "");
        r.cents(
            "the GS fallback, in cents",
            probePitch(r, p.entries.length * PROBE_SPACING + 0.05),
            100
        );
        r.cents(
            "the bank select of GS, in cents",
            probePitch(r, p.entries.length * PROBE_SPACING + 0.45),
            200
        );
    }
});

# Contributing to spessasynth_sfe

First, I want to thank you for wanting to help develop the SpessaSynth SFe 4 format.
I really appreciate your contribution :-)

Everything in this repository is in the public domain under [CC0 1.0](../LICENSE), and by contributing you
dedicate your changes to the public domain too.

Here are some tips about contributing:

## Changing the specification

Open a specification issue first, so the change can be discussed before anyone writes it. A change to a rule comes
with the tests that check it, in the same pull request, so the two never disagree. Keep the numbering of sections and
generators stable, since the tests link to them and the build fails on a section that no longer exists.

## Tests

The rest of this guide covers how a test is built and the conventions every test follows, so the tests stay
comparable with each other.

## The rule above all others

The [specification](../spec/sfe-format.md) decides what a test expects. The
behavior of spessasynth_core does not. When core fails a test that follows the specification, the test stays as it
is and gets a `coreFinding` note (see below). When the specification is unclear about what a test should expect, open
an issue instead of guessing.

Out of scope: the conversion of SoundFont 2 files (section 9) and everything the specification leaves to the
synthesizer, such as effects, portamento and the output gain.

## Building

Node 24 or later. `npm install`, then `npm run build`. It lints, type checks, builds every group into `dist/`, measures
every test on the float render and checks the rules for writers on every written bank. It also writes the site and the
PDF of the specification, printed by a headless Chromium that `npm install` downloads. It must pass before a pull
request.

- `npx tsx src/build.ts 10` builds only group 10.
- `npx tsx src/build.ts 10 --only GEN-01,GEN-02` builds only those tests, which is the fast way to work on one.

## The code

```
src/
├── build.ts          the command line: picks the groups, builds them, writes the site
├── framework/        types, samples, bank builder, start click, MIDI timeline, group build, render, verification,
│                     measurements, spec formulas, modulator evaluation, byte level patching, writer checks, Vorbis,
│                     FLAC, TESTS.md
├── site/             the site: TSX components rendered to static HTML, the spec page and its PDF, style.css and
│                     the theme scripts
└── groups/           one folder per area, one file per family of tests, shared helpers in common.ts
```

A test is one object, made with `defineTest`:

| Field          | What it is                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `GEN-12` and so on, stable once released. It is written into the MIDI file as a marker                                                    |
| `title`        | A short name                                                                                                                              |
| `section`      | The specification section, for example `7.1.1 #66`                                                                                        |
| `description`  | What it plays, in Markdown, for a synthesizer author who has not seen the code                                                            |
| `pass`         | What a compliant synthesizer does, in Markdown                                                                                            |
| `length`       | Seconds the test's own events need, the release included                                                                                  |
| `channels`     | The channels it uses, 0-based. Default `[0]`                                                                                              |
| `bank`         | Adds its presets through the `BankBuilder` and returns them                                                                               |
| `midi`         | Adds its events through the `Timeline`, relative to its own start. What it returns (the times of its notes, for example) goes to `verify` |
| `verify`       | Measures the reference render, with the presets from `bank` and what `midi` returned. Required when the pass criterion has a number in it |
| `coreFinding`  | Set when core fails the test while the test follows the specification                                                                     |
| `openQuestion` | Set while it is unclear what the test should expect. The test stays out of the build until then                                           |

Export the test from its group's folder and check that the group's `index.ts` picks it up. Most groups collect
their test files with `testsOf(...)`, which takes every export as a test and plays them in id order, so those files
export tests and nothing else. Their helpers go in `common.ts`. The page and `TESTS.md` are generated from these fields, so there is no other place to
update.

A few habits keep tests short and in step:

- `b.tone(name, generators, modulators)` makes the usual preset: one `sine` zone. `b.reference()` is the reference
  tone, and `b.shared(key, make)` makes a preset that several tests of a group share once per bank.
- Let `midi` return the times it chose and read them in `verify`, rather than writing the same arithmetic twice.
  When `verify` only needs the times, name the unused preset parameter with a leading underscore.
- `r.db(...)` and `r.cents(...)` measure with the default tolerances. Use `r.near(...)` with a tolerance of its own
  where the test needs another.
- A reader rule test that patches the written bank keeps its patch next to it, in one `readerGroup({ ... })`.

With a `coreFinding`, a failed measurement is a warning instead of an error, and the build fails once core passes so
the note gets removed.

## Writing the pass criterion

- A person must be able to check it without the reference file: equal steps, equal pitches, a named shape, a level
  against the reference tone or another note of the same test.
- Mark it "(should)" or "(may)" where the specification does.
- No criterion may need more than about 70 dB of range, since a person checks it in a 16 bit file. Decay and release
  times are measured as slopes over 20 to 40 dB, not down to silence.
- The default tolerances of `verify` are 0.2 dB and 2 cents (`r.db` and `r.cents`). A test states its own where it
  needs another.
- Make sure a pass and a fail really differ. A measurement that a wrong synthesizer passes too is not a test.
- A synthesizer may add limits against clicks (spec section 8.1), such as a minimum note length, a minimum attack or
  release, or smoothing of level, pan and filter changes, and the spec sets no length for them. Design for limits that
  settle within about 50 ms (a delay or a ramp of that length): measure a level 0.1 s or more after a change, and do not check attack, decay or release times
  shorter than 0.1 s. Zero time (-32768) stays exact, so a test that needs a decay from the first sound uses zero
  time for the delay, attack and hold.

## MIDI conventions

- Every test starts with the same preamble: a GS Reset, a pause of 200 ms, then CC 91 = 0 and CC 93 = 0 on the channels
  it uses. So a test never depends on what the test before it left behind. A test that needs another mode sends that
  mode's message after the preamble. The sends group keeps the sends, and the startup group has no reset at all.
- Each test starts on a whole second, with a marker meta event that holds its id and title, and a short click on
  channel 16 that marks the start in the waveform.
- One second of silence between tests.
- Tests use channel 1 unless they are about channels.
- Notes are at least 100 ms long.
- Every System Exclusive message carries a correct checksum.

## Samples

All generated in code at 48 kHz and 16 bit. They peak at -12 dBFS, which leaves room for the tests that play above
unity. A looped sample has guard points on both sides of its loop.

| Sample             | Content                                                                | Used for                              |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------- |
| `sine`             | 440 Hz, one second, looped over the whole length, root key 69          | levels, pitch, envelopes              |
| `cosine`           | The same, starting at its peak                                         | zero time and the start at the peak   |
| `noise`            | White noise from a fixed seed, looped                                  | the filter                            |
| `ramp`             | One rising ramp over 109 points (about 440 Hz), looped                 | loop modes                            |
| `tail`             | A looped 440 Hz section followed by 0.3 s of 880 Hz after the loop end | what plays after a loop is left       |
| `steps`            | Eight plateaus of 1000 points with falling level, no loop              | sample points and offsets             |
| `click`            | One cycle of 1 kHz                                                     | the start marker, `delayVoice`, sends |
| `left` and `right` | 440 Hz and 880 Hz, linked as a stereo pair                             | the sample links                      |
| `vorbis`           | The `tail`, encoded at build time                                      | compressed samples                    |

## Default modulators

The level and the pitch of every test depend on the bank's `DMOD`, so each group states its list:

| Groups                           | `DMOD`                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 10, 50 to 52, 60 to 65, 70 to 98 | Empty unless the group says otherwise. Velocity, CC 7, the pitch wheel and CC 1 do nothing unless a test's own modulator uses them |
| 20                               | Only the modulators that MOD-14, MOD-25 and MOD-31 name, on controllers no other test uses                                         |
| 30, 40                           | The list of `new BasicSoundBank()`, untouched                                                                                      |
| 31, 32                           | Set by the group                                                                                                                   |

The default list is not final yet, so never copy it into a test. Read it from `new BasicSoundBank().defaultModulators`
and compute the expected values from it.

"The reference tone" is the `sine` at key 69 in a bank with an empty `DMOD`, with no generator set apart from the loop
and a release of 0.1 s. How loud it comes out is up to the synthesizer, so every level criterion is relative to it or to
another note of the same test.

## Render

The build writes the bank, loads the written file back (so the writer and the reader are both in the loop), and plays
the MIDI file through spessasynth_core at 48 kHz. Effects are enabled only in the sends group. No test may push the
render above 0 dBFS, and the build fails when one does.

Things core does that are outside the specification and must not leak into a test:

- Notes shorter than 30 ms are lengthened, and a voice is held for 70 ms before its exclusive class ends it.
- Core adds two GS user drum sets at programs 64 and 65 of bank 0. Avoid GM and GS drum requests for those programs.
- In XG mode, core plays RPN 2 on a drum channel as a pitch shift. The specification does not define RPN 2.
- Effects and portamento are core's own.

## Malformed files

The reader rule groups (70 and up) write a valid bank with core and then patch its bytes with
`src/framework/patch.ts` and `src/framework/records.ts`. A group whose bank a reader must reject has no reference render,
and the build checks that core rejects it.

## Checks on the written files

The specification has rules for writers too. The build checks them on every bank before it is patched: the form type,
the version, `DMOD`, `XMOD`, `xdta`, the extended records, `wBank`, compressed samples and names of 40 characters. These
check core's writer, and a failure there is a finding for core, not for the test.

## Code style

TypeScript, formatted by Prettier (`npm run format`, also run by the commit hook) and checked by ESLint as part of
`npm run build`.

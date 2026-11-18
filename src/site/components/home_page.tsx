import type { Assets } from "../assets";
import {
    CORE_URL,
    LOGO_URL,
    PAGES,
    REPOSITORY_URL,
    SPEC_PDF_NAME,
    ZIP_NAME
} from "../names";
import { Layout } from "./layout";

/**
 * The home page: what SFe is and where to go.
 */
export function HomePage(props: { assets: Assets }) {
    return (
        <Layout title="SpessaSynth SFe" page="home" assets={props.assets}>
            <header class="hero">
                <img
                    class="mark"
                    src={LOGO_URL}
                    alt=""
                    width="96"
                    height="96"
                />
                <h1>SpessaSynth SFe</h1>
            </header>
            <p class="lede">
                SFe (SF-Enhanced) 4.0 is a sound bank format that extends
                SoundFont 2.04. This site holds its{" "}
                <a href={PAGES.spec}>specification</a> and its{" "}
                <a href={PAGES.tests}>compliance tests</a>.
            </p>
            <h2>Why SFe</h2>
            <p>
                SoundFont 2 is simple and widely supported, but it leaves a lot
                to the synthesizer and stops short of what classic General MIDI
                hardware could do. SFe adds generators (a second modulation
                envelope, LFO waveforms and start phases, a filter type, a voice
                delay and more), custom modulator curves, default modulators
                stored in the bank, 64-bit chunk sizes and a defined MIDI
                behavior, so a bank sounds the same in every synthesizer that
                reads it.
            </p>
            <p>
                Every SFe feature extends a stage that SoundFont 2 already has
                and defaults to the SoundFont 2 behavior. A bank without any SFe
                feature can always be written as a valid SoundFont 2 file.
            </p>
            <p>
                SFe is a public domain format. The specification is dedicated to
                the public domain under{" "}
                <a href={`${REPOSITORY_URL}/blob/HEAD/LICENSE`}>CC0 1.0</a>, so
                anyone may implement it, extend it or copy it, without asking
                and without attribution.
            </p>
            <div class="note">
                <p>
                    SpessaSynth SFe (with a lowercase "e") is not SFE (with an
                    uppercase "E") by the{" "}
                    <a href="https://sfe-team-was-taken.github.io/SFE/">
                        SFE Team
                    </a>
                    . The two formats share a name and many ideas, but a bank
                    made for one is not a valid bank for the other.
                </p>
            </div>
            <div class="panels">
                <section class="panel">
                    <h2>Specification</h2>
                    <p>
                        The <a href={PAGES.spec}>specification</a> describes
                        what SFe adds to SoundFont 2, for developers of software
                        that reads, writes or plays SFe files. Its source is{" "}
                        <code>spec/sfe-format.md</code> in the{" "}
                        <a href={REPOSITORY_URL}>repository</a>.
                    </p>
                    <a class="download" href={SPEC_PDF_NAME} download>
                        <span>
                            Download the PDF{" "}
                            <span class="nowrap">({SPEC_PDF_NAME})</span>
                        </span>
                    </a>
                </section>
                <section class="panel">
                    <h2>Tests</h2>
                    <p>
                        The <a href={PAGES.tests}>compliance tests</a> are test
                        banks, MIDI files that play them and reference renders.
                        A synthesizer author loads a bank, plays its MIDI file
                        and checks the result against the pass criterion of each
                        test.
                    </p>
                    <a class="download" href={ZIP_NAME} download>
                        <span>
                            Download the tests{" "}
                            <span class="nowrap">({ZIP_NAME})</span>
                        </span>
                    </a>
                </section>
                <section class="panel">
                    <h2>Implementations</h2>
                    <p>
                        <a href={CORE_URL}>spessasynth_core</a> reads, writes
                        and plays SFe files, and renders the references of the
                        tests.
                    </p>
                </section>
            </div>
        </Layout>
    );
}

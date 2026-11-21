import { raw } from "hono/html";
import {
    checkTexts,
    formatTime,
    groupFiles,
    rejectNote,
    sectionsLabel
} from "../../framework/catalogue";
import { type Layout as Slot, layoutTests } from "../../framework/midi_writer";
import { type Group, groupBaseName } from "../../framework/types";
import type { Assets } from "../assets";
import { escapeHtml, inline } from "../markdown";
import { PAGES, SPEC_PDF_NAME, TESTS_NAME, ZIP_NAME } from "../names";
import { linkSections, type SpecDocument } from "../spec";
import { Layout } from "./layout";

/**
 * The family of a group is the tens digit of its number (1 for generators, 7 for the reader rules). The page colors
 * each family like a MIDI channel on the SpessaSynth note canvas.
 */
function family(group: Group) {
    return Math.floor(group.number / 10);
}

/**
 * A finding of spessasynth_core, shown under a test or a group.
 */
function CoreFinding(props: { text: string }) {
    return (
        <p class="note core">
            <strong>Core finding:</strong> {inline(props.text)}
        </p>
    );
}

function TestRow(props: {
    slot: Slot;
    base: string;
    sections: (reference: string) => ReturnType<typeof raw>;
}) {
    const { test } = props.slot;
    checkTexts(test);
    return (
        <tr id={`${props.base}-${test.id}`}>
            <td class="id">{test.id}</td>
            <td class="time">{formatTime(props.slot.start)}</td>
            <td class="section">{props.sections(test.section)}</td>
            <td class="plays">
                <strong>{inline(test.title)}</strong>
                <br />
                {inline(test.description)}
            </td>
            <td class="pass">
                {inline(test.pass)}
                {test.coreFinding && <CoreFinding text={test.coreFinding} />}
            </td>
        </tr>
    );
}

function GroupSection(props: {
    group: Group;
    sections: (reference: string) => ReturnType<typeof raw>;
}) {
    const { group } = props;
    const base = groupBaseName(group);
    const files = groupFiles(group);
    const reference = files.find((f) => f.endsWith(".flac"));
    const reject = rejectNote(group);
    return (
        <section id={base} class="group" data-family={family(group)}>
            <h2>
                <span class="gid">{base}</span>{" "}
                <span>{inline(group.title)}</span>
            </h2>
            <p class="muted">
                {sectionsLabel(group.sections)} {props.sections(group.sections)}
            </p>
            <p>{inline(group.intro)}</p>
            {group.playerNote && (
                <p class="note">
                    <strong>Player:</strong> {inline(group.playerNote)}
                </p>
            )}
            {reject && <p class="note">{reject}</p>}
            {group.coreFinding && <CoreFinding text={group.coreFinding} />}
            <div class="deck">
                <div class="files">
                    {files.map((f) => (
                        <a class="file" href={f} download>
                            {f}
                        </a>
                    ))}
                </div>
                {reference && (
                    <audio controls preload="none" src={reference}></audio>
                )}
            </div>
            <div class="table">
                <table class="tests">
                    <thead>
                        <tr>
                            <th>Id</th>
                            <th>Start</th>
                            <th>Section</th>
                            <th>What it plays</th>
                            <th>Pass</th>
                        </tr>
                    </thead>
                    <tbody>
                        {layoutTests(group.tests).map((slot) => (
                            <TestRow
                                slot={slot}
                                base={base}
                                sections={props.sections}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

/**
 * The page that lists every group and test.
 */
export function TestsPage(props: {
    groups: Group[];
    spec: SpecDocument;
    assets: Assets;
}) {
    // Section references link into the specification, and a reference to a section it doesn't have throws
    const sections = (reference: string) =>
        raw(linkSections(escapeHtml(reference), props.spec, PAGES.spec));
    const sidebar = (
        <>
            <h3>Groups</h3>
            <ul class="groups">
                {props.groups.map((g) => (
                    <li data-family={family(g)}>
                        <a href={`#${groupBaseName(g)}`}>
                            <span class="num">{g.number}</span>
                            <span>{inline(g.title)}</span>
                        </a>
                    </li>
                ))}
            </ul>
            <h3>Files</h3>
            <ul>
                <li>
                    <a href={ZIP_NAME} download>
                        {ZIP_NAME}
                    </a>
                </li>
                <li>
                    <a href={TESTS_NAME}>{TESTS_NAME}</a>
                </li>
                <li>
                    <a href={SPEC_PDF_NAME}>{SPEC_PDF_NAME}</a>
                </li>
            </ul>
        </>
    );
    return (
        <Layout
            title="SFe 4 Spec Test"
            page="tests"
            assets={props.assets}
            sidebar={sidebar}
        >
            <h1>SFe 4 Spec Test</h1>
            <p>
                Test banks, MIDI files and reference renders for the{" "}
                <a href={PAGES.spec}>SFe 4.0 specification</a>. Load a bank in
                the synthesizer under test, play its MIDI file, and compare the
                result with the pass criterion of each test and with the
                reference render. The reference is rendered by spessasynth_core
                at 48 kHz.
            </p>
            <p>
                Unless a group says otherwise, every test starts on a whole
                second, with a short click on channel 16, a marker that holds
                its id and a GS Reset. Its own notes start half a second later.
            </p>
            <a class="download" href={ZIP_NAME} download>
                <span>
                    Download everything{" "}
                    <span class="file-name">({ZIP_NAME})</span>
                </span>
            </a>
            {props.groups.map((group) => (
                <GroupSection group={group} sections={sections} />
            ))}
        </Layout>
    );
}

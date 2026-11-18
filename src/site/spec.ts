import * as fs from "node:fs/promises";
import path from "node:path";
import { Marked, type Tokens } from "marked";

/**
 * The specification source, relative to the repository root.
 */
export const SPEC_SOURCE = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "spec",
    "sfe-format.md"
);

/**
 * One heading of the specification, for the sidebar.
 */
export interface SpecHeading {
    id: string;
    html: string;
    depth: number;
}

/**
 * The rendered specification with the ids of its headings.
 */
export interface SpecDocument {
    html: string;
    headings: SpecHeading[];
    /**
     * The anchor of a section number ("7.1.1") or a generator ("#66").
     */
    anchors: Map<string, string>;
}

/**
 * The id GitHub gives a heading: lowercase, without punctuation, spaces as hyphens. The same ids work on this page,
 * on GitHub and in the links of the spessasynth_core documentation.
 */
function slug(html: string) {
    return html
        .replaceAll(/<[^>]+>/g, "")
        .replaceAll(/&[a-z]+;|&#\d+;/g, "")
        .toLowerCase()
        .replaceAll(/[^\w\- ]/g, "")
        .replaceAll(" ", "-");
}

/**
 * Renders the specification with GitHub's heading ids. Section numbers ("7.1.1") and generators ("#66") map to
 * their heading, and a generator heading that covers a range answers for every generator in it.
 */
export async function renderSpec() {
    const source = await fs.readFile(SPEC_SOURCE, "utf8");
    const headings = new Array<SpecHeading>();
    const anchors = new Map<string, string>();
    const used = new Set<string>();
    const marked = new Marked({ gfm: true });
    marked.use({
        renderer: {
            heading({ tokens, depth, text }: Tokens.Heading) {
                const html = this.parser.parseInline(tokens);
                const section = /^(\d+(?:\.\d+)*)\.?\s/.exec(text);
                const generator = /^(\d+)(?: to (\d+))?\s/.exec(text);
                const id = slug(html);
                if (depth === 5 && generator) {
                    const last = Number(generator[2] ?? generator[1]);
                    for (let g = Number(generator[1]); g <= last; g++)
                        anchors.set(`#${g}`, id);
                } else if (section) anchors.set(section[1], id);
                if (used.has(id))
                    throw new Error(
                        `The specification has two headings with the id ${id}`
                    );
                used.add(id);
                // The number gets its own span so the page and the sidebar can set it apart from the name
                const number = (
                    depth === 5 && generator
                        ? /^(\d+(?: to \d+)?)\s/
                        : /^(\d+(?:\.\d+)*\.?)\s/
                ).exec(html);
                const shown = number
                    ? `<span class="num">${number[1]}</span> <span class="name">${html.slice(number[0].length)}</span>`
                    : html;
                headings.push({ id, html: shown, depth });
                return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${shown}</a></h${depth}>\n`;
            },
            blockquote({ tokens, raw }: Tokens.Blockquote) {
                // The admonitions of the source: a quote that starts with **Note** or **Warning**
                const kind = /^>\s*\*\*(Note|Warning)\*\*/.exec(raw)?.[1];
                const body = this.parser.parse(tokens);
                return `<div class="note${kind === "Warning" ? " warn" : ""}">${body}</div>\n`;
            }
        }
    });
    const rendered = await marked.parse(source);
    // Wide tables scroll in their own frame, as on the tests page
    const html = rendered
        .replaceAll("<table>", '<div class="table"><table>')
        .replaceAll("</table>", "</table></div>");
    return { html, headings, anchors } satisfies SpecDocument;
}

/**
 * A section reference of a test ("7.1.1 #66, 8.1.6") with each number linked into the specification page. Throws
 * when a number names no heading, so a stale reference fails the build.
 */
export function linkSections(
    reference: string,
    spec: SpecDocument,
    page: string
) {
    return reference.replaceAll(/#\d+|\d+(?:\.\d+)*/g, (number) => {
        const id = spec.anchors.get(number);
        if (!id)
            throw new Error(
                `The section reference "${reference}" names ${number}, which the specification does not have`
            );
        return `<a href="${page}#${id}">${number}</a>`;
    });
}

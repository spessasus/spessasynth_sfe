import { raw } from "hono/html";
import { SITE_URL, SPEC_FORMAT, SPEC_STAGE, SPEC_TITLE } from "../names";
import type { SpecDocument } from "../spec";

/**
 * The specification as one document for print: a title page, the contents and the text. Paged.js turns it into
 * pages in the browser before Chromium prints it to PDF.
 */
export function PrintPage(props: {
    spec: SpecDocument;
    style: string;
    paged: string;
    tables: string;
    date: Date;
}) {
    const year = props.date.getUTCFullYear();
    const date = props.date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC"
    });
    // The title heading of the source becomes plain text, so the outline starts at the chapters.
    // The heading anchors only link to themselves, which is no use on paper.
    const html = props.spec.html
        .replaceAll(
            /<a class="anchor" href="#[^"]*">(.*?)<\/a>(<\/h\d>)/g,
            "$1$2"
        )
        .replace(/<h1 id="[^"]*">(.*?)<\/h1>/, '<p class="doc-title">$1</p>')
        // Paged.js finds the page of a contents entry with querySelector, which takes no id that starts with a digit.
        // Every id and internal link gets a prefix for that.
        .replaceAll(' id="', ' id="s-')
        .replaceAll(' href="#', ' href="#s-')
        // On a page laid out by Paged.js, Chromium drops the number from a bookmark when it sits in its own span
        .replaceAll(
            /<span class="num">(.*?)<\/span> <span class="name">(.*?)<\/span>/g,
            "$1 $2"
        );
    return (
        <html lang="en">
            <head>
                <meta charset="utf-8" />
                <title>{SPEC_TITLE}</title>
                <link rel="icon" href="data:," />
                <style>{raw(props.style)}</style>
                <style>
                    {raw(
                        `@page { @top-left { content: "${SPEC_TITLE}"; } @bottom-left { content: "Printed ${year}, public domain (CC0 1.0)"; } }`
                    )}
                </style>
                <script>{raw("window.PagedConfig = { auto: false };")}</script>
                <script>{raw(props.paged)}</script>
                <script>{raw(props.tables)}</script>
            </head>
            <body>
                <section class="title-page">
                    <p class="title">{SPEC_FORMAT}</p>
                    <p class="subtitle">
                        Sound bank format specification, an extension of
                        SoundFont 2.04
                    </p>
                    <p class="status">{SPEC_STAGE}</p>
                    <p class="date">{date}</p>
                    <div class="legal">
                        <p>
                            This document is in the public domain. It is
                            dedicated under CC0 1.0 Universal, see the LICENSE
                            file of the repository.
                        </p>
                        <p>
                            Latest version: <a href={SITE_URL}>{SITE_URL}</a>
                        </p>
                    </div>
                </section>
                <nav class="contents">
                    <h2 id="contents">Contents</h2>
                    <ol>
                        {props.spec.headings
                            .filter((h) => h.depth >= 2 && h.depth <= 4)
                            .map((h) => (
                                <li class={`depth-${h.depth}`}>
                                    <a href={`#s-${h.id}`}>
                                        <span>{raw(h.html)}</span>
                                        <span class="leader"></span>
                                    </a>
                                </li>
                            ))}
                    </ol>
                </nav>
                <article class="spec">{raw(html)}</article>
            </body>
        </html>
    );
}

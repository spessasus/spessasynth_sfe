import * as fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import { testsMarkdown } from "../framework/catalogue";
import type { Group } from "../framework/types";
import { loadAssets } from "./assets";
import { HomePage } from "./components/home_page";
import { renderPage } from "./components/layout";
import { SpecPage } from "./components/spec_page";
import { TestsPage } from "./components/tests_page";
import { PAGES, SPEC_PDF_NAME, TESTS_NAME, ZIP_NAME } from "./names";
import { writeSpecPDF } from "./pdf";
import { renderSpec } from "./spec";

/**
 * Writes the pages, TESTS.md, the PDF of the specification and the zip of every group's files into the folder.
 */
export async function writeSite(
    dist: string,
    groups: Group[],
    files: string[]
) {
    const spec = await renderSpec();
    const assets = await loadAssets();
    const pages = {
        home: <HomePage assets={assets} />,
        spec: <SpecPage spec={spec} assets={assets} />,
        tests: <TestsPage groups={groups} spec={spec} assets={assets} />
    };
    for (const [name, page] of Object.entries(pages))
        await fs.writeFile(
            path.join(dist, PAGES[name as keyof typeof PAGES]),
            await renderPage(page)
        );
    await fs.writeFile(path.join(dist, TESTS_NAME), testsMarkdown(groups));
    // The Markdown source stays in the repository. Readers get the page and the PDF.
    await writeSpecPDF(spec, path.join(dist, SPEC_PDF_NAME));
    const entries: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
    for (const file of [TESTS_NAME, SPEC_PDF_NAME])
        entries[file] = [
            await fs.readFile(path.join(dist, file)),
            { level: 6 }
        ];
    for (const file of files)
        entries[file] = [
            await fs.readFile(path.join(dist, file)),
            // FLAC is compressed already
            { level: file.endsWith(".flac") ? 0 : 6 }
        ];
    await fs.writeFile(
        path.join(dist, ZIP_NAME),
        zipSync(entries, {
            // Zip times are local times, so a date built from local parts is the same everywhere
            mtime: new Date(2026, 0, 1)
        })
    );
    console.info(
        `The pages, ${TESTS_NAME}, ${SPEC_PDF_NAME} and ${ZIP_NAME} written`
    );
}

import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { launch } from "puppeteer";
import { bundleScript, bundleStyle } from "./assets";
import { renderPage } from "./components/layout";
import { PrintPage } from "./components/print_page";
import { type SpecDocument, SPEC_SOURCE } from "./spec";

// The polyfill build of Paged.js. The package does not export the file.
const PAGED_POLYFILL = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "node_modules",
    "pagedjs",
    "dist",
    "paged.polyfill.min.js"
);

// Never resolved, see below
const PAGE_URL = "http://spec.invalid/";

/**
 * Prints the specification to a PDF with headless Chromium. Paged.js lays out the pages first, because Chromium
 * alone has no running headers with the section name and no page numbers in the contents.
 */
export async function writeSpecPDF(spec: SpecDocument, file: string) {
    // The date on the title page is the date of the text, not of the build
    // Chromium still stamps the print time into the file, so the bytes differ from build to build
    // SOURCE_DATE_EPOCH wins, then the last commit of the source, then today
    let date = new Date();
    let dated = false;
    const epoch = process.env.SOURCE_DATE_EPOCH;
    if (epoch && /^\d+$/.test(epoch)) {
        date = new Date(Number(epoch) * 1000);
        dated = true;
    } else
        try {
            const committed = execFileSync(
                "git",
                ["log", "-1", "--format=%cI", "--", SPEC_SOURCE],
                { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
            ).trim();
            if (committed) {
                date = new Date(committed);
                dated = true;
            }
        } catch {
            // Not a Git checkout, or Git is missing
        }
    if (!dated)
        console.warn(
            "The PDF is dated today: SOURCE_DATE_EPOCH is not set and Git gave no date for the specification"
        );
    const html = await renderPage(
        <PrintPage
            spec={spec}
            style={await bundleStyle("print.css")}
            paged={await fs.readFile(PAGED_POLYFILL, "utf8")}
            tables={await bundleScript("paged_tables.ts")}
            date={date}
        />
    );
    // The page is built from this repository and loads nothing, so the sandbox adds little.
    // GitHub's Ubuntu runners block the user namespaces it needs, and Chromium only starts there without it.
    const browser = await launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage();
        // Anything the page reports fails the build, as Paged.js warns about content it could not place
        const problems = new Array<string>();
        page.on("pageerror", (error) => problems.push(String(error)));
        page.on("console", (message) => {
            if (message.type() === "error" || message.type() === "warn")
                problems.push(message.text());
        });
        // Paged.js needs a real address to resolve URLs against, so the page is served from one.
        // Every other request is refused, and a stray link to the network fails the build instead of reaching out.
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            const url = request.url();
            if (url === PAGE_URL)
                void request.respond({
                    contentType: "text/html; charset=utf-8",
                    body: html
                });
            // The fonts are inline
            else if (url.startsWith("data:")) void request.continue();
            else {
                problems.push(`The page asked for ${url}`);
                void request.abort();
            }
        });
        await page.goto(PAGE_URL, { waitUntil: "load" });
        // The layout starts once the fonts are in, so it measures with them
        await page.evaluate(
            "document.fonts.ready.then(() => window.PagedPolyfill.preview()).then(() => {})"
        );
        // Paged.js gives no warning for these, so the laid out pages are checked here.
        // Named functions inside would get a helper from tsx that the page does not have.
        problems.push(
            ...(await page.evaluate(() => {
                const found = new Array<string>();
                for (const pre of document.querySelectorAll("pre"))
                    if (pre.scrollWidth > pre.clientWidth)
                        found.push(
                            `A code block on page ${pre.closest<HTMLElement>(".pagedjs_page")?.dataset.pageNumber} is too wide: ${pre.textContent.split("\n")[0]}`
                        );
                for (const table of document.querySelectorAll("table"))
                    if (
                        table.tHead &&
                        [...table.tBodies].every((b) => b.rows.length === 0)
                    )
                        found.push(
                            `A table on page ${table.closest<HTMLElement>(".pagedjs_page")?.dataset.pageNumber} has a header row and no rows below it`
                        );
                return found;
            }))
        );
        if (problems.length > 0)
            throw new Error(
                `The PDF of the specification failed to lay out:\n${problems.join("\n")}`
            );
        await page.pdf({
            path: file,
            preferCSSPageSize: true,
            printBackground: true,
            outline: true,
            tagged: true
        });
    } finally {
        await browser.close();
    }
}

import path from "node:path";
import { build } from "esbuild";

const ASSETS = path.join(import.meta.dirname, "assets");

/**
 * The CSS and scripts of the pages, put into every page so each page is one file.
 */
export interface Assets {
    style: string;
    /**
     * Runs in the head, before the page paints.
     */
    themeInit: string;
    script: string;
}

/**
 * Bundles a script of the assets folder into one minified script for the browser.
 */
export async function bundleScript(name: string) {
    const result = await build({
        entryPoints: [path.join(ASSETS, name)],
        bundle: true,
        minify: true,
        format: "iife",
        target: "es2020",
        write: false
    });
    return result.outputFiles[0].text.trim();
}

/**
 * Bundles a stylesheet of the assets folder. Fonts go inline, so the page needs no other file.
 */
export async function bundleStyle(name: string) {
    const result = await build({
        entryPoints: [path.join(ASSETS, name)],
        bundle: true,
        minify: true,
        // Fontsource lists a WOFF fallback after each WOFF2, which Chromium never loads
        loader: { ".woff2": "dataurl", ".woff": "empty" },
        write: false
    });
    return result.outputFiles[0].text.trim();
}

export async function loadAssets() {
    return {
        style: await bundleStyle("style.css"),
        themeInit: await bundleScript("theme_init.ts"),
        script: await bundleScript("theme.ts")
    } satisfies Assets;
}

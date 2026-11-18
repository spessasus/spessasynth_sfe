export const ZIP_NAME = "sfe4-spec-test.zip";
export const TESTS_NAME = "TESTS.md";
export const SPEC_PDF_NAME = "sfe-format.pdf";

/**
 * The name and the stage of the specification, as the PDF shows them.
 */
export const SPEC_FORMAT = "SpessaSynth SFe 4.0";
export const SPEC_STAGE = "Release Candidate";
export const SPEC_TITLE = `${SPEC_FORMAT} ${SPEC_STAGE}`;

/**
 * The pages of the site.
 */
export const PAGES = {
    home: "index.html",
    spec: "spec.html",
    tests: "tests.html"
} as const;

export type PageName = keyof typeof PAGES;

export const CORE_URL = "https://github.com/spessasus/spessasynth_core";
export const SITE_URL = "https://spessasus.github.io/spessasynth_sfe/";
export const REPOSITORY_URL = "https://github.com/spessasus/spessasynth_sfe";

/**
 * The SpessaSynth logo, from the SpessaSynth repository as the READMEs of the project link it.
 */
export const LOGO_URL =
    "https://raw.githubusercontent.com/spessasus/SpessaSynth/refs/heads/master/src/website/spessasynth_logo_rounded.png";

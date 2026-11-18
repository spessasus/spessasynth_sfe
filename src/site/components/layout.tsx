import type { Child } from "hono/jsx";
import type { HtmlEscapedString } from "hono/utils/html";
import { raw } from "hono/html";
import type { Assets } from "../assets";
import {
    CORE_URL,
    LOGO_URL,
    PAGES,
    type PageName,
    REPOSITORY_URL
} from "../names";
import { MenuIcon, MoonIcon, SunIcon } from "./icons";

const NAV: [PageName, string][] = [
    ["spec", "Specification"],
    ["tests", "Tests"]
];

const DRAWER: [PageName, string][] = [["home", "Home"], ...NAV];

/**
 * A link to a page, marked when it is the page shown.
 */
function PageLink(props: { page: PageName; current: PageName; label: string }) {
    return (
        <a
            href={PAGES[props.page]}
            aria-current={props.page === props.current ? "page" : undefined}
        >
            {props.label}
        </a>
    );
}

/**
 * The frame every page shares: toolbar, sidebar, content and footer.
 */
export function Layout(props: {
    title: string;
    page: PageName;
    assets: Assets;
    sidebar?: Child;
    children: Child;
}) {
    const { assets } = props;
    return (
        <html lang="en" data-theme="dark">
            <head>
                <meta charset="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                />
                <meta name="color-scheme" content="dark light" />
                <title>{props.title}</title>
                <link rel="icon" href={LOGO_URL} type="image/png" />
                <script>{raw(assets.themeInit)}</script>
                <style>{raw(assets.style)}</style>
            </head>
            <body>
                <a class="skip" href="#content">
                    Skip to content
                </a>
                <header class="toolbar">
                    <div class="toolbar-contents">
                        <a href={PAGES.home} class="title">
                            <img src={LOGO_URL} alt="" width="28" height="28" />
                            SpessaSynth SFe
                        </a>
                        <nav class="links" aria-label="Pages">
                            {NAV.map(([page, label]) => (
                                <PageLink
                                    page={page}
                                    current={props.page}
                                    label={label}
                                />
                            ))}
                            <a href={CORE_URL}>spessasynth_core</a>
                        </nav>
                        <button
                            id="theme-button"
                            class="widget"
                            type="button"
                            data-mode="dark"
                        >
                            <SunIcon />
                            <MoonIcon />
                        </button>
                        <button
                            id="menu-button"
                            class="widget"
                            type="button"
                            aria-label="Menu"
                            aria-expanded="false"
                        >
                            <MenuIcon />
                        </button>
                    </div>
                </header>
                <div class="overlay"></div>
                <div class="layout" id="top">
                    <aside class="sidebar">
                        <nav class="pages" aria-label="Pages">
                            <ul>
                                {DRAWER.map(([page, label]) => (
                                    <li>
                                        <PageLink
                                            page={page}
                                            current={props.page}
                                            label={label}
                                        />
                                    </li>
                                ))}
                            </ul>
                        </nav>
                        {props.sidebar}
                    </aside>
                    <main class={`content page-${props.page}`} id="content">
                        {props.children}
                    </main>
                </div>
                <footer>
                    SpessaSynth SFe, a sound bank format that extends SoundFont 2.{" "}
                    <a href={REPOSITORY_URL}>Source</a>
                </footer>
                <script>{raw(assets.script)}</script>
            </body>
        </html>
    );
}

/**
 * A page as a whole document.
 */
export async function renderPage(
    page: HtmlEscapedString | Promise<HtmlEscapedString>
) {
    return `<!doctype html>\n${await page}\n`;
}

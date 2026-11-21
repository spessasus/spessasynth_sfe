// The theme toggle (dark, light), the phone menu and the highlight of the section in view

const root = document.documentElement;
const themeButton = document.querySelector<HTMLButtonElement>("#theme-button");
const menuButton = document.querySelector<HTMLButtonElement>("#menu-button");
const sidebar = document.querySelector<HTMLElement>(".sidebar");

const LABELS = { dark: "SpessaSynth Dark", light: "SpessaSynth Light" };
type Mode = keyof typeof LABELS;

// Dark is the default, so an older stored "os" choice also lands on dark
let mode: Mode = root.dataset.theme === "light" ? "light" : "dark";

function applyTheme() {
    root.dataset.theme = mode;
    if (!themeButton) return;
    themeButton.dataset.mode = mode;
    const label = `Theme: ${LABELS[mode]} (click to change)`;
    themeButton.setAttribute("aria-label", label);
    themeButton.title = label;
}

function toggleMenu(open: boolean) {
    root.classList.toggle("menu-open", open);
    menuButton?.setAttribute("aria-expanded", String(open));
}

applyTheme();
themeButton?.addEventListener("click", () => {
    mode = mode === "dark" ? "light" : "dark";
    try {
        localStorage.setItem("sfe-theme", mode);
    } catch {
        // Storage can be blocked, and the choice then lasts until the page is left
    }
    applyTheme();
});

menuButton?.addEventListener("click", () =>
    toggleMenu(!root.classList.contains("menu-open"))
);
document
    .querySelector(".overlay")
    ?.addEventListener("click", () => toggleMenu(false));
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleMenu(false);
});
for (const a of document.querySelectorAll(".sidebar a"))
    a.addEventListener("click", () => toggleMenu(false));

const links = new Map(
    [
        ...document.querySelectorAll<HTMLAnchorElement>(".sidebar a[href^='#']")
    ].map((a) => [a.getAttribute("href")?.slice(1) ?? "", a])
);

// The entry of the last heading above the upper third of the window is the one in view
let pending = false;
function updateActive() {
    pending = false;
    let current: string | undefined;
    for (const id of links.keys()) {
        const element = document.querySelector(`#${CSS.escape(id)}`);
        if (element && element.getBoundingClientRect().top <= innerHeight / 3)
            current = id;
    }
    for (const [id, a] of links) a.classList.toggle("active", id === current);
    // Keep the highlighted entry in view inside the sticky sidebar, without moving the page
    const active = current === undefined ? undefined : links.get(current);
    if (active && sidebar && getComputedStyle(sidebar).position === "sticky") {
        const top = active.offsetTop;
        if (
            top < sidebar.scrollTop ||
            top + active.offsetHeight > sidebar.scrollTop + sidebar.clientHeight
        )
            sidebar.scrollTop = top - sidebar.clientHeight / 3;
    }
}

addEventListener(
    "scroll",
    () => {
        if (!pending) {
            pending = true;
            requestAnimationFrame(updateActive);
        }
    },
    { passive: true }
);
updateActive();

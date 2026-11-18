// Runs in the head before the page paints, so a visitor who picked the light theme does not see the dark one first
try {
    if (localStorage.getItem("sfe-theme") === "light")
        document.documentElement.dataset.theme = "light";
} catch {
    // Storage can be blocked, and the page is dark then
}

// Light/dark mode helpers shared by layout.tsx (server) and ThemeToggle.tsx (browser).

// Where the user's choice is saved in localStorage: "light", "dark", or missing (= follow the OS).
export const THEME_KEY = "tripcanvas-theme";

// A tiny script that runs in the browser BEFORE the page is painted (layout.tsx puts it in
// <head>). React only runs after the first paint, so if we waited for it, a dark-mode user would
// see a white flash on every page load. The script picks the saved choice, or else the OS
// setting, and adds the "dark" class to <html>. try/catch: storage can be blocked.
export const themeScript = `
try {
  var saved = localStorage.getItem(${JSON.stringify(THEME_KEY)});
  var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch (e) {}
`;

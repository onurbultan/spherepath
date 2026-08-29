export type ThemePreference = "system" | "light" | "dark";

export const themeStorageKey = "spherepath.theme";

/**
 * Runs before first paint so a stored choice never flashes the wrong palette.
 * `system` stores nothing, which lets the generated `prefers-color-scheme`
 * block in theme.generated.css decide.
 */
export const themeBootstrapScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(themeStorageKey)});if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

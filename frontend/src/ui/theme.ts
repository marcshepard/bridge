// The MUI theme. Colours, typography sizes and spacing are MUI's defaults; components refer to
// theme tokens (palette roles like "error.main", spacing units, typography variants) rather than
// hard-coded values. App-wide adjustments live here and only here:
//
// - Font: Atkinson Hyperlegible, designed for low-vision readability (the screen lies next to your
//   cards). Sizes and weights stay MUI's defaults.
// - Buttons in sentence case (no ALL-CAPS), and at least 44px tall for tapping at the table.
// - Selected toggle buttons filled with the primary colour, so the picked level/strain/declarer
//   stands out at a glance.
// - Tabular digits for any element with class "num", so score columns line up.
//
// - Colours (light and dark), the only custom ones in the app:
//   - Primary: table green, a mid green with a touch of blue, so it stays clearly green (not
//     red or brown) for red-green colour-blind eyes. Same as the app icon (public/icon.svg) and
//     the browser bar tint (index.html, manifest). White text on it passes WCAG AA (about 5:1).
//     Dark mode uses a lighter version so it reads on a dark page.
//   - Secondary: card-back gold, a warm accent for highlights.
//   - Background and paper: a faint green-grey page with near-white cards (dark mode: deep
//     green-black page, slightly lighter cards), rather than plain white or black.
//   - The header stays table green in both modes (MUI would otherwise make it near-black in dark
//     mode, the same as the page). Your avatar on it is a white circle with a green letter.
//   - Card faces (palette.card), for hands drawn as playing cards: a white face with near-black
//     and red ink, as on real cards, so they read the same in both modes. Dark mode dims the face
//     a little so the cards don't glare.
//   Everything else (error red for hearts and diamonds, text colours) is MUI's default.
//
// Light unless you turn on Dark mode in the avatar menu (MUI's useColorScheme; MUI remembers the
// choice in the browser).

import { createTheme } from "@mui/material/styles";

/** A playing card's face: `face` background, `edge` border, `ink` for ♠♣ and `red` for ♥♦. */
interface CardColours {
  face: string;
  edge: string;
  ink: string;
  red: string;
}

declare module "@mui/material/styles" {
  interface Palette {
    card: CardColours;
  }
  interface PaletteOptions {
    card?: CardColours;
  }
}

/** Card-table green: the app icon, the header and the browser bar. */
export const TABLE_GREEN = "#1b7f5e";

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: TABLE_GREEN },
        secondary: { main: "#c99a1e", contrastText: "#1f1a0b" },
        background: { default: "#eef3f0", paper: "#fafcfb" },
        card: { face: "#ffffff", edge: "#9aa59f", ink: "#1a1a1a", red: "#c62828" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#6fd1aa" },
        secondary: { main: "#e2bd57" },
        background: { default: "#0e1714", paper: "#16221d" },
        card: { face: "#e6ebe8", edge: "#0e1714", ink: "#1a1a1a", red: "#b71c1c" },
      },
    },
  },
  typography: {
    fontFamily: '"Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif',
    button: { textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { ".num": { fontVariantNumeric: "tabular-nums" } },
    },
    MuiAppBar: {
      styleOverrides: {
        // Repeated for dark mode, where MUI's own dark-mode rule would otherwise win.
        root: ({ theme }) => {
          const green = { backgroundColor: TABLE_GREEN, color: "#ffffff", backgroundImage: "none" };
          return { ...green, ...theme.applyStyles("dark", green) };
        },
      },
    },
    MuiAvatar: {
      styleOverrides: { colorDefault: { backgroundColor: "#ffffff", color: TABLE_GREEN, fontWeight: 700 } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: ({ theme }) => ({ minHeight: theme.spacing(5.5) }) },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: "none",
          "&.Mui-selected, &.Mui-selected:hover": {
            backgroundColor: theme.vars.palette.primary.main,
            color: theme.vars.palette.primary.contrastText,
          },
        }),
      },
    },
  },
});

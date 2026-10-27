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
// Light and dark schemes both use MUI's default palettes. Light unless you turn on Dark mode in the
// avatar menu (MUI's useColorScheme; MUI remembers the choice in the browser).

import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: { light: true, dark: true },
  typography: {
    fontFamily: '"Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif',
    button: { textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { ".num": { fontVariantNumeric: "tabular-nums" } },
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

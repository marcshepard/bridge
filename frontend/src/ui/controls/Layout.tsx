// Page and section layout used by every screen, so spacing and headings are the same everywhere.
// Sizes come from theme spacing units and typography variants only.

import { Box, Container, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";

/** A screen's main column: narrow enough to read on a phone, centred on bigger screens. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <Container component="main" maxWidth="sm" sx={{ pt: 2, pb: 6 }}>
      {children}
    </Container>
  );
}

/** A titled block of content within a screen. */
export function Section({ title, children, id }: { title?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <Box component="section" sx={{ mt: 4 }} aria-labelledby={title && id ? id : undefined}>
      {title && (
        <Typography variant="h6" component="h2" id={id} sx={{ mb: 1 }}>
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

/** An outlined card for grouping related content. `highlight` marks it as yours (your result). */
export function Panel({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, ...(highlight && { bgcolor: "action.selected", borderColor: "primary.main" }) }}
    >
      {children}
    </Paper>
  );
}

/**
 * The big headline: a large figure with a caption, and optional detail beside it (below it on
 * phones). Used for the board result and the session tally.
 */
export function StatPanel({
  figure,
  caption,
  aside,
  tone = "primary",
}: {
  figure: ReactNode;
  caption: ReactNode;
  aside?: ReactNode;
  tone?: "primary" | "error";
}) {
  return (
    <Panel>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: aside ? "auto 1fr" : "1fr" },
          gap: 2,
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="h3" component="p" className="num" color={tone}>
            {figure}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {caption}
          </Typography>
        </Box>
        {aside && (
          <Box
            sx={{
              borderColor: "divider",
              borderLeft: { sm: 1 },
              borderTop: { xs: 1, sm: 0 },
              pl: { sm: 2 },
              pt: { xs: 2, sm: 0 },
            }}
          >
            {aside}
          </Box>
        )}
      </Box>
    </Panel>
  );
}

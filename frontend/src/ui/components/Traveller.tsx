// The field as a traveller: every score the original field got on this board, best for your side
// at the top, with how many tables got it and what they did. Your result is slotted into place.

import { Box, ButtonBase, Collapse, LinearProgress, List, ListItem, Typography } from "@mui/material";
import { useState } from "react";
import type { BoardComparison, ScoreGroup } from "../../core/compare";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { formatPct } from "../labels";

interface Row {
  group: ScoreGroup | null; // null = our score, which no field table matched
  score: number;
}

// Column widths in theme spacing units: score | description + bar | % and table count.
const SCORE_COL = 9;
const PCT_COL = 8;

export function Traveller({ c }: { c: BoardComparison }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const max = Math.max(1, ...c.groups.map((g) => g.count));

  const rows: Row[] = c.groups.map((g) => ({ group: g, score: g.score }));
  if (!c.groups.some((g) => g.isOurs)) {
    const at = rows.findIndex((r) => r.score < c.ourScore);
    rows.splice(at === -1 ? rows.length : at, 0, { group: null, score: c.ourScore });
  }

  return (
    <List disablePadding aria-label="Field results, best for your side first" sx={{ borderTop: 1, borderColor: "divider" }}>
      {rows.map((row) => {
        const g = row.group;
        const ours = g === null || g.isOurs;
        const open = expanded === row.score;
        // Contracts behind this score that the row doesn't name (your row names none of the field's).
        const others = g ? g.results.length - (ours ? 0 : 1) : 0;
        return (
          <ListItem
            key={row.score}
            disablePadding
            sx={{
              display: "block",
              borderBottom: 1,
              borderColor: "divider",
              ...(ours && { bgcolor: "action.selected", borderLeft: 4, borderLeftColor: "primary.main" }),
            }}
          >
            <ButtonBase
              disabled={!g || g.results.length === 0}
              aria-expanded={g ? open : undefined}
              onClick={() => setExpanded(open ? null : row.score)}
              sx={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: (t) => `${t.spacing(SCORE_COL)} 1fr ${t.spacing(PCT_COL)}`,
                gridTemplateAreas: '"score what pct" "score bar count"',
                columnGap: 1.5,
                rowGap: 0.5,
                alignItems: "center",
                textAlign: "left",
                py: 1,
                px: 0.5,
              }}
            >
              <Typography variant="subtitle1" component="span" sx={{ gridArea: "score", textAlign: "right" }}>
                <ScoreText score={row.score} strong />
              </Typography>
              <Typography variant="body2" sx={{ gridArea: "what", minWidth: 0 }}>
                {ours ? <strong>Your result</strong> : g!.results[0]?.description}
                {others > 0 && !open && (
                  <Box component="span" sx={{ color: "text.secondary" }}>
                    {" "}
                    (+{others} other {others === 1 ? "contract" : "contracts"})
                  </Box>
                )}
              </Typography>
              <LinearProgress variant="determinate" value={g ? (g.count / max) * 100 : 0} aria-hidden sx={{ gridArea: "bar" }} />
              <Typography
                variant="caption"
                color="text.secondary"
                className="num"
                sx={{ gridArea: "count", textAlign: "right", whiteSpace: "nowrap" }}
              >
                {g ? `${g.count} ${g.count === 1 ? "table" : "tables"}` : "only you"}
              </Typography>
              <Typography
                variant="subtitle2"
                className="num"
                title="Matchpoints this score earns"
                sx={{ gridArea: "pct", textAlign: "right" }}
              >
                {formatPct(g ? g.mpPct : c.mpPct)}
              </Typography>
            </ButtonBase>
            {g && (
              <Collapse in={open} unmountOnExit>
                <Box
                  component="ul"
                  sx={{ listStyle: "none", m: 0, pl: SCORE_COL + 2, pr: 1, pb: 1.5, display: "grid", gap: 0.5 }}
                >
                  {g.results.map((r, i) => (
                    <Typography component="li" key={i} variant="body2">
                      <span className="num">{r.count}×</span> <ResultText result={r.result} />{" "}
                      <Box component="span" sx={{ color: "text.secondary" }}>
                        {r.description}
                      </Box>
                    </Typography>
                  ))}
                </Box>
              </Collapse>
            )}
          </ListItem>
        );
      })}
    </List>
  );
}

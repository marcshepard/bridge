// The field as a traveller: every score the original field got on this board, best for your side
// at the top, with the matchpoints that score earns and how many tables got it. Your result is
// slotted into place. Each column heading has a "?" that explains it, so the list needs no notes.

import { LinearProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { Fragment } from "react";
import { matchpointPct, type BoardComparison, type ScoreGroup } from "../../core/compare";
import { formatScore } from "../../core/scoring";
import { ResultText, ScoreText } from "../controls/BridgeText";
import { HelpTip } from "../controls/HelpTip";
import { formatPct, formatShare, netParts } from "../labels";

interface Row {
  group: ScoreGroup | null; // null = our score, which no field table matched
  score: number;
}

export function Traveller({ c }: { c: BoardComparison }) {
  const max = Math.max(1, ...c.groups.map((g) => g.count));

  const rows: Row[] = c.groups.map((g) => ({ group: g, score: g.score }));
  if (!c.groups.some((g) => g.isOurs)) {
    const at = rows.findIndex((r) => r.score < c.ourScore);
    rows.splice(at === -1 ? rows.length : at, 0, { group: null, score: c.ourScore });
  }

  return (
    <Table size="small" aria-label="Field results, best for your side first" sx={{ "& td, & th": { px: 1 } }}>
      <TableHead>
        <TableRow>
          <TableCell>Score</TableCell>
          <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
            Matchpoints
            <HelpTip label="About the matchpoints column">
              <MatchpointsHelp c={c} />
            </HelpTip>
          </TableCell>
          <TableCell sx={{ whiteSpace: "nowrap" }}>
            Tables
            <HelpTip label="About the tables column">
              <span>The number and percent of tables that got this score.</span>
              <span>
                Note: the bar shows the percent relative to the most common result (so a full bar = the most common
                result).
              </span>
            </HelpTip>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => {
          const g = row.group;
          const ours = g === null || g.isOurs;
          return (
            <TableRow key={row.score} selected={ours}>
              <TableCell
                sx={{ verticalAlign: "top", ...(ours && { borderLeft: 4, borderLeftColor: "primary.main" }) }}
              >
                <Typography variant="subtitle1" component="div">
                  <ScoreText score={row.score} strong />
                </Typography>
                <Contracts group={g} ours={ours} />
              </TableCell>
              <TableCell align="right" className="num" sx={{ verticalAlign: "top" }}>
                <Typography variant="subtitle1" component="div" sx={ours ? { fontWeight: "fontWeightBold" } : undefined}>
                  {/* Your row matches the summary above it, which shows a decimal when the net needs one. */}
                  {ours || !g ? (c.mpPct === null ? "—" : netParts(c.mpPct).pct) : formatPct(g.mpPct)}
                </Typography>
              </TableCell>
              <TableCell sx={{ verticalAlign: "top", width: "40%" }}>
                <Typography variant="body2" className="num" sx={{ whiteSpace: "nowrap" }}>
                  {g ? `${g.count} (${formatShare((g.count / c.fieldSize) * 100)})` : "Only you"}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={g ? (g.count / max) * 100 : 0}
                  aria-hidden
                  sx={{ mt: 0.75 }}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Under a score: "Your result" on yours, otherwise the contracts behind it when the source gives
 * them. One contract needs no count (the tables column has it); several each get theirs.
 */
function Contracts({ group, ours }: { group: ScoreGroup | null; ours: boolean }) {
  if (ours) {
    return (
      <Typography variant="caption" component="div" sx={{ fontWeight: "fontWeightBold" }}>
        Your result
      </Typography>
    );
  }
  const results = group?.results ?? [];
  if (results.length === 0) return null;
  return (
    <Typography variant="caption" component="div" color="text.secondary">
      {results.map((r, i) => (
        <Fragment key={i}>
          {i > 0 && "; "}
          <ResultText result={r.result} />
          {results.length > 1 && <span className="num"> ×{r.count}</span>}
        </Fragment>
      ))}
    </Typography>
  );
}

/**
 * The matchpoints column, worked through for one score. Not yours (the summary above already works
 * that out): the most common other score, so the example is one many tables share.
 */
function MatchpointsHelp({ c }: { c: BoardComparison }) {
  const others = c.groups.filter((g) => !g.isOurs);
  const example = others.reduce<ScoreGroup | null>((best, g) => (!best || g.count > best.count ? g : best), null);
  const intro = (
    <>
      <span>The percent of the field beaten with the given score, with a tie counting as half a win.</span>
      <span>
        Scores are rounded to the nearest whole number for simplicity, but we show yours to one decimal point for
        accuracy.
      </span>
    </>
  );
  if (!example) return intro;
  const m = matchpointPct(example.score, c.groups);
  const exact = (m.pct ?? 0).toFixed(1);
  const shown = formatPct(m.pct);
  return (
    <>
      {intro}
      <span>
        For example, with <span className="num">{formatScore(example.score)}</span> you'd beat {m.beat}, tie with{" "}
        {m.tied} and lose to {m.lost}:{" "}
        <span className="num">
          ({m.beat} + {m.tied / 2}) ÷ {m.n} = {exact}%
        </span>
        {`${exact}%` !== shown && <>, shown as {shown} (if it's not your score)</>}.
      </span>
    </>
  );
}


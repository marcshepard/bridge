import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, Button, FormControlLabel, IconButton, Switch, Typography } from "@mui/material";
import { useState } from "react";
import { describeResult } from "../../core/describe";
import { scoreFor, scoreResult } from "../../core/scoring";
import { type Doubling, type Seat, type Strain, type TableResult, SEATS, SEAT_NAMES, directionOf } from "../../core/types";
import type { Board } from "../../providers/types";
import { Breakdown } from "../components/Breakdown";
import { ContractText, ScoreText, StrainSymbol } from "../controls/BridgeText";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { Panel } from "../controls/Layout";
import { SheetDialog } from "../controls/SheetDialog";
import { relationShort } from "../labels";
import { formatTrickResult } from "../../core/contract";

interface Props {
  open: boolean;
  board: Board;
  seat: Seat;
  initial: TableResult | null;
  onSave: (r: TableResult) => void;
  onClose: () => void;
}

const STRAINS: Array<{ value: Strain; aria: string }> = [
  { value: "C", aria: "Clubs" },
  { value: "D", aria: "Diamonds" },
  { value: "H", aria: "Hearts" },
  { value: "S", aria: "Spades" },
  { value: "NT", aria: "No trumps" },
];

/** Contract, declarer and tricks, with the score worked out live as you go. */
export function EnterResultDialog({ open, board, seat, initial, onSave, onClose }: Props) {
  const [passedOut, setPassedOut] = useState(initial ? initial.contract === null : false);
  const [level, setLevel] = useState<number | null>(initial?.contract?.level ?? null);
  const [strain, setStrain] = useState<Strain | null>(initial?.contract?.strain ?? null);
  const [doubling, setDoubling] = useState<Doubling>(initial?.contract?.doubling ?? "");
  const [declarer, setDeclarer] = useState<Seat | null>(initial?.declarer ?? null);
  const [tricks, setTricks] = useState<number | null>(initial?.contract ? initial.tricks : null);

  const contract = level !== null && strain !== null ? { level, strain, doubling } : null;
  const effectiveTricks = tricks ?? (contract ? contract.level + 6 : 0);

  const result: TableResult | null = passedOut
    ? { contract: null, declarer: null, tricks: 0 }
    : contract && declarer
      ? { contract, declarer, tricks: effectiveTricks }
      : null;

  const breakdown = result ? scoreResult(result, board.vul) : null;
  const ourScore = breakdown ? scoreFor(directionOf(seat), breakdown.nsScore) : null;
  const weDeclared = result?.declarer ? directionOf(result.declarer) === directionOf(seat) : false;

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      title={`Board ${board.number}: enter the result`}
      actions={
        <>
          <Button color="inherit" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" size="large" disabled={!result} onClick={() => result && onSave(result)}>
            Save result
          </Button>
        </>
      }
    >
      <FormControlLabel
        control={<Switch checked={passedOut} onChange={(e) => setPassedOut(e.target.checked)} />}
        label="Passed out"
      />

      {!passedOut && (
        <>
          <ChoiceGroup
            label="Level"
            value={level}
            onChange={(v) => {
              setLevel(v);
              setTricks(null);
            }}
            choices={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n }))}
          />
          <ChoiceGroup
            label="Strain"
            value={strain}
            onChange={setStrain}
            choices={STRAINS.map((s) => ({
              value: s.value,
              ariaLabel: s.aria,
              label: <StrainSymbol strain={s.value} />,
            }))}
          />
          <ChoiceGroup
            label="Doubled?"
            value={doubling}
            onChange={setDoubling}
            choices={[
              { value: "", label: "No" },
              { value: "X", label: "Doubled" },
              { value: "XX", label: "Redoubled" },
            ]}
          />
          <ChoiceGroup
            label="Declarer"
            value={declarer}
            onChange={setDeclarer}
            choices={SEATS.map((s) => ({ value: s, label: SEAT_NAMES[s], sub: relationShort(seat, s) }))}
          />

          {contract && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" component="p" sx={{ mb: 0.5 }}>
                Tricks taken by declarer
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: (t) => `${t.spacing(7)} 1fr ${t.spacing(7)}`, gap: 1 }}>
                <IconButton
                  aria-label="One trick fewer"
                  disabled={effectiveTricks <= 0}
                  onClick={() => setTricks(effectiveTricks - 1)}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
                >
                  <RemoveIcon />
                </IconButton>
                <Box
                  component="output"
                  aria-live="polite"
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    py: 0.5,
                  }}
                >
                  <Typography variant="h4" component="span" className="num">
                    {effectiveTricks}
                  </Typography>
                  <Typography color="text.secondary">
                    <ContractText contract={contract} />{" "}
                    {formatTrickResult({ contract, declarer: "N", tricks: effectiveTricks })}
                  </Typography>
                </Box>
                <IconButton
                  aria-label="One trick more"
                  disabled={effectiveTricks >= 13}
                  onClick={() => setTricks(effectiveTricks + 1)}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
                >
                  <AddIcon />
                </IconButton>
              </Box>
            </Box>
          )}
        </>
      )}

      {breakdown && result && ourScore !== null && (
        <Box sx={{ mt: 3 }} aria-live="polite">
          <Panel>
            <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
              {describeResult(breakdown)}: <ScoreText score={ourScore} /> for your side
            </Typography>
            {result.contract && (
              <Breakdown
                b={breakdown}
                perspective={weDeclared ? "your side declared" : "your side defended, so this counts against declarer"}
              />
            )}
          </Panel>
        </Box>
      )}
    </SheetDialog>
  );
}

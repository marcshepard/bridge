// The bidding system: Standard American Yellow Card, with each of its choices in plain words.
//
// Two ways to open it. Your own card (from the menu or the practice screen): you can change the
// choices the bots know, and they're kept on this device for the games you start or join. A game's
// cards (from a bidding review): read-only, the card each side of that game bids by.

import { Alert, Box, Button, Chip, Stack, Switch, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { type SystemSettings, SAYC_DEFAULTS, SETTING_FIELDS, fieldValue, isDefault } from "../../core/bidding/system";
import { SuitString } from "../controls/BridgeText";
import { ChoiceGroup } from "../controls/ChoiceGroup";
import { SheetDialog } from "../controls/SheetDialog";

type Props =
  | {
      open: boolean;
      onClose: () => void;
      /** Your card, editable. */
      system: SystemSettings;
      onChange: (system: SystemSettings) => void;
      /** Said above the choices (for example, that a game in progress keeps its card). */
      note?: ReactNode;
    }
  | {
      open: boolean;
      onClose: () => void;
      /** A game's cards, read-only: one per side, with a label ("Your side", "Opponents"). */
      cards: { label: string; system: SystemSettings }[];
    };

export function BiddingSystemDialog(props: Props) {
  const editing = "onChange" in props;
  const [shown, setShown] = useState(0);
  const card = editing ? props.system : (props.cards[shown] ?? props.cards[0]!).system;
  const groups = [...new Set(SETTING_FIELDS.map((f) => f.group))];

  return (
    <SheetDialog
      open={props.open}
      title={editing ? "Configure bidding system" : "This game's bidding system"}
      onClose={props.onClose}
      actions={
        editing ? (
          <Button variant="outlined" disabled={isDefault(card)} onClick={() => props.onChange({ ...SAYC_DEFAULTS })}>
            Back to SAYC as it comes
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <>
          <Typography sx={{ mb: 2 }}>
            The bots bid Standard American Yellow Card (SAYC), the system most club players learn. Set the options below the way you play
            them.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            {props.note ?? "Kept on this device. A game uses the card you had when you started or joined it."}
          </Alert>
        </>
      ) : (
        <>
          <Typography sx={{ mb: 1 }}>
            Each side bids by its own card, fixed when the game started. Bots bid their person's card; bots with nobody on their side bid
            SAYC as it comes.
          </Typography>
          {props.cards.length > 1 && (
            <ChoiceGroup
              value={shown}
              onChange={setShown}
              choices={props.cards.map((c, i) => ({ value: i, label: c.label, sub: isDefault(c.system) ? "SAYC as it comes" : "Their own choices" }))}
            />
          )}
          <Box sx={{ mb: 2 }} />
        </>
      )}

      <Box component="section" sx={{ mb: 3 }} aria-label="How the bots value a hand">
        <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
          How the bots value a hand
        </Typography>
        <Typography>Beyond high-card points (HCP: ace 4, king 3, queen 2, jack 1), the bots also consider:</Typography>
        <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2.5, display: "grid", gap: 0.5 }}>
          <li>
            <Typography>
              <strong>Length:</strong> 1 point for each card over four in a suit.
            </Typography>
          </li>
          <li>
            <Typography>
              <strong>Shortness,</strong> once a trump suit is agreed: a void, singleton or doubleton counts 3, 2 or 1 in the hand
              with the long trumps; when raising partner, 3, 2 or 1 with three trumps, 5, 3 or 1 with four or more.
            </Typography>
          </li>
          <li>
            <Typography>
              <strong>Playing tricks,</strong> for a long, strong suit: the tricks it takes by itself (
              <SuitString text="♠KQJ1098" /> is 5). A strong <SuitString text="2♣" /> shows {card.twoNtMax + 1}+ HCP or 9 playing tricks.
            </Typography>
          </li>
        </Box>
      </Box>

      {groups.map((g) => (
        <Box key={g} component="section" sx={{ mb: 3 }} aria-label={g}>
          <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
            {g}
          </Typography>
          <Stack spacing={2}>
            {SETTING_FIELDS.filter((f) => f.group === g).map((f) => {
              const changeable = editing && f.editable;
              const id = `setting-${f.id}`;
              return (
                <Box key={f.id}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" component="p" id={id} sx={{ flex: 1 }}>
                      <SuitString text={f.label} />
                    </Typography>
                    {changeable && f.kind === "toggle" ? (
                      <Switch
                        checked={card[f.key]}
                        onChange={(e) => editing && props.onChange({ ...card, [f.key]: e.target.checked })}
                        slotProps={{ input: { "aria-labelledby": id } }}
                      />
                    ) : (
                      !(changeable && f.kind === "choice") && (
                        <Typography variant="subtitle1" component="p" sx={{ fontWeight: "fontWeightBold" }}>
                          <SuitString text={fieldValue(f, card)} />
                        </Typography>
                      )
                    )}
                  </Stack>
                  {changeable && f.kind === "choice" && (
                    <ChoiceGroup
                      space="tight"
                      value={f.get(card)}
                      onChange={(v) => editing && props.onChange(f.set(card, v))}
                      choices={f.options.map((o) => ({ value: o.value, label: <SuitString text={o.label} />, ariaLabel: `${f.label}: ${o.label}` }))}
                    />
                  )}
                  {f.help(card) && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      <SuitString text={f.help(card)} />
                    </Typography>
                  )}
                  {!f.built && <Chip size="small" variant="outlined" label="Not used by the bots yet" sx={{ mt: 0.5 }} />}
                  {f.built && editing && !f.editable && <Chip size="small" variant="outlined" label="Part of SAYC: not a choice" sx={{ mt: 0.5 }} />}
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
    </SheetDialog>
  );
}

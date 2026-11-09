// The bidding system the bots use: Standard American Yellow Card, with each of its choices in plain
// words. Read-only for now; the choices become editable later (kept on this device).

import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import { describeSettings, SAYC_DEFAULTS } from "../../core/bidding/system";
import { SuitString } from "../controls/BridgeText";
import { SheetDialog } from "../controls/SheetDialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BiddingSystemDialog({ open, onClose }: Props) {
  const lines = describeSettings(SAYC_DEFAULTS);
  const groups = [...new Set(lines.map((l) => l.group))];
  return (
    <SheetDialog open={open} title="Bidding system: SAYC" onClose={onClose}>
      <Typography sx={{ mb: 2 }}>
        The bots bid Standard American Yellow Card (SAYC), the system most club players learn. These are the choices it
        leaves open, set the usual way. Your bids are compared with this system in the bidding review.
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        You'll be able to change these in a later version.
      </Alert>
      {groups.map((g) => (
        <Box key={g} component="section" sx={{ mb: 3 }} aria-label={g}>
          <Typography variant="h6" component="h3" sx={{ mb: 1 }}>
            {g}
          </Typography>
          <Stack spacing={1.5}>
            {lines
              .filter((l) => l.group === g)
              .map((l) => (
                <Box key={l.label}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" component="p" sx={{ flex: 1 }}>
                      <SuitString text={l.label} />
                    </Typography>
                    <Typography variant="subtitle1" component="p" sx={{ fontWeight: "fontWeightBold" }}>
                      <SuitString text={l.value} />
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    <SuitString text={l.help} />
                  </Typography>
                  {!l.built && <Chip size="small" variant="outlined" label="Not used by the bots yet" sx={{ mt: 0.5 }} />}
                </Box>
              ))}
          </Stack>
        </Box>
      ))}
    </SheetDialog>
  );
}

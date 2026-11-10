// Importing a game file (a PBN file or a saved Common Game results page), the same way wherever a
// game is imported (Start a game, Practice with bots): the button, and a "?" beside it that opens
// what a game file is and the steps for saving a Common Game page. The screen reads the file it's handed.

import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import { Alert, Box, Button, Collapse, IconButton, Link, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { ACCEPTED_FILES } from "../../providers/importFile";

interface Props {
  /** A file is already loaded: the button offers a different one. */
  loaded: boolean;
  onFile: (file: File) => void;
  /** More help, after the steps, for this screen only. */
  extraHelp?: ReactNode;
}

export function GameFileUpload({ loaded, onFile, extraHelp }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button variant="outlined" component="label">
          {loaded ? "Import a different file" : "Import game file"}
          <input
            hidden
            type="file"
            accept={ACCEPTED_FILES}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </Button>
        <IconButton
          aria-label="About game files"
          aria-expanded={showHelp}
          onClick={() => setShowHelp((s) => !s)}
        >
          <HelpOutlineIcon />
        </IconButton>
      </Stack>
      <Collapse in={showHelp} unmountOnExit>
        <TcgHelp extra={extraHelp} />
      </Collapse>
    </Stack>
  );
}

/** What a game file is, then step-by-step help for getting a Common Game results page. */
function TcgHelp({ extra }: { extra?: ReactNode }) {
  return (
    <Alert severity="info" icon={false}>
      <Typography variant="body2" sx={{ mb: 1.5 }}>
        Choose a game file with the hands to play and results to score against. Bridge Replay can import
        either a Common Game archive results page or a PBN file.
      </Typography>
      <Typography variant="subtitle2" component="p" sx={{ mb: 1 }}>
        Getting a Common Game results page
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, display: "grid", gap: 0.5 }}>
        <li>
          On a computer, go to{" "}
          <Link href="https://thecommongame.com/" target="_blank" rel="noopener noreferrer">
            thecommongame.com
          </Link>{" "}
          and choose <strong>Archived Common Game</strong>. Only archived games can be imported, never a game that's
          still being played.
        </li>
        <li>Pick the date of the game, and open the results page that shows the boards and the scores.</li>
        <li>
          Save the page: press <strong>Ctrl+S</strong> (<strong>Cmd+S</strong> on a Mac) and save it as{" "}
          <strong>Webpage, HTML only</strong>.
        </li>
        <li>Import the saved .html file here.</li>
      </Box>
      {extra}
      <Typography variant="body2" sx={{ mt: 1 }}>
        The page you save is the field you'll be compared with: the 299er page compares you with the 299ers.
      </Typography>
    </Alert>
  );
}

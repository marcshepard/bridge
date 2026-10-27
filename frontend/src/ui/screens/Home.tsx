import { Button, Typography } from "@mui/material";
import type { Session } from "../../session/session";
import { CardList } from "../controls/CardList";
import { ConfirmButton } from "../controls/ConfirmButton";
import { Screen, Section } from "../controls/Layout";

interface Props {
  sessions: Session[];
  onResume: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function Home({ sessions, onResume, onNew, onDelete }: Props) {
  const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <Screen>
      <Typography variant="h4" component="h1" color="primary" sx={{ mt: 3, mb: 1 }}>
        Bridge Replay
      </Typography>
      <Typography variant="subtitle1" sx={{ mb: 3 }}>
        Play hands from an old duplicate game at home, then see how your result stacks up against the
        original field.
      </Typography>

      <Button variant="contained" size="large" fullWidth onClick={onNew}>
        Start a session
      </Button>

      {sorted.length > 0 && (
        <Section title="Your sessions" id="sessions">
          <CardList
            label="Your sessions"
            items={sorted.map((s) => ({
              key: s.id,
              title: s.gameTitle,
              detail: `Sitting ${s.seat}, ${Object.keys(s.results).length} of ${s.boardOrder.length} boards played`,
              onClick: () => onResume(s.id),
              trailing: (
                <ConfirmButton
                  label="Delete"
                  ariaLabel={`Delete session for ${s.gameTitle}`}
                  onConfirm={() => onDelete(s.id)}
                />
              ),
            }))}
          />
        </Section>
      )}
    </Screen>
  );
}

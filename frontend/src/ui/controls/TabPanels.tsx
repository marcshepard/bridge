// Tabs over a screen's sections, so a long screen doesn't need scrolling on a phone (the result
// screen: Bidding, Play, Hands). Every panel stays mounted while hidden, so work going on in one
// (the play review's analysis) carries on, and coming back to it finds it as it was.

import { Box, Tab, Tabs } from "@mui/material";
import { type ReactNode, useState } from "react";

export interface TabPanel {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: TabPanel[];
  /** The tab shown first (the first tab if missing). */
  initial?: string;
  /** Names the tab list for screen readers. */
  label: string;
}

export function TabPanels({ tabs, initial, label }: Props) {
  const [current, setCurrent] = useState(tabs.some((t) => t.id === initial) ? initial! : tabs[0]?.id);
  if (tabs.length === 0) return null;
  return (
    <Box>
      <Tabs
        value={current}
        onChange={(_, v: string) => setCurrent(v)}
        variant="fullWidth"
        aria-label={label}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 1.5 }}
      >
        {tabs.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} />
        ))}
      </Tabs>
      {tabs.map((t) => (
        <Box key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== current}>
          {t.content}
        </Box>
      ))}
    </Box>
  );
}

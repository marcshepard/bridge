// A list of tappable cards with a title and a line of detail: games to choose, sessions to resume.

import { Box, List, ListItem, ListItemButton, ListItemText, Paper } from "@mui/material";
import type { ReactNode } from "react";

export interface CardItem {
  key: string;
  title: ReactNode;
  detail?: ReactNode;
  selected?: boolean;
  onClick: () => void;
  /** Extra control at the right-hand end, e.g. a delete button. */
  trailing?: ReactNode;
}

export function CardList({ items, label }: { items: CardItem[]; label?: string }) {
  return (
    <List disablePadding aria-label={label} sx={{ display: "grid", gap: 1 }}>
      {items.map((item) => (
        <ListItem key={item.key} disablePadding>
          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              ...(item.selected && { borderColor: "primary.main" }),
            }}
          >
            <ListItemButton selected={item.selected} aria-pressed={item.selected} onClick={item.onClick}>
              <ListItemText
                primary={item.title}
                secondary={item.detail}
                slotProps={{ primary: { variant: "subtitle1" } }}
              />
            </ListItemButton>
            {item.trailing && <Box sx={{ px: 1, flexShrink: 0 }}>{item.trailing}</Box>}
          </Paper>
        </ListItem>
      ))}
    </List>
  );
}

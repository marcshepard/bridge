// The app's dialog: slides up and fills the screen on a phone, a centred dialog on bigger screens.
// Title bar with a close button, scrolling content, and a pinned action area at the bottom.

import CloseIcon from "@mui/icons-material/Close";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slide,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import { forwardRef, useEffect, useState, type ReactElement, type ReactNode, type Ref } from "react";

const SlideUp = forwardRef(function SlideUp(
  props: TransitionProps & { children: ReactElement },
  ref: Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

export function SheetDialog({ open, title, onClose, children, actions }: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [visibleHeight, setVisibleHeight] = useState<number>();
  useEffect(() => {
    if (!open || !phone) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    // Older Safari can size a fixed dialog behind its browser bars. Measure the visible area.
    const resize = () => setVisibleHeight(viewport.scale === 1 ? viewport.height : undefined);
    resize();
    viewport.addEventListener("resize", resize);
    return () => viewport.removeEventListener("resize", resize);
  }, [open, phone]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={phone}
      fullWidth
      maxWidth="sm"
      slots={{ transition: SlideUp }}
      aria-labelledby="sheet-dialog-title"
      style={phone && visibleHeight !== undefined ? { height: visibleHeight } : undefined}
      sx={phone ? { height: "100%", "@supports (height: 100dvh)": { height: "100dvh" } } : undefined}
    >
      <DialogTitle id="sheet-dialog-title" sx={{ pr: 7 }}>
        {title}
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: "absolute", right: (t) => t.spacing(1), top: (t) => t.spacing(1) }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 0 }}>{children}</DialogContent>
      {actions && (
        <DialogActions sx={{ p: 2, pb: (t) => `max(${t.spacing(2)}, env(safe-area-inset-bottom))`, flexShrink: 0 }}>
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
}

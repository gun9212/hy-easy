"use client";

import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { useIsNarrow } from "./layout-context";

/** Desktop: a dialog in the middle of the screen, wide enough to read the original posting beside the facts. */
const DIALOG_WIDTH = 760;
const DIALOG_MAX_HEIGHT = "min(88vh, 960px)";
/** Phone: the drawer already covers the screen. */
const DRAWER_WIDTH = 520;

type Props = {
  label: string;
  title: string;
  subtitle: string;
  close: () => void;
  render: (header: React.ReactNode) => React.ReactNode;
};

/** Frames the posting detail: centered on desktop so it sits where the eye is, a full-height drawer on a phone. */
export function DetailFrame({ label, title, subtitle, close, render }: Props): React.ReactElement {
  const narrow = useIsNarrow();
  const onOpenChange = (open: boolean): void => {
    if (!open) close();
  };
  if (narrow) {
    return (
      <Drawer isOpen onOpenChange={onOpenChange} label={label} width={DRAWER_WIDTH} padding={0}>
        {render(<DrawerHeader title={title} subtitle={subtitle} onOpenChange={onOpenChange} />)}
      </Drawer>
    );
  }
  return (
    <Dialog
      isOpen
      onOpenChange={onOpenChange}
      aria-label={label}
      width={DIALOG_WIDTH}
      maxHeight={DIALOG_MAX_HEIGHT}
      padding={0}
    >
      {render(<DialogHeader title={title} subtitle={subtitle} onOpenChange={onOpenChange} />)}
    </Dialog>
  );
}

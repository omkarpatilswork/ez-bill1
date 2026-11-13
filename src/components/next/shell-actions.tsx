import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ShellActionsContext } from './capture-context';

/** Renders its children into the phone top bar (for example a bill's "more" menu). */
export function ShellActions({ children }: { children: ReactNode }) {
  const slot = useContext(ShellActionsContext);
  return slot ? createPortal(children, slot) : null;
}

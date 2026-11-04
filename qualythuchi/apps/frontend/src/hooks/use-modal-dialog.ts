import { useLayoutEffect, useRef } from 'react';

/** Open in the top layer and position before paint, including the mobile keyboard. */
export function useModalDialog(open = true) {
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!open) {
      if (element.open) element.close();
      return;
    }

    const viewport = window.visualViewport;
    let frame: number | undefined;
    const position = () => {
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      element.style.setProperty('--dialog-center-x', `${(viewport?.offsetLeft ?? 0) + width / 2}px`);
      element.style.setProperty('--dialog-center-y', `${(viewport?.offsetTop ?? 0) + height / 2}px`);
      element.style.setProperty('--dialog-viewport-width', `${width}px`);
      element.style.setProperty('--dialog-viewport-height', `${height}px`);
    };
    const reposition = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => { frame = undefined; position(); });
    };

    element.setAttribute('data-centered-dialog', '');
    element.setAttribute('autofocus', '');
    if (!element.hasAttribute('tabindex')) element.tabIndex = -1;
    position();
    if (!element.open) element.showModal();
    // Keep opening a form from immediately focusing an input, opening the
    // keyboard, and making the browser scroll the dialog to that input.
    element.focus({ preventScroll: true });

    window.addEventListener('resize', reposition);
    viewport?.addEventListener('resize', reposition);
    viewport?.addEventListener('scroll', reposition);
    return () => {
      window.removeEventListener('resize', reposition);
      viewport?.removeEventListener('resize', reposition);
      viewport?.removeEventListener('scroll', reposition);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (element.open) element.close();
    };
  }, [open]);

  return dialog;
}

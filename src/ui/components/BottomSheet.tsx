import type { ComponentChildren } from 'preact';
import { useId, useLayoutEffect, useRef } from 'preact/hooks';
import { IconButton } from './IconButton';
import { t } from '../i18n/t';

/** Controlled native modal sheet with focus trapping, Escape and focus restoration. */
export function BottomSheet({
  open,
  title,
  children,
  onDismiss,
}: {
  open: boolean;
  title: string;
  children: ComponentChildren;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    dialog.showModal();
    return () => {
      dialog.close();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      class="ui-sheet"
      aria-labelledby={id}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (node) =>
            node.tabIndex >= 0 &&
            !node.matches(':disabled') &&
            node.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <header class="ui-panel-header">
        <h2 id={id}>{title}</h2>
        <IconButton icon="close" label={t('ui.close')} onClick={onDismiss} />
      </header>
      <div class="ui-panel-body">{children}</div>
    </dialog>
  );
}

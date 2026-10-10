import type { ComponentChildren } from 'preact';
import { IconButton } from './IconButton';
import { t } from '../i18n/t';

/** Labelled reusable panel with optional dismissal and footer actions. */
export function Panel({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
  onClose?: () => void;
}) {
  return (
    <section class="ui-panel" aria-label={title}>
      <header class="ui-panel-header">
        <h2>{title}</h2>
        {onClose && (
          <IconButton icon="close" label={t('ui.close')} onClick={onClose} />
        )}
      </header>
      <div class="ui-panel-body">{children}</div>
      {actions && <footer class="ui-actions">{actions}</footer>}
    </section>
  );
}

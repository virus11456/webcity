import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { t } from '../i18n/t';

/** Persistent announcement remains readable until explicitly dismissed. */
export function Toast({
  message,
  tone = 'success',
  onDismiss,
}: {
  message: string | null;
  tone?: 'success' | 'error';
  onDismiss: () => void;
}) {
  return (
    <div class={`ui-toast ui-toast--${tone}`} hidden={!message}>
      <Icon name={tone === 'success' ? 'check' : 'info'} />
      <p role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
        {message ?? ''}
      </p>
      <IconButton
        icon="close"
        label={t('ui.dismissToast')}
        onClick={onDismiss}
      />
    </div>
  );
}

import { useId, useState } from 'preact/hooks';
import { Button } from './Button';
import { Icon } from './Icon';

/** Help trigger exposes the same description to touch, pointer and keyboard users. */
export function Tooltip({ label, text }: { label: string; text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      class="ui-tooltip"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onFocusIn={() => setOpen(true)}
      onFocusOut={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <Button
        aria-label={label}
        aria-describedby={id}
        onClick={() => setOpen(true)}
      >
        <Icon name="info" />
      </Button>
      <span id={id} role="tooltip" hidden={!open}>
        {text}
      </span>
    </span>
  );
}

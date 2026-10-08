import type { ComponentChildren } from 'preact';
import { useId, useRef } from 'preact/hooks';

export interface TabItem {
  id: string;
  label: string;
  content: ComponentChildren;
  disabled?: boolean;
}
/** Automatic-activation tabs with roving focus and Arrow/Home/End navigation. */
export function Tabs({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div class="ui-tabs">
      <div ref={ref} class="ui-tab-list" role="tablist" aria-label={label}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            class="ui-button"
            id={`${id}-tab-${item.id}`}
            role="tab"
            aria-selected={value === item.id}
            aria-controls={`${id}-panel-${item.id}`}
            tabIndex={value === item.id ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              const enabled = items.filter((tab) => !tab.disabled);
              const current = enabled.findIndex((tab) => tab.id === item.id);
              const index =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? enabled.length - 1
                    : event.key === 'ArrowRight'
                      ? (current + 1) % enabled.length
                      : event.key === 'ArrowLeft'
                        ? (current - 1 + enabled.length) % enabled.length
                        : -1;
              const next = enabled[index];
              if (!next) return;
              event.preventDefault();
              onChange(next.id);
              ref.current
                ?.querySelector<HTMLButtonElement>(
                  `[id="${id}-tab-${next.id}"]`,
                )
                ?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${id}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${item.id}`}
          hidden={item.id !== value}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

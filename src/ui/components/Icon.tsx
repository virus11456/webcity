import { ICON_PATHS as paths } from '../../data/icons';
export type { IconName } from '../../data/icons';
import type { IconName } from '../../data/icons';

/** Mount once per UI root; original icons share an inline SVG sprite. */
export function IconSprite() {
  return (
    <svg class="ui-icon-sprite" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(paths).map(([name, d]) => (
          <symbol key={name} id={`ui-icon-${name}`} viewBox="0 0 24 24">
            <path d={d} />
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

/** Decorative 24px icon; the containing control supplies its accessible name. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      class="ui-icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d={paths[name]} />
    </svg>
  );
}

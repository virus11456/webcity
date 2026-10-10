const paths = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm4 12 5 5L20 6',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  water: 'M12 2C10 6 4 11 4 15a8 8 0 0 0 16 0c0-4-6-9-8-13ZM8 15c0 2 1 3 3 3',
  power: 'm13 2-9 12h7l-1 8 10-13h-7l1-7Z',
} as const;
export type IconName = keyof typeof paths;

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
      <use href={`#ui-icon-${name}`} />
    </svg>
  );
}

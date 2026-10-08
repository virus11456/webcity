import type { ComponentProps } from 'preact';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

type Props = Omit<ComponentProps<typeof Button>, 'children' | 'aria-label'> & {
  icon: IconName;
  label: string;
};
/** Icon-only button always requires a visible-on-hover and accessible name. */
export function IconButton({ icon, label, ...props }: Props) {
  return (
    <Button {...props} aria-label={label} title={label}>
      <Icon name={icon} />
    </Button>
  );
}

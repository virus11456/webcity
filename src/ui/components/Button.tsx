import type { JSX } from 'preact';

type Props = JSX.IntrinsicElements['button'] & {
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
};

/** Native button with consistent touch size and disabled loading state. */
export function Button({
  variant = 'secondary',
  loading = false,
  children,
  class: className = '',
  disabled,
  ...props
}: Props) {
  return (
    <button
      type="button"
      {...props}
      class={`ui-button ui-button--${variant} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}

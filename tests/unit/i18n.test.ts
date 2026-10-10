import { describe, expect, it } from 'vitest';
import { t } from '@/ui/i18n/t';

describe('UI copy in the Node test environment', () => {
  it('resolves the application name without browser globals', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(t('app.name')).toBe('WebCity');
  });
});

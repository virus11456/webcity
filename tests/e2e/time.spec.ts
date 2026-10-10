import { expect, test } from '@playwright/test';

test('normal speed averages one game day every 2.4 seconds within five percent', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'Desktop',
    'Wall-clock precision check runs once; touch date controls run in simulation.spec.',
  );
  test.setTimeout(30_000);
  await page.goto('./?quality=low');
  await expect(page.locator('.sim-controls')).toHaveAttribute(
    'data-ready',
    'true',
  );
  const millisecondsPerDay = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const panel = document.querySelector<HTMLElement>('.sim-controls')!;
        const times: number[] = [];
        let previous = panel.dataset.day;
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error('Calendar failed to advance four days'));
        }, 20000);
        const observer = new MutationObserver(() => {
          if (panel.dataset.day === previous) return;
          previous = panel.dataset.day;
          times.push(performance.now());
          if (times.length === 4) {
            observer.disconnect();
            clearTimeout(timeout);
            resolve((times[3]! - times[0]!) / 3);
          }
        });
        observer.observe(panel, {
          attributes: true,
          attributeFilter: ['data-day'],
        });
      }),
  );
  await info.attach('calendar-rate', {
    body: JSON.stringify({
      millisecondsPerDay,
      expected: 2400,
      tolerancePercent: 5,
    }),
    contentType: 'application/json',
  });
  expect(Math.abs(millisecondsPerDay - 2400) / 2400).toBeLessThan(0.05);
});

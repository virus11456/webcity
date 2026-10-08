import { render } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import { Button } from './components/Button';
import { Icon, IconSprite } from './components/Icon';
import { IconButton } from './components/IconButton';
import { Panel } from './components/Panel';
import { BottomSheet } from './components/BottomSheet';
import { Slider } from './components/Slider';
import { Tabs } from './components/Tabs';
import { Tooltip } from './components/Tooltip';
import { Toast } from './components/Toast';
import { layout, observeLayout } from './store';
import { t } from './i18n/t';
import './styles/ui-kit.css';

function UiGallery() {
  useLayoutEffect(observeLayout, []);
  const [sheet, setSheet] = useState(false);
  const [value, setValue] = useState(70);
  const [tab, setTab] = useState('home');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [panel, setPanel] = useState(true);
  const notify = (isError: boolean) => {
    setError(isError);
    setMessage(t(isError ? 'ui.demoError' : 'ui.demoSaved'));
  };
  return (
    <main class="ui-gallery" data-layout={layout.value}>
      <IconSprite />
      <header class="ui-gallery-header">
        <div>
          <p class="ui-eyebrow">{t('ui.galleryEyebrow')}</p>
          <h1>{t('ui.galleryTitle')}</h1>
          <p>{t('ui.galleryHint')}</p>
        </div>
        <a class="ui-button" href="./">
          {t('ui.backToCity')}
        </a>
      </header>
      <div class="ui-gallery-meta">
        <span>
          {t('ui.currentLayout')} · {t(`ui.layout.${layout.value}`)}
        </span>
        <span>{t('ui.touchHint')}</span>
      </div>
      <div class="ui-gallery-grid">
        <Panel title={t('ui.buttons')}>
          <p>{t('ui.buttonsHint')}</p>
          <div class="ui-actions">
            <Button variant="primary" onClick={() => notify(false)}>
              {t('ui.primary')}
            </Button>
            <Button onClick={() => setSheet(true)}>{t('ui.openSheet')}</Button>
            <Button variant="danger" onClick={() => notify(true)}>
              {t('ui.error')}
            </Button>
            <Button disabled>{t('ui.disabled')}</Button>
            <Button loading>{t('ui.loading')}</Button>
          </div>
        </Panel>
        <Panel title={t('ui.icons')}>
          <p>{t('ui.iconsHint')}</p>
          <div class="ui-actions">
            <IconButton
              icon="home"
              label={t('ui.homeIcon')}
              onClick={() => notify(false)}
            />
            <IconButton
              icon="water"
              label={t('ui.waterIcon')}
              onClick={() => notify(false)}
            />
            <IconButton
              icon="power"
              label={t('ui.powerIcon')}
              onClick={() => notify(false)}
            />
            <Tooltip label={t('ui.help')} text={t('ui.tooltipText')} />
          </div>
          <div class="ui-icon-preview" aria-hidden="true">
            <Icon name="home" />
            <Icon name="water" />
            <Icon name="power" />
            <Icon name="check" />
            <Icon name="close" />
            <Icon name="info" />
          </div>
        </Panel>
        <Panel title={t('ui.sliders')}>
          <Slider
            label={t('ui.volume')}
            value={value}
            min={0}
            max={100}
            step={5}
            unit="%"
            onInput={setValue}
          />
          <Slider
            label={t('ui.lockedSlider')}
            value={50}
            min={0}
            max={100}
            unit="%"
            disabled
            onInput={() => {}}
          />
        </Panel>
        <Panel title={t('ui.tabs')}>
          <Tabs
            label={t('ui.zoneTabs')}
            value={tab}
            onChange={setTab}
            items={[
              {
                id: 'home',
                label: t('ui.residential'),
                content: t('ui.residentialHint'),
              },
              {
                id: 'locked',
                label: t('ui.lockedTab'),
                content: '',
                disabled: true,
              },
              {
                id: 'shop',
                label: t('ui.commercial'),
                content: t('ui.commercialHint'),
              },
            ]}
          />
        </Panel>
        {panel ? (
          <Panel
            title={t('ui.panel')}
            onClose={() => setPanel(false)}
            actions={
              <Button onClick={() => setSheet(true)}>
                {t('ui.openSheet')}
              </Button>
            }
          >
            <p>{t('ui.panelHint')}</p>
          </Panel>
        ) : (
          <Panel title={t('ui.panel')}>
            <Button onClick={() => setPanel(true)}>
              {t('ui.restorePanel')}
            </Button>
          </Panel>
        )}
        <Panel title={t('ui.notifications')}>
          <p>{t('ui.notificationsHint')}</p>
          <Button onClick={() => notify(false)}>{t('ui.showToast')}</Button>
        </Panel>
      </div>
      <BottomSheet
        open={sheet}
        title={t('ui.sheetTitle')}
        onDismiss={() => setSheet(false)}
      >
        <p>{t('ui.sheetHint')}</p>
        <Slider
          label={t('ui.volume')}
          value={value}
          min={0}
          max={100}
          step={5}
          unit="%"
          onInput={setValue}
        />
        <div class="ui-actions">
          <Button
            variant="primary"
            onClick={() => {
              setSheet(false);
              notify(false);
            }}
          >
            {t('ui.confirm')}
          </Button>
          <Button onClick={() => setSheet(false)}>{t('ui.cancel')}</Button>
        </div>
      </BottomSheet>
      <Toast
        message={message}
        tone={error ? 'error' : 'success'}
        onDismiss={() => setMessage(null)}
      />
    </main>
  );
}

/** Load the isolated component playground without starting the simulation or renderer. */
export function startUiGallery(root: HTMLElement): void {
  render(<UiGallery />, root);
}

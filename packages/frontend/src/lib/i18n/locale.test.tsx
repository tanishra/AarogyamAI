import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { I18nProvider, useI18n } from '../i18n';
import en from './en';
import hi from './hi';

function Probe() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="text">{t('common.save')}</span>
      <button onClick={() => setLocale('hi')}>switch</button>
    </div>
  );
}

describe('locale switching', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders English by default and Hindi after setLocale("hi")', async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('text').textContent).toBe(en['common.save']);

    await act(async () => {
      screen.getByRole('button', { name: 'switch' }).click();
    });

    expect(screen.getByTestId('locale').textContent).toBe('hi');
    expect(screen.getByTestId('text').textContent).toBe(hi['common.save']);
    expect(window.localStorage.getItem('aarogyam.locale')).toBe('hi');
  });
});

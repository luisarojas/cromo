import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS } from '@cromo/shared';
import enMessages from '../../messages/en.json';
import esMessages from '../../messages/es.json';

// Guard against the failure mode "added an achievement, forgot to translate it".
// The badge UI uses next-intl's t(`<key>.title`) / t(`<key>.description`) — a
// missing entry only surfaces when a user hovers the badge. This assertion
// catches the gap at test time so every locale ships in lockstep.

interface AchievementEntry {
  title?: string;
  description?: string;
}

const locales: Record<string, { achievements: Record<string, AchievementEntry> }> = {
  en: enMessages as { achievements: Record<string, AchievementEntry> },
  es: esMessages as { achievements: Record<string, AchievementEntry> },
};

describe('achievements i18n coverage', () => {
  for (const [localeKey, messages] of Object.entries(locales)) {
    describe(`${localeKey}.json`, () => {
      it('declares a sectionTitle for the badge panel', () => {
        expect(messages.achievements.sectionTitle).toBeTruthy();
      });

      for (const def of ACHIEVEMENTS) {
        it(`has title + description for "${def.key}"`, () => {
          const entry = messages.achievements[def.key];
          expect(entry, `missing achievements.${def.key}`).toBeDefined();
          expect(entry?.title, `missing achievements.${def.key}.title`).toBeTruthy();
          expect(entry?.description, `missing achievements.${def.key}.description`).toBeTruthy();
        });
      }
    });
  }
});

/**
 * Rotation wording. Only what the rule backs is stated:
 * - next rotation: "rotates out early 2027" (a day only once it is official),
 * - later sets: "stays until at least early 2028" (the earliest possible date),
 * - special rules: "stays until at least 2029".
 */
import type { Locale } from '../../config/site';
import type { RotationEstimate, SetRotation } from '../data/schema';
import { createFormatters, daysBetween, yearOf } from '../format';
import { useTranslations } from '../i18n';
import type { Wave } from './waves';

export type RotationTone = 'hot' | 'calm';

/** Days per month for the rough "in about 3 months" countdown. */
const DAYS_PER_MONTH = 30.4;

export function createRotationText(locale: Locale, estimate: RotationEstimate) {
  const { t, plural } = useTranslations(locale);
  const format = createFormatters(locale);
  const isOfficial = estimate.certainty === 'official';

  const when = (iso: string): string =>
    isOfficial && iso === estimate.day
      ? t('when.on', { date: format.date(iso) })
      : t('when.early', { year: yearOf(iso) });

  return {
    /** "early 2027", or "on 29.01.2027" once the date is official. */
    when,

    /** Headline of the next rotation: "Early 2027" or the official day. */
    headline(): string {
      if (!estimate.day) return t('hero.unknown');
      if (isOfficial) return format.date(estimate.day);
      const text = t('when.early', { year: yearOf(estimate.day) });
      return text.charAt(0).toUpperCase() + text.slice(1);
    },

    /** "in about 3 months" while estimated, "in 12 days" once official. */
    countdown(today: string): string {
      if (!estimate.day) return '';
      const days = Math.max(0, daysBetween(today, estimate.day));
      if (isOfficial) return t('countdown.days', { span: plural('count.days', days) });
      const months = Math.max(1, Math.round(days / DAYS_PER_MONTH));
      return t('countdown.months', { span: plural('count.months', months) });
    },

    forSet(rotation: SetRotation): string {
      if (rotation.legalUntilAtLeast != null) {
        return t('rotation.special', { year: rotation.legalUntilAtLeast });
      }
      if (rotation.wave === 0) {
        if (!rotation.earliest) return t('rotation.next');
        const key = rotation.certain ? 'rotation.out' : 'rotation.maybeOut';
        return t(key, { when: when(rotation.earliest) });
      }
      if (!rotation.earliest) return t('rotation.later');
      return t('rotation.staysUntil', { year: yearOf(rotation.earliest) });
    },

    tone(rotation: SetRotation): RotationTone {
      return rotation.wave === 0 ? 'hot' : 'calm';
    },

    waveTitle(wave: Wave): string {
      switch (wave.kind) {
        case 'next':
          return wave.earliest
            ? t('wave.next', { when: when(wave.earliest) })
            : t('wave.nextUnknown');
        case 'later':
          return wave.earliest
            ? t('wave.later', { year: yearOf(wave.earliest) })
            : t('wave.laterUnknown');
        case 'special':
          return t('wave.special', { year: wave.legalUntilAtLeast ?? '' });
      }
    },

    /**
     * Small note next to a wave title: the next rotation gets one once it is official, the
     * later waves none, as their title already says "at least until".
     */
    waveBadge(wave: Wave): string | null {
      switch (wave.kind) {
        case 'next':
          return isOfficial ? t('wave.badge.official') : null;
        case 'later':
          return null;
        case 'special':
          return t('wave.badge.special');
      }
    },
  };
}

export type RotationText = ReturnType<typeof createRotationText>;

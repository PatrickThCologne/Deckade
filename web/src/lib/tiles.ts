import type { Locale } from '../config/site';
import type { MtgSet } from './data/schema';
import { createFormatters } from './format';
import { useTranslations } from './i18n';
import { setPath } from './links';

/** Everything a set tile needs. */
export interface TileData {
  readonly code: string;
  readonly name: string;
  readonly href: string;
  readonly subline: string;
  readonly note: string | null;
  readonly packImage: string | null;
  readonly iconUrl: string | null;
}

export function setTile(set: MtgSet, locale: Locale): TileData {
  const { t } = useTranslations(locale);
  const format = createFormatters(locale);
  const upcoming = set.standard?.status === 'upcoming';
  const rotation = set.standard?.rotation;
  return {
    code: set.code,
    name: set.name,
    href: setPath(locale, set.code),
    subline: upcoming
      ? t('wave.upcoming', { date: format.date(set.releasedAt) })
      : format.monthYear(set.releasedAt),
    note: rotation && rotation.wave === 0 && !rotation.certain ? t('wave.maybe') : null,
    packImage: set.packImage,
    iconUrl: set.iconUrl,
  };
}

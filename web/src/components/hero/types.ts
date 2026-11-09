/** One key figure in the hero banner, optionally linking to a section of the page. */
export interface HeroStat {
  value: string;
  label: string;
  tone: 'hot' | 'calm' | 'accent' | 'special';
  href?: string;
}

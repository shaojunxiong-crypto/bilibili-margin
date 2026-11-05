import type { Settings } from '../shared/settings';

/** 同一组颜色变量穿透各页 Shadow DOM；通知 / 错误仍使用语义色。 */
export function applyAppearance(s: Settings, active = s.enabled): void {
  const de = document.documentElement;
  if (active) {
    if (de.dataset.marginGlass !== s.glass) de.dataset.marginGlass = s.glass;
  } else de.removeAttribute('data-margin-glass');
  const colors = active && s.accent !== 'classic' ? s.accent === 'blue'
    ? ['#007da8','#006a91','#60c7ed'] : ['#b92f64','#a82858','#ff98be'] : null;
  const variables: [string,string | null | undefined][] = [
    ['--margin-primary',colors?.[0]], ['--margin-primary-fg',colors ? '#fff' : null],
    ['--margin-accent-light',colors?.[1]], ['--margin-accent-dark',colors?.[2]],
  ];
  for (const [key,value] of variables) {
    if (value) { if (de.style.getPropertyValue(key) !== value) de.style.setProperty(key,value); }
    else de.style.removeProperty(key);
  }
}

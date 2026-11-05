import { geocodeList, type Place } from '../api/weather';
import { h } from './dom';

/** 天气卡和设置共用候选搜索，选中带地区的地点后才保存。 */
export function createCityPicker(onPick: (place: Place) => void) {
  const input = h('input', { class: 'city-in', type: 'search', placeholder: '输入城市', 'aria-label': '天气城市', autocomplete: 'off' }) as HTMLInputElement;
  const row = h('div', { class: 'city-row' }, input);
  const list = h('ul', { class: 'city-list', role: 'listbox', 'aria-label': '城市候选', hidden: '' });
  const el = h('div', { class: 'city-box' }, row, list);
  let timer = 0, sequence = 0;
  const cancel = () => {
    clearTimeout(timer);
    sequence++;
    list.hidden = true;
  };
  const search = async () => {
    cancel();
    const query = input.value.trim(), request = sequence;
    if (!query) return;
    list.replaceChildren(h('li', { class: 'empty', role: 'status' }, '搜索中…'));
    list.hidden = false;
    try {
      const places = await geocodeList(query);
      if (request !== sequence || !el.isConnected) return;
      list.replaceChildren(...(places.length ? places.map(place => {
        const option = h('li', { role: 'option', tabindex: '0' }, h('b', {}, place.name), h('small', {}, place.region));
        const pick = () => { cancel(); input.value = place.name; onPick(place); };
        option.addEventListener('click', pick);
        option.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); }
        });
        return option;
      }) : [h('li', { class: 'empty', role: 'status' }, '没有找到这个城市')]));
    } catch {
      if (request !== sequence || !el.isConnected) return;
      list.replaceChildren(h('li', { class: 'empty', role: 'status' }, '搜索失败，请重试'));
    }
  };
  input.addEventListener('input', () => {
    cancel();
    if (input.value.trim()) timer = window.setTimeout(search, 300);
  });
  el.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') cancel();
    if (event.target !== input || event.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); search(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); list.querySelector<HTMLElement>('[role="option"]')?.focus(); }
  });
  return { el, row, input, cancel };
}

import { messageEmotes, sendImage, sendText, uploadMessageImage, validateMessageImage, type EmotePack, type MessageImage } from '../api/msg';
import { h, icon, ICONS } from './dom';
import { reducedMotion } from '../motion';

/** 21st Emoji Picker / File Attachment 的轻量原生适配；数据与发送使用 B 站接口。 */
export function createMessageComposer(o: { me: number; to: number; name: string; csrf: () => string; say: (s: string) => void; onSent: () => Promise<void> }) {
  const input = h('textarea', { class: 'wh-input', rows: 1, placeholder: `发消息给 ${o.name}`, maxlength: 500, 'aria-label': `发消息给 ${o.name}` }) as HTMLTextAreaElement;
  const send = h('button', { class: 'wh-send', type: 'button', disabled: '' }, '发送') as HTMLButtonElement;
  const photo = h('button', { class: 'wh-tool', type: 'button', 'aria-label': '添加图片', title: '添加图片' }, icon(ICONS.image)) as HTMLButtonElement;
  const emoji = h('button', { class: 'wh-tool', type: 'button', 'aria-label': '选择表情', title: '选择表情', 'aria-expanded': 'false' }, icon(ICONS.smile)) as HTMLButtonElement;
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/gif,image/webp', hidden: '' }) as HTMLInputElement;
  const count = h('span', { class: 'wh-count', 'aria-live': 'off' }, '0/500');
  const thumb = h('img', { alt: '待发送图片' });
  const remove = h('button', { class: 'wh-attachment-remove', type: 'button', 'aria-label': '移除图片' }, icon(ICONS.close)) as HTMLButtonElement;
  const filename = h('span', { class: 'wh-filename' });
  const attachment = h('div', { class: 'wh-attachment', hidden: '' }, thumb, filename, remove);
  const hint = h('small', { class: 'wh-media-hint', hidden: '' }, '图片和文字将分别发送');
  const panel = h('section', { class: 'wh-emoji-panel', role: 'dialog', 'aria-label': 'B站表情', hidden: '' });
  const el = h('div', { class: 'wh-compose' }, panel, attachment,
    h('div', { class: 'wh-compose-row' }, input, send),
    h('div', { class: 'wh-compose-tools' }, photo, emoji, fileInput, hint, count));
  let active = true, busy = false, selected: File | null = null, uploaded: MessageImage | null = null, objectUrl = '';
  let start = 0, end = 0, packs: EmotePack[] | null = null, loading = false;
  let panelAnimation: Animation | null = null, attachmentAnimation: Animation | null = null;
  const selectedEmotes = new Set<string>();
  const controller = new AbortController();
  const sync = () => {
    count.textContent = `${input.value.length}/500`;
    send.disabled = busy || input.value.length > 500 || (!selected && !input.value.trim());
    input.disabled = photo.disabled = emoji.disabled = remove.disabled = busy;
    hint.hidden = !(selected && input.value.trim());
    send.textContent = busy ? '发送中…' : '发送';
  };
  const closePicker = (focus = false) => {
    panelAnimation?.cancel(); panelAnimation = null;
    panel.hidden = true; emoji.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (focus) emoji.focus({ preventScroll: true });
  };
  const outside = (e: Event) => { if (!e.composedPath().includes(panel) && !e.composedPath().includes(emoji)) closePicker(); };
  const clearImage = () => {
    attachmentAnimation?.cancel(); attachmentAnimation = null;
    selected = null; uploaded = null; attachment.hidden = true; thumb.removeAttribute('src');
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; fileInput.value = ''; sync();
  };
  const selectFile = (file?: File) => {
    if (!file || busy || !active) return;
    try { validateMessageImage(file); } catch (e) { o.say((e as Error).message); fileInput.value = ''; return; }
    clearImage(); selected = file; objectUrl = URL.createObjectURL(file);
    thumb.src = objectUrl; filename.textContent = file.name || '粘贴的图片'; attachment.hidden = false; sync(); input.focus();
    if (!reducedMotion()) attachmentAnimation = attachment.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
  };
  photo.onclick = () => fileInput.click();
  fileInput.onchange = () => selectFile(fileInput.files?.[0]);
  remove.onclick = () => { if (!busy) { clearImage(); input.focus(); } };
  input.addEventListener('paste', (e) => { const file = e.clipboardData?.files[0]; if (file?.type.startsWith('image/')) { e.preventDefault(); selectFile(file); } });
  el.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  el.addEventListener('drop', (e) => { if (e.dataTransfer?.files.length) { e.preventDefault(); selectFile(e.dataTransfer.files[0]); } });
  const remember = () => { start = input.selectionStart; end = input.selectionEnd; };
  for (const event of ['select', 'keyup', 'click', 'blur']) input.addEventListener(event, remember);
  input.addEventListener('input', () => { remember(); sync(); });

  const paintPicker = () => {
    const search = h('input', { class: 'wh-emoji-search', type: 'search', placeholder: '搜索表情', 'aria-label': '搜索表情' }) as HTMLInputElement;
    const tabs = h('div', { class: 'wh-emoji-tabs', role: 'tablist', 'aria-label': '表情包' });
    const grid = h('div', { class: 'wh-emoji-grid', role: 'group', 'aria-label': '表情列表' });
    let pack = 0;
    const paint = () => {
      const query = search.value.trim().toLowerCase();
      const items = query ? packs!.flatMap(p => p.emotes).filter(e => e.text.toLowerCase().includes(query)) : packs![pack]?.emotes ?? [];
      const seen = new Set<string>();
      grid.replaceChildren(...items.filter(e => !seen.has(e.text) && !!seen.add(e.text)).map(e => {
        const b = h('button', { class: 'wh-emote', type: 'button', 'aria-label': e.text, title: e.text }, h('img', { src: e.url, alt: e.text, loading: 'lazy', referrerpolicy: 'no-referrer' }));
        b.onclick = () => {
          if (input.value.length - (end - start) + e.text.length > 500) { o.say('消息不能超过 500 字'); return; }
          input.setRangeText(e.text, start, end, 'end'); selectedEmotes.add(e.text); remember(); sync(); closePicker(); input.focus();
        };
        return b;
      }));
      if (!items.length) grid.append(h('p', { class: 'wh-emoji-empty' }, '没有找到表情'));
      tabs.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-selected', String(i === pack && !query)));
    };
    packs!.forEach((p, i) => { const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(!i), onclick: () => { pack = i; search.value = ''; paint(); } }, p.name); tabs.append(b); });
    search.oninput = paint;
    grid.addEventListener('keydown', (e) => {
      const keys: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
      const buttons = [...grid.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(e.target as HTMLButtonElement);
      if (index < 0 || !(e.key in keys || e.key === 'Home' || e.key === 'End')) return;
      e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + keys[e.key]));
      buttons[next]?.focus();
    });
    panel.replaceChildren(search, tabs, grid); paint(); search.focus();
  };
  const loadPicker = async () => {
    if (loading) return;
    if (packs) { paintPicker(); return; }
    loading = true; panel.replaceChildren(h('p', { class: 'wh-emoji-empty', role: 'status' }, '正在加载表情…'));
    try {
      packs = await messageEmotes();
      if (!active || panel.hidden) return;
      if (!packs.length) throw new Error('暂时没有可用表情');
      paintPicker();
    } catch (e) {
      packs = null;
      if (active && !panel.hidden) panel.replaceChildren(h('p', { class: 'wh-emoji-empty' }, (e as Error).message), h('button', { class: 'ghost small', type: 'button', onclick: () => loadPicker() }, '重试'));
    } finally { loading = false; }
  };
  emoji.onclick = () => {
    if (!panel.hidden) { closePicker(); return; }
    remember(); panel.hidden = false; emoji.setAttribute('aria-expanded', 'true'); document.addEventListener('pointerdown', outside, true); void loadPicker();
    panelAnimation?.cancel();
    if (!reducedMotion()) panelAnimation = panel.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 150, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  };
  panel.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closePicker(true); } });
  const go = async () => {
    const text = input.value.trim();
    if (busy || !active || (!text && !selected)) return;
    if (input.value.length > 500) { o.say('消息不能超过 500 字'); return; }
    busy = true; closePicker(); sync(); let sent = false;
    try {
      if (selected) {
        uploaded ??= await uploadMessageImage(selected, o.csrf(), controller.signal);
        if (!active) return;
        if (!await sendImage(o.me, o.to, uploaded, o.csrf())) throw new Error('图片发送失败，请重试');
        clearImage(); sent = true;
      }
      if (text && active) {
        if (!await sendText(o.me, o.to, text, o.csrf(), [...selectedEmotes].some(e => text.includes(e)))) throw new Error('文字发送失败，请重试');
        input.value = ''; selectedEmotes.clear(); start = end = 0; sent = true;
      }
    } catch (e) { if (active) o.say((e as Error).message || '发送失败，请重试'); }
    finally {
      busy = false;
      if (active) {
        sync(); input.focus();
        if (sent) await o.onSent().catch(() => o.say('已发送，消息列表暂时刷新失败'));
      }
    }
  };
  send.onclick = () => { void go(); };
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); void go(); } });
  return { el, focus: () => input.focus(), dispose() { active = false; controller.abort(); closePicker(); clearImage(); } };
}

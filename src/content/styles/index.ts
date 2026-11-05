/**
 * styles.css 按区块拆分后的拼接入口（v0.51）。
 * 各文件按原顺序 join 成同一段文本注入 <style>，所以拆分不改变任何层叠结果；
 * 拆开只是为了改某一类样式时不用在 1700 行里翻。
 */
import base from './01-base.css?inline';
import header from './02-header.css?inline';
import cards from './03-cards.css?inline';
import glass_folder from './04-glass-folder.css?inline';
import footprint from './05-footprint.css?inline';
import watch from './06-watch.css?inline';
import overlays from './07-overlays.css?inline';
import home_search from './08-home-search.css?inline';
import appearance from './09-appearance.css?inline';

export default [base, header, cards, glass_folder, footprint, watch, overlays, home_search, appearance].join('');

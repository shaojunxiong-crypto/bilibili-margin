# 字体与许可

本扩展打包了以下字体的子集（GB2312 常用字 + 常用标点符号），仅用于界面显示：

| 文件 | 字体 | 作者 | 许可 |
| --- | --- | --- | --- |
| Geist.woff2 / GeistMono.woff2 | Geist / Geist Mono | Vercel | SIL Open Font License 1.1 — https://github.com/vercel/geist-font |
| MarginSans-SC.woff2 | Noto Sans SC（思源黑体）可变字重 400–700 子集 | Google / Adobe | SIL Open Font License 1.1 — https://github.com/notofonts/noto-cjk |
| MarginSerif-SC.woff2 | LXGW Neo ZhiSong（霞鹜新致宋）子集 | LXGW | IPA Font License 1.0 — https://github.com/lxgw/LxgwNeoZhiSong |
| InstrumentSerif.woff2 / InstrumentSerif-Italic.woff2 | Instrument Serif（拉丁子集，正体 + 斜体） | Instrument / Rodrigo Fuenzalida | SIL Open Font License 1.1 — https://github.com/Instrument/instrument-serif |

子集文件为派生作品，按各自原许可分发；完整许可文本见上述仓库。

两款中文字体子集（MarginSans-SC / MarginSerif-SC，源文件在仓库 fonts-src/，不打进扩展包）按 unicode-range 各分成 34 片放在 fonts/sc/（sans-*.woff2 / serif-*.woff2），由 scripts/slice-fonts.py 生成，@font-face 表见 fonts/margin-sc.css。低频组适度合并，常用组保持独立加载。切片只改变文件划分，不改字形，仍按上表各自的许可（OFL 1.1 / IPA 1.0）分发，字体名保持为 Margin Sans SC / Margin Serif SC（与原字体名区分）。
| MarginGrotesk.woff2 | Alte Haas Grotesk Regular，ASCII 子集 | Yann Le Coroller（dafont） | Freeware，可随许可文件分发 — public/fonts/licenses/AlteHaasGrotesk-licence.rtf |

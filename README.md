<div align="center">

<img src="store/edge/logo-300.png" width="104" height="104" alt="映间 MARGIN 图标" />

<h1>映间 MARGIN</h1>

<p><strong>给 B 站换一个更清晰的界面。</strong></p>
<p>编辑式排版、液态玻璃控件、动态背景，保留熟悉的原生播放体验。</p>
<p>A quieter interface for Bilibili, with clean layouts, liquid glass controls and animated backgrounds.</p>

<p>
  <a href="https://github.com/jiuyang5354/bilibili-margin/releases/latest"><img src="https://img.shields.io/github/v/release/jiuyang5354/bilibili-margin?label=version&amp;color=00aeec" alt="最新版本" /></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/%E6%98%A0%E9%97%B4-margin/"><img src="https://img.shields.io/amo/v/margin@jiuyang5354.github.io?label=Firefox%20Add-ons&amp;color=ff7139" alt="Firefox 附加组件商店" /></a>
  <img src="https://img.shields.io/badge/browser-Edge%20%2F%20Chrome%20%2F%20Firefox-535b66" alt="支持 Edge、Chrome 和 Firefox" />
  <img src="https://img.shields.io/badge/extension-Manifest%20V3-535b66" alt="Manifest V3" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-535b66" alt="MIT 许可" /></a>
</p>

<p>
  <a href="https://github.com/jiuyang5354/bilibili-margin/releases/latest">下载扩展</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能">功能</a> ·
  <a href="#常见问题">常见问题</a> ·
  <a href="CHANGELOG.md">更新日志</a> ·
  <a href="https://github.com/jiuyang5354/bilibili-margin/issues">反馈问题</a>
</p>

<p><strong>简体中文</strong> | <a href="README.en.md">English</a></p>

</div>

> **English summary**
>
> MARGIN is an open-source Edge / Chrome / Firefox extension that redesigns Bilibili's homepage, search, video and reading pages. It keeps the native player, danmaku and comments, while adding themes, recommendation filters, favorites shortcuts and a local activity heatmap. Settings and activity records stay on your device; weather uses third-party location and forecast services. Read the [full English README](README.en.md).

## 界面预览

| 浅色首页 | 暗色首页 |
| :---: | :---: |
| ![浅色主题下的推荐流与足迹热力图](store/edge/screenshots/1.png) | ![暗色主题下的推荐流与动态背景](store/edge/screenshots/2.png) |

<details>
<summary>查看播放页、命令面板、收藏夹和搜索页</summary>

| 播放页 | 命令面板 |
| :---: | :---: |
| ![保留 B 站原生播放器的播放界面](store/edge/screenshots/3.png) | ![搜索联想与快捷命令](store/edge/screenshots/4.png) |

| 收藏夹 | 搜索页 |
| :---: | :---: |
| ![玻璃文件夹样式的收藏夹抽屉](store/edge/screenshots/5.png) | ![重新排版的搜索结果](store/edge/screenshots/6.png) |

</details>

截图展示主要界面，具体样式以当前版本为准。

## 快速开始

1. 从 [最新版本](https://github.com/jiuyang5354/bilibili-margin/releases/latest) 下载 [`margin.zip`](https://github.com/jiuyang5354/bilibili-margin/releases/latest/download/margin.zip)，解压到固定文件夹。
2. 打开 `edge://extensions` 或 `chrome://extensions`，开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择包含 `manifest.json` 的文件夹。
4. 打开或刷新 [B 站](https://www.bilibili.com/)。

更新手动安装版时，将新版解压到原来的文件夹，在扩展管理页点击**重新加载**，再刷新 B 站。详细变化见[更新日志](CHANGELOG.md)。

**Firefox（140 及以上）**：从 [Firefox 附加组件商店安装](https://addons.mozilla.org/en-US/firefox/addon/%E6%98%A0%E9%97%B4-margin/)（推荐，可长期使用并自动更新）。备用方式：下载 [`margin-firefox.zip`](https://github.com/jiuyang5354/bilibili-margin/releases/latest/download/margin-firefox.zip)（直链，始终是最新版），打开 `about:debugging#/runtime/this-firefox`，点击**临时载入附加组件**，选择这个 zip；临时载入的扩展在重启 Firefox 后会被移除。

其他 Chromium 内核浏览器（Brave、Opera、Vivaldi、Arc 等）可以按 Chrome 的步骤安装，但未逐一测试。Safari 暂不支持。

## 功能

| 模块 | 可以做什么 |
| --- | --- |
| 首页与搜索 | 个性推荐、热门视频、无限加载、换一批，以及关键词、UP 主、播放量和时长过滤。 |
| 原生播放 | 重新排版标题、UP 主卡片、选集与推荐列表，保留原生播放器、弹幕、评论、清晰度及全屏操作。 |
| 收藏与稍后再看 | 玻璃文件夹收藏抽屉、稍后再看列表、观看进度和视频右键菜单。 |
| 足迹 | 年 / 月热力图、每日首次打开时间与停留时长、观看历史补全、数据来源提示。 |
| 阅读与账号页面 | 动态、图文、专栏的阅读布局，以及个人空间、历史、动态流和消息页面的统一界面。 |
| 外观与背景 | 亮色、暗色、跟随系统；13 款动态背景、自定义图片与强度调节，包含汇流和点击冲击波。 |
| 快捷操作 | 搜索联想、命令面板、悬停预览、可翻面的头像工牌和可修改城市的天气卡片。 |
| 本地数据 | 设置与足迹保存在本机，可导出和导入 JSON 备份。 |

部分账号功能需要登录 B 站；是否可用也受 B 站自身的接口、权限与地区限制影响。

## 常见问题

### 怎么临时回到 B 站原版？

在顶栏菜单选择**原版**，或在页面链接中添加 `?margin=off`。也可以在扩展弹窗中关闭 MARGIN。

### 会替换播放器或影响我的账号吗？

播放仍由 B 站原生播放器负责。扩展使用你当前的 B 站登录状态请求页面所需的数据；收藏、稍后再看等操作仍通过 B 站接口完成。

### 会自动更新吗？

手动加载的解压版需要按上面的步骤更新；弹窗会提示 GitHub 新版本。从 Edge 商店安装的版本由浏览器分发审核通过的更新。

### 动态背景是否一直运行？

页面可见时，背景在滚动和视频播放期间保持动态；标签页隐藏时暂停，并遵循系统的“减少动态效果”设置。开场动画覆盖页面时会暂缓底层背景绘制。渲染采用自适应调度，实际帧率取决于设备和页面负载，不保证所有场景固定 60fps。参见[性能说明](docs/performance-v0.31.0.md)。

## 隐私

开发者不运营统计或数据收集服务器。设置、足迹与自定义背景保存在本机；导出备份由你自行保存。

天气功能会请求 `ipwho.is` 获取粗略城市定位，并向 Open-Meteo 请求城市搜索和天气预报；这些服务会收到必要的 IP、城市或坐标信息。B 站账号、收藏与观看历史不会发送给天气服务。完整说明见[隐私政策](PRIVACY.md)。

本扩展为独立开源项目，**非 bilibili 官方产品，与哔哩哔哩无关联**。

## 开发与贡献

使用 Node.js 22 安装依赖并构建：

```bash
npm ci
npm run build
```

构建结果在 `dist/`，可直接作为解压扩展加载。在提供 `zip` 命令的环境中运行 `npm run pack`，会生成 `margin.zip`。

页面使用原生 TypeScript、CSS 和 Shadow DOM；Vite 按路由拆分页面模块，后台 service worker 负责合并足迹计时，中文字体按字符范围分包。

欢迎[报告问题或提出建议](https://github.com/jiuyang5354/bilibili-margin/issues)。提交界面修改时，请附上页面地址、复现步骤和截图；修改播放页时保留 B 站原生播放能力。设计来源与第三方署名见[设计参考与致谢](docs/design-references.md)。
- 21st「Video Player」（chetanverma16）：播放器浮动控制坞（v0.40.0）
- 21st「Post Card」（shadcnui-blocks）：播放页播放器 + 互动 + 简介合成一张卡片（v0.41.0）
- 21st「Comment Thread」（klyv-ui）：楼中楼对话树的限深缩进与细引导线（v0.49.0）

## 许可

[MIT License](LICENSE) © 2026 jiuyang5354。第三方组件、字体与素材的许可分别见[设计参考与致谢](docs/design-references.md)和[字体许可说明](public/fonts/FONTS-LICENSES.md)。

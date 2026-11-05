**中文** | [English](design-references.en.md)

# 设计参考与致谢

[返回项目介绍](../README.md)

以下记录项目迭代中采用的参考与移植来源；历史实现描述不代表当前版本仍使用同一种技术。第三方代码、字体与素材遵循各自许可。

- 私信图片 / 表情：参考 21st [Emoji Picker（liveblocks）](https://21st.dev/@liveblocks/components/emoji-picker) 的搜索、分类与弹出面板，以及 [File Attachment（serafimcloud）](https://21st.dev/@serafimcloud/components/file-attachment) 的缩略图 / 移除交互，按现有 TypeScript 与 CSS 变量独立实现，不增加 React 依赖。表情目录、上传与消息格式对照 B 站原生消息页脚本，不在运行时请求 21st。
- 首页与播放页沿用原有昼夜开关；小主题按钮预览方案已按用户要求撤回。
- 稍后再看图标：对齐 [B 站原生搜索页](https://search.bilibili.com/all?keyword=bilibili) 卡片的圆环播放图形；路径坐标保留三位小数并从 20 缩放到 24 viewBox。

- 首页搜索栏（v0.23.0）：21st Placeholders And Vanish Input / Morphing Search / Expandable Search Bar；X 上 @MSchwaibold、@vponamariov 的搜索交互；热榜序号像素字体 Pirkkala（Otto Ojala，dafont，Public domain/OFL）
- 播放页悬浮菜单字体（v0.23.2）：中文改无衬线 Margin Sans SC（思源黑体子集），英文副标 Alte Haas Grotesk（Yann Le Coroller，dafont，freeware，许可见 public/fonts/licenses/）
- 头像工牌（v0.27.0）：移植自 21st「ID Card Lanyard」（用户提供代码）；v0.25.x 的推荐画廊（21st Elastic Gallery）已在 v0.27.0 移除
- 播放页 UP 卡（v0.34.0）：参考 21st「Item With Actions」（felipemenezes098）、「Profile Hover Card」（isaiahbjork）；选集参考课程播放页的编号目录
- 背景「汇流」（v0.33.0）：移植自 21st「Gateway Flow」（Neuform），Canvas 2D 点线汇流 + 点击冲击波
- 详情页（v0.32.0）：单条动态、图文、专栏的两栏版式移植自 21st「Article With Author Sidebar」（olewandowski1）
- 首页天气卡（v0.26.0）：点阵天空与小图标移植自 21st「Weather Widget」（vijayksingh）；数据来自 Open-Meteo（CC BY 4.0），定位 ipwho.is

交互参考了 21st.dev 上的 Sheet、Segmented Control、Chip Group、Minimal Slider、Glow Button、Glass Button、Toggle Switch、Command Search 等组件的形态，用原生 TypeScript / CSS 重新实现。

阴影（Smooth Shadows 的分层合成与 0.5px 发丝环）和嵌套圆角规则（Perfect Corner Radius）也来自 movements.dev。足迹热力图的玻璃透镜算法移植自 movements.dev「Refractive Glass」（@movements/react-glass，MIT）。背景「流光」用 [vgpu](https://vgpu.sh)（vercel-labs，MIT）写 WebGPU 计算着色器：2.4 万颗粒子沿旋度噪声流场漂移，只在选中这款背景时才加载；浏览器不支持 WebGPU 时自动退回 WebGL 近似版。首页开场动画移植自 21st.dev「Glass Reveal」（引擎源自 zanwei/glass-icon-reveal，MIT），图标为 Simple Icons 的 B 站小电视。头像卡片移植自 21st.dev「User Profile Dropdown Menu」（shadcnspace）。个人空间与消息中心的版式参考了 21st.dev 的 Editorial Image Hero、Editorial service list、Activity Timeline、Notification Panel、Conversation List；历史记录页参考 Activity Timeline（olewandowski1），动态首页的作者行参考 SocialPostCard（ruixen.ui），足迹卡片的月视图参考 Glass Calendar。标题里的西文与英文眉标用 Instrument Serif（OFL）。

收藏夹的玻璃文件夹按 21st.dev「Glass Folder Cards」的公开源码移植（React → 原生 TS，含液态纹理生成算法、扇形展开、··· 菜单与入场组装），并接入 B 站收藏数据：后板是收藏夹封面，口袋里是最近收藏的 4 个视频。

昼夜切换按用户提供的 Uiverse「theme-switch」移植（太阳滑入月亮、云沉星落），配色改为跟随站点调色板。

顶栏快捷入口按 21st.dev「Expandable Tabs」的源码移植（framer-motion 弹簧展开 → 原生 CSS 过渡，点外部收起）。

命令面板按 21st.dev「Command Palette」（rafa-porto，Raycast 风格）移植：点顶栏搜索框、按 `/` 或 `Ctrl/⌘ + K` 唤出，有 B 站搜索联想、最近搜索、bilibili 热搜和 MARGIN 命令（换一批、切主题、收藏夹、网页全屏……），↑↓ 选、↵ 执行、Tab 切分类，常用命令按次数排前。

视频卡片右键菜单按 21st.dev「Context Menu」（ddoemonn）移植：新标签打开、稍后再看、复制链接 / BV 号、UP 主空间、不看该 UP；贴边自动翻转，支持键盘和首字母跳转，Shift + 右键是浏览器原生菜单。

「稍后再看」抽屉按 21st.dev「Drawer」（ddoemonn）移植：右侧弹簧滑出、遮罩随位置变化、拖动头部甩出关闭；顶栏「稍后」、命令面板和卡片右键都能打开，可直接移出条目，显示观看进度。

首页背景新增 6 款着色器：丝缎、烟霞、流萤、流沙、天光、弥散，移植自 21st.dev Shader Builder 系列（Silk、Smoke、Neuro Noise、Grain Gradient、God Rays、Mesh Gradient；Mesh Gradient 改编自 Paper Shaders，Apache-2.0），配色按亮暗主题重新调过；设置面板的样式色块改为真实渲染的缩略图。推荐流加载占位按「Skeleton Loader」（animbits）改成 1.5s 流光。播放页右缘的刻度尺滚动进度按「Scroll Bars」（radiumcoders）竖向版移植：滚动时出现，指示条弹簧跟随，悬停显示百分比，点刻度跳转。

播放页底部的快捷菜单按 21st.dev「Floating Menu」移植（胶囊变形成面板、墨色圆从底部漫上来、逐字翻滚悬停），配色换成墨色 / 暖白，菜单字改衬线：回到顶部、看评论、网页全屏、宽屏模式、收藏夹。

顶栏的液态玻璃（搜索框、快捷入口胶囊、选中滑块）按 21st.dev「Apple Liquid glass switcher」（Den Dionigi）移植：多层内阴影高光 + `backdrop-filter: url(#位移滤镜)` 折射背后的内容，选中滑块移动时弹一下。原版位移图是按 344×76 胶囊画的，这里按每块玻璃的实际尺寸用光学公式（squircle 斜面 + 斯涅尔折射）现算，尺寸变化时重算。

首页足迹热力图的液态玻璃借鉴 bubbbly「GitHub Glass Card」的 WebGL 透镜思路：背景着色器先画进纹理，再在卡片位置做边缘折射、内部模糊、顶光高光与乳白 / 墨色染色（改写为圆角矩形 SDF，自写实现）。命令面板 v0.10 改为两栏：左边搜索，右边命令。


实验功能「App 推荐流」（v0.48）：首页推荐改走 B 站 App 接口 `app.bilibili.com/x/v2/feed/index`，TV 端扫码授权拿 access_key。接口、APP 签名与扫码流程参考 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)（CC BY-NC 4.0，文档）与 [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly)「授权 App」的做法（MIT），代码为原生重写。

可选的「跳过视频内广告」使用 [小电视空降助手 / BilibiliSponsorBlock](https://github.com/hanydd/BilibiliSponsorBlock) 社区片段及其[公开 API](https://github.com/hanydd/BilibiliSponsorBlock/wiki/API)。片段来自社区贡献者，仅按 BVID 哈希前缀只读查询，不捆绑数据库或复制上游扩展代码。映间的查询、播放器跳过与撤销逻辑为独立实现；社区片段与第三方服务不属于本仓库的 MIT 代码许可。

扩展自带操作图标取自 IconMCP 的 outline 图标，通过 Icon MCP 查询并导出静态 SVG，统一按 20px / 1.5px 线宽本地打包；保留品牌标志、原生 B 站控件及场景插画。图标运行时不访问外部服务。

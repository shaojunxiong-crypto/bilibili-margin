# Safari 兼容与打包准备（#12）

2026-11-04：完成源码与官方文档核对。当前在 Windows 验证，**尚未通过真实 Safari 扩展安装和播放验收**，不将此文档视为已发布 Safari 支持。

## 当前代码检查

| 使用点 | 检查结果 / 待验收内容 |
| --- | --- |
| Manifest V3、后台 service worker | Apple 支持此结构；后台在顶层注册监听，持久状态使用 storage.local。待验后台休眠后足迹和消息恢复。 |
| chrome.storage.local / onChanged、runtime 消息 / getURL / getManifest | Apple 支持 chrome 命名空间与 Promise。未使用 Safari 缺失的 identity、storage.sync 或 webRequestBlocking。待验设置、背景图、动态模块加载和消息响应。 |
| cdn.js 的 content_scripts.world: MAIN | MDN 兼容数据标为 Safari 18 起；更早版本不能据此承诺 CDN 切换支持。待验 document_start 注入及不重复播放。 |
| 页面模块 ES import 与 web_accessible_resources | 路由页面与字体、flux.js 已列在 manifest。待验 Safari 扩展协议、权限授予和 CSP 下的动态加载。 |
| SVG backdrop-filter | 默认柔和模式不生成折射位移图，液态折射仍依赖 SVG URL 滤镜；不能用 CSS 语法可接受代替效果验证。需要实际检查文字清晰度与玻璃兜底。 |
| WebGPU / WebGL | 流光已有初始化失败退回 WebGL；仍需验收实际 GPU、上下文丢失和前后台恢复。 |
| 新增社区片段查询 | 只在显式开启后查询 bsbsb.top；需在 Safari 授予对应站点权限后验收后台跨域及撤销操作。 |

## 在 Mac 上打包

先用与当前分支相同的源码构建，再使用 Apple 当前工具。此命令不覆盖已有工程；`--copy-resources` 避免 Xcode 工程回写原始 dist。

```sh
npm ci
npm run build
xcrun safari-web-extension-packager ./dist \
  --project-location ./safari-xcode \
  --app-name MARGIN \
  --bundle-identifier io.github.jiuyang5354.margin \
  --macos-only --swift --copy-resources --no-open
```

旧版 Xcode 的工具名是 `safari-web-extension-converter`，可用相同参数调用。打包前运行工具的 `--help`，并审核它报告的 manifest 警告。

在 Xcode 中选择自己的开发团队、构建并运行 macOS 宿主 App，按 Apple 的运行文档启用扩展，并在 Safari 中允许访问对应的 B 站页面。分发、签名和 App Store 审核另行处理；仓库当前没有签名的 Safari 安装包。

## 安装后的验收

1. 首次授权与刷新后：首页、播放、搜索、空间、消息、动态、历史均正常加载，禁用扩展与 `?margin=off` 能恢复原版。
2. 背景与主题切换、透明控件、字体和账号卡片在亮暗主题与窄窗口下可读；后台切回后恢复。
3. 原生视频不中断或重复初始化，普通 / 宽屏 / 网页全屏切换、弹幕、评论草稿与收起正常。
4. 收藏夹直接展开、消息刷新和足迹在多个标签及后台重启后保持正确。
5. 社区跳过默认不请求第三方，开启后只跳当前分 P，撤销和关闭即时生效；拒绝服务权限或接口失败时仍能播放。

## 依据

- [Apple：评估跨浏览器兼容性](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)
- [Apple：打包 Web 扩展](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Apple：运行 Safari Web 扩展](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
- [MDN：content_scripts 兼容数据](https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/content_scripts.json)

[中文](design-references.md) | **English**

# Design references and credits

[Back to the project](../README.en.md)

These notes retain references and adaptations from the project history. Historical implementation descriptions do not necessarily describe the current renderer. Third-party code, fonts and assets retain their respective licenses.

- Private-message media follows the search, categories and popover pattern of 21st [Emoji Picker by liveblocks](https://21st.dev/@liveblocks/components/emoji-picker) and the thumbnail/removal pattern of [File Attachment by serafimcloud](https://21st.dev/@serafimcloud/components/file-attachment). Independently implemented in the existing TypeScript/CSS stack without React. Bilibili's native message-page scripts inform the catalog, upload and payload protocol; no runtime requests are made to 21st.
- Home and watch retain the original day/night switch; the compact watch theme-button proposal was withdrawn at the user's request.
- Watch later icon: matches the circular play icon on [native Bilibili search cards](https://search.bilibili.com/all?keyword=bilibili); path coordinates use three decimal places and scale from a 20 to a 24 viewBox.

The watch page uploader card (v0.34.0) follows 21st "Item With Actions" (felipemenezes098) and "Profile Hover Card" (isaiahbjork).

The "Gateway" background (v0.33.0) ports 21st "Gateway Flow" (Neuform) to Canvas 2D.

Detail pages (v0.32.0) for single posts, opus articles, and columns port the two-column layout of 21st "Article With Author Sidebar" (olewandowski1).

Interactions were independently implemented in native TypeScript and CSS after studying 21st.dev components including Sheet, Segmented Control, Chip Group, Minimal Slider, buttons, toggles, and Command Search.

Adapted component references include:

- **Glass Folder Cards:** React-to-native-TypeScript adaptation with liquid texture generation, fan-out, menus, and entrance assembly, connected to Bilibili favorites and recent thumbnails.
- **Sun Moon Theme Toggle:** Web Animations arc keyframes with reversal when clicked midway.
- **Expandable Tabs:** native CSS transitions adapting the original spring expansion.
- **Command Palette** by rafa-porto: Raycast-style search and commands; a two-column layout was added in v0.10.
- **Context Menu** and **Drawer** by ddoemonn: edge-aware keyboard navigation, spring drawer behavior, and drag dismissal.
- **Skeleton Loader** by animbits and vertical **Scroll Bars** by radiumcoders.
- **Floating Menu:** a capsule expanding into a panel with a rising ink circle and word-by-word hover movement.
- **Apple Liquid glass switcher** by Den Dionigi: layered inset highlights and `backdrop-filter` displacement. Maps are recalculated for each element using a squircle bevel and Snell refraction.
- **Editorial Image Hero**, **Editorial service list**, **Activity Timeline**, **Notification Panel**, and **Conversation List** informed space and message layouts.

The heatmap glass lens algorithm is adapted from movements.dev Refractive Glass (@movements/react-glass, MIT). Layered shadows and the 0.5px hairline ring follow Smooth Shadows; nested corner radii follow Perfect Corner Radius, also from movements.dev.
 The "Flux" background is a WebGPU compute shader built with [vgpu](https://vgpu.sh) (vercel-labs, MIT): 24,000 particles drifting through a curl-noise flow field, loaded only when that background is selected, with a WebGL fallback when WebGPU is unavailable.

Additional shader references are Silk, Smoke, Neuro Noise, Grain Gradient, God Rays, and Mesh Gradient from 21st's Shader Builder series. Mesh Gradient derives from Paper Shaders under Apache-2.0. Settings thumbnails render the actual shaders.

The activity heatmap's glass takes inspiration from bubbbly's **GitHub Glass Card** WebGL lens approach. The background is rendered to a texture and sampled through a rounded-rectangle SDF lens with edge refraction, blur, highlights, and tinting. This implementation is independently written.

The optional advertisement-skipping feature uses community segments from [BilibiliSponsorBlock](https://github.com/hanydd/BilibiliSponsorBlock) through its [public API](https://github.com/hanydd/BilibiliSponsorBlock/wiki/API). It makes read-only BVID hash-prefix queries, without bundling the database or copying upstream extension code. MARGIN's query, seek and undo implementation is independently written; community data and the third-party service are outside this repository's MIT code license.

Extension-owned action icons use IconMCP outlines queried and exported through Icon MCP, normalized to 20px / 1.5px strokes and bundled as static SVG. Brand marks, native Bilibili controls and scene illustrations are preserved. Icons make no runtime requests to an external service.

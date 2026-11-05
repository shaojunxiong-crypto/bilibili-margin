[中文](CHANGELOG.md) | **English**

# Changelog

## Unreleased

- Fix square corners on the black video loading surface. Apply the existing clipping before the native player sets its screen mode, covering radius settings, wide mode, mini player and fullscreen.
- Mount the watch-page card as soon as native hydration finishes, removing the previous polling delay of up to about 1.5 seconds. Coalesce startup observation by animation frame and bound its lifetime, with periodic checks covering late nodes.
- Load native profile-page drawers through a separate on-demand module, reducing the entry script by about 64% and lowering startup script parsing. Add regressions for initial loading, late mounting, hydration and native media node continuity.

- Fix the weather search selecting the Shandong namesake of Zhuhai. The weather card and settings share explicit location candidates with regional details, including a supplementary city-suffix search for Chinese names. Discard stale searches and weather responses after clearing, switching cities, or returning to automatic location, and validate cached weather against the current coordinates (#73).
- Fix excessive trailing space in the native video share capsule and collapsed text after native label transitions. Cover counts, the copy prompt, and browser zoom levels (#38).
- Update the header hover setting and its description to match the current sliding indicator behavior (#11).

- Fix the creator card jumping upward and danmaku or playlist spacing changing when a wide player becomes a mini player. Preserve the preceding document layout and anchor sidebar placement to the original player placeholder, including resize, sidebar updates, and return to wide mode (#58).

- Fix the wide player covering the creator card during scrolling when native sticky positioning pins the left column. Keep the wide column in document flow and cover creator hit testing, screen-mode transitions, and recovery from the mini player (#58).

- Fix recommendations and playlists being pushed far below the player when automatic wide mode starts. Sidebar placement accounts for existing native spacing and removes the duplicate danmaku spacer, with coverage for automatic entry, manual toggling, late mounting, and cleanup (#58).
- Restore a live badge below the profile avatar that opens the corresponding live room. Live status loads independently so slow or failed status requests leave profile information and actions usable (#71).
- Add previous and next scroll buttons to the followed-creator strip on the dynamic feed. Controls reflect scroll boundaries, search results, and viewport changes, and support keyboard input and reduced motion. Keep the empty search field stable on blur so creator clicks reach their target (#72).

- Add a responsive inset to profile statistics and action buttons, with left-aligned placement in narrow windows.

- Let the footprint card fill the content area when weather is disabled (#69).
- Use the homepage's standalone settings button across extension pages (#70).
- Match the title container to the actual wide player's width, including window resizing (#66).
- Add Collections and Series to user spaces, with covers, video counts, detail views, pagination, list view, empty states and retry. Discard stale responses after switching tabs (#67).
- Keep the home category bar's layout space during its sticky transition to prevent flickering while older followed videos load (#11 feedback).

- Remove the visible full-width header band while scrolling over image backgrounds. Drop the header tint, parent backdrop blur and lower mask across pages while keeping individual search/navigation glass controls. Add high-contrast background checks for scrolling, both themes and both glass modes.

- Reduce bundled Chinese font fragmentation from 97 to 34 files per family while preserving Unicode coverage, outlines and variable weights. Common-character groups remain separate; no system-font substitution or remote fonts. Use maximum Deflate compression for the release ZIP.

- Unify extension-owned action icons with locally bundled IconMCP outlines across navigation, search, favorites, messages, settings, feed actions and the image viewer. Preserve brand marks and native player/comment controls.
- Position the header glass indicator on interaction and use an interruptible 200ms transition, removing continuous hover layout polling and overlapping bounces. Add a 150ms emoji-panel entrance and a 140ms attachment fade; cancel on dismissal, removal or conversation changes and respect reduced motion.
- Soften the watch header fade and remove full-header blur in soft-glass mode. Render private-message sessions without waiting for profile requests, hydrate names/avatars progressively and show page-memory chat history before refreshing, preserving the active draft and focus.

- Add native Bilibili image and emoji support to private messages: select, paste or drop a single image with preview/removal; lazily load emoji packs with categories, search and cursor insertion, and render original emoji images/GIFs in chat. Preserve failed drafts, cancel uploads on conversation changes and retry only the unsent part of mixed image/text messages.
- Fix uploader cards following the floating mini-player and creating excessive right-column gaps. Align against the player's document placeholder, preserve the initial gap during scrolling and recalibrate at the top; retain normal-mode, title-wrap and wide-mode-return alignment.
- Restore the previous watch-page UI outside the requested title, player, uploader, danmaku-list and playlist area. Comments return below the player with their previous styling; remove fixed side comments, input-height options and the compact theme button. Preserve performance improvements and native nodes.
- Fix automatic feed filling bypassing its retry delay when recommendations are duplicates or fully filtered, causing repeated requests and skeleton creation. Coalesce automatic loads during empty-batch cooldowns; changing tabs, refreshing or restoring the previous batch clears the cooldown.
- Update home and watch settings lists only when their contents change, avoiding hidden order, CDN and filter-chip rebuilds during theme changes. Skip unchanged segmented-control values.
- Reuse folder geometry and cover nodes while hovering. Recalibrate after drawer/page scrolling, viewport resizing and column changes, preserving animated backgrounds and full hover effects.

- Keep visible backgrounds animated during playback, continuous scrolling and open drawers by removing obsolete pause conditions. Hidden tabs, covered fullscreen backgrounds and reduced-motion preferences retain their protections. Add activity regressions that count GL draw calls separately from physical-device FPS measurements.

- Add classic / Bilibili blue / pink accents and soft frosted / liquid refractive controls. Classic colors and soft frosting are the defaults; primary actions and links share theme variables while notifications and errors keep semantic colors. Soft mode skips displacement-map computation; large drawers use solid surfaces. Keep the classic home layout and pill search field.
- Add responsive 2 / 3 / 4-column favorites, full hover previews and a plain three-dot menu. New installs open folder contents directly while existing choices remain intact. Personal shortcuts can be reordered with keyboard focus preserved; watch-later icons match native search cards.
- Keep the previous comment input height and heading typography, while retaining the modern comment editor's 14–17 text-size fix.

- Keep the classic home layout, pill search field and day/night switch; discard the side navigation proposal. Restore the previous watch header and day/night switch while preserving player, danmaku and playlist controls.
- Add “Mark all as read” for all message categories, keeping the separate chat action. Refresh server unread counts after processing and retain failed categories and drafts. Fix ignored chat acknowledgement failures, the 25-page cap, and system cursor handling across personal notices and announcements, including cursor precision.

- Align the author panel with the player in normal mode, updating after title wrapping, resizing and leaving wide mode without moving native nodes (#11).
- Do not classify an intentional 30fps background cap as dropped frames; use the effective frame interval so removing the cap resumes the normal cadence while retaining load-based fallback.
- Preview background intensity locally while dragging and persist once on release, avoiding repeated storage writes and full settings-panel synchronization.
- Render space profile identity and actions before slower statistics or optional banner fallback; patch only counters and the banner afterward, preserving focused controls and interaction state.
- Refresh unread badges when returning to the tab or window, including shortly after reading messages elsewhere; coalesce duplicate resume events.
- Stabilize interactive targets on draggable account cards: links and buttons use a pointer cursor, and hovering them holds the card position and tilt while other areas retain drag and flip behavior (#11).
- Fixed white reply-loading masks in dark mode by synchronizing the native `--bg1_rgb` token, including live theme changes (#65).
- Fixed the direct-open favorites setting across watch, search, space, message, feed, history and native-space entries, including live updates (#11).
- Added an Upload visibility option (#11) and fixed narrow headers pushing the avatar off screen and displacing the account card (#38).
- Added collapse/reopen controls for both generations of native nested comments while preserving pagination, drafts and asynchronous replies (#11).
- Preserved the native author card's measured width and replaced its scaling entrance with an opacity transition; removed excess share-button width (#38).
- Disabled gravity simulation for fixed account cards, fixing gradual drift with dragging disabled; reduced-motion mode also stays fixed (#11 / #38).
- Kept search, profile and video navigation inside Chrome application windows (#18), preserving ordinary browser tabs, modified clicks and explicit Open in New Tab actions.
- Added opt-in community advertisement skipping (#64), using BilibiliSponsorBlock's read-only hash-prefix API and matching the current CID and duration. Skips can be undone; network failures leave playback intact. Added the `bsbsb.top` host permission, with no new requests while disabled, and updated privacy information and attribution.
- Added regressions for native media seek/undo, application-window navigation, header controls, favorites, nested comments and card geometry.
- Fixed collapsing feed height and header-widget jumps during refresh (#59), integrating PR #60 by @liguochuan00 with stale-request guards and zoom-aware positioning. Failed refreshes preserve the old list.
- Rendered emoji in dynamic posts, reposts and inline comments (#61), preserving original image URLs and falling back to text when loading fails.
- Resolve missing comment identifiers on demand and expand pinned/hot replies below the post, with collapse and a full-comments link on failure (#61).
- Reposition late-mounted or resized collection sidebars in wide mode and clean up observers and spacing when leaving wide mode (#58).
- Added dynamic-data unit tests and browser regressions for delayed/failed refreshes, other feed tabs, zoom, comment fallback and late sidebars.
- Fixed the full-screen overlay blocking native space pages after drawers close.
- Kept the history drawer in its original style container so it appears above the space page.
- Cancelled pending close callbacks when reopening history; closing restores the previous scroll state and focus.
- Calculated history progress from watched seconds and duration, including the completed marker.
- Added browser regression tests for space drawers in light and dark themes, and included them in CI.

## [v0.52.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.52.0) · 2026-11-04

- **Removed the YouTube-style layout** (#51): 映间 now ships a single visual language. Deleted `ui/yt/` (648 lines), both YT stylesheets, the `ytHome` setting and all branches that depended on it. Tag filtering, the space-page waiver and the message-toggle linkage are unaffected.
- **Header no longer reflows on hover** (#49, #50, GitHub #11): items keep a fixed width, a sliding indicator moves instead of expanding text, and each icon now has a native tooltip.
- **New "6 per row" grid option** (#48, GitHub #11): auto / 4 / 5 / 6, falling back 6 → 5 → 3 on narrow windows.
- **Background image applies immediately after upload** (#47, GitHub #31): `chrome.storage.onChanged` never fired when the settings object was unchanged; the uploader now notifies the background layer explicitly.

## [v0.51.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.51.0) · 2026-11-04

- **YouTube-style layout** (Settings → Appearance, off by default): Home, watch page, channel page and search page use a large-thumbnail + two-line-info arrangement; the header "Settings" entry becomes its own button instead of a row in the expandable menu. From PR #32 (@zwh-study); conflicts with `main` resolved as unions by the maintainer.
- **Tag filters** (Settings → Content filters, off by default): hide videos by tag on Home, Popular and channel uploads; space pages are exempt. Same PR #32.
- Space video cards show a "charging exclusive" badge. From PR #41 (@yangdev02), for GitHub #40.
- **Message page refreshes promptly**: the list reloads when you switch back to the tab, when the window regains focus, and while the page stays open; entering from the header message panel forces a fresh fetch; the header unread badge stays in sync with the list. From PR #44 (@shaojunxiong-crypto).
- Fix: clicking "换一批" (next batch) on Home snapped the page back to the top (GitHub #39). The scroll position is preserved now; switching category tabs still returns to top.
- Internal: `styles.css` split into 8 section files (joined in the original order, byte-identical, no cascade change); 53 vitest unit tests added and wired into CI; `settings.merge()` now validates the `theme` enum.

## [v0.50.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.50.1) · 2026-11-04

- Fix: only top/bottom fixed danmaku showed, no scrolling danmaku (GitHub #36). With the OS "reduce motion" on (e.g. Windows "Animation effects" off) or Margin's own reduce-motion setting, Margin shortened all page animations to an instant, which also made scrolling danmaku jump straight to the end. The player and danmaku layer are now excluded.
- Fix: native space sub-pages (favorites, bangumi, follows) weren't themed, and clicking Home / Dynamic / Uploads there needed a refresh to show Margin's space page (GitHub #30). Bilibili blue is now Margin ink, and moving to a space page Margin takes over now loads it automatically.
- Home cards show the exact publish time (e.g. 2026-10-24 16:17:44) on its own line; new setting "Click category tab to refresh" (Settings → Home widgets, off by default). From PR #33 (@me1dlinger), for GitHub #25.
- Fix: footprint month strip jittering on horizontal scroll and clipping dates at both ends. From PR #14 (@Coffeiz).

## [v0.50.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.50.0) · 2026-11-03

- Home "Footprint + Weather" on narrower screens (1280–1859px) no longer pushes weather onto its own row leaving a big gap: the footprint card shrinks with the window (smaller cells) and weather stays alongside; they stack only below 1280px. The trailing partial month (<3 weeks) on the heatmap is no longer labeled, so labels don't overlap.
- Feed page: like, repost and comment right on the card, no detail page needed. Like toggles instantly; Repost opens an inline box (optional text, sent only when you press Repost); Comment opens hot comments and an input inline (Enter to send), with "All comments" still opening the detail page. Endpoints per bilibili-API-collect. Thanks to @昵途人 for suggesting it, and @今天鱼块了吗 for the feedback.
- Fix: pressing Space in the search box on the watch page played the video and the space never got typed. Margin's inputs live in Shadow DOM and the Bilibili player only checks the event target; keys typed in Margin inputs no longer reach the page. Thanks to @AAA卡利古拉 for reporting.
- Home: Recommended / Popular / Followed classics each keep their list and scroll position, so switching back picks up where you left off instead of jumping to the top. Thanks to @Ctrl_Shift_N for suggesting it.
- Reply tree now also works with the legacy comment section Bilibili still serves to some accounts (v0.49 only handled the new one). Note it applies to replies after you expand them. Thanks to @飞行雪羢 for reporting.
- New "Corner radius" setting (Appearance → Layout): square / small / default / large for cards, buttons and panels; avatars stay round. Thanks to @博尔加诺斯 for suggesting it.
- New "Comment font size" setting (Appearance → Fonts): 14–17px. Thanks to @月明溪潺 for suggesting it.
- New "Expand labels on hover" toggle (Header): when off, header icons only expand their label on click. Thanks to @百叶间 for suggesting it.
- Home card titles show the full title on hover. Thanks to @大きい林檎番組 for reporting.
- Co-created videos get a "合作" tag on the cover in Popular, Followed classics and space uploads; the recommendation API doesn't expose this flag, so the main feed can't show it yet. Thanks to @優希堂沙也香 for suggesting it.
- Followed classics are now sorted newest first within each batch instead of shuffled. Thanks to @Order_阿包 for suggesting it.
- Includes PRs #13, #15, #17 and #28 merged on GitHub.

## [v0.49.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.49.1) · 2026-11-03

- Messages: a "Load more chats" button now sits at the end of the chat list, so you can load more by hand if auto-loading doesn't fire; auto-loading at the bottom is also more reliable (it re-checks after each page).

## [v0.49.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.49.0) · 2026-11-03

- New reply tree for nested comments: expanded replies are indented by who they reply to ("回复 @name"), joined by hairlines, up to three levels deep. The page script can't read Bilibili's reply-parent field, so a reply is matched to the nearest earlier comment by that name and may occasionally land one level off; can be turned off in Settings → Watch page. Styling after klyv-ui's Comment Thread on 21st.dev. Thanks to @橘味魔术师 for suggesting it (inspired by BewlyCat's reply styling).
- New stepless speed keys on the watch page: X slows down and C speeds up by 0.1× (0.1×–16×); Z toggles between the current speed and 1×. The current speed shows briefly in the middle of the picture. Can be turned off in Settings → Watch page. Thanks to @岁月_2023 for suggesting it.
- Fix: the row of followed-UP avatars at the top of the Feed page had disappeared, because Bilibili changed the response format and the old parser got an empty list. The row also no longer stops at 30, scrolls sideways with the mouse wheel, and can search your followings by name. Thanks to @bgbfbfb for the report.
- "Comments N" on feed cards is now clickable: it opens the post in a new tab, scrolled to the comments. Thanks to @cyf84 for reporting that feed comments couldn't be viewed.
- Calmer motion: the theme switch now takes 0.3 s with no overshoot instead of 0.5 s with a bounce; the account card no longer swings on its lanyard or tilts with the mouse by default (turn on "Draggable account card" to bring it back), and its fade-in is down to 0.2 s. Reduce motion turns all of it off. Thanks to @岁月_2023 for suggesting it.
- Fix: the Messages page showed only the first 20 chats. More now load as you scroll; chats outside the list get their name and avatar instead of a bare UID; a new "Mark all read" marks every chat read at once. The red badge that never cleared was most likely unread messages in chats you couldn't reach. Thanks to @随便起一个昵称就好啦 for the report and the diagnosis.
- Fix: system tips in chats ("you can send only 1 text message before they follow or reply") showed as a dark bubble of raw JSON; they're now small centered grey text. Thanks to @随便起一个昵称就好啦 for the report.
- Fix: System notices missed site-wide announcements (privacy-policy updates and the like) because only personal notices were fetched; "点击查看>>" and links inside notices are now clickable. Thanks to @随便起一个昵称就好啦 for the report.
- Space page: clicking "Following" now opens Set groups / Unfollow instead of unfollowing straight away; following someone opens group selection; the "⋯" menu can block the user. Thanks to @EA乖离 for the report and @我是真心困啊 for the suggestion.
- Fix: in dark mode, hovering a group in Bilibili's following/fans sidebar turned it white-on-white. Thanks to @EA乖离 for the report.

## [v0.48.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.48.0) · 2026-11-03

- Experimental "App feed" (Settings → Experimental, off by default): the home Recommended tab uses the Bilibili mobile app's recommendation API. Scan a QR code once with the Bilibili app to get the same personalised feed as on your phone; without it you get the non-personalised app feed. "Not interested" and blocking an uploader are sent back to the app feed. The token stays on this device and can be revoked any time. API and QR flow based on bilibili-API-collect and BewlyBewly's "Authorize app" (MIT), reimplemented natively.
- Experimental "X-style rerank" (off by default): following the candidate → scoring → filtering stages of X's open-source recommender, home recommendations are reordered on this device: uploaders you finish watching move up, quick exits (under 10 s) and "Not interested" move down; each batch mixes in up to 3 videos from people you follow posted in the last 48 hours (tagged "Following · new"); watched videos are dropped and the same uploader never appears twice in a row. Preferences come only from Bilibili's own watch history (cached for 6 hours); negative feedback stays local. Works together with the App feed.
- Merged PR #10 (@zwh-study): Reduce motion, global block words (search, watch-page recommendations, popular / ranking / bangumi too), global wide mode, hide ads (on by default, display only), home section order, and a message reminder toggle.
- Fix: the first ~1 s of a video played twice on open. The watch-page card backdrop was inserted into the left column before Bilibili's SSR page finished hydrating, so Vue saw a DOM mismatch, re-rendered the page and rebuilt the player; it now waits for hydration. Thanks to @K-aloy for the report.
- Home: a "Previous batch" button next to "Refresh" brings back the batch you just replaced (click again to go forward). Thanks to @K-aloy for suggesting it, and to @我是真的小心眼 for the feedback.
- Background: new "Random pool" — random mode only picks from the styles you keep lit. Thanks to @K-aloy for suggesting it.
- Messages: replies / mentions show your quoted comment first (thin left rule) and then their reply, so short lines no longer look like two replies; the DM panel now fills to the bottom of the window. Thanks to @K-aloy for the feedback.
- Fix: in web fullscreen the mouse wheel scrolled the page instead of changing volume (side effect of v0.43's scrollable web fullscreen). While the player fills the screen, the wheel over the picture changes volume as usual; over the bottom control strip, or once you have scrolled down to the comments, it only scrolls and no longer touches the volume. Thanks to @bgbfbfb for the report.
- Fix: long-pressing Like for the triple action only spun the ring once if you let go as soon as it filled. Margin's ring fills in 1.5 s but Bilibili's own long press needs longer; once the ring is full Margin now keeps the press held until Bilibili's triple lands (up to 2.5 s). Thanks to @阿埋为爱拉磨中 for the report.
- Fix: the message badge could keep one unread that never cleared. Unread counts now use the same newer endpoint as Bilibili's own header (falling back to the old one). Thanks to @-九条泷川- for the report.
- New host permission `app.bilibili.com`: the app feed API has no CORS, so it is requested from the extension's background worker; nothing is requested while the feature is off.

## [v0.47.4](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.47.4) · 2026-11-02

- Messages: images in a chat open in an in-page lightbox (← → to switch, Esc to close); Ctrl-click still opens the original in a new tab.
- Comments: Enter sends, Shift + Enter adds a line; never sends while an IME is composing or an @ mention is being typed.
- Settings: rarely changed options moved into collapsible drawers that show the current value when closed. Design reference: 21st "Accordion" (coss.com) and "Disclosure" (hero_ui).

## [v0.47.3](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.47.3) · 2026-11-02

GitHub issues:
- #6 Watch-later / playlist pages: title no longer hidden under the header; after switching to the native page a "Back to MARGIN" pill appears.
- #9 Header "Dynamics" popover loads more on scroll instead of a fixed 8.
- #8 Feed: in-page image viewer with ← → and thumbnails, long posts fold, whole card opens the detail, keyword / uploader blocklist applies to the feed, comment sort tabs on detail pages no longer touch the tab bar.

## [v0.47.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.47.2) · 2026-11-02

- Live room skin: MARGIN header, canvas background instead of the room skin, rounded player and chat cards, light / dark aware. Playback, danmaku, gifts and chat untouched; full-page event templates stay native. Thanks to @桃花映眼 for suggesting reskinning live rooms.
- Video CDN node picker with latency test (Settings › Watch page). Only the stream host is rewritten and the original URLs stay as backups. Idea from bilisail. Thanks to @离港码头 for suggesting picking and speed-testing CDN nodes.
- New home tab "Classics": the most-played videos older than 90 days from random followed uploaders. Thanks to @wsxszzz for suggesting surfacing followed creators' older popular videos.
- Ctrl+K can be turned off (Settings › Header); / still opens the command palette. Thanks to @真红love的宝贝鱼 for suggesting handling Ctrl+K shortcut conflicts.

## [v0.47.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.47.1) · 2026-11-02

- Header shortcuts are customizable: toggle each entry in Settings › Header and reorder the Bilibili links with arrows; Settings always stays, with a reset button. Thanks to @离港码头 for suggesting customizing header icons.
- Content zoom 100% / 110% / 120% for home, space, messages, history and feed; sticky tabs keep their offset. Thanks to @桃花映眼, @゙゙入间美兔 for suggesting text being too small and too much whitespace.
- Space page tabs and tools become a sticky pill bar instead of sitting on top of video covers.

## [v0.47.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.47.0) · 2026-11-02

- Fix "Message" on the watch-page uploader card opening Replies instead of the chat: Bilibili links use `#whisper/mid…` (no slash); both forms now open that conversation. Thanks to @离港码头 for suggesting fixing the message link.
- Space page: search within the uploader's videos (box next to the Videos tab, Esc clears). Thanks to @戊水Amber for suggesting searching within a creator's space.
- Space page: "Recent coins" and "Recent likes" tabs, shown only when the user made them public. Thanks to @离港码头 for suggesting showing recent coins and likes.
- Fix missing space banner: complete legacy host-less `bfs/space/…` paths; fall back to `web-interface/card` for name, avatar and banner when acc/info is risk-controlled (-352). Thanks to @FUSEAKIRA for suggesting the missing space banner.
- Weather clock runs on its own 15 s task instead of the sky animation, so it no longer freezes while scrolling, with a sheet open, or under reduced motion (the sun/moon still move with local time). Weather data refreshes every 30 minutes. Thanks to @海虎爆破拳11 for suggesting the frozen weather clock.
- Watch-page scroll ruler can be dragged, not just clicked. Thanks to @海虎爆破拳11 for suggesting dragging the scroll ruler.
- Home: the header search fades in once the big search box scrolls out of view. Thanks to @吉安天命 for suggesting keeping search visible while scrolling.
- Settings › Appearance: "Body font" (any installed font name; also used for titles when set to Sans) and a "Monospace numbers" toggle. Thanks to @我的王之力啊123, @Eyedazzler for suggesting choosing a local font and turning off mono.
- Warn once when BewlyBewly (or a similar full-site extension) is also running, since the two take over the same pages (reported: only the search page restyled on Edge). Thanks to @Eous_the_Bangboo for suggesting only the search page working in Edge.

## [v0.46.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.46.0) · 2026-11-01

- "Not interested" on home cards: hover × or the context menu fades the card out and reports it through Bilibili's own home-feed feedback endpoint, with undo (which cancels the feedback). "Block uploader" also tells Bilibili "don't show this uploader". Thanks to @A一命二运三风水 for suggesting disliked videos still being recommended.
- Fix message center unread dots not clearing until refresh: opening a whisper sends the read ack (update_ack); opening replies / @ / likes / system clears the sidebar count and advances the system read cursor; the header badge refreshes right away. Thanks to @Weslie077, @戊水Amber for suggesting unread dots not clearing.
- The "Grain" background no longer looks like TV static: grain is now fixed to screen pixels instead of re-randomised every frame, at half strength (frame-to-frame flicker 1.03 → 0.07). Thanks to @昂卟哩唔啵 for suggesting the flickering grain background.
- New appearance setting "Title font": serif (default) or sans, applied to home, takeover and skinned pages. Thanks to @这是我小号不用怀疑, @Eyedazzler for suggesting letting users choose the font.
- New appearance setting "Draggable account card": off keeps the card hanging still; click still flips it. Thanks to @nianyi呀 for suggesting a switch for dragging the account card.
- Card hover buttons drop their backdrop blur for a solid translucent fill.

## [v0.45.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.45.0) · 2026-11-01

- Much lighter favorites sheet: compositor time per frame while scrolling drops from ~13 ms to ~4.5 ms, hovering folders ~16 ms → ~10 ms, and on the watch page ~18 ms → ~8 ms. The biggest cost was the sheet's own backdrop-filter: every frame of the animated background or the playing video behind it forced an 820 px-wide area to be re-blurred. The favorites sheet and sheets on the watch page are now solid (they were already 90% opaque, so the look barely changes).
- While any sheet (settings, favorites) is open, the animated background and weather animation freeze.
- Folder hover parallax no longer rewrites CSS variables on the folder root (which restyled the whole folder including its blurred copy); it moves the few layers directly, and the highlight translates instead of repainting its gradient. Hover style recalculation roughly halves.
- Approach informed by similar fixes on GitHub: Slush97/grimoire#264, vuejs/vitepress#1049, nextcloud/server#45452.

## [v0.44.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.44.0) · 2026-11-01

- Faster load: MARGIN's own script time on the watch page drops from ~650 ms to ~240 ms, home from ~450 ms to ~340 ms. Removed forced reflows during load: the sun/moon switch's first paint (~160 ms), segmented controls measuring inside the closed settings sheet (~110 ms), QR codes now drawn when idle, liquid-glass maps computed once per size.
- Smoother scrolling: script time while scrolling the watch page drops from ~440 ms to ~150 ms. The header TV eyes no longer read layout on every pointer move and frame; the scroll ruler stops reading page height inside scroll events and only updates the ticks that change; the watch card underlay no longer re-measures every 1.5 s.
- Background canvas and footprint heatmap sizes now come from ResizeObserver instead of extra layout reads.
- Lighter loads on other pages too: MARGIN script time on space ~2.1 s → 0.5 s, feed ~1.5 s → 0.45 s, history ~1.3 s → 0.45 s, search ~1.2 s → 0.6 s (relative, sandbox software rendering). The settings sheet is built on first open (~220 nodes); the account card is built on first avatar hover and no longer downloads two large avatars at load; segmented controls measure only in post-layout callbacks; the header TV reads its color after layout; icons are parsed once and cloned.

## [v0.43.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.43.0) · 2026-11-01

- Settings "Home top" becomes "Home components": hide the search box, date row or refresh button individually; hiding the big search brings back the header search. Thanks to @Riiiiiiiiick for suggesting managing home components.
- New "Card info": toggle uploader, views, danmaku, publish time, duration and recommendation reason on home video cards; separators follow automatically.
- Less stutter: the animated background freezes while a video plays and in web/full screen, pauses while scrolling, and drops to 30 fps below the first screen; the weather card drops its blur while scrolling; closed settings/favorites sheets no longer take part in compositing.
- New header "Zones" entry: hover for 24 Bilibili zones (anime, guochuang, movies, animation, games, knowledge…). Thanks to @真新镇的撒东西 for suggesting the missing zones entry.
- New "Watch page" settings: auto web fullscreen (off by default); scrollable web fullscreen (on by default) — scroll down to the comments while the player scrolls away, Esc exits. Thanks to @scorpio19xx for suggesting auto web fullscreen and scrolling to comments in web fullscreen.

## [v0.42.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.42.2) · 2026-11-01

- Fix the footprint heatmap's last month label (e.g. "11月") wrapping onto today's cell.
- "All favorites" in the header favorites popover opens the favorites panel in place instead of a new tab.

## [v0.42.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.42.1) · 2026-11-01

- Fix web-fullscreen player being covered by the right column (uploader card, danmaku list, recommendations); header hides in web fullscreen. Thanks to @子时欧拉欧拉欧拉 for suggesting the covered web-fullscreen player.

## [v0.42.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.42.0) · 2026-11-01

- Player control bar back to Bilibili's original (v0.40.0 floating glass dock removed), in-video views · danmaku chip removed.
- Video cards show danmaku count: uploader · views · danmaku · time; time hides first on narrow cards. Thanks to @ooohes for suggesting showing danmaku counts on cards.
- New setting "Videos per row" on home: auto (6–8 by width) / 4 / 5. Thanks to @看到你时我的表情belike for suggesting four videos per row.
- Favorites "play all" and watch-later playlists (/list/…) use the watch page styling. Thanks to @55348868 for suggesting supporting favorites play-all.
- Header hover popovers (live, messages, feed, history, favorites, watch later) open instantly, no 1.5s delay.

## [v0.41.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.41.0) · 2026-11-01

- Watch page "one card" (after 21st Post Card, shadcnui-blocks): player, danmaku bar, actions, description and tags share one surface.
- Views · danmaku count chip inside the video, shown with the control dock.
- Sending bar follows the theme again (reverts v0.40.1 dark body).
- Feed: live notices and live-room shares render (cover, title, area, popularity, LIVE badge); season / bangumi / course / music / common cards no longer blank.
- Hover preview on feed and space video covers; "Watch later" button on home, space and feed covers (block button moved top-left).
- Feed sidebar fits the viewport and scrolls; all live users listed.
- Whispers: card / notice / share messages shown in full, sender avatar, wider chat.
- History: uploader name links to their space; new timeline / grid views.
- Watch: restyled uploader hover card, centered rec thumbnails, quick menu focus line and top gap fixed.
- Settings: manual weather city with candidates, or back to auto.

## [v0.40.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.40.1) · 2026-11-01

- Danmaku sending bar merged into the player as one dark body in both themes; removed Bilibili's 1px white divider; translucent pill input and a separate pill send button.
- Thin bottom progress bar hides while the control dock is shown.

## [v0.40.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.40.0) · 2026-11-01

- Player controls redesigned after 21st "Video Player" (chetanverma16): a floating rounded dark-glass dock inset 12px inside the video, white progress, spring in / blur out; all native controls kept.
- Danmaku input bar uses a pill input to match.
- Fix: home search trending list could differ from Bilibili's header because it was fetched once per page load; now refreshes every 5 minutes and uses the same signed endpoint.

## [v0.39.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.39.2) · 2026-11-01

- Typography pass two (references: W3C clreq, Vercel Geist, Linear): comments go from Bilibili's 12/18px to 14/24px with Geist + Source Han Sans (watch and detail pages); automatic CJK–Latin spacing (text-autospace); tabular numerals everywhere; peer titles share one spec (space list titles 18px/1.45 like history), text-wrap pretty/balance; weights limited to 400/500/600; native-page secondary text now meets 4.5:1.

## [v0.39.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.39.1) · 2026-11-01

- Style consistency pass (first round, for the "UI feels inconsistent" feedback): header gets a progressive blur + stronger fade when content scrolls under it; standalone pages drop the redundant Home button so every header has the same entries; stray radii (5/7/9/11px) snapped to 6/8/10/12px, one pink (#fb7299), search tab text back on the type scale (14px). Thanks to @P1r2y for suggesting the UI feeling inconsistent.

## [v0.39.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.39.0) · 2026-11-01

- Header hover lists now cover more entries (same 1.5 s rest delay, one open at a time): Live (followed streamers on air), Messages (unread per category), History (last 8 with progress and device), Favorites (folders with counts; clicking still opens the drawer), Watch later (with duration and progress). Thanks to @不遇春雪 for suggesting a hover list for history.

## [v0.38.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.38.0) · 2026-11-01

- Header "动态" (Moments) hover list: rest the pointer on the button for 1.5 s to open the latest 8 followed posts (avatar, uploader, time, type, title, cover). Move into the panel to keep browsing; leaving or Esc closes it, and opening clears the unread badge. Passing over the header does not trigger it. Thanks to @星星不在闪耀 for suggesting showing recent posts on hover.

## [v0.37.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.37.2) · 2026-11-01

- Fixed watch page recommendation covers where the hover preview spilled past the rounded frame and showed a black bar: the inline preview and frame preview now fill the cover and are clipped to its radius.

## [v0.37.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.37.1) · 2026-11-01

- Watch page quick menu moved from bottom-center to the bottom-left corner. Collapsed it is a small translucent round button (fully visible on hover), so it no longer covers the video or comments; it still expands into the same panel. Thanks to @DML靓仔 for suggesting moving the quick menu off center.

## [v0.37.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.37.0) · 2026-11-01

Fixes from Bilibili comment feedback.

- Home infinite scroll: fixed the feed sometimes stopping at the bottom. It now re-checks remaining height after each load and when scrolling stops, retries later when a whole batch is filtered or duplicated, and silently retries the recommendation API twice on transient errors. Same fix on the Following feed page. Thanks to @小龙爱搓澡 for suggesting infinite scroll stalling.
- ID card lag in Firefox: the card is positioned with `transform` and its size is cached, removing a forced reflow every frame; the bead chain only clears last frame's area; the photo backdrop uses an upscaled tiny image instead of `filter: blur`; the holo stripe only animates while hovered; blend-mode layers are dropped in Firefox. Thanks to @雪花Snow-Official for suggesting ID card lag in Firefox.
- Following feed avatar strip: creators with new posts come first and get an accent ring plus a dot (the logic existed but had no styles); the selected avatar now uses an ink ring so it reads differently. Thanks to @--聪聪子-- for suggesting avatars for creators with new posts.
- Your own space page: Follow / Message are replaced by Favorites, History and Watch later shortcuts. Thanks to @--聪聪子-- for suggesting history and favorites on your own space.
- Favorites: new setting "Open favorites directly" lists all videos on click instead of fanning out the latest four. Home now opens Favorites / Watch later from `bilibili.com/#fav` and `#later`; the ID card shortcuts use them. Thanks to @--聪聪子-- for suggesting opening favorites directly.

## [v0.36.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.36.1) · 2026-10-31

Safe-DOM cleanup ahead of Firefox Add-ons review.

- Removed all 17 uses of `innerHTML` / `insertAdjacentHTML`. Bundled icons and fixed markup are now parsed with `DOMParser` (an inert document, no script execution) and imported, via new `setMarkup` / `appendMarkup` helpers.
- Search suggestions (home search box and command palette) no longer insert HTML returned by the Bilibili API: only the highlight tag is recognised and turned into text nodes plus `<mark>`; everything else is treated as plain text.
- `web-ext lint` unsafe-assignment warnings went from 14 to 0. No visual or functional changes; regression-tested in Firefox 153 ESR and Chrome.

## [v0.36.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.36.0) · 2026-10-31

Firefox support.

- New Firefox package `margin-firefox.zip` (Firefox 140+), attached to every release alongside `margin.zip`. The code is identical to the Chrome build; only the manifest differs: an event-page background for Firefox, a gecko extension ID, and a data-collection declaration (weather uses an IP-based city lookup). Thanks to @秋前雨- for suggesting Firefox support.
- Fixed always appearing logged out in Firefox: Firefox content-script requests are sent as the extension, so Bilibili APIs never saw the login. Requests to Bilibili domains now go out as the page; Chrome and Edge are unaffected.
- Tested on Firefox 153 ESR across home, watch, search, space, feed, messages and history pages in light and dark themes.
- Install via `about:debugging` → Load Temporary Add-on (removed on restart) until MARGIN is listed on Firefox Add-ons. The README now covers Firefox and other Chromium browsers.

## [v0.35.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.35.0) · 2026-10-31

- The Footprint heatmap and the weather card at the top of the home page can now be turned off separately: Settings → Home top. Both stay on by default. Thanks to @看不见的战争 for suggesting hiding the heatmap and weather card.
- Turning Footprint off only hides it; activity is still recorded locally and comes back when you turn it on again. Turning weather off stops all weather and city-lookup requests.
- With both off, only the search bar remains and the feed moves up; with weather alone, the card keeps its 480 × 240 size, aligned left.
- When Footprint is off, the header Footprint button and the palette's "看足迹" show a notice with a one-tap turn-on.
- Settings export / import includes both switches.

## [v0.34.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.34.2) · 2026-10-31

- Added the missing Live entry: a 直播 (Live) link now leads the header shortcuts on every redesigned page, the command palette (Ctrl K) finds it by "直播" or "live", and the account card's quick links include it too. Thanks to @常喝新西粥 for suggesting adding a Live entry.

## [v0.34.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.34.1) · 2026-10-30

- Fixed the Footprint heatmap tooltip on the home page getting cut off when hovering the rightmost column (today). The tooltip now stays inside the card horizontally and flips below the cell when there is no room above.

## [v0.34.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.34.0) · 2026-10-29

Watch page title area and right column redesigned.

- Views, danmaku, date, and copyright under the title now sit in one clear capsule with hairline dividers and monospace numbers instead of directly on the background.
- Uploader card follows 21st "Item With Actions" and "Profile Hover Card": avatar, name, two-line bio, a small message button at top right, and full-width buttons below a divider (solid follow with follower count, outlined charge). Avatars with pendants are scaled into the grid so they no longer cover the name.
- Episode list follows course-player tables of contents: monospace 01, 02… numbers, right-aligned monospace durations, a tinted current row, a count chip, and a progress line under the header. Cover mode keeps the native layout.
- The danmaku list header is a consistent 44px row.

## [v0.33.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.33.0) · 2026-10-29

New background: Gateway (汇流).

- Ported from 21st "Gateway Flow" (Neuform): 80 dotted Bézier paths converge from both edges, each carrying a particle inward; clicking sends out a shockwave that pushes particles away.
- On the home page the paths converge on the search bar; elsewhere on the screen center. Dark uses white dotted lines on black, light uses dark ink on #eef1f6 paper, and line color crossfades with the theme.
- Drawn with Canvas 2D at device pixels (capped at 1.5×) so the dotted lines stay crisp; pauses like other backgrounds when hidden, during the intro, or with reduced motion, and keeps the same flow speed when throttled to 30fps.
- The settings thumbnail renders with the same code.

## [v0.32.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.32.1) · 2026-10-29

- Watch page "Up next" and recommendations: uploader name, play and danmaku counts used the faintest gray and were nearly invisible on dark backgrounds; they now use the secondary text color (≥4.5:1 in both themes), with matching icons.

## [v0.32.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.32.0) · 2026-10-29

Detail pages redesigned: single posts, opus articles, columns, and bangumi playback.

- Opus / column / single-post pages use a two-column layout ported from 21st "Article With Author Sidebar" (olewandowski1): a 708px article card with a full-bleed cover, 28px serif title, 16/28 body text, serif subheadings, hairline quotes, and rounded images.
- New sticky sidebar: author card (avatar, followers, bio, follow / visit space), reading progress and estimated time, an auto-generated table of contents that highlights the current section, the uploader's latest videos, and like / coin / favorite / forward / comment.
- Sidebar actions forward to Bilibili's native toolbar, so counts, active states, and the native coin / favorite / forward dialogs stay intact. The native floating TOC and vertical toolbar are replaced on wide screens and restored when the window is too narrow.
- Native comments are kept; tabs get serif labels and a thin underline, and the duplicate "评论" heading is hidden.
- Bangumi playback: rounded player, serif title, episode and extras panels as cards, monospace episode chips with an inverted current episode.
- Smoke tests now cover an offline opus page: sidebar, author, TOC, actions, and no overlap with the article.

## [v0.31.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.31.2) · 2026-10-29

More accurate footprint, better keyboard and screen-reader support, settings backup.

- Footprint timing: audibly playing video in a background tab now counts (listening only); in the foreground it still needs input within 90s or playback.
- A day only counts as "opened" and towards the streak after 1 minute in total; a bare open no longer lights a cell.
- History backfill only fills days without a local record, estimates each item conservatively (min of duration, progress and 20 minutes) and pages back to the earliest day shown on the heatmap (up to 60 pages).
- Adaptive heatmap levels: quartiles of your own active days over the last year, falling back to 15 / 45 / 90 minutes with fewer than 14 active days.
- The hover tooltip says where a duration comes from: local record or history estimate.
- Accessibility: clear keyboard focus rings on every control (search capsules light up when tabbed into), the closed settings sheet is no longer reachable by Tab, and icon-only buttons, avatar and image links now have accessible names.
- Contrast: light-theme secondary text (--faint) goes from 3.2:1 to 5.1:1, small accent-coloured text uses a deeper blue (≥4.6:1), and the watch page's tertiary text is darkened to match; the dark theme already passed.
- New "Data" section in settings: export settings and footprint to a JSON file, or import a backup (validated and confirmed first; footprint days are merged, keeping the longer time).

## [v0.31.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.31.1) · 2026-10-29

Stability: history overlap fix, fall back to the native page on module errors, automated smoke tests.

- Fixed history timeline items overlapping each other (since v0.23): the home search box's `.hs-row` class shared its name with history rows and squeezed each entry to 54px. The history page now uses its own `hi-` prefix.
- If a page module fails to load or mount, you no longer get a blank page: the error is logged, Margin's UI is removed and the page is handed back to native Bilibili (reloading once when native scripts were blocked).
- New smoke test `npm run test:smoke`: loads the built extension and opens home, watch, search, space, messages, history and feed on an offline mocked Bilibili, checking for extension errors, key elements, non-overlapping history rows, native fallback and the background footprint timer, and saves light and dark screenshots. GitHub Actions runs it on every push (separate smoke workflow, screenshots uploaded as artifacts).

## [v0.31.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.31.0) · 2026-10-29

Performance: per-page code loading, sliced CJK fonts, one scheduler for timers.

- The entry script injected into every Bilibili page drops from 447 KB to 34 KB: UI code for home, watch, search, space, messages, history and feed now loads on demand by route; the intro engine and the ID-card QR code library load only when used.
- Both CJK fonts (Noto Sans SC subset 1.7 MB, LXGW Neo ZhiSong subset 1.3 MB) are split into ~100 frequency-ordered slices so pages only download the characters they show; font traffic on a first home load drops from 3.25 MB to 1.68 MB.
- All periodic work (footprint timing, unread badges, trending rotation, weather animation, comment skin) shares one scheduler and pauses entirely while the tab is in the background.
- Footprint time is now accumulated by a background service worker, so several Bilibili tabs no longer overwrite or double-count each other. Data format unchanged.
- The watch-page skin stylesheet is applied at document start without waiting for the UI code, so the native page doesn't flash.

## [v0.30.3](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.30.3) · 2026-10-29

Lighter opening animation, fixes stutter.

- While the intro plays, the home background, weather animation and header TV eyes it fully covers are paused, resuming as soon as it fades out, so they no longer compete for the GPU.
- The intro nebula is evaluated twice per pixel instead of once per dispersion sample (20×), with 3 noise octaves instead of 4.
- Adaptive resolution for the intro canvas: pixel density steps down on sustained dropped frames.

## [v0.30.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.30.2) · 2026-10-29

Shader background for the opening animation.

- The intro background is now a flowing nebula using the Live Orb fbm domain warp: Bilibili blue breathes at the centre like an orb, pink and orange drift around it; soft tinted paper in light mode, a dim glow on near-black in dark mode.
- The glass tile refracts this moving backdrop, so its rim dispersion visibly bends it.
- Reverted the v0.30.1 skeleton shader (misunderstood request); skeletons use the CSS shimmer again.

## [v0.30.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.30.1) · 2026-10-29

Shader loading skeletons.

- Cover placeholders on video cards and Watch Later now use a WebGL shader: the Live Orb fbm domain-warped ink fog drifts slowly, with an occasional pink-to-orange accent and a diagonal light sweep; text lines keep the CSS shimmer.
- One shared WebGL context renders a small image; each cover copies its own region via a 2D canvas. ~30fps, stops as soon as skeletons are gone, one still frame under reduced motion, CSS shimmer kept without WebGL.

## [v0.30.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.30.0) · 2026-10-29

The header TV comes alive.

- The top-left TV's eyes are now drawn in WebGL (a port of the 21st Live Orb technique): the screen is a slightly convex CRT surface, the two capsule eyes sit on it and turn in 3D toward the pointer with perspective foreshortening, blink now and then, and glance around after the pointer rests for 3 seconds.
- No animation frames while still; a timer waits for the next blink or glance. Pauses when the tab is hidden, the icon is off screen, or reduced motion is on.
- Follows the day/night theme; falls back to the original SVG icon without WebGL or after a lost context. The intro still lands on the same spot.

## [v0.29.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.29.1) · 2026-10-29

Favourites card size fix.

- Video cards in the Favourites sheet are back to auto-fill width (min ~210px) instead of inheriting the home page's 6/7/8-column grid. Regression from v0.25.0.

## [v0.29.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.29.0) · 2026-10-29

Performance, see docs/performance-v0.29.0.md.

- Takeover pages (home, feed, history, messages) now block the hidden native Bilibili scripts: home load script time 2.0s → 0.3s, JS heap 48.5MB → 3.6MB, nodes 15k → 2.7k. Space page excluded; risk-control 412 / -352 lets native scripts through once.
- Weather dot sky reuses its paths and only updates d.
- ID card animation loop sleeps once settled and wakes on pointer input.

## [v0.28.3](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.28.3) · 2026-10-29

Secondary text legibility.

- Secondary text tokens (--muted, --faint, native --text3, --graph_medium) darkened in light / lifted in dark so they stay readable over the colourful animated background.
- Watch page meta row (views, danmaku, date, copyright, AI notice) now uses --muted with selectors updated for the current Bilibili DOM; soft shadow in dark mode.

## [v0.28.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.28.2) · 2026-10-29

ID card back re-laid out (keeps the original 21st ID Card Lanyard Connect row).

- Links as a 2×3 grid under an "ACCOUNT" eyebrow; adds Message center.
- New quick-access icon row: favourites, history, watch later, dynamics.
- Log out moved to the signature line; no more empty gap, stripe and barcode tightened.

## [v0.28.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.28.1) · 2026-10-29

ID card front re-laid out (after 21st ID Card Lanyard + Flip Card stats row).

- Following / followers / coins as a three-column stat row; exp numbers share the line with the membership role.
- Top-right shows level and UID; info rows show exp to next level, B-coins and a scan hint.
- No text on the card below 10px, matching the site type scale.

## [v0.28.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.28.0) · 2026-10-29

Avatar ID card upgrade.

### Improved

- ID card enlarged ~1.28× (scale 0.86 → 1.1) for readability.
- Front/back QR codes are now real (qrcode-generator, MIT) and open your space when scanned.
- Front footer now shows unread messages and new dynamics counts (clickable, highlighted when non-zero) instead of placeholder text.
- Hovering the avatar must dwell 200ms before the card drops, so passing over it no longer opens it.

## [v0.27.3](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.27.3) · 2026-10-29

Ball-chain ID card.

- A metal ball chain hangs from the avatar into the card slot, theme-aware.
- Drag-swing and tap-to-flip kept; the card pivots at its slot.

## [v0.27.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.27.2) · 2026-10-29

No more lanyard rope.

- The card floats under the avatar on a hidden pivot, still draggable and flippable, kept inside the viewport.

## [v0.27.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.27.1) · 2026-10-29

Card placement.

- Clasp under the avatar, shorter rope, card at 86%.
- Tilted gravity keeps the card inside the viewport.

## [v0.27.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.27.0) · 2026-10-28

Avatar card becomes an ID card.

- Hovering the avatar drops a 21st ID Card Lanyard style card: rope physics, drag-swing, tap to flip, account links on the back.
- Closes 0.5s after the pointer leaves.
- Home elastic gallery removed.

## [v0.26.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.26.0) · 2026-10-28

Dot-matrix weather card.

- New home weather card (21st Weather Widget port): animated sky, hourly and 3-day forecast.
- Open-Meteo + IP location, editable city, 30-minute cache.

## [v0.25.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.25.2) · 2026-10-28

Gallery follows recommendations.

- The elastic gallery shows the first 5 recommended videos of each batch, refreshes with Shuffle and never repeats them in the grid.

## [v0.25.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.25.1) · 2026-10-28

Elastic gallery.

- Home widgets replaced by 21st Elastic Gallery: 5 accordion covers with vertical CJK titles; resume recent history when signed in.

## [v0.25.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.25.0) · 2026-10-28

Home layout matches search.

- Home width, gutters and columns now match the Bilibili search page (6/7/8 columns by width).
- Footprint card fixed width with a widget slot.

## [v0.24.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.24.0) · 2026-10-28

Intro finale.

- After the intro the TV flies to the top-left and stays as the home link.
- Header Command tab removed; Ctrl+K still works.

## [v0.23.3](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.23.3) · 2026-10-28

Watch menu type scale.

- CJK 18px, English 11px tracked caps, labels 14px.

## [v0.23.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.23.2) · 2026-10-28

Menu fonts and comment spacing.

- Floating menu uses sans fonts (Margin Sans SC + Alte Haas Grotesk).
- 24px top padding on comments.

## [v0.23.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.23.1) · 2026-10-28

Comment skin.

- Native comment header and composer follow Margin colours.
- Command palette entry moved to the header (Ctrl+K).

## [v0.23.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.23.0) · 2026-10-28

Combined homepage-search and performance update. Includes all optimizations and fixes from v0.22.5 through v0.22.7; no separate performance patch is required.

### Added

- Rotating trending-search placeholders, focus dimming, and an expanding homepage search panel.
- Recent searches, trending terms and input suggestions, with history deletion, keyboard selection and dismissal.
- A text-dissolve submission effect with simplified reduced-motion behavior.

### Included optimizations and fixes

- Backgrounds remain animated during scrolling, video playback and theme changes during playback. Accumulated deadlines correct high-refresh drawing cadence while retaining adaptive operation around 60/30 under load.
- Cached WebGL constants/palettes and reused glass displacement maps during header expansion, regenerating exact maps after dimensions settle.
- Reused yearly/monthly activity nodes, retaining centered date selection, current statistics/tooltips and midnight refresh.
- Card-relative date-tooltip positioning fixes offsets caused by backdrop-filter changes; resizing and horizontal graph scrolling dismiss stale tips.
- Restored valid 0.8s front-panel and 0.75s file-card transitions. Pointer geometry reads are coalesced per frame, preserving folder headroom and fan clipping.
- The theme switch uses transforms. Homepage/watch-page UI updates precede asynchronous persistence. The watch page removes the whole-page snapshot transition that obscured live switch motion, retaining the switch and background animations.
- Page color transitions have a narrower scope; background theme interpolation follows its normal target cadence to reduce contention.

### Validation scope

Earlier targeted checks covered shader/component visual comparisons, activity-date logic, continuous animation, folder interpolation/final geometry, live homepage/watch-page theme switching and persistence. See [background/activity measurements](docs/performance-v0.22.5.md) and [folder/theme-switch measurements](docs/interaction-performance-v0.22.7.md).

These changes do not guarantee stable 60fps in every scenario. Earlier live concurrent-video tests still showed drawing-rate variation. The v0.23.0 local update verified code inclusion and release-file integrity; a complete performance suite was not rerun for that update.

## v0.22.7 · 2026-10-28

- Fixed duplicate easing functions that invalidated folder-opening transitions; coalesced pointer geometry reads.
- Moved the theme switch using transforms and narrowed page color transitions.
- Updated theme UI before saving settings and removed watch-page snapshots that froze the switch.
- Kept backgrounds animated during theme interpolation at the normal target cadence.

## v0.22.6 · 2026-10-28

- Positioned activity-date tooltips in card-local coordinates.
- Dismissed stale tips on horizontal graph scroll and card resizing.

## v0.22.5 · 2026-10-28

- Corrected high-refresh background scheduling, retaining load adaptation and continuous animation during scroll/playback.
- Reduced glass-map generation, repeated WebGL uploads and activity-view node rebuilding.

## [v0.22.4](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.22.4) · 2026-10-28

- Reserved folder-opening headroom and narrowed the fan/clipping region to reduce overlap with adjacent cards.

## [v0.22.3](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.22.3) · 2026-10-28

Watch menu English sub-labels.

- Each floating-menu item gets an Instrument Serif italic English sub-label.

## [v0.22.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.22.2) · 2026-10-28

Watch menu font.

- Floating menu uses LXGW WenKai Medium, subset to the menu characters only (5.6KB).

## [v0.22.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.22.1) · 2026-10-28

Day/night switch colours.

- Warm paper track, white clouds and a Bilibili pink-to-orange sun by day; ink track and cool white moon by night.

## [v0.22.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.22.0) · 2026-10-28

New day/night switch.

- Theme toggle replaced by a native port of Uiverse theme-switch, keeping its structure, proportions and curves.
- Page colour fade now 500ms, in sync with the switch.

## [v0.21.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.21.1) · 2026-10-28

Sun/moon toggle fixes.

- Back to the original 21st Sun Moon Theme Toggle behaviour: colour-only page fade, 150ms button easing, twinkling stars.

## [v0.21.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.21.0) · 2026-10-28

Scroll performance and motion tokens.

- Large blurred surfaces drop their backdrop while scrolling; off-screen cards skip rendering.
- Motion unified to three easing curves and 150/200/300/400ms durations; press feedback on buttons.

## [v0.20.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.20.0) · 2026-10-28

Footprint card glass.

- Footprint card uses 21st Glass Calendar glass (translucent fill, 24px blur, hairline border, 24px radius); GL refractive lens disabled.

## [v0.19.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.19.0) · 2026-10-28

Footprint month view.

- Footprint card gains a 21st Glass Calendar month view: year/month toggle, scrollable day strip, tap a day for details.
- Background targets ~60fps and steps down on slow frames.
- Header selection pill becomes a clear highlight.

## [v0.18.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.18.1) · 2026-10-28

Typography pass.

- Font sizes reduced to a 12-step integer scale on a 4px spacing grid.
- Serif only for titles ≥16px, mono only for numbers and English eyebrows, tighter CJK tracking, concentric radii.

## [v0.18.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.18.0) · 2026-10-28

History and feed pages.

- History and the feed home become Margin pages (21st Activity Timeline / SocialPostCard).
- Instrument Serif Latin titles and italic English eyebrows.
- Fixed the square corner on the collapsed danmaku list.

## [v0.17.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.17.0) · 2026-10-28

Intro animation.

- Home intro (21st Glass Reveal with the Bilibili TV), once per session, skippable, can be turned off.
- Fixed a stray blue dot on the triple-action button.

## [v0.16.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.16.0) · 2026-10-28

Header complete.

- Header adds VIP, Creator Center and Upload, plus unread badges for messages and feed.
- Avatar card with level, following, followers, coins and sign-out.
- Create and delete favourite folders.

## [v0.15.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.15.0) · 2026-10-28

"Flux" background.

- New Flux background: a WebGPU compute particle flow field, loaded only when selected, with a WebGL fallback.

## [v0.14.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.14.2) · 2026-10-28

Performance.

- Background thumbnails in settings compile lazily and are cached.
- Scrolling reuses the background texture; software rendering keeps the background static.

## [v0.14.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.14.1) · 2026-10-28

Watch page shadows.

- Action pills, description and comment cards and the floating menu use Smooth Shadows with a hairline ring.

## [v0.14.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.14.0) · 2026-10-28

Shadow and radius tokens.

- Shadows unified to --sh-xs/sm/md/lg plus a --ring hairline (movements.dev Smooth Shadows); nested radii are concentric.

## [v0.13.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.13.2) · 2026-10-28

Heatmap glass tweak.

- Softer edge bend and aberration on the heatmap glass, lighter border and shadow.

## [v0.13.1](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.13.1) · 2026-10-28

Refractive heatmap glass.

- Heatmap glass follows movements.dev Refractive Glass, with inner stroke and sheen.

## [v0.13.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.13.0) · 2026-10-28

Space and messages layout.

- Space header becomes a large fading banner with a big serif name; videos gain a list view.
- Messages grouped by day with sentence-style notices and quotes; DMs grouped by date.

## [v0.12.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.12.0) · 2026-10-28

Space and messages.

- Personal space rebuilt as a Margin page: editorial profile bar, videos and posts.
- Message center rebuilt: categories, notice stream and DM conversations.

## [v0.11.5](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.11.5) · 2026-10-28

Theme switch sync.

- Removed the header bottom hairline.
- Background palette and toggle animate in step; watch page fade is 1740ms.

## [v0.11.4](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.11.4) · 2026-10-28

Performance and search page.

- Background shader renders at lower resolution and 24fps, pausing while scrolling or playing video.
- Search page box matches the header, suggestion popup fixed, sticky search bar hidden.

## [v0.11.3](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.11.3) · 2026-10-28

Update notice and Edge listing.

- Popup shows when a new version is available.
- Edge Add-ons listing assets: privacy policy, screenshots, logo, publish script.

## [v0.11.2](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.11.2) · 2026-10-28

Favourites, wide mode, triple action.

- Favourites wrap to multiple rows; right column yields in wide mode; danmaku list edges fixed.
- Margin triple-action animation (21st Hold to Confirm + Like Burst).

## v0.11.1 · 2026-10-28

Header hover.

- Header shortcuts expand into labelled pills on hover.

## v0.11.0 · 2026-10-28

Fonts and typography.

- Bundled font subsets: Geist, Geist Mono, Source Han Sans, LXGW Neo ZhiSong; editorial typography.
- Header tooltips (21st Tooltip port).

## v0.10.6 · 2026-10-28

Full-strength liquid glass.

- Background strength and fade mask moved into GL compositing so the glass is no longer washed out.

## v0.10.5 · 2026-10-28

Physically based liquid glass.

- Heatmap glass rewritten: curved-edge refraction with Fresnel, dispersion, light blur and directional highlights.

## v0.10.4 · 2026-10-28

Clear glass.

- Heatmap glass drops the milky tint and heavy blur for edge refraction, dispersion and highlights.

## v0.10.3 · 2026-10-28

Home search box.

- Large centred search box on home; header search hidden there.

## v0.10.2 · 2026-10-28

Search page fix.

- Only one search box on the search page.

## v0.10.1 · 2026-10-28

Theme fade safeguard.

- 1.6s fallback so the theme cross-fade never gets stuck.

## v0.10.0 · 2026-10-28

Site-wide takeover.

- Search and other pages get the Margin look; shader backgrounds site-wide.
- Liquid-glass heatmap; two-column command palette.

## v0.9.3 · 2026-10-28

Watch page theme switch.

- Whole-page cross-fade on the watch page; softer dark-mode glass highlights.

## v0.9.2 · 2026-10-27

Feed bar fix.

- Removed the grey glass strip under the feed tabs.

## v0.9.1 · 2026-10-27

Header logo removed.

- Removed the top-left header logo.

## v0.9.0 · 2026-10-27

Shader backgrounds.

- Six 21st shader backgrounds; footprint card loses its border.

## v0.8.0 · 2026-10-27

Glass footprint card and scroll ruler.

- Glass footprint card, shimmer skeletons and a ruler-style scroll indicator.

## v0.7.1 · 2026-10-27

Watch Later drawer.

- New Watch Later side drawer.

## v0.7.0 · 2026-10-27

Command palette and context menu.

- Command palette (Ctrl+K) and a right-click menu on video cards.

## v0.6.2 · 2026-10-27

Sticky tabs.

- Sticky category bar becomes liquid glass.

## v0.6.1 · 2026-10-27

Watch page menu.

- Floating quick menu on the watch page.

## v0.6.0 · 2026-10-27

Liquid-glass header.

- Header becomes liquid glass.

## v0.5.2 · 2026-10-27

Player bottom corners.

- Fixed the player bottom corners.

## v0.5.1 · 2026-10-27

Player edge.

- Removed the black edge outside the rounded player.

## v0.5.0 · 2026-10-27

Watch page redesign.

- Watch page gets the Margin look: title, player, description and related column.

## v0.4.2 · 2026-10-27

Sun/moon toggle.

- New sun/moon theme toggle.

## v0.4.1 · 2026-10-27

Footprint on home.

- Footprint heatmap moved onto the home page.

## v0.4.0 · 2026-10-27

Footprint heatmap and expandable tabs.

- Bilibili footprint heatmap (first open time and duration per day).
- Header uses Expandable Tabs.

## v0.3.0 · 2026-10-27

Palettes and favourites.

- Mist blue / night blue palettes, ice background and glass-folder favourites.

## v0.2.1 · 2026-10-27

UI fixes.

- Fixed broken blur, narrow-screen header and sticky bar overlap.

## v0.2.0 · 2026-10-27

Settings and home features.

- Settings panel, feed filters, hover preview, favourites and animated backgrounds.

## v0.1.0 · 2026-10-27

Clean-room rewrite.

- Margin rewritten from scratch with Vite + TypeScript (vanilla DOM + Shadow DOM), no longer based on BewlyBewly.
- New home feed and header.

## Legacy (based on BewlyBewly, branch `legacy-v0.6`)

The first build before the clean-room rewrite, which restarted numbering at v0.1.0.

### v0.6.4 · 2026-10-27

- 6 random shader backgrounds plus custom image background.

### v0.6.3 · 2026-10-27

- Glass-folder favourites in the right column.

### v0.6.2 · 2026-10-27

- Footprint heatmap in the right column (first visit time and duration per day).

### v0.6.1 · 2026-10-27

- 21st interactions: hover preview, shimmer search, typewriter command palette, circular theme reveal.

### [v0.6.0](https://github.com/jiuyang5354/bilibili-margin/releases/tag/v0.6.0) · 2026-10-27

- First preview: Bilibili home and watch page redesign on top of BewlyBewly.

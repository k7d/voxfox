# Chrome Web Store listing: VoxFox

## Store listing tab

**Name:** VoxFox

**Summary** (≤132 chars):
Listen to any webpage with one click. Natural AI voices that run privately on your device: no account, no cloud.

**Category:** Accessibility (secondary option: Productivity → Tools)

**Language:** English

**Description:**

Turn any article into audio with a single click.

VoxFox reads webpages aloud in natural-sounding voices powered by Kokoro, an open-source AI speech model. Unlike most text-to-speech tools, everything runs directly in your browser. Nothing you listen to is ever sent to a server.

🦊 ONE CLICK
Click the fox in your toolbar (or press ⌃⌘V on Mac, Alt+Shift+V on Windows/Linux) to start listening. Click again to pause or resume.

📰 READS WHAT MATTERS
VoxFox finds the main article and skips the menus, ads, and footers. Want just one part? Highlight it first, or right-click → "Listen to selection".

🎧 NATURAL VOICES
22 American and British English voices that sound far more human than built-in system voices. Change speed from 0.75× to 2×.

🔒 PRIVATE BY DESIGN
No account. No API key. No tracking. The voice model runs locally using your GPU (WebGPU) or CPU, and works offline after the first download.

▶️ SIMPLE PLAYER
A small floating player lets you skip sentences, change speed, and switch voices, while the paragraph being read is highlighted on the page.

Good for long reads, learning, proofreading your own writing, resting your eyes, and accessibility.

Note: the first time you listen, VoxFox downloads the voice model (about 90–330 MB) and caches it. VoxFox is open source: https://github.com/K7D/voxfox

**Graphics:**
- Icon: `static/icons/icon-128.png`
- Screenshots (1280×800): `store/screenshot-1-player.png`, `store/screenshot-2-settings.png`
- Small promo tile (440×280): `store/promo-small-440x280.png`
- Marquee promo tile (1400×560, optional): `store/promo-marquee-1400x560.png`

**Homepage URL:** https://github.com/K7D/voxfox
**Support URL:** https://github.com/K7D/voxfox/issues

## Privacy tab

**Single purpose:**
VoxFox reads the text of the current webpage aloud using an on-device text-to-speech model.

**Permission justifications:**
- `activeTab`: Read the text of the current tab only when the user clicks the toolbar button, uses the keyboard shortcut, or uses the context menu.
- `scripting`: Inject the script that extracts the article text and shows the playback controls into the tab the user chose to listen to.
- `offscreen`: Run the text-to-speech model and play audio in an offscreen document, since MV3 service workers can't play audio or run the model.
- `storage`: Save the user's voice, speed, and engine preferences, and track which tab is currently playing.
- `contextMenus`: Add "Listen to selection" and "Listen to this page" to the right-click menu.
- **Remote code:** No. All JavaScript and WebAssembly is in the package. Only model weights and voice data files (non-executable) are downloaded from huggingface.co.

**Data usage:** check none of the data types. Certify:
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/K7D/voxfox/blob/main/PRIVACY.md

## Distribution tab
- Visibility: Public
- Regions: All regions
- Pricing: Free

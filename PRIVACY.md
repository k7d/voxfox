# VoxFox Privacy Policy

_Last updated: October 19, 2026_

VoxFox reads webpages aloud using a speech model that runs entirely on your device.

**What VoxFox does not do**
- It does not collect, store, sell, or transmit any personal data.
- It does not send the text of the pages you listen to anywhere. All speech is generated locally in your browser.
- It has no accounts, analytics, tracking, or ads.

**How it works**
- When you click the VoxFox button (or use its shortcut or context menu), VoxFox reads the text of the current tab only. It uses Chrome's `activeTab` permission, so it can't see any page you haven't asked it to read.
- On first use, VoxFox downloads the open-source [Kokoro](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) speech model and voice files from Hugging Face (huggingface.co). These are standard file downloads with no page content or personal information attached. They are cached by your browser so they only download once.
- Your preferences (voice, speed, engine) are saved with `chrome.storage.sync`, which Chrome may sync across your signed-in browsers. VoxFox's developer never receives them.

**Contact**
Questions? Open an issue at https://github.com/K7D/voxfox/issues.

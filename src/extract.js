import { Readability, isProbablyReaderable } from "@mozilla/readability";

const MAX_CHUNK = 300; // characters; keeps each Kokoro call well under its 510-token limit
const FIRST_CHUNK = 140; // a short first chunk gets audio started fast

const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption, td, th, dt, dd";

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

// Return readable blocks (paragraphs, headings, list items) from a container.
function blocksFrom(root) {
  const blocks = [];
  const nodes = root.querySelectorAll(BLOCK_SELECTOR);
  for (const el of nodes) {
    // Skip containers whose text will be covered by a nested block.
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    const text = normalize(el.textContent || "");
    if (!text) continue;
    const heading = /^H[1-6]$/.test(el.tagName);
    blocks.push(heading && !/[.!?:]$/.test(text) ? text + "." : text);
  }
  if (!blocks.length) {
    const text = normalize(root.textContent || "");
    if (text) blocks.push(text);
  }
  return blocks;
}

export function extractPage() {
  const selection = window.getSelection()?.toString().trim();
  if (selection && selection.length > 1) {
    return { title: document.title, blocks: selection.split(/\n\s*\n|\n/).map(normalize).filter(Boolean), source: "selection" };
  }

  let title = document.title;
  let blocks = [];
  try {
    const clone = document.cloneNode(true);
    const article = new Readability(clone, { charThreshold: 200 }).parse();
    if (article?.content) {
      const container = document.createElement("div");
      container.innerHTML = article.content;
      blocks = blocksFrom(container);
      if (article.title) title = article.title;
      if (title && blocks[0] !== title && !blocks[0]?.startsWith(title)) blocks.unshift(title.endsWith(".") ? title : title + ".");
    }
  } catch (err) {
    console.warn("[VoxFox] Readability failed", err);
  }

  if (!blocks.length || (!isProbablyReaderable(document) && blocks.join(" ").length < 200)) {
    const main = document.querySelector("main, article, [role=main]") || document.body;
    blocks = blocksFrom(main);
  }
  return { title, blocks, source: "page" };
}

function splitSentences(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const seg = new Intl.Segmenter(document.documentElement.lang || "en", { granularity: "sentence" });
    return Array.from(seg.segment(text), (s) => s.segment.trim()).filter(Boolean);
  }
  return text.match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

function splitLong(sentence, max) {
  if (sentence.length <= max) return [sentence];
  const parts = [];
  let rest = sentence;
  while (rest.length > max) {
    let cut = -1;
    for (const sep of ["; ", ": ", ", ", " – ", " — ", " "]) {
      const i = rest.lastIndexOf(sep, max);
      if (i > max * 0.4) { cut = i + sep.length - 1; break; }
    }
    if (cut === -1) cut = max;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Group sentences into chunks: each paragraph starts a new chunk, short sentences are merged.
export function chunkBlocks(blocks) {
  const chunks = [];
  for (const block of blocks) {
    let current = "";
    for (const sentence of splitSentences(block)) {
      for (const piece of splitLong(sentence, MAX_CHUNK)) {
        const limit = chunks.length === 0 ? FIRST_CHUNK : MAX_CHUNK;
        if (current && (current.length + 1 + piece.length > limit)) {
          chunks.push(current);
          current = piece;
        } else {
          current = current ? current + " " + piece : piece;
        }
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

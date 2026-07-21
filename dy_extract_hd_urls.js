
(() => {
  "use strict";

  const INSTANCE_KEY = "__DY_HD_URL_EXTRACTOR__";
  window[INSTANCE_KEY]?.stop?.(false);
  document.querySelector("#dy-hd-tool-panel")?.remove();
  document.querySelector("#dy-hd-url-extractor-panel")?.remove();
  document.querySelector("#dy-hd-picker-badge")?.remove();
  document.querySelectorAll(".dy-hd-card-overlay").forEach((element) => element.remove());

  const records = new Map();
  const selected = new Map();
  let selecting = false;
  let stopped = false;
  let hoveredCard = null;

  const originalFetch = window.fetch;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  const normalizeUrl = (value) =>
    typeof value === "string" ? value.replaceAll("\\u0026", "&") : "";

  const normalizeText = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/#[^\s#]+/g, " ")
      .replace(/[\s\p{P}\p{S}]+/gu, "")
      .trim();

  const isTargetApi = (url) =>
    typeof url === "string" && (
      /(?:^|[\/?_-])single(?:[\/?_&=-]|$)/i.test(url) ||
      /\/search(?:[\/?_&=-]|$)/i.test(url)
    );

  const isVideoUrl = (url) =>
    /^https?:\/\//i.test(url) &&
    !/\.(?:mp3|m4a|aac|wav|flac|ogg)(?:[?#]|$)/i.test(url) &&
    !/(?:ies-music|music\.douyin|audio)/i.test(url);

  const numeric = (value) => Number(value) || 0;

  function qualityScore(variant) {
    const address = variant?.play_addr ?? {};
    return [
      numeric(address.width) * numeric(address.height),
      numeric(variant?.FPS ?? variant?.fps),
      numeric(variant?.bit_rate),
    ];
  }

  function betterThan(left, right) {
    const a = qualityScore(left);
    const b = qualityScore(right);
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) return a[index] > b[index];
    }
    return false;
  }

  function bestVideoUrl(video) {
    if (!Array.isArray(video?.bit_rate) || !video.bit_rate.length) return "";
    let best = null;
    for (const variant of video.bit_rate) {
      if (!variant?.play_addr?.url_list?.length) continue;
      if (!best || betterThan(variant, best)) best = variant;
    }
    const url = normalizeUrl(best?.play_addr?.url_list?.[0]);
    return isVideoUrl(url) ? url : "";
  }

  function firstText(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function captureRecord(container, video = container?.video) {
    const url = bestVideoUrl(video);
    if (!url) return;

    const authorObject = container?.author ?? container?.aweme_author ?? {};
    const title = firstText(
      container?.desc,
      container?.title,
      container?.aweme_desc,
      video?.desc,
      video?.title,
    );
    const author = firstText(
      authorObject?.nickname,
      authorObject?.unique_id,
      authorObject?.short_id,
      container?.author_name,
      container?.nickname,
    );
    const id = String(
      container?.aweme_id ?? container?.item_id ?? video?.aweme_id ??
      video?.play_addr?.uri ?? url,
    );

    const old = records.get(id);
    records.set(id, {
      id,
      title: title || old?.title || "",
      author: author || old?.author || "",
      url,
    });
    updatePanel();
  }

  function walk(value, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    // single 常见结构：aweme 对象中包含 video、desc 和 author。
    if (value.video?.bit_rate) captureRecord(value, value.video);
    // 兼容 video 对象本身就是响应节点的情况。
    if (value.bit_rate && (value.desc || value.title || value.author)) {
      captureRecord(value, value);
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item, seen);
    } else {
      for (const child of Object.values(value)) walk(child, seen);
    }
  }

  function parsePayload(text) {
    if (typeof text !== "string" || !text.trim()) return;
    try {
      walk(JSON.parse(text));
      return;
    } catch {
      // 搜索接口可能返回 11051{...}a{...} 这种多个 JSON 数据块拼接的内容。
    }

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        if (depth === 0) start = index;
        depth += 1;
      } else if (character === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          try {
            walk(JSON.parse(text.slice(start, index + 1)));
          } catch {
            // 当前块损坏时继续寻找后面的完整数据块。
          }
          start = -1;
        }
      }
    }
  }

  // 注入后立即开始抓取 single 接口。
  window.fetch = async function patchedFetch(...args) {
    const response = await originalFetch.apply(this, args);
    if (isTargetApi(response.url)) {
      response.clone().text().then(parsePayload).catch(() => {});
    }
    return response;
  };

  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__dySingleUrl = String(url ?? "");
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(...args) {
    this.addEventListener("load", () => {
      const url = this.responseURL || this.__dySingleUrl || "";
      if (!isTargetApi(url)) return;
      if (this.responseType === "json") walk(this.response);
      else if (this.responseType === "" || this.responseType === "text") {
        parsePayload(this.responseText);
      }
    }, { once: true });
    return originalXhrSend.apply(this, args);
  };

  const style = document.createElement("style");
  style.textContent = `
    #dy-hd-tool-panel button { margin: 7px 5px 0 0; padding: 5px 9px; cursor: pointer; }
    .dy-hd-card-overlay { position: absolute; pointer-events: none; z-index: 2147483645;
      box-sizing: border-box; border-radius: 8px; }
    .dy-hd-card-hover { border: 2px solid #00a8ff; background: rgba(0,168,255,.20); }
    .dy-hd-card-selected { border: 4px solid #2cff88; background: rgba(44,255,136,.13); }
    #dy-hd-picker-badge { position: absolute; pointer-events: none; z-index: 2147483646;
      max-width: 440px; padding: 4px 7px; border-radius: 4px; color: #fff;
      background: #087cc1; box-shadow: 0 2px 8px rgba(0,0,0,.3);
      font: 12px/1.4 Menlo, Monaco, monospace; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; }
  `;
  document.documentElement.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "dy-hd-tool-panel";
  Object.assign(panel.style, {
    position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
    padding: "12px 14px", minWidth: "260px", borderRadius: "10px", color: "#fff",
    background: "rgba(20,20,24,.94)", boxShadow: "0 4px 18px rgba(0,0,0,.4)",
    font: "14px/1.55 -apple-system,BlinkMacSystemFont,sans-serif",
  });
  panel.innerHTML = `
    <div data-status>抓包已启动：已缓存 0 个视频</div>
    <div data-help>按 ⌘⇧A 开始框选视频</div>
    <div data-results style="margin-top:8px;max-height:220px;max-width:390px;overflow:auto"></div>
    <button data-select>开始选择</button>
    <button data-finish>完成并下载</button>
    <button data-clear>清空选择</button>
  `;
  document.documentElement.appendChild(panel);

  const hoverOverlay = document.createElement("div");
  hoverOverlay.className = "dy-hd-card-overlay dy-hd-card-hover";
  hoverOverlay.hidden = true;
  document.documentElement.appendChild(hoverOverlay);

  const pickerBadge = document.createElement("div");
  pickerBadge.id = "dy-hd-picker-badge";
  pickerBadge.hidden = true;
  document.documentElement.appendChild(pickerBadge);

  function positionOverlay(overlay, element) {
    const rect = element.getBoundingClientRect();
    Object.assign(overlay.style, {
      left: `${rect.left + window.scrollX}px`,
      top: `${rect.top + window.scrollY}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  function describeCard(card) {
    const rect = card.getBoundingClientRect();
    const tag = card.tagName.toLowerCase();
    const id = card.id ? `#${card.id}` : "";
    const classes = Array.from(card.classList).slice(0, 2).map((name) => `.${name}`).join("");
    const metadata = cardMetadata(card);
    const details = [metadata.title, metadata.author].filter(Boolean).join(" · ");
    return `${tag}${id}${classes}  ${Math.round(rect.width)} × ${Math.round(rect.height)}` +
      (details ? `  ${details}` : "");
  }

  function positionPicker(card) {
    positionOverlay(hoverOverlay, card);
    const rect = card.getBoundingClientRect();
    pickerBadge.textContent = describeCard(card);
    pickerBadge.hidden = false;
    const badgeHeight = 26;
    const top = rect.top + window.scrollY >= badgeHeight
      ? rect.top + window.scrollY - badgeHeight
      : rect.bottom + window.scrollY;
    Object.assign(pickerBadge.style, {
      left: `${Math.max(4, rect.left + window.scrollX)}px`,
      top: `${Math.max(4, top)}px`,
    });
  }

  function looksLikeCard(element) {
    if (!(element instanceof HTMLElement) || element === panel) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 160 || rect.width > 900 || rect.height > 1200) {
      return false;
    }
    const hasMedia = Boolean(element.matches("video, img") || element.querySelector("video, img"));
    const hasVideoLink = Boolean(
      element.matches('a[href*="/video/"],a[href*="/note/"]') ||
      element.querySelector('a[href*="/video/"],a[href*="/note/"]'),
    );
    return hasMedia || hasVideoLink;
  }

  function findVideoCard(target) {
    if (!(target instanceof Element) || panel.contains(target)) return null;
    const selectors = [
      '[data-e2e="search-card-item"]',
      '[data-e2e*="video-card"]',
      '[data-e2e*="feed-video"]',
      '[data-e2e*="aweme"]',
      'li:has(a[href*="/video/"])',
    ];
    for (const selector of selectors) {
      const card = target.closest(selector);
      if (looksLikeCard(card)) return card;
    }

    let node = target;
    let best = null;
    let bestScore = -1;
    for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
      if (!looksLikeCard(node)) continue;
      const hasVideoLink = Boolean(node.querySelector('a[href*="/video/"],a[href*="/note/"]'));
      const hasAuthor = Boolean(node.querySelector('a[href*="/user/"],[data-e2e*="author"],[class*="author"]'));
      const textLength = node.innerText?.trim().length ?? 0;
      const mediaCount = node.querySelectorAll("video, img").length;
      const score = (hasVideoLink ? 8 : 0) + (hasAuthor ? 5 : 0) +
        (textLength > 1 ? 3 : 0) + (mediaCount === 1 ? 2 : 0) - depth * 0.05;
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
      if (hasVideoLink && hasAuthor && textLength > 1) break;
    }
    return best;
  }

  function findVideoCardAt(x, y, eventTarget) {
    const elements = document.elementsFromPoint(x, y);
    if (eventTarget instanceof Element && !elements.includes(eventTarget)) {
      elements.unshift(eventTarget);
    }
    for (const element of elements) {
      if (element === hoverOverlay || element === pickerBadge || panel.contains(element)) continue;
      const card = findVideoCard(element);
      if (card) return card;
    }
    return null;
  }

  function selectorText(card, selectors) {
    for (const selector of selectors) {
      const value = card.querySelector(selector)?.textContent?.trim();
      if (value) return value;
    }
    return "";
  }

  function cardMetadata(card) {
    let title = selectorText(card, [
      '[data-e2e*="video-desc"]', '[data-e2e*="search-card-desc"]',
      '[data-e2e*="title"]', '[class*="title"]', '[class*="desc"]',
    ]);
    let author = selectorText(card, [
      '[data-e2e*="author"]', '[class*="author"]', 'a[href*="/user/"]',
    ]);
    const lines = (card.innerText ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
    if (!author) author = lines.find((line) => /^@/.test(line))?.replace(/^@/, "") ?? "";
    if (!title) title = lines.find((line) => line !== author && !/^\d/.test(line)) ?? "";
    return { title, author, text: lines.join(" ") };
  }

  function updatePanel(message) {
    const status = panel.querySelector("[data-status]");
    const help = panel.querySelector("[data-help]");
    if (status) status.textContent = message ??
      `抓包缓存 ${records.size} 个；已选择 ${selected.size} 个`;
    if (help) help.textContent = selecting
      ? "单击视频可多选，再按 ⌘⇧A 完成"
      : "按 ⌘⇧A 开始框选视频";
    renderSelectionResults();
  }

  function selectionMatches(selection) {
    return Array.from(records.values()).filter((record) => matchRecord(selection, record));
  }

  function renderSelectionResults() {
    const results = panel.querySelector("[data-results]");
    if (!results) return;
    results.replaceChildren();
    let index = 0;
    for (const selection of selected.values()) {
      index += 1;
      const matches = selectionMatches(selection);
      const row = document.createElement("div");
      const matched = matches.length > 0;
      Object.assign(row.style, {
        marginTop: "6px", padding: "7px 8px", borderRadius: "6px",
        background: matched ? "rgba(44,255,136,.14)" : "rgba(255,82,82,.16)",
        border: `1px solid ${matched ? "rgba(44,255,136,.45)" : "rgba(255,82,82,.48)"}`,
      });
      const author = selection.author || "未识别作者";
      const title = selection.title || "未识别视频标题";
      row.textContent = `${matched ? "✓" : "✕"} ${index}. 作者：${author}\n` +
        `${title}\n${matched ? "已匹配高清链接" : "未匹配高清链接"}`;
      row.style.whiteSpace = "pre-wrap";
      results.appendChild(row);
    }
  }

  function clearSelection() {
    for (const item of selected.values()) item.overlay.remove();
    selected.clear();
    updatePanel();
  }

  function toggleCard(card) {
    if (selected.has(card)) {
      selected.get(card).overlay.remove();
      selected.delete(card);
    } else {
      const overlay = document.createElement("div");
      overlay.className = "dy-hd-card-overlay dy-hd-card-selected";
      document.documentElement.appendChild(overlay);
      positionOverlay(overlay, card);
      selected.set(card, { overlay, ...cardMetadata(card) });
    }
    updatePanel();
  }

  function textMatches(selectedText, recordText) {
    const a = normalizeText(selectedText);
    const b = normalizeText(recordText);
    if (!a || !b) return false;
    return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b));
  }

  function matchRecord(selection, record) {
    const titleMatched = textMatches(selection.title, record.title) ||
      textMatches(selection.text, record.title);
    const authorMatched = textMatches(selection.author, record.author) ||
      textMatches(selection.text, record.author);
    return titleMatched && authorMatched;
  }

  function downloadMatches() {
    if (!selected.size) {
      updatePanel("请先选择至少一个视频");
      return false;
    }
    const matched = new Set();
    const unmatched = [];
    for (const selection of selected.values()) {
      let selectionMatched = false;
      for (const record of records.values()) {
        if (matchRecord(selection, record)) {
          matched.add(record.url);
          selectionMatched = true;
        }
      }
      if (!selectionMatched) {
        unmatched.push({
          author: selection.author || "未识别作者",
          title: selection.title || "未识别视频标题",
        });
      }
    }

    if (!matched.size) {
      updatePanel(`没有匹配到链接；未匹配 ${unmatched.length} 个视频`);
      return false;
    }
    const blobUrl = URL.createObjectURL(new Blob(
      [`${Array.from(matched).join("\n")}\n`], { type: "text/plain;charset=utf-8" },
    ));
    const link = Object.assign(document.createElement("a"), {
      href: blobUrl, download: "video_urls.txt",
    });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    if (unmatched.length) {
      updatePanel(`已下载 ${matched.size} 个链接；未匹配 ${unmatched.length} 个视频`);
    } else {
      updatePanel(`全部匹配成功：已下载 ${matched.size} 个高清链接`);
    }
    return true;
  }

  function startSelecting() {
    selecting = true;
    document.body.style.cursor = "crosshair";
    updatePanel();
  }

  function finishSelecting() {
    selecting = false;
    hoveredCard = null;
    hoverOverlay.hidden = true;
    pickerBadge.hidden = true;
    document.body.style.cursor = "";
    updatePanel();
    downloadMatches();
  }

  function onMouseMove(event) {
    if (!selecting) return;
    hoveredCard = findVideoCardAt(event.clientX, event.clientY, event.target);
    hoverOverlay.hidden = !hoveredCard;
    pickerBadge.hidden = !hoveredCard;
    if (hoveredCard) positionPicker(hoveredCard);
  }

  function blockCardEvent(event) {
    if (!selecting || !hoveredCard) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onPointerDown(event) {
    if (!selecting || !hoveredCard || event.button !== 0) return;
    blockCardEvent(event);
    toggleCard(hoveredCard);
  }

  function onClick(event) {
    blockCardEvent(event);
  }

  function onKeyDown(event) {
    if (!(event.metaKey && event.shiftKey && event.key.toLowerCase() === "a")) return;
    event.preventDefault();
    event.stopPropagation();
    if (selecting) finishSelecting();
    else startSelecting();
  }

  function refreshOverlays() {
    if (hoveredCard && selecting) positionPicker(hoveredCard);
    for (const [card, item] of selected) {
      if (card.isConnected) positionOverlay(item.overlay, card);
    }
  }

  function stop(removePanel = true) {
    if (stopped) return;
    stopped = true;
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXhrOpen;
    XMLHttpRequest.prototype.send = originalXhrSend;
    window.removeEventListener("pointermove", onMouseMove, true);
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("mousedown", blockCardEvent, true);
    document.removeEventListener("mouseup", blockCardEvent, true);
    document.removeEventListener("pointerup", blockCardEvent, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", refreshOverlays, true);
    window.removeEventListener("resize", refreshOverlays, true);
    document.body.style.cursor = "";
    hoverOverlay.remove();
    pickerBadge.remove();
    clearSelection();
    style.remove();
    if (removePanel) panel.remove();
  }

  window.addEventListener("pointermove", onMouseMove, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("mousedown", blockCardEvent, true);
  document.addEventListener("mouseup", blockCardEvent, true);
  document.addEventListener("pointerup", blockCardEvent, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", refreshOverlays, true);
  window.addEventListener("resize", refreshOverlays, true);
  panel.querySelector("[data-select]").addEventListener("click", startSelecting);
  panel.querySelector("[data-finish]").addEventListener("click", finishSelecting);
  panel.querySelector("[data-clear]").addEventListener("click", clearSelection);

  window[INSTANCE_KEY] = { records, selected, startSelecting, downloadMatches, stop };
  updatePanel("抓包已启动：等待 single/搜索接口");
  console.info("[抖音高清提取器] 已监听 single 和搜索接口；按 Command+Shift+A 开始多选。");
})();

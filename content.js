(() => {
  const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, dt, dd';
  const IGNORE_SELECTOR = 'script, style, noscript, code, pre, svg, textarea, input, select, [translate="no"], .notranslate, .bgt-original';
  const ORIGINAL_CLASS = 'bgt-original';
  const BLOCK_CLASS = 'bgt-block';

  // 保存元素翻译前的原始文本快照
  const originalSnapshot = new WeakMap();
  let isEnabled = true;
  let displayStyle = 'subtle';
  let transScale = 100; // 译文字号缩放百分比（80 - 150）
  let renderTimer = null;

  // 读取用户设置
  if (chrome?.storage?.sync) {
    chrome.storage.sync.get({ enabled: true, style: 'subtle', transScale: 100 }, (res) => {
      isEnabled = res.enabled;
      displayStyle = res.style;
      transScale = res.transScale;
      applySettings();
      syncBilingualView();
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.enabled) isEnabled = changes.enabled.newValue;
      if (changes.style) displayStyle = changes.style.newValue;
      if (changes.transScale) transScale = changes.transScale.newValue;
      applySettings();
      syncBilingualView();
    });
  }

  function applySettings() {
    const html = document.documentElement;
    html.dataset.bgtStyle = displayStyle;
    html.style.setProperty('--bgt-trans-scale', String((Number(transScale) || 100) / 100));
  }

  // 判断当前页面是否处于 Google 翻译激活状态
  function isPageTranslated() {
    const html = document.documentElement;
    return (
      html.classList.contains('translated-ltr') ||
      html.classList.contains('translated-rtl') ||
      Boolean(document.querySelector('font[style*="vertical-align: inherit"]'))
    );
  }

  // 仅处理包含实质文本且不包含子级块元素的叶子块级节点，避免嵌套重复
  function isTargetBlock(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.closest(IGNORE_SELECTOR)) return false;
    if (!el.matches(BLOCK_SELECTOR)) return false;

    // 如果内部还包含其他块级元素，则交由更内层的块级元素处理
    if (el.querySelector(BLOCK_SELECTOR)) return false;

    const text = el.textContent?.trim();
    return Boolean(text && text.length >= 2);
  }

  // 记录元素的原始文本
  function captureOriginal(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.ELEMENT_NODE && isTargetBlock(root) && !originalSnapshot.has(root)) {
      originalSnapshot.set(root, root.textContent.trim());
    }
    const candidates = root.querySelectorAll ? root.querySelectorAll(BLOCK_SELECTOR) : [];
    for (const el of candidates) {
      if (!originalSnapshot.has(el) && isTargetBlock(el)) {
        originalSnapshot.set(el, el.textContent.trim());
      }
    }
  }

  // 注入双语原文（原文在上，译文在下）
  function injectOriginals() {
    if (!document.body) return;
    const candidates = document.body.querySelectorAll(BLOCK_SELECTOR);
    for (const el of candidates) {
      if (!isTargetBlock(el)) continue;
      if (el.querySelector(`:scope > .${ORIGINAL_CLASS}`)) continue;

      const origText = originalSnapshot.get(el);
      if (!origText) continue;

      // 只有当译文与原文确实不同（已被翻译）时才插入原文，避免重复显示
      const currentText = el.textContent?.trim();
      if (!currentText || currentText === origText) continue;

      // 记录该段落原本的计算字号，确保缩放译文时不连带缩放原文
      if (!el.style.getPropertyValue('--bgt-base-size')) {
        const computedSize = window.getComputedStyle(el).fontSize;
        if (computedSize) {
          el.style.setProperty('--bgt-base-size', computedSize);
        }
      }
      el.classList.add(BLOCK_CLASS);

      const origSpan = document.createElement('span');
      origSpan.className = ORIGINAL_CLASS;
      origSpan.setAttribute('translate', 'no');
      origSpan.textContent = origText;

      // 使用 span(display: block) prepend 到块元素顶部，不破坏 <ul>/<table>/<p> 结构
      el.prepend(origSpan);
    }
  }

  // 移除双语原文（恢复纯译文或用户点“显示原文”时清理）
  function removeOriginals() {
    document.querySelectorAll(`.${ORIGINAL_CLASS}`).forEach((node) => node.remove());
    document.querySelectorAll(`.${BLOCK_CLASS}`).forEach((el) => {
      el.classList.remove(BLOCK_CLASS);
      el.style.removeProperty('--bgt-base-size');
    });
  }

  function syncBilingualView() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (isEnabled && isPageTranslated()) {
        injectOriginals();
      } else {
        removeOriginals();
      }
    }, 150);
  }

  // 1. 初始加载时立即缓存原文
  captureOriginal(document.body);
  applySettings();

  // 2. 监听 <html> 的 class/lang 变化（Google 翻译开启/关闭会修改 translated-ltr）
  const htmlObserver = new MutationObserver(() => {
    syncBilingualView();
  });
  htmlObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'lang']
  });

  // 3. 监听 DOM 新增节点（支持 SPA 与无限滚动加载的内容）
  const bodyObserver = new MutationObserver((mutations) => {
    let hasRelevantChange = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains(ORIGINAL_CLASS)) {
          captureOriginal(node);
          hasRelevantChange = true;
        }
      }
    }
    if (hasRelevantChange && isEnabled && isPageTranslated()) {
      syncBilingualView();
    }
  });

  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  }
})();

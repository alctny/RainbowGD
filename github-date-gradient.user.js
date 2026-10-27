// ==UserScript==
// @name         Rainbow
// @namespace    github-date-gradient
// @version      1.3.3
// @description  GitHub 修改日期越久顏色越深，支援單色、彩色漸變及順序、倒序、原序排列。
// @author       codex/GPT-6 Astra
// @match        https://github.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @license      WTFPL
// ==/UserScript==

(() => {
  'use strict';

  const KEY = 'github-date-gradient.settings.v1';
  const DEFAULTS = { enabled: true, mode: 'mono', color: '#2563eb', sort: 'desc' };
  let settings = { ...DEFAULTS };
  try {
    const saved = GM_getValue(KEY, {});
    settings = {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : true,
      mode: saved.mode === 'rainbow' ? 'rainbow' : 'mono',
      color: /^#[0-9a-f]{6}$/i.test(saved.color) ? saved.color : DEFAULTS.color,
      sort: ['asc', 'desc', 'original'].includes(saved.sort) ? saved.sort : DEFAULTS.sort,
    };
  } catch (error) { console.warn('[GitHub Date Gradient] 無法讀取設定', error); }

  const style = document.createElement('style');
  style.textContent = `
    #github-date-gradient-controls[hidden] { display: none !important; }
    /* Star is a split button; Rainbow is standalone and needs all four corners. */
    #github-date-gradient-controls > button {
      border-radius: var(--borderRadius-medium, 6px) !important;
    }
    #github-date-gradient-controls .ghdg-trigger-content {
      display: inline-flex; align-items: center; gap: 6px; vertical-align: middle;
    }
    #github-date-gradient-controls .ghdg-rainbow-icon {
      width: 16px; height: 16px; flex: none;
    }
    #github-date-gradient-controls[data-gradient="off"] .ghdg-rainbow-icon {
      filter: grayscale(1);
    }
    .ghdg-date {
      background: var(--ghdg-bg) !important;
      color: var(--ghdg-fg) !important;
      border-radius: 4px;
      padding: 2px 5px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    @media (forced-colors: active) {
      .ghdg-date { outline: 1px solid CanvasText; }
    }
  `;
  document.head.append(style);

  // Isolated controls do not inherit GitHub's styles or trigger our observer.
  const host = document.createElement('div');
  const controlsListItem = document.createElement('li');
  host.id = 'github-date-gradient-controls';
  host.style.cssText = 'position:fixed;right:16px;top:80px;z-index:1000;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { color-scheme: light dark; font: 13px/1.5 system-ui, sans-serif; }
      [hidden] { display: none !important; }
      button, select, input { font: inherit; }
      button, select { cursor: pointer; }
      button { padding: 7px 12px; border: 1px solid #8888; border-radius: 8px;
        background: Canvas; color: CanvasText; box-shadow: 0 2px 8px #0002; }
      button:focus-visible, select:focus-visible, input:focus-visible {
        outline: 2px solid #58a6ff; outline-offset: 3px;
      }
      #panel { box-sizing: border-box; width: min(290px, calc(100vw - 32px));
        max-height: calc(100vh - 88px); overflow: auto;
        margin-bottom: 8px; padding: 16px; background: Canvas; color: CanvasText;
        border: 1px solid #8888; border-radius: 10px; box-shadow: 0 4px 24px #0003; }
      #panel { position: absolute; right: 0;
        top: calc(100% + 8px); margin: 0; text-align: left; white-space: normal; }
      label { display: flex; justify-content: space-between; align-items: center;
        gap: 12px; margin: 10px 0; }
      select { max-width: 160px; }
      input[type=color] { width: 48px; height: 30px; padding: 2px; }
      p { margin: 12px 0 0; font-size: 12px; }
      #status:empty { display: none; }
      #scale { height: 12px; margin-top: 12px; border-radius: 4px; }
      #ends { display: flex; justify-content: space-between; font-size: 12px; }
    </style>
    <section id="panel" aria-label="Rainbow 設定" hidden>
      <label>啟用漸變 <input id="enabled" type="checkbox"></label>
      <label>顏色模式 <select id="mode"><option value="mono">單色漸變</option>
        <option value="rainbow">彩色漸變</option></select></label>
      <label id="color-row">主色 <input id="color" type="color" aria-label="單色漸變主色"></label>
      <label>排序 <select id="sort"><option value="asc">順序（舊 → 新）</option>
        <option value="desc">倒序（新 → 舊）</option>
        <option value="original">原序（GitHub 原序）</option></select></label>
      <div id="scale" aria-hidden="true"></div>
      <div id="ends"><span>新 · 淺</span><span>舊 · 深</span></div>
      <p id="status" role="status"></p>
    </section>
    <button id="toggle" type="button" aria-expanded="false" aria-controls="panel">
      <span class="ghdg-trigger-content">
        <svg class="ghdg-rainbow-icon" viewBox="0 0 24 24" fill="none" stroke-width="2"
          aria-hidden="true" focusable="false">
          <path d="M2 19V14a10 10 0 0 1 20 0v5" stroke="#f85149"/>
          <path d="M4 19V14a8 8 0 0 1 16 0v5" stroke="#f2a93b"/>
          <path d="M6 19V14a6 6 0 0 1 12 0v5" stroke="#e3d750"/>
          <path d="M8 19V14a4 4 0 0 1 8 0v5" stroke="#56d364"/>
          <path d="M10 19V14a2 2 0 0 1 4 0v5" stroke="#58a6ff"/>
        </svg>
        <span>Rainbow</span>
      </span>
    </button>
  `;
  const $ = (selector) => shadow.querySelector(selector);
  const panel = $('#panel');
  const toggle = $('#toggle');
  // Keep only the panel isolated. A slotted light-DOM button can use GitHub's
  // actual button classes, including hover, focus and light/dark theme rules.
  const triggerSlot = document.createElement('slot');
  triggerSlot.name = 'trigger';
  toggle.replaceWith(triggerSlot);
  toggle.slot = 'trigger';
  toggle.className = 'btn btn-sm';
  host.append(toggle);
  function closePanel() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  shadow.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closePanel(); toggle.focus(); }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.composedPath().includes(host)) closePanel();
  });

  function mix(a, b, amount) { return a.map((v, i) => Math.round(v + (b[i] - v) * amount)); }
  function colorAt(amount) {
    if (settings.mode === 'rainbow') {
      // Each stop has lower relative luminance: older dates become darker.
      const stops = [[255, 247, 188], [161, 218, 180], [65, 182, 196], [44, 127, 184], [37, 52, 148]];
      const index = Math.min(3, Math.floor(amount * 4));
      return mix(stops[index], stops[index + 1], amount * 4 - index);
    }
    const base = settings.color.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16));
    return mix(mix([255, 255, 255], base, 0.12), mix(base, [0, 0, 0], 0.4), amount);
  }
  function foreground(rgb) {
    const linear = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    return luminance > 0.179 ? '#000000' : '#ffffff';
  }
  function syncControls() {
    host.dataset.gradient = settings.enabled ? 'on' : 'off';
    const label = `Rainbow 設定（顏色漸變${settings.enabled ? '已啟用' : '已關閉'}）`;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    $('#enabled').checked = settings.enabled;
    $('#mode').value = settings.mode;
    $('#color').value = settings.color;
    $('#sort').value = settings.sort;
    $('#color-row').hidden = settings.mode !== 'mono';
    const colors = Array.from({ length: 9 }, (_, i) => `rgb(${colorAt(i / 8).join(',')})`);
    $('#scale').style.background = `linear-gradient(to right, ${colors.join(',')})`;
  }
  shadow.addEventListener('change', () => {
    settings = { enabled: $('#enabled').checked, mode: $('#mode').value, color: $('#color').value, sort: $('#sort').value };
    try { GM_setValue(KEY, settings); $('#status').textContent = '設定已儲存。'; }
    catch (error) { $('#status').textContent = '設定暫時生效，但無法儲存。'; console.warn(error); }
    syncControls();
    schedule();
  });

  const painted = new Set();
  function clearDate(element) {
    element.classList.remove('ghdg-date');
    element.style.removeProperty('--ghdg-bg');
    element.style.removeProperty('--ghdg-fg');
  }
  function isRepositoryFileLink(href) {
    const pageParts = location.pathname.split('/').filter(Boolean);
    try {
      const url = new URL(href, location.href);
      const linkParts = url.pathname.split('/').filter(Boolean);
      // GitHub owner/repository names are case-insensitive; file paths are not.
      return url.origin === location.origin && pageParts.length >= 2 &&
        linkParts.length >= 4 &&
        linkParts[0].toLowerCase() === pageParts[0].toLowerCase() &&
        linkParts[1].toLowerCase() === pageParts[1].toLowerCase() &&
        (linkParts[2] === 'blob' || linkParts[2] === 'tree');
    } catch { return false; }
  }
  function collectDates() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || (parts.length > 2 && parts[2] !== 'tree')) return [];
    const entries = [];
    for (const element of document.querySelectorAll('relative-time[datetime], time-ago[datetime], time[datetime]')) {
      // Restrict coloring to file/directory rows; exclude commits, README and activity.
      const row = element.closest('tr, [role="row"], .js-navigation-item');
      if (!row || row.closest('article, .markdown-body') || !element.getClientRects().length) continue;
      const isFileRow = Array.from(row.querySelectorAll('a[href]')).some((link) =>
        isRepositoryFileLink(link.getAttribute('href')));
      if (!isFileRow) continue;
      const timestamp = Date.parse(element.getAttribute('datetime'));
      if (Number.isFinite(timestamp)) entries.push({ element, row, timestamp });
    }
    return entries;
  }
  function ageAmount(timestamp, oldest, newest) {
    return newest === oldest ? 0.5 : (newest - timestamp) / (newest - oldest);
  }
  const originalOrders = new WeakMap();
  function sortRows(entries, order = 'desc') {
    const groups = new Map();
    for (const { row, timestamp } of entries) {
      const parent = row.parentElement;
      if (!parent) continue;
      if (!groups.has(parent)) groups.set(parent, new Map());
      // A responsive row may contain several copies of the same date.
      groups.get(parent).set(row, timestamp);
    }
    for (const [parent, times] of groups) {
      const children = Array.from(parent.children);
      let record = originalOrders.get(parent);
      if (!record || record.path !== location.pathname) {
        record = { path: location.pathname, rows: [...children] };
        originalOrders.set(parent, record);
      }
      // Retain the initial order across our own moves and late date loading.
      record.rows = record.rows.filter((row) => children.includes(row));
      children.forEach((row, position) => {
        if (!record.rows.includes(row)) record.rows.splice(position, 0, row);
      });
      const sorted = record.rows.filter((row) => times.has(row))
        .sort((a, b) => order === 'asc' ? times.get(a) - times.get(b) : times.get(b) - times.get(a));
      let index = 0;
      // Keep headers, parent-directory links and undated rows in their slots.
      const desired = order === 'original' ? record.rows :
        record.rows.map((row) => times.has(row) ? sorted[index++] : row);
      desired.forEach((row, position) => {
        if (parent.children[position] !== row) parent.insertBefore(row, parent.children[position] || null);
      });
    }
  }
  function findStarButton() {
    const [owner, repo] = location.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    const actionPath = `/${owner}/${repo}/`.toLowerCase();
    // React repository headers need not have either of the old header IDs.
    return Array.from(document.querySelectorAll('button, summary, a.btn, a[class*="Button"]'))
      .find((button) => {
        if (host.contains(button) || !button.getClientRects().length ||
            button.closest('article, .markdown-body, [role="menu"], dialog')) return false;
        const label = `${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.trim();
        const form = button.closest('form[action]');
        let starAction = false;
        if (form) {
          try {
            const url = new URL(form.getAttribute('action'), location.href);
            starAction = url.origin === location.origin &&
              [actionPath + 'star', actionPath + 'unstar'].includes(url.pathname.toLowerCase());
          } catch { /* Ignore malformed unrelated forms. */ }
        }
        const starIcon = button.querySelector('.octicon-star, .octicon-star-fill');
        return starAction || (starIcon && /\bstar(?:red)?\b|星標|星标|收藏/i.test(label)) ||
          /^(?:star|starred|unstar)(?:\s|$)/i.test(label);
      }) || null;
  }
  function placeControls() {
    const star = findStarButton();
    if (star) {
      // Climb through forms and split-button wrappers, but never enter a menu
      // or nest our settings trigger inside the Star action itself.
      let widget = star;
      while (widget.parentElement && widget.parentElement !== document.body) {
        const parent = widget.parentElement;
        if (parent.matches('form, details, .js-social-container, [class*="ButtonGroup"], [class*="buttonGroup"]')) {
          widget = parent;
        } else if (parent.children.length === 1 && !parent.matches('main, header, nav, ul, ol')) {
          widget = parent;
        } else break;
      }
      const listItem = star.closest('li');
      if (listItem) widget = listItem;
      // Give Rainbow its own sibling list item beside the Star action.
      if (widget.tagName === 'LI') {
        if (host.parentElement !== controlsListItem) controlsListItem.append(host);
        if (widget.nextElementSibling !== controlsListItem) widget.after(controlsListItem);
      } else {
        if (widget.nextElementSibling !== host) widget.after(host);
        controlsListItem.remove();
      }
      const placement = widget.tagName === 'LI' ? 'star-list' : 'star';
      if (host.dataset.placement !== placement) {
        host.dataset.placement = placement;
        host.style.cssText = `display:inline-flex;position:relative;margin-left:${placement === 'star-list' ? '0' : '8px'};vertical-align:middle;align-self:center;flex-shrink:0;z-index:1000;`;
      }
      const classes = star.className || 'btn btn-sm';
      if (toggle.className !== classes) toggle.className = classes;
      for (const attribute of ['data-size', 'data-variant']) {
        const value = star.getAttribute(attribute);
        if (value === null) toggle.removeAttribute(attribute);
        else if (toggle.getAttribute(attribute) !== value) toggle.setAttribute(attribute, value);
      }
      const computed = getComputedStyle(star);
      // Match geometry without freezing theme colors or overriding hover rules.
      for (const property of ['height', 'min-height', 'font-family', 'font-size', 'font-weight',
        'line-height', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right']) {
        const value = computed.getPropertyValue(property);
        if (toggle.style.getPropertyValue(property) !== value) toggle.style.setProperty(property, value);
      }
    } else {
      // Stay at the top right while the header is loading or Star is hidden.
      if (host.parentElement !== document.body) document.body.append(host);
      controlsListItem.remove();
      if (host.dataset.placement !== 'floating') {
        host.dataset.placement = 'floating';
        host.style.cssText = 'position:fixed;right:16px;top:80px;z-index:1000;';
      }
    }
  }
  function refresh() {
    const entries = collectDates();
    sortRows(entries, settings.sort);
    placeControls();
    // Only mutate when visibility changes: 'hidden' is observed below.
    const hidden = entries.length === 0;
    if (host.hidden !== hidden) host.hidden = hidden;
    if (controlsListItem.hidden !== hidden) controlsListItem.hidden = hidden;
    const active = new Set(settings.enabled ? entries.map(({ element }) => element) : []);
    for (const element of painted) {
      if (!active.has(element)) { clearDate(element); painted.delete(element); }
    }
    if (!settings.enabled || !entries.length) return;
    const times = entries.map(({ timestamp }) => timestamp);
    const oldest = Math.min(...times);
    const newest = Math.max(...times);
    for (const { element, timestamp } of entries) {
      const amount = ageAmount(timestamp, oldest, newest);
      const rgb = colorAt(amount);
      const background = `rgb(${rgb.join(', ')})`;
      const text = foreground(rgb);
      // Avoid needless mutations in GitHub's custom time elements.
      if (element.style.getPropertyValue('--ghdg-bg') !== background) element.style.setProperty('--ghdg-bg', background);
      if (element.style.getPropertyValue('--ghdg-fg') !== text) element.style.setProperty('--ghdg-fg', text);
      element.classList.add('ghdg-date');
      painted.add(element);
    }
  }
  let timer;
  function schedule() {
    if (timer !== undefined) return;
    timer = window.setTimeout(() => { timer = undefined; refresh(); }, 120);
  }
  new MutationObserver(schedule).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['datetime', 'href', 'hidden'],
  });
  document.addEventListener('turbo:load', schedule);
  document.addEventListener('pjax:end', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('resize', schedule);
  document.body.append(host);
  syncControls();
  refresh();
})();

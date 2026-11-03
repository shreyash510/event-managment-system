/* Shared screen helpers. Every view uses these so screens look and behave the same. */
(function () {
  'use strict';
  const UI = {};
  UI.esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.money = (n) => '£' + (Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  UI.date = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
  UI.time = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  UI.dateTime = (v) => (v ? `${UI.date(v)}, ${UI.time(v)}` : '');
  const TONE = { 'On sale': 'good', 'Sold out': 'bad', Cancelled: 'bad', Draft: 'quiet', Scheduled: 'info', 'Sales closed': 'warn', Completed: 'quiet' };
  UI.badge = (text, tone) => `<span class="badge badge-${UI.esc(tone || TONE[text] || 'quiet')}">${UI.esc(text)}</span>`;
  UI.demo = (text) => `<p class="demo-note">Demo: ${UI.esc(text)}</p>`;
  UI.empty = (text) => `<div class="empty">${UI.esc(text)}</div>`;
  UI.pageHead = (title, actionsHtml, subtitle) => `<div class="page-head"><div><h1>${UI.esc(title)}</h1>${subtitle ? `<p class="muted">${UI.esc(subtitle)}</p>` : ''}</div><div class="page-actions">${actionsHtml || ''}</div></div>`;
  /* Responsive table: columns [{label, html(row)}]. Becomes cards on a phone through data-label.
     CSS display changes remove a table's meaning for screen readers, so the roles are set by hand. */
  /* Options: emptyText, pageSize (default 10), rowClass(row) for a class on that row's <tr>.
     Every table gets Previous / Next under it (disabled when everything fits on one page). Row buttons should use a click listener on
     a parent that lives on (as every view already does), because turning a page swaps the rows' HTML. */
  const PAGE_SIZE = 10;
  const paged = new Map();   /* table id -> what is needed to draw it again */
  const lastPage = new Map();   /* screen and columns -> { page, count }, so a re-render stays on the same page */
  let tableCount = 0;
  const SORT_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>';
  const headHtml = (c, i, sort) => {
    if (!c.label) return `<th scope="col" role="columnheader"></th>`;
    const on = sort && sort.i === i;
    return `<th scope="col" role="columnheader"${on ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" class="th-sort" data-sort="${i}">${UI.esc(c.label)}${SORT_ICON}</button></th>`;
  };
  /* Sorting uses the text a cell shows, so it works for every column without extra setup. Numbers sort as numbers. */
  const cellText = (c, r) => String(c.html(r)).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  const sortRows = (t) => {
    const s = t.state.sort;
    if (!s) return t.rows;
    const c = t.columns[s.i];
    const keyed = t.rows.map((r, n) => ({ r, n, v: cellText(c, r) }));
    keyed.sort((a, b) => {
      const x = parseFloat(a.v.replace(/[£,$]/g, '')), y = parseFloat(b.v.replace(/[£,$]/g, ''));
      const cmp = !isNaN(x) && !isNaN(y) && /^[£$]?-?[\d,.]+/.test(a.v) && /^[£$]?-?[\d,.]+/.test(b.v) ? x - y : a.v.localeCompare(b.v, 'en-GB', { numeric: true, sensitivity: 'base' });
      return (cmp * s.dir) || a.n - b.n;
    });
    return keyed.map((k) => k.r);
  };
  const tableHtml = (columns, rows, o, sort) =>
    `<div class="table-wrap"><table class="table" role="table"><thead role="rowgroup"><tr role="row">${columns.map((c, i) => headHtml(c, i, sort)).join('')}</tr></thead><tbody role="rowgroup">${rows.map((r) => `<tr role="row"${o.rowClass && o.rowClass(r) ? ` class="${UI.esc(o.rowClass(r))}"` : ''}>${columns.map((c) => `<td role="cell" data-label="${UI.esc(c.label)}">${c.html(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const SIZES = [10, 15, 25, 50];
  const PG_ICON = {
    first: '<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>', prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>', last: '<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>'
  };
  const pgIcon = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PG_ICON[k]}</svg>`;
  const pagedHtml = (t) => {
    const size = t.state.size, pages = Math.max(1, Math.ceil(t.rows.length / size)), page = t.state.page, start = page * size;
    const shown = sortRows(t).slice(start, start + size);
    const ctl = (k, label, off) => `<button type="button" class="pg-btn" data-pg="${k}" aria-label="${label}"${off ? ' disabled' : ''}>${pgIcon(k)}</button>`;
    /* Up to five page numbers around the current page. */
    const from = Math.max(0, Math.min(page - 2, pages - 5)), to = Math.min(pages, from + 5);
    let nums = '';
    for (let i = from; i < to; i++) nums += `<button type="button" class="pg-btn pg-num" data-pg="page" data-n="${i}" aria-label="Page ${i + 1}"${i === page ? ' aria-current="page"' : ''}>${i + 1}</button>`;
    const opts = SIZES.concat(SIZES.includes(size) ? [] : [size]).sort((a, b) => a - b).map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n}</option>`).join('');
    return tableHtml(t.columns, shown, t.o, t.state.sort) +
      `<nav class="pager" aria-label="Table pages"><div class="pg-group">${ctl('first', 'First page', page === 0)}${ctl('prev', 'Previous page', page === 0)}${nums}${ctl('next', 'Next page', page >= pages - 1)}${ctl('last', 'Last page', page >= pages - 1)}</div>` +
      `<label class="pg-size"><span class="sr-only">Rows per page</span><select data-pg-size>${opts}</select><span>per page</span></label>` +
      `<span class="muted pager-info" tabindex="-1" role="status">${t.rows.length ? `${start + 1} - ${start + shown.length}` : '0'} of ${t.rows.length}</span></nav>`;
  };
  UI.table = (columns, rows, opts) => {
    const o = opts || {};
    if (!rows.length) return UI.empty(o.emptyText || 'Nothing to show.');
    const key = location.hash.split('?')[0] + '|' + columns.map((c) => c.label).join('|');
    let state = lastPage.get(key);
    /* A different number of rows means the list changed (a filter, an add), so start again at page one. */
    if (!state || state.count !== rows.length) { state = { page: 0, count: rows.length, size: state ? state.size : (o.pageSize || PAGE_SIZE) }; lastPage.set(key, state); }
    const id = 'pg' + (++tableCount);
    const t = { columns, rows, o, state };
    paged.set(id, t);
    if (paged.size > 200) paged.delete(paged.keys().next().value);
    return `<div class="paged" data-paged="${id}">${pagedHtml(t)}</div>`;
  };
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('button[data-pg]');
    const box = btn && btn.closest('[data-paged]');
    const t = box && paged.get(box.dataset.paged);
    if (!t || btn.disabled) return;
    const pages = Math.max(1, Math.ceil(t.rows.length / t.state.size)), k = btn.dataset.pg, p = t.state.page;
    const next = k === 'first' ? 0 : k === 'last' ? pages - 1 : k === 'next' ? p + 1 : k === 'prev' ? p - 1 : Number(btn.dataset.n);
    t.state.page = Math.min(Math.max(next, 0), pages - 1);
    box.innerHTML = pagedHtml(t);
    /* The pressed button is gone, so put focus on it again, or on the page note if it is now disabled. */
    const again = k === 'page' ? box.querySelector('.pg-num[aria-current]') : box.querySelector(`button[data-pg="${k}"]:not([disabled])`);
    (again || box.querySelector('.pager-info')).focus();
  });
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('button[data-sort]');
    const box = btn && btn.closest('[data-paged]');
    const t = box && paged.get(box.dataset.paged);
    if (!t) return;
    const i = Number(btn.dataset.sort), cur = t.state.sort;
    t.state.sort = cur && cur.i === i ? (cur.dir > 0 ? { i, dir: -1 } : null) : { i, dir: 1 };
    t.state.page = 0;
    box.innerHTML = pagedHtml(t);
    const again = box.querySelector(`button[data-sort="${i}"]`);
    if (again) again.focus();
  });
  document.addEventListener('change', (ev) => {
    const sel = ev.target.closest && ev.target.closest('select[data-pg-size]');
    const box = sel && sel.closest('[data-paged]');
    const t = box && paged.get(box.dataset.paged);
    if (!t) return;
    t.state.size = Number(sel.value) || PAGE_SIZE;
    t.state.page = 0;
    box.innerHTML = pagedHtml(t);
    box.querySelector('select[data-pg-size]').focus();
  });

  /* Remember an element well enough to find its replacement after a re-render. */
  UI.focusKey = (el) => {
    if (!el || el === document.body || !el.tagName) return null;
    let sel = '';
    if (el.id) sel = '#' + CSS.escape(el.id);
    else {
      const attrs = Array.from(el.attributes).filter((a) => a.name === 'name' || a.name === 'href' || a.name.startsWith('data-'));
      if (attrs.length) sel = el.tagName.toLowerCase() + attrs.map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
    }
    let start = null, end = null;
    try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { /* this input type has no caret */ }
    return sel ? { sel, start, end } : null;
  };
  /* Put focus back where it was, or on the main area if that element has gone. */
  UI.refocus = (key) => {
    let el = null;
    if (key) { try { el = document.querySelector(key.sel); } catch (e) { el = null; } }
    (el || document.getElementById('main')).focus({ preventScroll: true });
    if (el && key.start !== null && key.start !== undefined && el.setSelectionRange) { try { el.setSelectionRange(key.start, key.end); } catch (e) { /* not a text field */ } }
  };

  /* A modal dialog sits above the page. A popover is the only way to show toasts above it. */
  function liftToasts(box) {
    if (!box.showPopover) return;
    if (!box.hasAttribute('popover')) box.setAttribute('popover', 'manual');
    if (box.matches(':popover-open')) box.hidePopover();
    box.showPopover();
  }
  function lowerToasts(box) {
    if (box.children.length || !box.hasAttribute('popover')) return;
    if (box.matches(':popover-open')) box.hidePopover();
    box.removeAttribute('popover');
  }
  /* Toast tones: 'good', 'bad', 'warn', or none. */
  UI.toast = (text, tone) => {
    const show = () => {
      const box = document.getElementById('toasts');
      const t = document.createElement('div');
      t.className = `toast ${tone ? 'toast-' + tone : ''}`;
      t.textContent = text;
      box.appendChild(t);
      if (document.querySelector('dialog[open]')) liftToasts(box);
      setTimeout(() => { t.remove(); lowerToasts(box); }, tone === 'bad' ? 7000 : 4000);
    };
    /* Called from a dialog button, the dialog usually closes straight after. Wait, so screen readers hear it. */
    if (document.querySelector('dialog[open]')) setTimeout(show, 0); else show();
  };
  /* In-page dialog. Never use alert()/confirm()/prompt().
     UI.dialog({ title, body: html, actions: [{ label, kind: 'primary'|'danger'|'ghost', onClick(dialogEl, close) }], onOpen(dialogEl), wide })
     A button closes the dialog unless onClick returns false (use that to show a validation message).
     Long content scrolls inside .dialog-body, so the buttons stay on screen. */
  let dialogCount = 0;
  UI.dialog = ({ title, body, actions, onOpen, wide }) => {
    const d = document.createElement('dialog');
    const titleId = `dialog-title-${++dialogCount}`;
    d.className = 'dialog' + (wide ? ' dialog-wide' : '');
    d.setAttribute('aria-labelledby', titleId);
    const list = actions && actions.length ? actions : [{ label: 'Close', kind: 'ghost' }];
    d.innerHTML = `<h2 id="${titleId}">${UI.esc(title)}</h2><div class="dialog-body">${body || ''}</div><p class="form-error" role="alert" hidden></p><div class="dialog-actions">${list.map((a, i) => `<button type="button" class="btn btn-${a.kind || 'ghost'}" data-i="${i}">${UI.esc(a.label)}</button>`).join('')}</div>`;
    const opener = UI.focusKey(document.activeElement);
    const close = () => {
      const wasOpen = d.isConnected;
      if (d.open) d.close();
      d.remove();
      /* If the screen was redrawn while the dialog was open, the button that opened it has gone. */
      if (wasOpen && (!document.activeElement || document.activeElement === document.body) && !document.querySelector('dialog[open]')) UI.refocus(opener);
    };
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.querySelectorAll('.dialog-actions button').forEach((b) => b.addEventListener('click', () => {
      const a = list[Number(b.dataset.i)];
      if ((a.onClick ? a.onClick(d, close) : undefined) !== false) close();
    }));
    document.body.appendChild(d);
    d.showModal();
    /* A long body would take first focus with a box round it. Start on the dialog itself; Tab goes into the body. */
    if (document.activeElement === d.querySelector('.dialog-body')) { d.tabIndex = -1; d.focus(); }
    if (onOpen) onOpen(d);
    return d;
  };
  /* A form that fills the dialog itself and brings its own buttons (Save, Cancel). Used for routed forms, see App.modal.
     UI.modal({ title, onCancel }) returns { dialog, body, close }. Esc and the Close button call onCancel; the
     backdrop does not, so a click outside cannot throw away a half-filled form. */
  UI.modal = ({ title, onCancel }) => {
    const d = document.createElement('dialog');
    const titleId = `dialog-title-${++dialogCount}`;
    d.className = 'dialog dialog-wide dialog-form';
    d.setAttribute('aria-labelledby', titleId);
    d.innerHTML = `<div class="dialog-head"><h2 id="${titleId}">${UI.esc(title)}</h2><button type="button" class="btn btn-ghost btn-small" data-modal-close>Close</button></div><div class="dialog-body"></div>`;
    const cancel = () => { if (onCancel) onCancel(); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); cancel(); });
    d.querySelector('[data-modal-close]').addEventListener('click', cancel);
    document.body.appendChild(d);
    d.showModal();
    d.tabIndex = -1; d.focus();
    return { dialog: d, body: d.querySelector('.dialog-body'), close: () => { if (d.open) d.close(); d.remove(); } };
  };
  UI.dialogError = (d, text) => { const e = d.querySelector('.form-error'); e.textContent = text; e.hidden = !text; };
  /* Real browser download. rows is an array of arrays; goes through Core.toCSV. */
  UI.downloadCSV = (filename, rows) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Core.toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  UI.options = (items, selected) => items.map((i) => `<option value="${UI.esc(i.value)}"${String(i.value) === String(selected) ? ' selected' : ''}>${UI.esc(i.label)}</option>`).join('');
  window.UI = UI;
})();

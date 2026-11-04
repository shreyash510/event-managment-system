/* Shared screen helpers. Every view uses these so screens look and behave the same. */
(function () {
  'use strict';
  const UI = {};
  UI.esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.money = (n) => {
    const v = Number(n) || 0, text = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${v < 0 && text !== '0.00' ? '-' : ''}£${text}`;
  };
  UI.date = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
  UI.time = (v) => (v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  UI.dateTime = (v) => (v ? `${UI.date(v)}, ${UI.time(v)}` : '');
  const TONE = { 'On sale': 'good', 'Sold out': 'bad', Cancelled: 'bad', Draft: 'quiet', Scheduled: 'info', 'Sales closed': 'warn', Completed: 'quiet', 'Pending approval': 'warn' };
  UI.badge = (text, tone) => `<span class="badge badge-${UI.esc(tone || TONE[text] || 'quiet')}">${UI.esc(text)}</span>`;
  /* Small rounded icon tile for stat boxes. */
  const ICO = {
    calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>', users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.7 3.5 6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>', wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7V6a2 2 0 0 1 2-2h10M16 13.5h.01"/>',
    ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v2.5M14 11v2M14 15.5V18"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    seat: '<path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M4 11h16v5H4zM7 16v4M17 16v4"/>', alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>'
  };
  UI.statIcon = (name, tone) => `<span class="stat-ico${tone ? ' is-' + tone : ''}" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO[name] || ''}</svg></span>`;
  /* Stat cards: label colours and icon tiles go blue, amber, cyan, violet along a row. Always <div class="grid stats">. */
  UI.statTone = (i) => ['blue', 'amber', 'cyan', 'violet'][i % 4];
  UI.demo = (text) => `<p class="demo-note">Demo: ${UI.esc(text)}</p>`;
  UI.empty = (text) => `<div class="empty">${UI.esc(text)}</div>`;
  /* back: a hash such as '#/checkin' for the parent page, false for no arrow (the start page), or leave out to go back in history. */
  const BACK_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
  UI.pageHead = (title, actionsHtml, subtitle, back) => `<div class="page-head"><div class="ph-main">${back === false ? '' : `<button type="button" class="page-back" data-back="${UI.esc(back || '')}" aria-label="Go back" title="Go back">${BACK_ICON}</button>`}<div><h1>${UI.esc(title)}</h1>${subtitle ? `<p class="muted">${UI.esc(subtitle)}</p>` : ''}</div></div><div class="page-actions">${actionsHtml || ''}</div></div>`;
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('button.page-back');
    if (!b) return;
    if (b.dataset.back) { location.hash = b.dataset.back; return; }
    if (history.length > 1) history.back(); else if (window.App) location.hash = App.home();
  });
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
  const isAction = (c) => /^actions?$/i.test(c.label || '');
  const headHtml = (c, i, sort) => {
    if (!c.label) return `<th scope="col" role="columnheader"></th>`;
    if (isAction(c)) return `<th scope="col" role="columnheader" class="th-actions">${UI.esc(c.label)}</th>`;
    const on = sort && sort.i === i;
    return `<th scope="col" role="columnheader"${on ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" class="th-sort" data-sort="${i}">${UI.esc(c.label)}${SORT_ICON}</button></th>`;
  };
  /* Sorting uses the text a cell shows, so it works for every column without extra setup. Numbers sort as numbers. */
  const decoder = document.createElement('textarea');
  const decodeText = (x) => { if (!x.includes('&')) return x; decoder.innerHTML = x; return decoder.value; };
  const cellText = (c, r) => decodeText(String(c.html(r)).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const compareText = (a, b) => {
    const x = parseFloat(a.replace(/[£,$]/g, '')), y = parseFloat(b.replace(/[£,$]/g, ''));
    return !isNaN(x) && !isNaN(y) && /^[£$]?-?[\d,.]+/.test(a) && /^[£$]?-?[\d,.]+/.test(b) ? x - y : a.localeCompare(b, 'en-GB', { numeric: true, sensitivity: 'base' });
  };
  const sortRows = (t, rows) => {
    const s = t.state.sort;
    if (!s) return rows;
    const c = t.columns[s.i];
    const keyed = rows.map((r, n) => ({ r, n, v: cellText(c, r) }));
    keyed.sort((a, b) => (compareText(a.v, b.v) * s.dir) || a.n - b.n);
    return keyed.map((k) => k.r);
  };
  const tableHtml = (columns, rows, o, sort) =>
    `<div class="table-wrap"><table class="table" role="table"><thead role="rowgroup"><tr role="row">${columns.map((c, i) => headHtml(c, i, sort)).join('')}</tr></thead><tbody role="rowgroup">${rows.map((r) => `<tr role="row"${o.rowClass && o.rowClass(r) ? ` class="${UI.esc(o.rowClass(r))}"` : ''}>${columns.map((c) => `<td role="cell" data-label="${UI.esc(c.label)}"${isAction(c) ? ' class="td-actions"' : ''}>${isAction(c) ? UI.rowMenu(c.html(r)) : c.html(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const SIZES = [10, 15, 25, 50];
  const PG_ICON = {
    first: '<path d="M11 6l-6 6 6 6M19 6l-6 6 6 6"/>', prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>', last: '<path d="M13 6l6 6-6 6M5 6l6 6-6 6"/>'
  };
  const pgIcon = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PG_ICON[k]}</svg>`;
  /* Column filters: each column offers a dropdown of the values it really holds, so nothing can be misspelled.
     A column with one value has nothing to choose, and one where nearly every row differs is too long to pick from: the search box covers those. */
  const FILTER_MIN = 9;   /* a table of 8 rows or fewer is read at a glance, so it gets no search or Filter */
  const FILTER_MAX_VALUES = 50;
  const dayOf = (text) => { const m = /\d{1,2} [A-Z][a-z]{2,8} \d{4}/.exec(text); return m ? Date.parse(m[0]) : NaN; };
  const orderValues = (values) => {
    const days = values.map(dayOf);
    /* Dates run in date order, not alphabetically by weekday. */
    if (days.every((d) => !isNaN(d))) return values.slice().sort((a, b) => dayOf(a) - dayOf(b) || compareText(a, b));
    return values.slice().sort(compareText);
  };
  /* A column can list its own choices with filterValues(row), for a cell holding several things or a badge beside its value. */
  const filterValuesOf = (c, r) => (c.filterValues ? c.filterValues(r).map(String) : [cellText(c, r)]);
  const filterFields = (t) => {
    if (t.fields) return t.fields;
    t.fields = [];
    t.columns.forEach((c, i) => {
      if (!c.label || isAction(c)) return;
      const values = [...new Set(t.rows.flatMap((r) => filterValuesOf(c, r)).filter(Boolean))];
      if (values.length < 2 || values.length > FILTER_MAX_VALUES) return;
      t.fields.push({ key: String(i), label: c.label, any: 'All', options: orderValues(values).map((v) => ({ value: v, label: v })) });
    });
    return t.fields;
  };
  const activeFilters = (t) => Object.keys(t.state.filter || {}).filter((k) => t.state.filter[k]);
  /* Rows that pass the search box (any column) and every column filter. */
  const matching = (t) => {
    const keys = activeFilters(t), q = (t.state.q || '').trim().toLowerCase();
    if (!keys.length && !q) return t.rows;
    const words = q.split(/\s+/).filter(Boolean);
    return t.rows.filter((r) =>
      keys.every((k) => filterValuesOf(t.columns[k], r).includes(t.state.filter[k])) &&
      (!words.length || (() => { const text = t.columns.filter((c) => !isAction(c)).map((c) => cellText(c, r)).join(' ').toLowerCase(); return words.every((w) => text.includes(w)); })()));
  };
  /* The title and subtitle on the left, and on the right a search box and a Filter button. Pages that have their own
     pass filter: false, or tools: html to put their own search and Filter there instead. */
  const headLeft = (o) => (o.title || o.subtitle
    ? `<div class="tbl-heading">${o.title ? `<h3 class="tbl-title">${UI.esc(o.title)}</h3>` : ''}${o.subtitle ? `<p class="tbl-sub muted">${UI.esc(o.subtitle)}</p>` : ''}</div>` : '');
  const headRow = (left, tools) => (left || tools ? `<div class="tbl-head">${left || '<div></div>'}${tools ? `<div class="tbl-tools">${tools}</div>` : ''}</div>` : '');
  const toolsHtml = (t) => {
    if (t.o.tools !== undefined) return headRow(headLeft(t.o), t.o.tools);
    if (t.o.filter === false || t.rows.length < FILTER_MIN) return headRow(headLeft(t.o), '');
    const n = activeFilters(t).length;
    return headRow(headLeft(t.o), `<div class="tbl-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" data-tbl-search autocomplete="off" placeholder="Search this table..." aria-label="Search this table" value="${UI.esc(t.state.q || '')}"></div>${filterFields(t).length ? UI.filterButton('', n, `data-tbl-filter="${t.id}"`) : ''}`);
  };
  const pagedHtml = (t) => {
    const rows = matching(t);
    const size = t.state.size, pages = Math.max(1, Math.ceil(rows.length / size)), page = Math.min(t.state.page, pages - 1), start = page * size;
    t.state.page = page;
    const shown = sortRows(t, rows).slice(start, start + size);
    const ctl = (k, label, off) => `<button type="button" class="pg-btn" data-pg="${k}" aria-label="${label}"${off ? ' disabled' : ''}>${pgIcon(k)}</button>`;
    /* Up to five page numbers around the current page. */
    const from = Math.max(0, Math.min(page - 2, pages - 5)), to = Math.min(pages, from + 5);
    let nums = '';
    for (let i = from; i < to; i++) nums += `<button type="button" class="pg-btn pg-num" data-pg="page" data-n="${i}" aria-label="Page ${i + 1}"${i === page ? ' aria-current="page"' : ''}>${i + 1}</button>`;
    const opts = SIZES.concat(SIZES.includes(size) ? [] : [size]).sort((a, b) => a - b).map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n}</option>`).join('');
    return toolsHtml(t) + (rows.length ? tableHtml(t.columns, shown, t.o, t.state.sort) : UI.empty('No rows match your search or filter.')) +
      `<nav class="pager" aria-label="Table pages"><div class="pg-group">${ctl('first', 'First page', page === 0)}${ctl('prev', 'Previous page', page === 0)}${nums}${ctl('next', 'Next page', page >= pages - 1)}${ctl('last', 'Last page', page >= pages - 1)}</div>` +
      `<label class="pg-size"><span class="sr-only">Rows per page</span><select data-pg-size>${opts}</select><span>per page</span></label>` +
      `<span class="muted pager-info" tabindex="-1" role="status">${rows.length ? `${start + 1} - ${start + shown.length}` : '0'} of ${rows.length}</span></nav>`;
  };
  UI.table = (columns, rows, opts) => {
    const o = opts || {};
    /* Nothing to list: keep the heading, and the page's own search so it can be cleared. */
    if (!rows.length) return headRow(headLeft(o), o.tools || '') + UI.empty(o.emptyText || 'Nothing to show.');
    const key = location.hash.split('?')[0] + '|' + columns.map((c) => c.label).join('|');
    let state = lastPage.get(key);
    /* A different number of rows means the list changed (a filter, an add), so start again at page one. */
    if (!state || state.count !== rows.length) { state = { page: 0, count: rows.length, size: state ? state.size : (o.pageSize || PAGE_SIZE), filter: {}, q: "" }; lastPage.set(key, state); }
    const id = 'pg' + (++tableCount);
    const t = { columns, rows, o, state, id };
    paged.set(id, t);
    if (paged.size > 200) paged.delete(paged.keys().next().value);
    return `<div class="paged" data-paged="${id}">${pagedHtml(t)}</div>`;
  };
  /* ---------- Row actions: a "..." button that opens a menu ---------- */
  const DOTS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  let menuCount = 0;
  /* Takes the HTML of an Actions cell and moves every button and link in it into a menu. The items keep their
     attributes (data-act, data-id, href, disabled), so the screen's own click handling needs no change. */
  UI.rowMenu = (html) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const els = Array.from(tpl.content.querySelectorAll('button, a'));
    if (!els.length) return html;
    const items = els.map((el) => {
      const copy = el.cloneNode(true);
      copy.className = 'menu-item' + (el.classList.contains('btn-danger') ? ' is-danger' : '');
      copy.setAttribute('role', 'menuitem');
      if (copy.tagName === 'BUTTON') copy.setAttribute('type', 'button');
      return copy.outerHTML;
    }).join('');
    els.forEach((el) => el.remove());
    const note = tpl.content.textContent.replace(/\s+/g, ' ').trim();
    const id = 'rowmenu' + (++menuCount);
    return `<div class="row-menu"><button type="button" class="kebab" data-menu="${id}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions" title="Actions">${DOTS}</button><div class="row-menu-pop" id="${id}" role="menu" popover="manual">${items}${note ? `<p class="menu-note">${UI.esc(note)}</p>` : ''}</div></div>`;
  };
  const menuOf = (kebab) => document.getElementById(kebab.dataset.menu);
  const closeMenus = (except) => {
    document.querySelectorAll('.kebab[aria-expanded="true"]').forEach((k) => {
      if (k === except) return;
      k.setAttribute('aria-expanded', 'false');
      const pop = menuOf(k);
      if (!pop) return;
      pop.classList.remove('is-open');
      try { if (pop.matches(':popover-open')) pop.hidePopover(); } catch (e) { /* not a popover here */ }
    });
  };
  const openMenu = (kebab) => {
    const pop = menuOf(kebab);
    if (!pop) return;
    closeMenus(kebab);
    pop.classList.add('is-open');
    try { if (pop.showPopover) pop.showPopover(); } catch (e) { /* the is-open class is enough */ }
    kebab.setAttribute('aria-expanded', 'true');
    /* Under the button, lined up with its right edge; above it if there is no room below. */
    const r = kebab.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    const first = pop.querySelector('.menu-item:not([disabled])');
    if (first) first.focus();
  };
  document.addEventListener('click', (ev) => {
    const kebab = ev.target.closest && ev.target.closest('button.kebab');
    if (kebab) { if (kebab.getAttribute('aria-expanded') === 'true') { closeMenus(); } else openMenu(kebab); return; }
    /* A chosen item, or a click anywhere else, closes the menu. The item's own handler has already run. */
    closeMenus();
  });
  document.addEventListener('keydown', (ev) => {
    const open = document.querySelector('.kebab[aria-expanded="true"]');
    if (!open) return;
    const pop = menuOf(open);
    if (ev.key === 'Escape') { ev.stopPropagation(); closeMenus(); open.focus(); return; }
    if (ev.key === 'Tab') { closeMenus(); return; }
    if (!pop || !pop.contains(document.activeElement)) return;
    const items = Array.from(pop.querySelectorAll('.menu-item:not([disabled])')), i = items.indexOf(document.activeElement);
    const to = ev.key === 'ArrowDown' ? items[(i + 1) % items.length] : ev.key === 'ArrowUp' ? items[(i - 1 + items.length) % items.length] : ev.key === 'Home' ? items[0] : ev.key === 'End' ? items[items.length - 1] : null;
    if (to) { ev.preventDefault(); to.focus(); }
  }, true);
  /* A menu stays put on the screen, so close it when the page moves under it. */
  window.addEventListener('resize', () => closeMenus());
  document.addEventListener('scroll', () => closeMenus(), true);

  /* Every table says what it is. Options: title (a heading above the table), subtitle (one line under it).
     A table that already sits under a heading passes only a subtitle. */
  const plainTable = UI.table;
  UI.table = (a, b, c, d) => {
    /* UI.table({ title, subtitle }, columns, rows, opts) is the same as passing them in opts. */
    const [columns, rows, opts] = Array.isArray(a) ? [a, b, c] : [b, c, Object.assign({}, d, a)];
    return plainTable(columns, rows, opts);
  };
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('button[data-pg]');
    const box = btn && btn.closest('[data-paged]');
    const t = box && paged.get(box.dataset.paged);
    if (!t || btn.disabled) return;
    const pages = Math.max(1, Math.ceil(matching(t).length / t.state.size)), k = btn.dataset.pg, p = t.state.page;
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
  document.addEventListener('input', (ev) => {
    const inp = ev.target.closest && ev.target.closest('input[data-tbl-search]');
    const box = inp && inp.closest('[data-paged]');
    const t = box && paged.get(box.dataset.paged);
    if (!t) return;
    t.state.q = inp.value; t.state.page = 0;
    const start = inp.selectionStart, end = inp.selectionEnd;
    box.innerHTML = pagedHtml(t);
    /* The box was redrawn, so give the typing place back. */
    const again = box.querySelector('input[data-tbl-search]');
    again.focus();
    try { again.setSelectionRange(start, end); } catch (e) { /* not a text field */ }
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

  /* ---------- List page pattern: breadcrumb, pill tabs, stat pill, search box, Filter dialog, avatar cells ---------- */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
    cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c2 .7 3.5 2.7 3.5 6"/>',
    ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v2.5M14 11v2M14 15.5V18"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7l12-3v3M16 13h2"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
    repeat: '<path d="M17 4l3 3-3 3M20 7H8a4 4 0 0 0-4 4M7 20l-3-3 3-3M4 17h12a4 4 0 0 0 4-4"/>'
  };
  /* k is a name from the list above, or the inside of an svg (starting with "<"). */
  const icon = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[k] || k}</svg>`;
  UI.icon = icon;
  /* items: [{ label, href }], the last one is the page you are on. */
  UI.crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((x, i) => `<li>${i === items.length - 1 || !x.href ? `<span aria-current="page">${UI.esc(x.label)}</span>` : `<a href="${UI.esc(x.href)}">${UI.esc(x.label)}</a>`}</li>`).join('')}</ol></nav>`;
  /* items: [{ key, label, icon, count, on, href }]. With href a tab is a link; without, a button carrying data-tab (or o.attr). */
  UI.tabs = (items, o) => {
    const opt = o || {}, attr = opt.attr || 'data-tab';
    return `<div class="pill-tabs${opt.sub ? ' is-sub' : ''}" role="group" aria-label="${UI.esc(opt.label || 'Views')}">${items.map((t) => {
      const inner = `${t.icon ? icon(t.icon) : ''}<span>${UI.esc(t.label)}</span>${t.count === undefined ? '' : `<span class="pill-n">${UI.esc(t.count)}</span>`}`;
      return t.href
        ? `<a class="pill-tab" href="${UI.esc(t.href)}"${t.on ? ' aria-current="page"' : ''}>${inner}</a>`
        : `<button type="button" class="pill-tab" ${attr}="${UI.esc(t.key)}" aria-pressed="${t.on ? 'true' : 'false'}">${inner}</button>`;
    }).join('')}</div>`;
  };
  /* Redraw part of a screen without losing the keyboard's place. */
  UI.keepFocus = (fn) => {
    const key = UI.focusKey(document.activeElement);
    fn();
    if (!key) return;
    let el = null;
    try { el = document.querySelector(key.sel); } catch (e) { el = null; }
    if (el && el !== document.activeElement) el.focus({ preventScroll: true });
    if (el && key.start !== null && key.start !== undefined && el.setSelectionRange) { try { el.setSelectionRange(key.start, key.end); } catch (e) { /* not a text field */ } }
  };
  UI.statPill = (items) => `<div class="stat-pill" role="group" aria-label="Totals">${items.map((x) => `<div><b>${UI.esc(x.n)}</b><span>${UI.esc(x.label)}</span></div>`).join('')}</div>`;
  UI.search = ({ id, value, placeholder, attrs }) => `<label class="searchbox"><span class="sr-only">Search</span>${icon('search')}<input type="search"${id ? ` id="${UI.esc(id)}"` : ''} ${attrs || ''} value="${UI.esc(value)}" placeholder="${UI.esc(placeholder)}" autocomplete="off"></label>`;
  /* A coloured poster for an event, made from its title: no images are needed. The colour follows the label (the event type). */
  UI.poster = (title, label, size, image) => {
    const seed = String(label || title || '?');
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    const letters = String(title || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
    const photo = /^https?:\/\//i.test(String(image || '').trim()) ? `<img src="${UI.esc(String(image).trim())}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    return `<div class="poster${size ? ' poster-' + size : ''}${photo ? ' has-img' : ''}" style="--h:${h}" aria-hidden="true">${photo}${label ? `<span class="poster-tag">${UI.esc(label)}</span>` : ''}<span class="poster-init">${UI.esc(letters)}</span></div>`;
  };
  /* A photo that fails to load is dropped, so the coloured poster underneath shows instead. */
  document.addEventListener('error', (ev) => { const t = ev.target; if (t && t.tagName === 'IMG' && t.closest && t.closest('.poster')) { t.closest('.poster').classList.remove('has-img'); t.remove(); } }, true);
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
  UI.avatar = (name) => `<span class="av" aria-hidden="true">${UI.esc(initials(name))}</span>`;
  /* A name with a round initials badge, and a small line under it. */
  UI.person = (name, sub, href) => `<div class="person">${UI.avatar(name)}<div class="person-text">${href ? `<a href="${UI.esc(href)}"><b>${UI.esc(name)}</b></a>` : `<b>${UI.esc(name)}</b>`}${sub ? `<span class="hint">${UI.esc(sub)}</span>` : ''}</div></div>`;

  /* Filter dialog: fields down the left, the chosen field's input on the right, Clear all and Apply at the foot.
     fields: [{ key, label, options: [{ value, label }], any? }], each shown as a dropdown. values: { key: value }.
     onApply gets only the fields that have something in them, and {} for Clear all. */
  UI.filterDialog = ({ title, subtitle, fields, values, onApply }) => {
    const v = values || {};
    const nav = fields.map((f, i) => `<button type="button" class="fd-tab" data-fd-tab="${i}" aria-pressed="${i === 0 ? 'true' : 'false'}">${UI.esc(f.label)}${v[f.key] ? '<i class="fd-dot" aria-hidden="true"></i><span class="sr-only"> (set)</span>' : ''}</button>`).join('');
    const panes = fields.map((f, i) => {
      const id = `fd-c-${i}`;
      const control = `<select id="${id}" data-fd="${UI.esc(f.key)}"><option value="">${UI.esc(f.any || 'Any')}</option>${UI.options(f.options || [], v[f.key])}</select>`;
      return `<div class="fd-pane" data-fd-pane="${i}"${i ? ' hidden' : ''}><label for="${id}">${UI.esc(f.label)}</label>${control}</div>`;
    }).join('');
    const read = (d) => {
      const out = {};
      d.querySelectorAll('[data-fd]').forEach((c) => { if (c.value.trim()) out[c.dataset.fd] = c.value.trim(); });
      return out;
    };
    return UI.dialog({
      title, wide: true,
      body: `<p class="hint fd-sub">${UI.esc(subtitle || 'Pick the filters you want, then Apply')}</p><div class="fd"><div class="fd-nav">${nav}</div><div class="fd-panes">${panes}</div></div>`,
      actions: [{ label: 'Clear all', kind: 'ghost', onClick: () => { onApply({}); } }, { label: 'Apply', kind: 'primary', onClick: (d) => { onApply(read(d)); } }],
      onOpen: (d) => {
        const show = (i) => {
          d.querySelectorAll('[data-fd-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fdTab === String(i))));
          d.querySelectorAll('[data-fd-pane]').forEach((p) => { p.hidden = p.dataset.fdPane !== String(i); });
          const c = d.querySelector(`[data-fd-pane="${i}"] [data-fd]`);
          if (c) c.focus();
        };
        d.querySelector('.fd-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-fd-tab]'); if (b) show(b.dataset.fdTab); });
        show(0);
      }
    });
  };
  /* The Filter button. name ties it to the screen's opener (UI.onFilter); extra is for tables, which open their own. */
  /* The Filter button. name ties it to the screen's opener (UI.onFilter); extra is for tables, which open their own. */
  UI.filterButton = (name, n, extra) => `<button type="button" class="btn filter-btn" ${name ? `data-filter-open="${UI.esc(name)}"` : ''} ${extra || ''} aria-haspopup="dialog">${icon('filter')}<span>Filter</span>${n ? `<span class="pill-n">${n}</span>` : ''}</button>`;
  UI.setFilterCount = (root, n) => {
    const b = root.querySelector('[data-filter-open]');
    if (!b) return;
    let c = b.querySelector('.pill-n');
    if (!n) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('span'); c.className = 'pill-n'; b.appendChild(c); }
    c.textContent = n;
  };
  const openers = {};
  UI.onFilter = (name, fn) => { openers[name] = fn; };
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-filter-open]');
    if (b && openers[b.dataset.filterOpen]) openers[b.dataset.filterOpen]();
  });
  /* A table's own Filter button: one field per column. */
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('[data-tbl-filter]');
    const box = btn && btn.closest('[data-paged]');
    const t = box && paged.get(box.dataset.paged);
    if (!t) return;
    UI.filterDialog({
      title: 'Filter rows', fields: filterFields(t), values: t.state.filter,
      onApply: (vals) => {
        t.state.filter = vals; t.state.page = 0;
        box.innerHTML = pagedHtml(t);
        const again = box.querySelector('[data-tbl-filter]');
        if (again) again.focus();
      }
    });
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
  /* Toast tones: 'good', 'bad', 'warn', or none. action: { label, onClick, ms } adds one button, such as Undo,
     and keeps the toast up longer (10 seconds unless ms says otherwise). */
  UI.toast = (text, tone, action) => {
    const show = () => {
      const box = document.getElementById('toasts');
      const t = document.createElement('div');
      t.className = `toast ${tone ? 'toast-' + tone : ''}${action ? ' toast-has-action' : ''}`;
      const msg = document.createElement('span');
      msg.textContent = text;
      t.appendChild(msg);
      const gone = () => { t.remove(); lowerToasts(box); };
      if (action) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'toast-action';
        b.textContent = action.label || 'Undo';
        b.addEventListener('click', () => { gone(); if (action.onClick) action.onClick(); });
        t.appendChild(b);
      }
      box.appendChild(t);
      if (document.querySelector('dialog[open]')) liftToasts(box);
      setTimeout(gone, action ? (action.ms || 10000) : tone === 'bad' ? 7000 : 4000);
    };
    /* Called from a dialog button, the dialog usually closes straight after. Wait, so screen readers hear it. */
    if (document.querySelector('dialog[open]')) setTimeout(show, 0); else show();
  };
  /* In-page dialog. Never use alert()/confirm()/prompt().
     UI.dialog({ title, body: html, actions: [{ label, kind: 'primary'|'danger'|'ghost', onClick(dialogEl, close) }], onOpen(dialogEl), wide })
     A button closes the dialog unless onClick returns false (use that to show a validation message).
     Long content scrolls inside .dialog-body, so the buttons stay on screen. */
  let dialogCount = 0;
  /* Title, optional subtitle and an X, the same on every dialog. */
  const X_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const dialogHead = (titleId, title, subtitle, iconHtml) => `<div class="dialog-head">${iconHtml ? `<span class="dialog-ic" aria-hidden="true">${iconHtml}</span>` : ''}<div class="dialog-head-text"><h2 id="${titleId}">${UI.esc(title)}</h2>${subtitle ? `<p class="dialog-sub">${UI.esc(subtitle)}</p>` : ''}</div><button type="button" class="dialog-x" data-dialog-x aria-label="Close">${X_ICON}</button></div>`;
  UI.dialog = ({ title, subtitle, body, actions, onOpen, wide }) => {
    const d = document.createElement('dialog');
    const titleId = `dialog-title-${++dialogCount}`;
    d.className = 'dialog' + (wide ? ' dialog-wide' : '');
    d.setAttribute('aria-labelledby', titleId);
    const list = actions && actions.length ? actions : [{ label: 'Close', kind: 'ghost' }];
    d.innerHTML = `${dialogHead(titleId, title, subtitle)}<div class="dialog-body">${body || ''}</div><p class="form-error" role="alert" hidden></p><div class="dialog-actions">${list.map((a, i) => `<button type="button" class="btn btn-${a.kind || 'ghost'}" data-i="${i}">${UI.esc(a.label)}</button>`).join('')}</div>`;
    const opener = UI.focusKey(document.activeElement);
    const close = () => {
      const wasOpen = d.isConnected;
      if (d.open) d.close();
      d.remove();
      /* If the screen was redrawn while the dialog was open, the button that opened it has gone. */
      if (wasOpen && (!document.activeElement || document.activeElement === document.body) && !document.querySelector('dialog[open]')) UI.refocus(opener);
    };
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    d.querySelector('[data-dialog-x]').addEventListener('click', close);
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
  UI.modal = ({ title, subtitle, icon, onCancel }) => {
    const d = document.createElement('dialog');
    const titleId = `dialog-title-${++dialogCount}`;
    d.className = 'dialog dialog-wide dialog-form';
    d.setAttribute('aria-labelledby', titleId);
    d.innerHTML = `${dialogHead(titleId, title, subtitle, icon)}<div class="dialog-body"></div>`;
    const cancel = () => { if (onCancel) onCancel(); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); cancel(); });
    d.querySelector('[data-dialog-x]').addEventListener('click', cancel);
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

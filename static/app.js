(function () {
  const state = {
    categories: [],
    folders: [],
    noFolderCount: 0,
    totalCount: 0,
    summary: null,
    invoices: [],
    activeId: null,
    activeFolderId: null, // null = all, "none" = unfiled, number = folder id
    selectedIds: new Set(),
    sort: { field: null, dir: "asc" },
  };

  const el = (id) => document.getElementById(id);
  const MONTHS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];
  const MONTH_NAMES = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

  const ICONS = {
    checkCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/></svg>`,
    alertCircle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>`,
    external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M21 3 10 14"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>`,
    sortNeutral: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 9 5-5 5 5M7 15l5 5 5-5"/></svg>`,
    sortAsc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`,
    sortDesc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    invoice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>`,
    wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><circle cx="16" cy="14" r="1"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
    alertTriangle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a1.5 1.5 0 0 0 1.3 2.2h17.8a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z"/><path d="M12 9v4M12 16.5h.01"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>`,
    allFolders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  };

  function statusClass(status) {
    return status === "po splatnosti" ? "po-splatnosti" : status;
  }

  function formatMoney(amount, currency) {
    try {
      return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: currency || "CZK" })
        .format(amount || 0);
    } catch {
      return `${(amount || 0).toFixed(2)} ${currency || ""}`;
    }
  }

  function formatDate(d) {
    if (!d) return "–";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return d;
    return `${parseInt(m[3], 10)}. ${parseInt(m[2], 10)}. ${m[1]}`;
  }

  function formatMonthLabel(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (!m) return key;
    const idx = parseInt(m[2], 10) - 1;
    return `${MONTHS[idx] || m[2]} ${m[1]}`;
  }

  function pluralize(n, one, few, many) {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("Nepřihlášeno.");
    }
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail || detail;
      } catch {}
      throw new Error(detail);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---------- toasts ----------
  function toast(message, kind = "ok") {
    const stack = el("toastStack");
    const item = document.createElement("div");
    item.className = `toast ${kind}`;
    item.innerHTML = `${kind === "err" ? ICONS.alertCircle : ICONS.checkCircle}<div class="msg"></div><button class="close" aria-label="Zavřít">&times;</button>`;
    item.querySelector(".msg").textContent = message;
    const remove = () => {
      item.style.transition = "opacity .18s ease, transform .18s ease";
      item.style.opacity = "0";
      item.style.transform = "translateY(6px)";
      setTimeout(() => item.remove(), 180);
    };
    item.querySelector(".close").addEventListener("click", remove);
    stack.appendChild(item);
    setTimeout(remove, 4500);
  }

  // ---------- confirm dialog ----------
  function showConfirm(title, message, okLabel = "Smazat") {
    const overlay = el("confirmOverlay");
    el("confirmTitle").textContent = title;
    el("confirmMessage").textContent = message;
    const okBtn = el("confirmOk");
    okBtn.textContent = okLabel;
    overlay.classList.add("open");
    return new Promise((resolve) => {
      function cleanup(result) {
        overlay.classList.remove("open");
        okBtn.removeEventListener("click", onOk);
        el("confirmCancel").removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onOverlay);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onOverlay(e) { if (e.target === overlay) cleanup(false); }
      okBtn.addEventListener("click", onOk);
      el("confirmCancel").addEventListener("click", onCancel);
      overlay.addEventListener("click", onOverlay);
    });
  }

  function currentFilters() {
    const params = new URLSearchParams();
    const q = el("fSearch").value.trim();
    const vendor = el("fVendor").value;
    const category = el("fCategory").value;
    const status = el("fStatus").value;
    if (q) params.set("q", q);
    if (vendor) params.set("vendor", vendor);
    if (category) params.set("category", category);
    if (status) params.set("payment_status", status);
    if (state.activeFolderId !== null) params.set("folder_id", state.activeFolderId);
    return params;
  }

  async function loadAll() {
    state.selectedIds.clear();
    const [summary, invoices] = await Promise.all([
      api("/api/summary?" + (() => {
        const p = new URLSearchParams();
        if (state.activeFolderId !== null) p.set("folder_id", state.activeFolderId);
        return p.toString();
      })()),
      api("/api/invoices?" + currentFilters().toString()),
    ]);
    state.summary = summary;
    state.invoices = invoices;
    renderCards();
    renderCharts();
    renderVendorOptions();
    renderTable();
    el("countBadge").textContent =
      `${invoices.length} ${pluralize(invoices.length, "faktura", "faktury", "faktur")}`;
  }

  function renderCards() {
    const s = state.summary;
    const overdue = s.by_status["po splatnosti"] || 0;
    const notYetDue = s.by_status["neuhrazeno"] || 0;
    const unpaidTotal = overdue + notYetDue;
    el("cards").innerHTML = `
      <div class="stat-card card">
        <div class="icon">${ICONS.invoice}</div>
        <div><div class="label">Celkem faktur</div><div class="value">${s.count}</div></div>
      </div>
      <div class="stat-card card">
        <div class="icon">${ICONS.wallet}</div>
        <div><div class="label">Celková částka</div><div class="value">${formatMoney(s.total_amount, "CZK")}</div></div>
      </div>
      <div class="stat-card card">
        <div class="icon">${ICONS.clock}</div>
        <div><div class="label">Neuhrazeno celkem</div><div class="value">${unpaidTotal}</div></div>
      </div>
      <div class="stat-card card ${overdue ? "warn" : ""}">
        <div class="icon">${ICONS.alertTriangle}</div>
        <div><div class="label">Z toho po splatnosti</div><div class="value">${overdue}</div></div>
      </div>
    `;
  }

  function renderBarList(target, data, labelFormatter) {
    const entries = Object.entries(data);
    if (!entries.length) {
      target.innerHTML = `<div class="empty" style="padding:0.5rem 0;">zatím žádná data</div>`;
      return;
    }
    const max = Math.max(...entries.map(([, v]) => v));
    target.innerHTML = entries
      .map(([name, value]) => {
        const label = labelFormatter ? labelFormatter(name) : name;
        return `
        <div class="bar-row">
          <div class="name" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
          <div class="track"><div class="fill" style="width:${max ? (value / max) * 100 : 0}%"></div></div>
          <div class="amt tabular">${formatMoney(value, "CZK")}</div>
        </div>
      `;
      })
      .join("");
  }

  function renderStatusChart() {
    const s = state.summary;
    const rows = [
      { key: "uhrazeno", label: "Uhrazeno", cls: "good" },
      { key: "neuhrazeno", label: "Neuhrazeno", cls: "neutral" },
      { key: "po splatnosti", label: "Po splatnosti", cls: "bad" },
    ];
    const max = Math.max(1, ...rows.map((r) => s.by_status[r.key] || 0));
    el("chartStatus").innerHTML = rows
      .map((r) => {
        const count = s.by_status[r.key] || 0;
        const amount = (s.by_status_amount && s.by_status_amount[r.key]) || 0;
        return `
        <div class="bar-row">
          <div class="name">${r.label}</div>
          <div class="track"><div class="fill status-${r.cls}" style="width:${(count / max) * 100}%"></div></div>
          <div class="amt tabular" style="width:8.4rem;">${count} · ${formatMoney(amount, "CZK")}</div>
        </div>
      `;
      })
      .join("");
  }

  function renderCharts() {
    renderBarList(el("chartCategory"), state.summary.by_category);
    renderBarList(el("chartMonth"), state.summary.by_month, formatMonthLabel);
    renderStatusChart();
  }

  function renderVendorOptions() {
    const select = el("fVendor");
    const current = select.value;
    const vendors = Object.keys(state.summary.by_vendor);
    select.innerHTML = `<option value="">Všichni dodavatelé</option>` +
      vendors.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    select.value = vendors.includes(current) ? current : "";
  }

  function categoryOptions(selected) {
    const cats = selected && !state.categories.includes(selected)
      ? [...state.categories, selected]
      : state.categories;
    return cats
      .map((c) => `<option value="${escapeHtml(c)}" ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`)
      .join("");
  }

  function folderSelectOptions(selectedId, includeEmptyLabel) {
    let html = `<option value="">${includeEmptyLabel}</option>`;
    html += state.folders
      .map((f) => `<option value="${f.id}" ${String(f.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(f.name)}</option>`)
      .join("");
    return html;
  }

  // ---------- folders ----------
  async function loadFolders() {
    const data = await api("/api/folders");
    state.folders = data.folders;
    state.noFolderCount = data.no_folder_count;
    state.totalCount = data.total_count;
    renderFolders();
    el("editFolder").innerHTML = folderSelectOptions(null, "Bez složky");
    el("bulkFolderSelect").innerHTML =
      `<option value="">Přesunout do složky…</option><option value="none">Bez složky</option>` +
      state.folders.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("");
  }

  function folderRow(id, name, count, icon) {
    const active = String(state.activeFolderId) === String(id);
    const isSpecial = id === null || id === "none";
    return `
      <div class="folder-row" data-folder-row="${id === null ? "" : id}">
        <button class="folder-item ${active ? "active" : ""}" data-folder-select="${id === null ? "" : id}">
          ${icon}<span class="name">${escapeHtml(name)}</span><span class="count">${count}</span>
        </button>
        ${isSpecial ? "" : `
          <button class="icon-btn" data-folder-rename="${id}" title="Přejmenovat">${ICONS.edit}</button>
          <button class="icon-btn danger" data-folder-delete="${id}" title="Smazat">${ICONS.trash}</button>
        `}
      </div>
    `;
  }

  function renderFolders() {
    const rows = [
      folderRow(null, "Všechny faktury", state.totalCount, ICONS.allFolders),
      folderRow("none", "Bez složky", state.noFolderCount, ICONS.folder),
      ...state.folders.map((f) => folderRow(f.id, f.name, f.count, ICONS.folder)),
    ];
    el("folderList").innerHTML = rows.join("");
  }

  function startFolderRename(folderId) {
    const row = document.querySelector(`[data-folder-row="${folderId}"]`);
    const folder = state.folders.find((f) => String(f.id) === String(folderId));
    if (!row || !folder) return;
    row.innerHTML = `
      <form class="folder-inline-edit" data-folder-rename-form="${folderId}">
        <input type="text" value="${escapeHtml(folder.name)}" maxlength="60" autofocus />
      </form>
    `;
    const input = row.querySelector("input");
    input.focus();
    input.select();
    row.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name || name === folder.name) {
        renderFolders();
        return;
      }
      try {
        await api(`/api/folders/${folderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        await loadFolders();
        toast("Složka přejmenována.");
      } catch (err) {
        toast("Přejmenování selhalo: " + err.message, "err");
        renderFolders();
      }
    });
    input.addEventListener("blur", () => row.querySelector("form")?.requestSubmit());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") renderFolders();
    });
  }

  function wireFolders() {
    el("folderList").addEventListener("click", async (e) => {
      const selectBtn = e.target.closest("[data-folder-select]");
      if (selectBtn) {
        const raw = selectBtn.dataset.folderSelect;
        state.activeFolderId = raw === "" ? null : (raw === "none" ? "none" : Number(raw));
        renderFolders();
        await loadAll();
        return;
      }
      const renameBtn = e.target.closest("[data-folder-rename]");
      if (renameBtn) {
        startFolderRename(renameBtn.dataset.folderRename);
        return;
      }
      const deleteBtn = e.target.closest("[data-folder-delete]");
      if (deleteBtn) {
        const folderId = deleteBtn.dataset.folderDelete;
        const folder = state.folders.find((f) => String(f.id) === String(folderId));
        const ok = await showConfirm(
          "Smazat složku?",
          `Opravdu smazat složku „${folder ? folder.name : ""}“? Faktury v ní zůstanou, jen se přesunou do „Bez složky“.`
        );
        if (!ok) return;
        try {
          await api(`/api/folders/${folderId}`, { method: "DELETE" });
          if (String(state.activeFolderId) === String(folderId)) state.activeFolderId = null;
          await loadFolders();
          await loadAll();
          toast("Složka smazána.");
        } catch (err) {
          toast("Smazání selhalo: " + err.message, "err");
        }
        return;
      }
    });

    el("folderAddForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = el("folderNameInput");
      const name = input.value.trim();
      if (!name) return;
      try {
        await api("/api/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        input.value = "";
        await loadFolders();
      } catch (err) {
        toast("Nepodařilo se založit složku: " + err.message, "err");
      }
    });
  }

  // ---------- category management ----------
  function renderCategoryList() {
    el("categoryList").innerHTML = state.categories
      .map((c) => `
        <div class="category-row">
          <span>${escapeHtml(c)}</span>
          <button class="icon-btn danger" data-category-delete="${escapeHtml(c)}" title="Smazat">${ICONS.close}</button>
        </div>
      `)
      .join("") || `<div class="empty" style="padding:1rem 0;">Zatím žádné kategorie.</div>`;
  }

  async function refreshCategoriesEverywhere() {
    state.categories = await api("/api/categories");
    const currentFilterCat = el("fCategory").value;
    el("fCategory").innerHTML =
      `<option value="">Všechny kategorie</option>` +
      state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (state.categories.includes(currentFilterCat)) el("fCategory").value = currentFilterCat;
  }

  function wireCategoryModal() {
    const overlay = el("categoryOverlay");
    el("manageCategoriesBtn").addEventListener("click", async () => {
      renderCategoryList();
      overlay.classList.add("open");
    });
    el("categoryCloseBtn").addEventListener("click", () => overlay.classList.remove("open"));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });

    el("categoryAddForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = el("categoryNameInput");
      const name = input.value.trim();
      if (!name) return;
      try {
        await api("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        input.value = "";
        await refreshCategoriesEverywhere();
        renderCategoryList();
      } catch (err) {
        toast("Nepodařilo se přidat kategorii: " + err.message, "err");
      }
    });

    el("categoryList").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-category-delete]");
      if (!btn) return;
      const name = btn.dataset.categoryDelete;
      try {
        await api(`/api/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
        await refreshCategoriesEverywhere();
        renderCategoryList();
      } catch (err) {
        toast("Smazání selhalo: " + err.message, "err");
      }
    });
  }

  // ---------- sorting ----------
  function sortedInvoices() {
    const { field, dir } = state.sort;
    if (!field) return state.invoices;
    const mul = dir === "asc" ? 1 : -1;
    return [...state.invoices].sort((a, b) => {
      let av = a[field];
      let bv = b[field];
      if (field === "amount_total") {
        av = av || 0; bv = bv || 0;
      } else {
        av = (av || "").toString().toLowerCase();
        bv = (bv || "").toString().toLowerCase();
      }
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
  }

  function renderSortIndicators() {
    document.querySelectorAll("th.sortable").forEach((th) => {
      const field = th.dataset.sort;
      const span = th.querySelector(".sort-indicator");
      if (field === state.sort.field) {
        th.classList.add("sort-active");
        span.innerHTML = state.sort.dir === "asc" ? ICONS.sortAsc : ICONS.sortDesc;
      } else {
        th.classList.remove("sort-active");
        span.innerHTML = ICONS.sortNeutral;
      }
    });
  }

  // ---------- bulk selection ----------
  function updateBulkBar() {
    const bar = el("bulkBar");
    const n = state.selectedIds.size;
    bar.classList.toggle("show", n > 0);
    el("bulkCount").textContent = n;
    const visibleIds = sortedInvoices().map((i) => i.id);
    const allCheckbox = el("selectAll");
    allCheckbox.checked = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));
    allCheckbox.indeterminate = !allCheckbox.checked && visibleIds.some((id) => state.selectedIds.has(id));
  }

  async function runBulk(ids, action, successMsg) {
    let ok = 0, fail = 0;
    for (const id of ids) {
      try { await action(id); ok++; } catch { fail++; }
    }
    state.selectedIds.clear();
    await loadFolders();
    await loadAll();
    if (fail === 0) toast(successMsg(ok));
    else toast(`${successMsg(ok)} (${fail} se nezdařilo)`, "err");
  }

  function renderTable() {
    const tbody = el("tbody");
    const invoices = sortedInvoices();
    el("emptyState").hidden = invoices.length > 0;
    renderSortIndicators();
    tbody.innerHTML = invoices
      .map((inv) => `
        <tr data-id="${inv.id}" class="inv-row" tabindex="0">
          <td class="checkbox-col">
            <input type="checkbox" data-select-row ${state.selectedIds.has(inv.id) ? "checked" : ""} />
          </td>
          <td class="vendor-cell" data-label="Dodavatel">${escapeHtml(inv.vendor)}</td>
          <td data-label="Číslo">${escapeHtml(inv.invoice_number) || "–"}</td>
          <td class="tabular" data-label="Vystaveno">${formatDate(inv.issue_date)}</td>
          <td class="tabular" data-label="Splatnost">${formatDate(inv.due_date)}</td>
          <td class="amt" data-label="Částka">${formatMoney(inv.amount_total, inv.currency)}</td>
          <td data-label="Kategorie">${escapeHtml(inv.category)}</td>
          <td data-label="Stav"><span class="pill ${statusClass(inv.display_status)}">${inv.display_status}</span></td>
          <td>
            <div class="row-actions">
              <a class="icon-btn" href="/api/invoices/${inv.id}/file" target="_blank" rel="noopener" title="Otevřít originál" onclick="event.stopPropagation()">${ICONS.external}</a>
              <button class="icon-btn danger" data-action="delete" title="Smazat">${ICONS.trash}</button>
            </div>
          </td>
        </tr>
      `)
      .join("");
    updateBulkBar();
  }

  async function patchInvoice(id, fields) {
    return api(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  function setSaveStatus(text, kind) {
    const box = el("drawerSaveStatus");
    box.textContent = text;
    box.className = "save-indicator" + (kind ? " " + kind : "");
  }

  // ---------- drawer ----------
  function findInvoice(id) {
    return state.invoices.find((i) => i.id == id);
  }

  function openDrawer(inv) {
    state.activeId = inv.id;
    el("drawerVendor").textContent = inv.vendor;
    el("drawerSub").textContent = `#${inv.id} · ${inv.filename}`;
    el("editVendor").value = inv.vendor || "";
    el("editInvoiceNumber").value = inv.invoice_number || "";
    el("editIssueDate").value = inv.issue_date || "";
    el("editDueDate").value = inv.due_date || "";
    el("editAmount").value = inv.amount_total ?? "";
    el("editCurrency").value = inv.currency || "";
    el("editCategory").innerHTML = categoryOptions(inv.category);
    el("editStatus").value = inv.payment_status;
    el("editFolder").innerHTML = folderSelectOptions(inv.folder_id, "Bez složky");
    el("editNotes").value = inv.notes || "";
    el("drawerFile").href = `/api/invoices/${inv.id}/file`;
    setSaveStatus("");

    const itemsSection = el("itemsSection");
    if (inv.items && inv.items.length) {
      itemsSection.hidden = false;
      el("drawerItems").innerHTML = inv.items.map((it) => `
        <tr>
          <td>${escapeHtml(it.description) || ""}</td>
          <td class="num">${it.quantity ?? ""}</td>
          <td class="num">${it.unit_price ?? ""}</td>
          <td class="num">${it.total ?? ""}</td>
        </tr>
      `).join("");
    } else {
      itemsSection.hidden = true;
    }

    el("drawerOverlay").classList.add("open");
  }

  function closeDrawer() {
    el("drawerOverlay").classList.remove("open");
    state.activeId = null;
  }

  async function saveField(field, value) {
    if (state.activeId == null) return;
    try {
      setSaveStatus("Ukládám…", "busy");
      await patchInvoice(state.activeId, { [field]: value });
      // Re-fetch summary + invoices from the server so stat cards and charts
      // (paid/unpaid/overdue totals, category & month breakdowns) reflect the change.
      await loadAll();
      if (field === "folder_id") await loadFolders();
      setSaveStatus("Uloženo", "ok");
      setTimeout(() => setSaveStatus(""), 1600);
    } catch (e) {
      setSaveStatus("Nepodařilo se uložit: " + e.message, "err");
    }
  }

  function wireDrawer() {
    el("drawerClose").addEventListener("click", closeDrawer);
    el("drawerOverlay").addEventListener("click", (e) => {
      if (e.target === el("drawerOverlay")) closeDrawer();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el("drawerOverlay").classList.contains("open")) closeDrawer();
    });

    const textFields = [
      ["editVendor", "vendor", false],
      ["editInvoiceNumber", "invoice_number", false],
      ["editCurrency", "currency", false],
      ["editNotes", "notes", false],
    ];
    textFields.forEach(([id, field]) => {
      el(id).addEventListener("blur", () => {
        const inv = findInvoice(state.activeId);
        if (!inv) return;
        const value = el(id).value.trim();
        if (value === (inv[field] || "")) return;
        saveField(field, value);
      });
    });

    el("editAmount").addEventListener("blur", () => {
      const inv = findInvoice(state.activeId);
      if (!inv) return;
      const value = parseFloat(el("editAmount").value);
      if (Number.isNaN(value) || value === inv.amount_total) return;
      saveField("amount_total", value);
    });

    ["editIssueDate", "editDueDate"].forEach((id) => {
      const field = id === "editIssueDate" ? "issue_date" : "due_date";
      el(id).addEventListener("change", () => {
        const inv = findInvoice(state.activeId);
        if (!inv) return;
        const value = el(id).value;
        if (value === (inv[field] || "")) return;
        saveField(field, value);
      });
    });

    el("editCategory").addEventListener("change", () => saveField("category", el("editCategory").value));
    el("editStatus").addEventListener("change", () => saveField("payment_status", el("editStatus").value));
    el("editFolder").addEventListener("change", () => {
      const value = el("editFolder").value;
      saveField("folder_id", value === "" ? null : Number(value));
    });

    el("drawerDelete").addEventListener("click", async () => {
      const inv = findInvoice(state.activeId);
      if (!inv) return;
      const ok = await showConfirm(
        "Smazat fakturu?",
        `Opravdu smazat fakturu od „${inv.vendor}“ na ${formatMoney(inv.amount_total, inv.currency)}? Tuto akci nelze vrátit zpět.`
      );
      if (!ok) return;
      try {
        await api(`/api/invoices/${inv.id}`, { method: "DELETE" });
        closeDrawer();
        toast("Faktura smazána.");
        await loadFolders();
        await loadAll();
      } catch (e) {
        toast("Smazání selhalo: " + e.message, "err");
      }
    });
  }

  function wireTable() {
    el("tbody").addEventListener("click", async (e) => {
      const checkbox = e.target.closest("[data-select-row]");
      if (checkbox) {
        const row = checkbox.closest("tr");
        const id = Number(row.dataset.id);
        if (checkbox.checked) state.selectedIds.add(id); else state.selectedIds.delete(id);
        updateBulkBar();
        return;
      }
      const delBtn = e.target.closest("[data-action='delete']");
      if (delBtn) {
        const row = delBtn.closest("tr");
        const inv = findInvoice(row.dataset.id);
        if (!inv) return;
        const ok = await showConfirm(
          "Smazat fakturu?",
          `Opravdu smazat fakturu od „${inv.vendor}“ na ${formatMoney(inv.amount_total, inv.currency)}? Tuto akci nelze vrátit zpět.`
        );
        if (!ok) return;
        try {
          await api(`/api/invoices/${inv.id}`, { method: "DELETE" });
          toast("Faktura smazána.");
          await loadFolders();
          await loadAll();
        } catch (err) {
          toast("Smazání selhalo: " + err.message, "err");
        }
        return;
      }
      if (e.target.closest("a")) return;
      const row = e.target.closest("tr.inv-row");
      if (row) {
        const inv = findInvoice(row.dataset.id);
        if (inv) openDrawer(inv);
      }
    });

    el("tbody").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.target.closest("[data-select-row]")) return;
      const row = e.target.closest("tr.inv-row");
      if (!row) return;
      const inv = findInvoice(row.dataset.id);
      if (inv) openDrawer(inv);
    });

    document.querySelectorAll("th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const field = th.dataset.sort;
        if (state.sort.field === field) {
          state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        } else {
          state.sort.field = field;
          state.sort.dir = field === "vendor" ? "asc" : "desc";
        }
        renderTable();
      });
    });

    el("selectAll").addEventListener("change", (e) => {
      const visibleIds = sortedInvoices().map((i) => i.id);
      if (e.target.checked) visibleIds.forEach((id) => state.selectedIds.add(id));
      else visibleIds.forEach((id) => state.selectedIds.delete(id));
      renderTable();
    });
  }

  function wireBulkBar() {
    el("bulkMarkPaid").addEventListener("click", () => {
      const ids = Array.from(state.selectedIds);
      runBulk(ids, (id) => patchInvoice(id, { payment_status: "uhrazeno" }), (n) => `Označeno jako uhrazené: ${n}`);
    });
    el("bulkMarkUnpaid").addEventListener("click", () => {
      const ids = Array.from(state.selectedIds);
      runBulk(ids, (id) => patchInvoice(id, { payment_status: "neuhrazeno" }), (n) => `Označeno jako neuhrazené: ${n}`);
    });
    el("bulkDelete").addEventListener("click", async () => {
      const ids = Array.from(state.selectedIds);
      const ok = await showConfirm(
        "Smazat vybrané faktury?",
        `Opravdu smazat ${ids.length} vybraných faktur? Tuto akci nelze vrátit zpět.`
      );
      if (!ok) return;
      runBulk(ids, (id) => api(`/api/invoices/${id}`, { method: "DELETE" }), (n) => `Smazáno faktur: ${n}`);
    });
    el("bulkFolderSelect").addEventListener("change", (e) => {
      const value = e.target.value;
      if (!value) return;
      const ids = Array.from(state.selectedIds);
      const folderId = value === "none" ? null : Number(value);
      runBulk(ids, (id) => patchInvoice(id, { folder_id: folderId }), (n) => `Přesunuto faktur: ${n}`);
      e.target.value = "";
    });
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  function wireFilters() {
    el("fSearch").addEventListener("input", debounce(() => loadAll(), 300));
    ["fVendor", "fCategory", "fStatus"].forEach((id) => {
      el(id).addEventListener("change", () => loadAll());
    });
    el("fReset").addEventListener("click", () => {
      el("fSearch").value = "";
      el("fVendor").value = "";
      el("fCategory").value = "";
      el("fStatus").value = "";
      loadAll();
    });
  }

  // ---------- upload (single + batch) ----------
  async function uploadOne(file) {
    const form = new FormData();
    form.append("file", file);
    if (typeof state.activeFolderId === "number") form.append("folder_id", state.activeFolderId);
    await api("/api/invoices", { method: "POST", body: form });
  }

  async function uploadFiles(files) {
    const list = Array.from(files);
    if (!list.length) return;
    const btn = el("pickBtn");
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    let ok = 0;
    const failures = [];
    for (let i = 0; i < list.length; i++) {
      btn.innerHTML = list.length > 1
        ? `<span class="spinner"></span> Nahrávám ${i + 1}/${list.length}…`
        : `<span class="spinner"></span> Čtu fakturu…`;
      try {
        await uploadOne(list[i]);
        ok++;
      } catch (e) {
        failures.push(`${list[i].name}: ${e.message}`);
      }
    }
    btn.disabled = false;
    btn.innerHTML = originalHTML;

    if (list.length === 1) {
      if (ok === 1) toast(`Faktura „${list[0].name}“ přidána.`);
      else toast(`Nepodařilo se zpracovat fakturu: ${failures[0]}`, "err");
    } else if (failures.length === 0) {
      toast(`Nahráno ${ok} z ${list.length} faktur.`);
    } else {
      toast(`Nahráno ${ok} z ${list.length} faktur, ${failures.length} se nezdařilo.`, "err");
    }
    await loadFolders();
    await loadAll();
  }

  function wireUpload() {
    const dropzone = el("dropzone");
    const input = el("fileInput");
    el("pickBtn").addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files.length) uploadFiles(input.files);
      input.value = "";
    });

    ["dragenter", "dragover"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add("drag-over");
      })
    );
    ["dragleave"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
      })
    );

    // allow dropping files anywhere on the page, handled once at document level
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });
  }

  // ---------- report ----------
  function periodRange(year, month) {
    if (month) {
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      return {
        from: `${year}-${month}-01`,
        to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
        label: `${MONTH_NAMES[Number(month) - 1]} ${year}`,
      };
    }
    return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Rok ${year}` };
  }

  async function renderReport() {
    const year = el("reportYear").value;
    const month = el("reportMonth").value;
    const { from, to, label } = periodRange(year, month);
    el("reportPrintTitle").textContent = `Report faktur — ${label}`;

    const params = new URLSearchParams({ date_from: from, date_to: to });
    const s = await api("/api/summary?" + params.toString());

    const paidAmount = (s.by_status_amount && s.by_status_amount["uhrazeno"]) || 0;
    const unpaidAmount = ((s.by_status_amount && s.by_status_amount["neuhrazeno"]) || 0) +
      ((s.by_status_amount && s.by_status_amount["po splatnosti"]) || 0);
    const overdueCount = s.by_status["po splatnosti"] || 0;

    const container = el("reportContent");
    container.innerHTML = `
      <p style="color:var(--ink-soft); margin: -0.5rem 0 1.2rem;">${label}</p>
      <div class="report-stats">
        <div class="report-stat"><div class="label">Počet faktur</div><div class="value">${s.count}</div></div>
        <div class="report-stat"><div class="label">Celková částka</div><div class="value">${formatMoney(s.total_amount, "CZK")}</div></div>
        <div class="report-stat"><div class="label">Uhrazeno</div><div class="value">${formatMoney(paidAmount, "CZK")}</div></div>
        <div class="report-stat"><div class="label">Neuhrazeno</div><div class="value">${formatMoney(unpaidAmount, "CZK")}</div></div>
      </div>
      ${overdueCount ? `<p style="color:var(--bad); font-weight:600; margin-top:-0.6rem;">${overdueCount} ${pluralize(overdueCount, "faktura po splatnosti", "faktury po splatnosti", "faktur po splatnosti")}</p>` : ""}
      <div class="report-section">
        <p class="section-title">Podle kategorie</p>
        <div id="reportByCategory"></div>
      </div>
      <div class="report-section">
        <p class="section-title">Podle dodavatele</p>
        <div id="reportByVendor"></div>
      </div>
    `;
    renderBarList(el("reportByCategory"), s.by_category);
    renderBarList(el("reportByVendor"), s.by_vendor);
  }

  function wireReport() {
    const currentYear = new Date().getFullYear();
    const yearSelect = el("reportYear");
    yearSelect.innerHTML = "";
    for (let y = currentYear; y >= currentYear - 6; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      yearSelect.appendChild(opt);
    }
    const monthSelect = el("reportMonth");
    MONTH_NAMES.forEach((name, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx + 1).padStart(2, "0");
      opt.textContent = name;
      monthSelect.appendChild(opt);
    });

    const overlay = el("reportOverlay");
    el("openReportBtn").addEventListener("click", () => {
      overlay.classList.add("open");
      renderReport();
    });
    el("reportCloseBtn").addEventListener("click", () => overlay.classList.remove("open"));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });
    yearSelect.addEventListener("change", renderReport);
    monthSelect.addEventListener("change", renderReport);
    el("reportPrintBtn").addEventListener("click", () => window.print());
  }

  function wireLogout() {
    el("logoutBtn").addEventListener("click", async () => {
      try {
        await api("/api/logout", { method: "POST" });
      } catch {}
      window.location.href = "/login";
    });
  }

  async function init() {
    const me = await api("/api/me");
    el("currentUser").textContent = me.display_name || me.email;
    await refreshCategoriesEverywhere();
    await loadFolders();
    wireUpload();
    wireFilters();
    wireTable();
    wireDrawer();
    wireFolders();
    wireCategoryModal();
    wireBulkBar();
    wireReport();
    wireLogout();
    await loadAll();
  }

  init();
})();

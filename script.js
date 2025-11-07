// 方法 3：每次載入都強制讀取 merchants.json，不使用 localStorage
// DEBUG 關閉：不顯示除錯浮窗
(async function () {
  'use strict';
  const DEBUG = false;

  // --- 小工具：除錯浮窗（關閉時不顯示） ---
  function showError(msg) {
    if (!DEBUG) return;
    let box = document.getElementById('debug-error-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'debug-error-box';
      box.style.cssText = `
        position:fixed; right:14px; bottom:14px; max-width:420px; z-index:9999;
        background:#fff; color:#c1121f; border:1px solid #f3c7c7; border-radius:12px;
        box-shadow:0 8px 28px rgba(0,0,0,.12); font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial;
        padding:12px 14px; white-space:pre-wrap; word-break:break-word;`;
      const title = document.createElement('div');
      title.textContent = '讀取診斷';
      title.style.cssText = 'color:#111;font-weight:700;margin-bottom:6px';
      box.appendChild(title);
      document.body.appendChild(box);
    }
    const line = document.createElement('div');
    line.textContent = String(msg);
    box.appendChild(line);
  }

  // --- 讀取 JSON（含 timeout、cache bust） ---
  async function loadJSON() {
    const url = './merchants.json?v=' + Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort('timeout'), 8000);
    try {
      showError('Fetching ' + url);
      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(t);
      showError('HTTP ' + res.status + ' ' + res.statusText);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ct = res.headers.get('content-type') || '';
      showError('Content-Type: ' + ct);

      const text = await res.text();
      try {
        const json = JSON.parse(text.replace(/^\uFEFF/, ''));
        if (!Array.isArray(json)) throw new Error('JSON 不是陣列');
        return json;
      } catch (parseErr) {
        showError('JSON parse 失敗，原始長度: ' + text.length);
        throw parseErr;
      }
    } catch (err) {
      showError('讀取失敗：' + (err?.message || err));
      console.error('[merchants.json] load failed:', err);
      return [];
    }
  }

  const state = { q: '', data: await loadJSON() };

  // ---- DOM 綁定 ----
  const $ = (id) => document.getElementById(id);
  const elQ = $('q');
  const elList = $('list');
  const elEmpty = $('empty');
  const elStats = $('stats');

  const addPanel = $('add-panel');
  const btnAdd = $('btn-add');
  const btnSave = $('btn-save');
  const btnCancel = $('btn-cancel');

  const btnExport = $('btn-export');
  const importer = $('importer');

  const fName = $('f-name');
  const fRate = $('f-rate');
  const fCond = $('f-cond');
  const fTags = $('f-tags');

  const required = [
    elQ,
    elList,
    elEmpty,
    elStats,
    addPanel,
    btnAdd,
    btnSave,
    btnCancel,
    btnExport,
    importer,
    fName,
    fRate,
    fCond,
    fTags,
  ];
  if (required.some((n) => !n)) {
    showError('index.html 中某些必要的 id 缺失，請檢查');
    console.error(
      'Missing elements:',
      required.map((x) => !!x)
    );
    return;
  }

  if (state.data.length === 0) {
    showError('注意：目前沒有載入到任何商家資料。');
  }

  // ---- 事件 ----
  elQ.addEventListener(
    'input',
    debounce(() => {
      state.q = (elQ.value || '').trim();
      render();
    }, 80)
  );

  btnAdd.addEventListener('click', () => {
    addPanel.hidden = false;
    fName.focus();
  });
  btnCancel.addEventListener('click', () => {
    addPanel.hidden = true;
    clearForm();
  });

  // 加入清單（方法3：只存在記憶體）
  btnSave.addEventListener('click', () => {
    const name = (fName.value || '').trim();
    const rate = Number(fRate.value);
    if (!name) {
      alert('請輸入商家名稱');
      return;
    }
    if (Number.isNaN(rate) || rate < 0) {
      alert('請輸入有效的回饋%');
      return;
    }

    const cond = (fCond.value || '').trim();
    const tags = (fTags.value || '').trim()
      ? fTags.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    state.data.push({ id: cid(), name, rate, cond, tags });
    addPanel.hidden = true;
    clearForm();
    elQ.value = '';
    state.q = '';
    render();
  });

  // 匯出目前畫面內的資料（供手動覆蓋 merchants.json）
  btnExport.addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(state.data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'merchants.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError('匯出失敗：' + (err?.message || err));
    }
  });

  // 匯入 JSON（覆蓋記憶體資料）
  importer.addEventListener('change', (e) => {
    const file = e?.target?.files?.[0] || null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error('格式錯誤：需為陣列');
        const ok = arr.every(
          (x) => x && typeof x.name === 'string' && typeof x.rate === 'number'
        );
        if (!ok) throw new Error('缺少 name 或 rate');
        state.data = arr.map((x) => ({
          id: x.id || cid(),
          name: x.name,
          rate: Number(x.rate) || 0,
          cond: x.cond || '',
          tags: Array.isArray(x.tags) ? x.tags : [],
        }));
        importer.value = '';
        render();
      } catch (err) {
        showError('匯入失敗：' + (err?.message || err));
      }
    };
    reader.readAsText(file);
  });

  // ---- 渲染 ----
  function render() {
    const q = (state.q || '').toLowerCase();
    let items = state.data.slice();

    if (q) {
      items = items.filter(
        (x) =>
          (x.name || '').toLowerCase().includes(q) ||
          (x.cond || '').toLowerCase().includes(q) ||
          (Array.isArray(x.tags) ? x.tags : []).some((t) =>
            String(t).toLowerCase().includes(q)
          )
      );
    }

    items.sort((a, b) => (Number(b.rate) || 0) - (Number(a.rate) || 0));
    elStats.textContent = `共 ${state.data.length} 家商家 · 顯示 ${
      items.length
    } 筆${q ? `（關鍵字：${state.q}）` : ''}`;

    elList.innerHTML = '';
    if (items.length === 0) {
      elEmpty.hidden = false;
      return;
    }
    elEmpty.hidden = true;

    for (const x of items) {
      const card = document.createElement('article');
      card.className = 'card';

      const top = document.createElement('div');
      top.className = 'row';
      top.style.justifyContent = 'space-between';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = x.name || '';

      // 回饋數字：>5% 顯示紅色
      const badge = document.createElement('span');
      badge.className = 'badge';
      const color = Number(x.rate) > 5 ? '#d93535' : 'var(--blue)';
      badge.innerHTML = `<span class="rate" style="color:${color}">${fmtRate(
        x.rate
      )}</span> 回饋`;

      top.append(name, badge);

      const cond = document.createElement('div');
      cond.className = 'cond';
      cond.textContent = x.cond || '—';

      const meta = document.createElement('div');
      meta.className = 'meta';
      (Array.isArray(x.tags) ? x.tags : []).forEach((t) => {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t;
        meta.appendChild(tag);
      });

      const tools = document.createElement('div');
      tools.className = 'row';
      const btnDel = tinyBtn('刪除', () => {
        if (confirm(`刪除「${x.name}」?`)) {
          state.data = state.data.filter((y) => y.id !== x.id);
          render();
        }
      });
      tools.append(btnDel);

      card.append(top, cond, meta, tools);
      elList.appendChild(card);
    }
  }

  function tinyBtn(text, onClick) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.style.padding = '6px 10px';
    b.style.fontSize = '12px';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }
  function fmtRate(r) {
    const v = Number(r);
    if (!isFinite(v)) return '-%';
    const p = v > 1 ? v : v * 100;
    return Math.round(p * 10) / 10 + '%';
  }
  function clearForm() {
    fName.value = '';
    fRate.value = '';
    fCond.value = '';
    fTags.value = '';
  }
  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }
  function cid() {
    return 'm_' + Math.random().toString(36).slice(2, 9);
  }

  // 初次渲染
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', render);
  else render();
})();

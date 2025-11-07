// 方法 3：每次載入都強制讀取 merchants.json，不使用 localStorage
// DEBUG 關閉
(async function () {
  'use strict';
  const DEBUG = false;

  function showError(msg) {
    if (!DEBUG) return; /* 省略除錯框實作 */
  }

  async function loadJSON() {
    const url = './merchants.json?v=' + Date.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const json = JSON.parse(text.replace(/^\uFEFF/, ''));
      return Array.isArray(json) ? json : [];
    } catch (err) {
      showError('讀取失敗：' + (err?.message || err));
      console.error('[merchants.json] load failed:', err);
      return [];
    }
  }

  const state = { q: '', data: await loadJSON() };

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const elQ = $('q'),
    elList = $('list'),
    elEmpty = $('empty'),
    elStats = $('stats');
  const addPanel = $('add-panel'),
    btnAdd = $('btn-add'),
    btnSave = $('btn-save'),
    btnCancel = $('btn-cancel');
  const btnExport = $('btn-export'),
    importer = $('importer');
  const fName = $('f-name'),
    fRate = $('f-rate'),
    fCond = $('f-cond'),
    fTags = $('f-tags');

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

  // 加入商家（僅記憶體）
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
    state.data.push({ id: cid(), name, rate, cond, tags, offers: [] });
    addPanel.hidden = true;
    clearForm();
    elQ.value = '';
    state.q = '';
    render();
  });

  // 匯出／匯入（保留 offers）
  btnExport.addEventListener('click', () => {
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
  });
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
          offers: Array.isArray(x.offers) ? x.offers : [], // ← 保留 offers
        }));
        importer.value = '';
        render();
      } catch (err) {
        alert('匯入失敗：' + (err?.message || err));
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

    // 依商家「主回饋」大→小
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

      // 標頭
      const top = document.createElement('div');
      top.className = 'row';
      top.style.justifyContent = 'space-between';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = x.name || '';

      // 商家主回饋：>5% 紅色
      const badge = document.createElement('span');
      badge.className = 'badge';
      const color = Number(x.rate) > 5 ? '#d93535' : 'var(--blue)';
      badge.innerHTML = `<span class="rate" style="color:${color}">${fmtRate(
        x.rate
      )}</span> 回饋`;
      top.append(name, badge);

      // 條件與標籤
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

      // 操作列：加上 .tools，並改用 btn-danger
      const tools = document.createElement('div');
      tools.className = 'row tools';
      const btnDel = tinyBtn(
        '✖',
        () => {
          if (confirm(`刪除「${x.name}」?`)) {
            state.data = state.data.filter((y) => y.id !== x.id);
            render();
          }
        },
        'btn-danger'
      );
      tools.append(btnDel);

      card.append(top, cond, meta, tools);

      // 新增：信用卡優惠展開區
      const offersWrap = document.createElement('div');
      offersWrap.className = 'offers';
      const offers = Array.isArray(x.offers) ? x.offers.slice() : [];
      if (offers.length > 0) {
        // 依回饋由高到低
        offers.sort((a, b) => (Number(b.rate) || 0) - (Number(a.rate) || 0));

        const toggle = document.createElement('div');
        toggle.className = 'offer-toggle muted';
        toggle.textContent = `查看卡片優惠（${offers.length}）`;
        const ul = document.createElement('ul');
        ul.className = 'offer-list';

        toggle.addEventListener('click', () => {
          ul.classList.toggle('open');
          toggle.textContent = ul.classList.contains('open')
            ? '收合卡片優惠'
            : `查看卡片優惠（${offers.length}）`;
        });

        for (const o of offers) {
          const li = document.createElement('li');
          li.className = 'offer-item';

          const left = document.createElement('div');
          left.className = 'offer-left';
          const cardName = document.createElement('div');
          cardName.className = 'offer-card';
          // 顯示格式：發卡行 + 卡名（若存在），否則顯示 o.card
          const label =
            o.issuer && o.card
              ? `${o.issuer}・${o.card}`
              : o.card || o.issuer || '未知卡別';
          cardName.textContent = label;

          const sub = document.createElement('div');
          sub.className = 'offer-cond';
          sub.textContent = o.cond || '—';

          left.append(cardName, sub);

          const right = document.createElement('div');
          const rateSpan = document.createElement('span');
          rateSpan.className =
            'offer-rate' + (Number(o.rate) > 5 ? ' high' : '');
          rateSpan.textContent = fmtRate(o.rate);

          right.appendChild(rateSpan);

          li.append(left, right);
          ul.appendChild(li);
        }

        offersWrap.append(toggle, ul);
      }

      // 組裝卡片
      card.append(top, cond, meta, tools);
      if (offers.length > 0) card.append(offersWrap);
      elList.appendChild(card);
    }
  }

  // ---- Utils ----
  function tinyBtn(text, onClick, extraClass) {
    const b = document.createElement('button');
    b.className = 'btn' + (extraClass ? ' ' + extraClass : '');
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

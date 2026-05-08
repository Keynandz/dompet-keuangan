let db = { transactions: [] };
let ghConfig = null;
let ghFileSHA = null;
let isSyncing = false;

const STORAGE_KEY = 'dompet_sayang_gh_config';

function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function loadConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch(e) {
        return null;
    }
}

function clearConfig() {
    localStorage.removeItem(STORAGE_KEY);
}

function ghApiUrl(cfg) {
    const fp = cfg.filepath.startsWith('/') ? cfg.filepath.slice(1) : cfg.filepath;
    return `https://api.github.com/repos/${cfg.username}/${cfg.repo}/contents/${fp}`;
}

async function ghGetFile(cfg) {
    const res = await fetch(ghApiUrl(cfg), {
        headers: {
            'Authorization': `token ${cfg.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    if (res.status === 404) return null;
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `HTTP ${res.status}`);
    }
    return await res.json();
}

async function ghPutFile(cfg, content, sha, commitMsg) {
    const body = {
        message: commitMsg || '💰 Update Dompet Sayang',
        content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
        ...(sha ? { sha } : {})
    };
    const res = await fetch(ghApiUrl(cfg), {
        method: 'PUT',
        headers: {
            'Authorization': `token ${cfg.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `HTTP ${res.status}`);
    }
    return await res.json();
}

function decodeGHContent(base64Str) {
    try {
        return JSON.parse(decodeURIComponent(escape(atob(base64Str.replace(/\n/g, '')))));
    } catch(e) {
        throw new Error('Gagal membaca isi file JSON dari GitHub. Pastikan formatnya benar.');
    }
}

async function connectGitHub() {
    const username = document.getElementById('gh-username').value.trim();
    const repo = document.getElementById('gh-repo').value.trim();
    const filepath = document.getElementById('gh-filepath').value.trim() || 'dompet_sayang.json';
    const token = document.getElementById('gh-token').value.trim();

    setModalError('');
    setModalSuccess('');

    if (!username) return setModalError('❗ Username GitHub tidak boleh kosong!');
    if (!repo) return setModalError('❗ Nama repository tidak boleh kosong!');
    if (!token) return setModalError('❗ Token GitHub tidak boleh kosong!');

    const btn = document.getElementById('btn-connect-github');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">⏳</span> Menghubungkan...';

    const cfg = { username, repo, filepath, token };

    try {
        const fileData = await ghGetFile(cfg);

        if (fileData) {
            ghFileSHA = fileData.sha;
            const parsed = decodeGHContent(fileData.content);
            if (parsed && Array.isArray(parsed.transactions)) {
                db = parsed;
            }
            setModalSuccess(`✅ Berhasil terhubung! Ditemukan ${db.transactions.length} transaksi di GitHub 🌸`);
        } else {
            const newData = { transactions: [] };
            const result = await ghPutFile(cfg, newData, null, '🌸 Inisialisasi Dompet Sayang');
            ghFileSHA = result.content.sha;
            db = newData;
            setModalSuccess('✅ File baru dibuat di GitHub! Siap digunakan 💕');
        }

        ghConfig = cfg;
        saveConfig(cfg);

        setTimeout(() => {
            closeGitHubModal();
            setBannerConnected();
            renderDashboard();
            renderHistory(currentFilter);
            showToast('🔗 Terhubung ke GitHub ' + username + '/' + repo + ' 💕');
        }, 1200);

    } catch(e) {
        setModalError('❌ Gagal terhubung: ' + e.message + '. Cek username, repo, dan token ya!');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔗 Hubungkan & Sync Sekarang';
    }
}

async function syncFromGitHub(showToastMsg = false) {
    if (!ghConfig || isSyncing) return;
    isSyncing = true;
    setSaveIndicator('saving');

    try {
        const fileData = await ghGetFile(ghConfig);
        if (fileData) {
            ghFileSHA = fileData.sha;
            const parsed = decodeGHContent(fileData.content);
            if (parsed && Array.isArray(parsed.transactions)) {
                db = parsed;
                renderDashboard();
                renderHistory(currentFilter);
                if (showToastMsg) showToast('🔄 Data berhasil disync dari GitHub!');
            }
        }
        setSaveIndicator('saved');
    } catch(e) {
        setSaveIndicator('nosave');
        if (showToastMsg) showToast('⚠️ Gagal sync: ' + e.message);
    } finally {
        isSyncing = false;
    }
}

async function pushToGitHub(commitMsg) {
    if (!ghConfig) return;
    setSaveIndicator('saving');
    try {
        const fileData = await ghGetFile(ghConfig);
        const currentSHA = fileData ? fileData.sha : null;
        ghFileSHA = currentSHA;

        const result = await ghPutFile(ghConfig, db, ghFileSHA, commitMsg || '💰 Update Dompet Sayang');
        ghFileSHA = result.content.sha;
        setSaveIndicator('saved');
    } catch(e) {
        setSaveIndicator('nosave');
        showToast('⚠️ Gagal simpan ke GitHub: ' + e.message);
        console.error('Push error:', e);
    }
}

let saveTimer;
function scheduleSave(commitMsg) {
    setSaveIndicator('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => pushToGitHub(commitMsg), 1500);
}

function openGitHubModal() {
    document.getElementById('github-modal').classList.remove('hidden');
    if (ghConfig) {
        document.getElementById('gh-username').value = ghConfig.username || '';
        document.getElementById('gh-repo').value = ghConfig.repo || '';
        document.getElementById('gh-filepath').value = ghConfig.filepath || 'dompet_sayang.json';
        document.getElementById('gh-token').value = ghConfig.token || '';
    }
}

function closeGitHubModal() {
    document.getElementById('github-modal').classList.add('hidden');
}

function setModalError(msg) {
    const el = document.getElementById('modal-error');
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
    document.getElementById('modal-success').classList.remove('show');
}

function setModalSuccess(msg) {
    const el = document.getElementById('modal-success');
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
    document.getElementById('modal-error').classList.remove('show');
}

function toggleTokenVisibility() {
    const inp = document.getElementById('gh-token');
    const btn = document.getElementById('btn-eye-toggle');
    if (inp.type === 'password') {
        inp.type = 'text';
        btn.textContent = '🙈';
    } else {
        inp.type = 'password';
        btn.textContent = '👁️';
    }
}

function setBannerConnecting() {
    const b = document.getElementById('github-banner');
    b.className = 'github-banner connecting';
    document.getElementById('banner-icon').textContent = '⏳';
    document.getElementById('banner-msg').textContent = 'Menghubungkan ke GitHub...';
    document.getElementById('banner-sub').textContent = 'Mohon tunggu sebentar ya 🌸';
    document.getElementById('btn-banner-settings').style.display = 'none';
    document.getElementById('btn-banner-sync').style.display = 'none';
}

function setBannerConnected() {
    const b = document.getElementById('github-banner');
    b.className = 'github-banner connected';
    document.getElementById('banner-icon').textContent = '✅';
    document.getElementById('banner-msg').textContent = '🔗 Terhubung: ' + ghConfig.username + '/' + ghConfig.repo;
    document.getElementById('banner-sub').textContent = '📄 File: ' + ghConfig.filepath + ' · Data otomatis disimpan ke GitHub 💚';
    document.getElementById('btn-banner-settings').style.display = '';
    document.getElementById('btn-banner-sync').style.display = '';
}

function setBannerError(msg) {
    const b = document.getElementById('github-banner');
    b.className = 'github-banner error';
    document.getElementById('banner-icon').textContent = '⚠️';
    document.getElementById('banner-msg').textContent = msg || 'Belum terhubung ke GitHub';
    document.getElementById('banner-sub').textContent = 'Klik pengaturan untuk menghubungkan 🌸';
    document.getElementById('btn-banner-settings').style.display = '';
    document.getElementById('btn-banner-sync').style.display = 'none';
}

function setSaveIndicator(state) {
    const el = document.getElementById('save-indicator');
    el.className = 'save-indicator ' + state;
    if (state === 'saving') el.textContent = '☁️ Menyimpan ke GitHub...';
    else if (state === 'saved') el.textContent = '✅ Tersimpan di GitHub';
    else el.textContent = '⚠️ Belum terhubung GitHub';
}

const EXPENSE_COLORS = { 'Makanan':'#FF85A1','Belanja':'#C9B1FF','Transport':'#85C7FF','Kesehatan':'#B5EAD7','Tagihan':'#FFEAA7','Hiburan':'#FFB347','Pendidikan':'#DDA0DD','Rumah':'#87CEEB','Anak':'#FFD1DC','Lainnya':'#D3D3D3' };
const EXPENSE_EMOJI = { 'Makanan':'🍱','Belanja':'🛍️','Transport':'🚗','Kesehatan':'💊','Tagihan':'💡','Hiburan':'🎉','Pendidikan':'📚','Rumah':'🏠','Anak':'👶','Lainnya':'✨' };
const EXPENSE_BG = { 'Makanan':'#FFE4EC','Belanja':'#F0EBFF','Transport':'#E8F4FF','Kesehatan':'#E8FFF5','Tagihan':'#FFFBE8','Hiburan':'#FFF3E8','Pendidikan':'#F5E8FF','Rumah':'#E8F5FF','Anak':'#FFE8EE','Lainnya':'#F5F5F5' };
const INCOME_COLORS = { 'Gaji':'#6FD4AB','Freelance':'#85C7FF','Bisnis':'#DDA0DD','Investasi':'#FFEAA7','Hadiah':'#FF85A1','Transfer':'#C9B1FF','Lainnya':'#D3D3D3' };
const INCOME_EMOJI = { 'Gaji':'💼','Freelance':'💻','Bisnis':'🏪','Investasi':'📈','Hadiah':'🎁','Transfer':'💸','Lainnya':'✨' };

function fmt(n) { return 'Rp ' + Math.abs(n).toLocaleString('id-ID'); }
function fmtDate(d) { return new Date(d).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}); }
function today() { return new Date().toISOString().split('T')[0]; }

function getFilteredExpensesByDate() {
    const startDateInput = document.getElementById('fundsource-start-date').value;
    let endDateInput = document.getElementById('fundsource-end-date').value;
    if (!endDateInput) {
        endDateInput = today();
        document.getElementById('fundsource-end-date').value = endDateInput;
    }
    const startDate = new Date(startDateInput || '2024-01-01');
    const endDate = new Date(endDateInput);
    endDate.setHours(23,59,59,999);
    return db.transactions.filter(t => {
        if (t.type !== 'expense' || !t.fundSource) return false;
        const tDate = new Date(t.date);
        return tDate >= startDate && tDate <= endDate;
    });
}

function resetFundSourceDateFilter() {
    document.getElementById('fundsource-start-date').value = '2024-01-01';
    document.getElementById('fundsource-end-date').value = today();
    renderFundSourceChart();
    showToast('🗓️ Filter tanggal direset');
}

function renderFundSourceChart() {
    const expenses = getFilteredExpensesByDate();
    const el = document.getElementById('fund-source-content');
    if (!expenses.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><p>Belum ada data pengeluaran dengan sumber dana di rentang tanggal yang dipilih 🌸</p></div>';
        return;
    }
    const wifeTotal = expenses.filter(t=>t.fundSource==='Istri Tercantik').reduce((s,t)=>s+t.amount,0);
    const husbTotal = expenses.filter(t=>t.fundSource==='Suami Risma').reduce((s,t)=>s+t.amount,0);
    const grandTotal = wifeTotal + husbTotal || 1;
    const wifePct = Math.round(wifeTotal/grandTotal*100);
    const husbPct = 100-wifePct;
    const wifeTx = expenses.filter(t=>t.fundSource==='Istri Tercantik').length;
    const husbTx = expenses.filter(t=>t.fundSource==='Suami Risma').length;
    const cats = {};
    expenses.forEach(t => {
        if (!cats[t.category]) cats[t.category] = {wife:0,husb:0};
        if (t.fundSource==='Istri Tercantik') cats[t.category].wife+=t.amount;
        else if (t.fundSource==='Suami Risma') cats[t.category].husb+=t.amount;
    });
    const catEntries = Object.entries(cats).sort((a,b)=>(b[1].wife+b[1].husb)-(a[1].wife+a[1].husb));
    const maxCat = Math.max(...catEntries.map(([,v])=>Math.max(v.wife,v.husb)),1);
    const catRowsHtml = catEntries.map(([cat,vals])=>{
        const emoji=EXPENSE_EMOJI[cat]||'✨', bg=EXPENSE_BG[cat]||'#F5F5F5';
        const wPct=Math.round(vals.wife/maxCat*100), hPct=Math.round(vals.husb/maxCat*100);
        return `<div class="fs-cat-row"><div class="fs-cat-emoji" style="background:${bg}">${emoji}</div><div class="fs-cat-name">${cat}</div><div class="fs-cat-bars"><div class="fs-cat-mini-row"><div class="fs-cat-mini-track"><div class="fs-cat-mini-fill" style="width:${wPct}%;background:linear-gradient(90deg,#FFB3C6,#e8547a);"></div></div><div class="fs-cat-mini-val" style="color:#e8547a;">${vals.wife>0?fmt(vals.wife).replace('Rp ',''):'—'}</div></div><div class="fs-cat-mini-row"><div class="fs-cat-mini-track"><div class="fs-cat-mini-fill" style="width:${hPct}%;background:linear-gradient(90deg,#C9B1FF,#9B7FD4);"></div></div><div class="fs-cat-mini-val" style="color:#9B7FD4;">${vals.husb>0?fmt(vals.husb).replace('Rp ',''):'—'}</div></div></div></div>`;
    }).join('');
    el.innerHTML = `
        <div class="fs-summary-cards">
            <div class="fs-sum-card wife"><div class="card-crown">👸</div><div class="card-name">Istri Tercantik</div><div class="card-total">${fmt(wifeTotal)}</div><div class="card-pct">${wifePct}% dari total</div><div class="card-txcount">${wifeTx} transaksi</div></div>
            <div class="fs-sum-card husb"><div class="card-crown">🤵</div><div class="card-name">Suami Risma</div><div class="card-total">${fmt(husbTotal)}</div><div class="card-pct">${husbPct}% dari total</div><div class="card-txcount">${husbTx} transaksi</div></div>
        </div>
        <div class="fs-compare-wrap">
            <div class="fs-compare-label"><span class="wife-lbl">👸 Istri Tercantik · ${wifePct}%</span><span class="husb-lbl">${husbPct}% · Suami Risma 🤵</span></div>
            <div class="fs-compare-track">
                <div class="fs-compare-wife" style="width:${wifePct}%">${wifePct>12?`<span class="fs-bar-pct-label">${wifePct}%</span>`:''}</div>
                <div class="fs-compare-husb" style="width:${husbPct}%">${husbPct>12?`<span class="fs-bar-pct-label">${husbPct}%</span>`:''}</div>
            </div>
        </div>
        ${catEntries.length?`<div><div class="fs-cat-title">📊 Rincian per Kategori</div><div class="fs-legend-row"><div class="fs-leg-item"><div class="fs-leg-dot" style="background:#e8547a;"></div>Istri Tercantik</div><div class="fs-leg-item"><div class="fs-leg-dot" style="background:#9B7FD4;"></div>Suami Risma</div></div><div class="fs-cat-list">${catRowsHtml}</div></div>`:''}
    `;
}

function addTransaction(type) {
    if (!ghConfig) {
        showToast('⚠️ Hubungkan ke GitHub dulu! Klik ⚙️ Pengaturan di atas.');
        openGitHubModal();
        return;
    }
    if (type === 'income') {
        const source = document.getElementById('income-source').value;
        const note = document.getElementById('income-note').value.trim();
        const amount = parseFloat(document.getElementById('income-amount').value);
        const date = document.getElementById('income-date').value;
        if (!source) return showToast('😅 Pilih sumber pemasukan dulu ya!');
        if (!amount||amount<=0) return showToast('😅 Isi jumlah pemasukan dulu!');
        if (!date) return showToast('😅 Isi tanggal dulu ya!');
        db.transactions.unshift({id:Date.now(),type:'income',category:source,note,amount,date,fundSource:null});
        document.getElementById('income-source').value='';
        document.getElementById('income-note').value='';
        document.getElementById('income-amount').value='';
        showToast('💚 Pemasukan berhasil dicatat!');
        scheduleSave('💚 Tambah pemasukan: ' + (note||source));
    } else {
        const cat = document.getElementById('expense-category').value;
        const fundSource = document.getElementById('expense-fund-source').value;
        const note = document.getElementById('expense-note').value.trim();
        const amount = parseFloat(document.getElementById('expense-amount').value);
        const date = document.getElementById('expense-date').value;
        if (!cat) return showToast('😅 Pilih kategori pengeluaran dulu ya!');
        if (!fundSource) return showToast('😅 Pilih Sumber Dana dulu!');
        if (!amount||amount<=0) return showToast('😅 Isi jumlah pengeluaran dulu!');
        if (!date) return showToast('😅 Isi tanggal dulu ya!');
        db.transactions.unshift({id:Date.now(),type:'expense',category:cat,note,amount,date,fundSource});
        document.getElementById('expense-category').value='';
        document.getElementById('expense-fund-source').value='';
        document.getElementById('expense-note').value='';
        document.getElementById('expense-amount').value='';
        showToast('🌸 Pengeluaran berhasil dicatat!');
        scheduleSave('🌸 Tambah pengeluaran: ' + (note||cat));
    }
    renderDashboard();
    renderHistory(currentFilter);
}

function deleteTransaction(id) {
    const tx = db.transactions.find(t=>t.id===id);
    db.transactions = db.transactions.filter(t=>t.id!==id);
    scheduleSave('🗑️ Hapus transaksi: ' + (tx?tx.note||tx.category:''));
    renderDashboard();
    renderHistory(currentFilter);
    showToast('🗑️ Transaksi dihapus!');
}

function renderDashboard() {
    const txs = db.transactions;
    const totalIncome = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const totalExpense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const balance = totalIncome - totalExpense;
    document.getElementById('total-income').textContent = fmt(totalIncome);
    document.getElementById('total-expense').textContent = fmt(totalExpense);
    const balEl = document.getElementById('total-balance');
    balEl.textContent = (balance<0?'- ':'')+fmt(balance);
    balEl.style.color = balance<0?'#e8547a':'#9B7FD4';
    renderFundSourceChart();
    renderDonut('expense',txs.filter(t=>t.type==='expense'),EXPENSE_COLORS,EXPENSE_EMOJI,totalExpense);
    renderDonut('income', txs.filter(t=>t.type==='income'), INCOME_COLORS, INCOME_EMOJI, totalIncome);
    renderMonthly(txs);
    renderRecent(txs.slice(0,5));
}

function renderDonut(type,txs,colors,emojis,total) {
    const svgEl=document.getElementById('donut-'+type);
    const legEl=document.getElementById('legend-'+type);
    const cats={};
    txs.forEach(t=>{cats[t.category]=(cats[t.category]||0)+t.amount;});
    const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    if(!entries.length){
        svgEl.innerHTML=`<circle cx="60" cy="60" r="46" fill="none" stroke="#F5EEF5" stroke-width="18"/><text x="60" y="64" text-anchor="middle" font-family="Nunito,sans-serif" font-size="10" font-weight="900" fill="${type==='expense'?'#8B6F8B':'#6FD4AB'}">Kosong</text>`;
        legEl.innerHTML='<div style="font-size:0.8rem;color:#BBA5BB;font-weight:700;">Belum ada data 🌸</div>';
        return;
    }
    const circ=2*Math.PI*46; let offset=0, arcs='';
    entries.forEach(([cat,val])=>{
        const pct=val/total, dash=pct*circ, gap=circ-dash, color=colors[cat]||'#D3D3D3';
        arcs+=`<circle cx="60" cy="60" r="46" fill="none" stroke="${color}" stroke-width="18" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
        offset+=dash;
    });
    svgEl.innerHTML=arcs+`<text x="60" y="58" text-anchor="middle" font-family="Nunito,sans-serif" font-size="8" font-weight="700" fill="#8B6F8B">${entries.length}</text><text x="60" y="70" text-anchor="middle" font-family="Nunito,sans-serif" font-size="7" fill="#BBA5BB">kategori</text>`;
    legEl.innerHTML=entries.slice(0,5).map(([cat,val])=>{
        const pct=Math.round(val/total*100),color=colors[cat]||'#D3D3D3',emoji=emojis[cat]||'✨';
        return `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div><span>${emoji} ${cat}</span><span class="legend-pct">${pct}%</span></div>`;
    }).join('');
}

function renderMonthly(txs) {
    const now=new Date();
    const thisMonth=txs.filter(t=>{const d=new Date(t.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
    const barEl=document.getElementById('monthly-bars');
    if(!thisMonth.length){barEl.innerHTML='<div class="empty-state" style="padding:16px 0;">Belum ada transaksi bulan ini ✨</div>';return;}
    const weeks={1:0,2:0,3:0,4:0};
    thisMonth.forEach(t=>{if(t.type==='expense'){const d=new Date(t.date).getDate(),w=Math.min(4,Math.ceil(d/7));weeks[w]+=t.amount;}});
    const maxVal=Math.max(...Object.values(weeks),1);
    const weekNames=['Minggu 1','Minggu 2','Minggu 3','Minggu 4'];
    const barColors=['#FFB3C6','#C9B1FF','#B5EAD7','#FFEAA7'];
    barEl.innerHTML=Object.entries(weeks).map(([w,val],i)=>{
        const pct=Math.round(val/maxVal*100);
        return `<div class="bar-row"><div class="bar-label">${weekNames[i]}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${barColors[i]}"></div></div><div class="bar-val">${val>0?fmt(val):'–'}</div></div>`;
    }).join('');
}

function renderRecent(txs) {
    const el=document.getElementById('recent-list');
    if(!txs.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">🌸</div><p>Belum ada transaksi<br>Yuk catat keuanganmu!</p></div>';return;}
    el.innerHTML=txs.map(t=>{
        const isIncome=t.type==='income',emoji=isIncome?(INCOME_EMOJI[t.category]||'✨'):(EXPENSE_EMOJI[t.category]||'✨'),sign=isIncome?'+':'-';
        const fundSourceHtml=(!isIncome&&t.fundSource)?`<div class="ri-source-badge">💰 ${t.fundSource}</div>`:'';
        return `<div class="recent-item"><div class="ri-icon ${isIncome?'income-icon':'expense-icon'}">${emoji}</div><div class="ri-info"><div class="ri-name">${t.note||t.category}</div><div class="ri-sub">${t.category} · ${fmtDate(t.date)} ${fundSourceHtml}</div></div><div class="ri-amount ${isIncome?'income-amt':'expense-amt'}">${sign} ${fmt(t.amount)}</div></div>`;
    }).join('');
}

let currentFilter='all';

function filterHistory(type,btn) {
    currentFilter=type;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderHistory(type);
}

function renderHistory(type) {
    let txs=db.transactions;
    if(type!=='all') txs=txs.filter(t=>t.type===type);
    const el=document.getElementById('history-list');
    if(!txs.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">🌸</div><p>Belum ada transaksi</p></div>';return;}
    el.innerHTML=txs.map(t=>{
        const isIncome=t.type==='income',emoji=isIncome?(INCOME_EMOJI[t.category]||'✨'):(EXPENSE_EMOJI[t.category]||'✨'),sign=isIncome?'+':'-';
        const fundSourceHtml=(!isIncome&&t.fundSource)?`<span style="font-size:0.7rem;background:#f0f0f0;padding:2px 8px;border-radius:20px;margin-left:8px;">💰 ${t.fundSource}</span>`:'';
        return `<div class="history-item"><div class="ri-icon ${isIncome?'income-icon':'expense-icon'}">${emoji}</div><div class="ri-info"><div class="ri-name">${t.note||t.category} ${fundSourceHtml}</div><div class="ri-sub">${t.category} · ${fmtDate(t.date)}</div></div><div class="ri-amount ${isIncome?'income-amt':'expense-amt'}" style="margin-right:8px;">${sign} ${fmt(t.amount)}</div><button class="delete-btn" onclick="deleteTransaction(${t.id})" title="Hapus">🗑️</button></div>`;
    }).join('');
}

function showTab(name) {
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('tab-'+name).classList.add('active');
    document.querySelector('.tab-'+name).classList.add('active');
    if(name==='dashboard') renderDashboard();
    if(name==='history') renderHistory(currentFilter);
}

function showToast(msg) {
    const t=document.getElementById('toast');
    t.textContent=msg; t.classList.add('show');
    setTimeout(()=>t.classList.remove('show'),3000);
}

document.getElementById('income-date').value = today();
document.getElementById('expense-date').value = today();
document.getElementById('fundsource-start-date').value = '2024-01-01';
document.getElementById('fundsource-end-date').value = today();

document.getElementById('fundsource-start-date').addEventListener('change', ()=>renderFundSourceChart());
document.getElementById('fundsource-end-date').addEventListener('change', ()=>renderFundSourceChart());

document.getElementById('github-modal').addEventListener('click', function(e){
    if (e.target === this && ghConfig) closeGitHubModal();
});

(async function init() {
    const savedConfig = loadConfig();
    if (savedConfig) {
        setBannerConnecting();
        ghConfig = savedConfig;
        try {
            await syncFromGitHub(false);
            setBannerConnected();
            setSaveIndicator('saved');
            renderDashboard();
            renderHistory(currentFilter);
            showToast('✅ Data berhasil dimuat dari GitHub ' + savedConfig.username + '/' + savedConfig.repo);
        } catch(e) {
            setBannerError('Gagal terhubung ke GitHub: ' + e.message);
            setSaveIndicator('nosave');
            openGitHubModal();
        }
    } else {
        setBannerError('Belum terhubung ke GitHub');
        setSaveIndicator('nosave');
        openGitHubModal();
        renderDashboard();
        renderHistory(currentFilter);
    }
})();
/* ResepKu: kalkulator bahan toko kue, data di IndexedDB */
const DB_NAME = 'toko_kue_db', DB_VER = 1; // nama DB dipertahankan agar data lama tidak hilang
let db = null;
let editingResepItems = [];

const $ = s => document.querySelector(s);
const rp = n => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const fmtG = g => g >= 1000 ? (g/1000).toLocaleString('id-ID',{maximumFractionDigits:2}) + ' kg' : Math.round(g*100)/100 + ' g';

const ICON_EDIT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_CALC = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h8M8 15h8M8 19h8"/></svg>';

function openDB(){
  return new Promise((res, rej)=>{
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if(!d.objectStoreNames.contains('bahan')) d.createObjectStore('bahan',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('resep')) d.createObjectStore('resep',{keyPath:'id',autoIncrement:true});
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror = e => rej(e);
  });
}
function tx(store, mode, fn){
  return new Promise((res, rej)=>{
    const t = db.transaction(store, mode).objectStore(store);
    const q = fn(t);
    if(q && q.onsuccess !== undefined){ q.onsuccess = ()=>res(q.result); q.onerror = rej; }
    else res();
  });
}
const Bahan = {
  all: ()=>tx('bahan','readonly',s=>s.getAll()),
  add: v=>tx('bahan','readwrite',s=>s.add(v)),
  put: v=>tx('bahan','readwrite',s=>s.put(v)),
  del: id=>tx('bahan','readwrite',s=>s.delete(id)),
  clear: ()=>tx('bahan','readwrite',s=>s.clear()),
  get: id=>tx('bahan','readonly',s=>s.get(id)),
};
const Resep = {
  all: ()=>tx('resep','readonly',s=>s.getAll()),
  add: v=>tx('resep','readwrite',s=>s.add(v)),
  put: v=>tx('resep','readwrite',s=>s.put(v)),
  del: id=>tx('resep','readwrite',s=>s.delete(id)),
};

const hargaPerGram = b => b.satuan === 'kg' ? b.harga/1000 : b.harga;
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2400); }

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); $('#tab-'+b.dataset.tab).classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
});

/* BAHAN */
let bahanCache = [];
async function renderBahan(){
  bahanCache = await Bahan.all();
  const q = ($('#bahan-cari').value||'').toLowerCase();
  const list = bahanCache.filter(b=>b.nama.toLowerCase().includes(q));
  $('#bahan-count').textContent = bahanCache.length;
  $('#bahan-tbody').innerHTML = list.map(b=>'<tr>'
    + '<td data-l="Nama"><b>'+esc(b.nama)+'</b></td>'
    + '<td data-l="Harga beli">'+rp(b.harga)+' / '+b.satuan+'</td>'
    + '<td data-l="Rp per gram"><b>'+rp(hargaPerGram(b))+'</b></td>'
    + '<td data-l="Aksi"><button class="icon-btn" onclick="editBahan('+b.id+')">'+ICON_EDIT+' Ubah</button>'
    + '<button class="icon-btn del" onclick="delBahan('+b.id+')">'+ICON_TRASH+' Hapus</button></td>'
    + '</tr>').join('')
    || '<tr><td colspan="4" style="text-align:center;color:#999">Belum ada bahan. Tulis bahan baru di kotak sebelah kiri.</td></tr>';

  $('#resep-pilih-bahan').innerHTML = bahanCache.map(b=>'<option value="'+b.id+'">'+esc(b.nama)+' ('+rp(hargaPerGram(b))+'/g)</option>').join('')
    || '<option value="">Isi bahan dulu di Langkah 1</option>';

  const q2 = ($('#resep-cari-bahan').value||'').toLowerCase();
  $('#bahan-drag-list').innerHTML = bahanCache.filter(b=>b.nama.toLowerCase().includes(q2)).map(b=>
    '<div class="drag-item" draggable="true" data-id="'+b.id+'"><span><b>'+esc(b.nama)+'</b><br><small>'+rp(hargaPerGram(b))+' per gram</small></span>'
    + '<button type="button" class="btn small primary drag-add" data-add="'+b.id+'">'+ICON_PLUS+' Tambah</button></div>'
  ).join('') || '<p class="muted small">Belum ada bahan. Isi dulu di Langkah 1.</p>';

  document.querySelectorAll('.drag-item').forEach(el=>{
    el.addEventListener('dragstart', e=>e.dataTransfer.setData('text/bahan-id', el.dataset.id));
  });
  document.querySelectorAll('[data-add]').forEach(btn=>{
    btn.onclick = e => { e.stopPropagation(); tambahItemKeResep(+btn.dataset.add); };
  });
  updateResepTotal();
}
function esc(s){ return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

window.editBahan = async id => {
  const b = await Bahan.get(id); if(!b) return;
  $('#bahan-id').value=b.id; $('#bahan-nama').value=b.nama; $('#bahan-harga').value=b.harga; $('#bahan-satuan').value=b.satuan;
  $('#bahan-submit').textContent='Simpan Perubahan'; $('#bahan-batal').hidden=false; updPreview();
  window.scrollTo({top:0,behavior:'smooth'});
};
window.delBahan = async id => { if(confirm('Hapus bahan ini?')){ await Bahan.del(id); renderBahan(); toast('Bahan sudah dihapus'); } };

function updPreview(){
  const h=+$('#bahan-harga').value||0, s=$('#bahan-satuan').value;
  $('#bahan-preview').textContent = h
    ? 'Harga per gram: ' + rp(s==='kg'?h/1000:h) + ' (dari ' + rp(h) + ' per ' + (s==='kg' ? '1 kg' : '1 gram') + ')'
    : 'Harga per gram: belum diisi';
}
$('#bahan-harga').oninput=updPreview; $('#bahan-satuan').onchange=updPreview;
$('#form-bahan').onsubmit = async e=>{
  e.preventDefault();
  const v={nama:$('#bahan-nama').value.trim(), harga:+$('#bahan-harga').value, satuan:$('#bahan-satuan').value};
  if(!v.nama){ toast('Tulis nama bahan dulu'); return; }
  const id=$('#bahan-id').value;
  if(id){ v.id=+id; await Bahan.put(v); toast('Bahan sudah diperbarui'); } else { await Bahan.add(v); toast('Bahan tersimpan'); }
  e.target.reset(); $('#bahan-id').value=''; $('#bahan-submit').textContent='Simpan Bahan'; $('#bahan-batal').hidden=true; updPreview(); renderBahan();
};
$('#bahan-batal').onclick=e=>{e.target.form.reset();$('#bahan-id').value='';$('#bahan-submit').textContent='Simpan Bahan';e.target.hidden=true;updPreview();};
$('#bahan-cari').oninput=renderBahan; $('#resep-cari-bahan').oninput=renderBahan;
/* Data demo: 20 bahan dan 4 resep, siap untuk demo */
const DEMO_BAHAN = [
  ['Tepung Terigu Protein Tinggi',14500,'kg'],
  ['Tepung Terigu Protein Sedang',13000,'kg'],
  ['Gula Pasir',17500,'kg'],
  ['Gula Halus',24000,'kg'],
  ['Margarin',30000,'kg'],
  ['Mentega Butter',95000,'kg'],
  ['Telur Ayam',30000,'kg'],
  ['Susu Cair Full Cream',21000,'kg'],
  ['Susu Bubuk',98000,'kg'],
  ['Susu Kental Manis',32000,'kg'],
  ['Ragi Instan',140,'g'],
  ['Bread Improver',250,'g'],
  ['Baking Powder',180,'g'],
  ['Garam',12000,'kg'],
  ['Vanili Bubuk',400,'g'],
  ['Coklat Filling',42000,'kg'],
  ['Meses',34000,'kg'],
  ['Keju Cheddar',125000,'kg'],
  ['Pisang Raja',18000,'kg'],
  ['Minyak Goreng',21000,'kg']
];
const DEMO_RESEP = [
  {nama:'Roti Coklat', pcs:10, berat:110, bahan:[['Tepung Terigu Protein Tinggi',500],['Gula Pasir',100],['Margarin',80],['Telur Ayam',60],['Susu Cair Full Cream',200],['Ragi Instan',7],['Bread Improver',3],['Garam',6],['Coklat Filling',150]]},
  {nama:'Roti Keju', pcs:12, berat:85, bahan:[['Tepung Terigu Protein Tinggi',500],['Gula Pasir',90],['Mentega Butter',70],['Telur Ayam',50],['Susu Cair Full Cream',180],['Susu Bubuk',30],['Ragi Instan',7],['Garam',5],['Keju Cheddar',120]]},
  {nama:'Donat Gula Halus', pcs:15, berat:60, bahan:[['Tepung Terigu Protein Sedang',500],['Gula Pasir',80],['Margarin',60],['Telur Ayam',80],['Susu Cair Full Cream',150],['Ragi Instan',8],['Baking Powder',5],['Garam',5],['Minyak Goreng',100],['Gula Halus',80]]},
  {nama:'Roti Pisang Coklat', pcs:8, berat:120, bahan:[['Tepung Terigu Protein Tinggi',400],['Gula Pasir',80],['Mentega Butter',80],['Telur Ayam',50],['Susu Cair Full Cream',120],['Ragi Instan',6],['Vanili Bubuk',2],['Garam',4],['Pisang Raja',200],['Coklat Filling',100],['Meses',50]]}
];
async function muatDemo(force){
  if(!force){
    try{ if(localStorage.getItem('rotihitung_demo_v1') === '1') return false; }catch(e){}
  }
  const peta = {};
  const semua = await Bahan.all();
  semua.forEach(b=>{ peta[b.nama.toLowerCase()] = b.id; });
  for(const [nama,harga,satuan] of DEMO_BAHAN){
    if(peta[nama.toLowerCase()]) continue;
    const id = await Bahan.add({nama,harga,satuan});
    peta[nama.toLowerCase()] = id;
  }
  const resepAda = await Resep.all();
  const namaAda = new Set(resepAda.map(r=>r.nama.toLowerCase()));
  for(const r of DEMO_RESEP){
    if(namaAda.has(r.nama.toLowerCase())) continue;
    const items = [];
    for(const [namaB,jumlah] of r.bahan){
      const id = peta[namaB.toLowerCase()];
      if(id) items.push({bahanId:id, jumlah});
    }
    if(items.length) await Resep.add({nama:r.nama, pcs:r.pcs, berat:r.berat, items, updatedAt:Date.now()});
  }
  await renderBahan(); await renderResepList();
  try{ localStorage.setItem('rotihitung_demo_v1','1'); }catch(e){}
  return true;
}
$('#btn-contoh').onclick=async()=>{
  const sudahAda = bahanCache.length > 0;
  if(sudahAda && !confirm('Tambah data demo (20 bahan dan 4 resep) ke daftar?')) return;
  await muatDemo(true);
  toast('Data demo sudah masuk');
};
$('#btn-hapus-bahan').onclick=async()=>{ if(confirm('Hapus SEMUA bahan? Tindakan ini tidak bisa dibatalkan.')){ await Bahan.clear(); renderBahan(); } };

/* RESEP */
function tambahItemKeResep(bahanId){
  if(editingResepItems.find(i=>i.bahanId===bahanId)){ toast('Bahan itu sudah ada di resep'); return; }
  editingResepItems.push({bahanId, jumlah:100});
  renderResepItems();
}
$('#btn-tambah-item').onclick=()=>{
  const id=+$('#resep-pilih-bahan').value;
  if(id) tambahItemKeResep(id); else toast('Isi bahan dulu di Langkah 1');
};

const dz=$('#dropzone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');const id=+e.dataTransfer.getData('text/bahan-id');if(id)tambahItemKeResep(id);});

function renderResepItems(){
  $('#resep-items').innerHTML = editingResepItems.map((it,ix)=>{
    const b=bahanCache.find(x=>x.id===it.bahanId)||{nama:'(terhapus)'};
    return '<li><span class="nm">'+esc(b.nama)+'<small>'+rp(hargaPerGram(b))+' per gram</small></span>'
      + '<input type="number" min="0" step="1" value="'+it.jumlah+'" data-ix="'+ix+'" class="inp-jml" aria-label="Jumlah gram '+esc(b.nama)+'">'
      + '<button type="button" class="x" data-x="'+ix+'" aria-label="Buang">X</button></li>';
  }).join('');
  document.querySelectorAll('.inp-jml').forEach(i=>i.oninput=e=>{editingResepItems[+e.target.dataset.ix].jumlah=+e.target.value||0;updateResepTotal();});
  document.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{editingResepItems.splice(+b.dataset.x,1);renderResepItems();});
  updateResepTotal();
}
function updateResepTotal(){
  let g=0,biaya=0;
  editingResepItems.forEach(it=>{const b=bahanCache.find(x=>x.id===it.bahanId);if(!b)return;g+=it.jumlah;biaya+=it.jumlah*hargaPerGram(b);});
  $('#resep-total').textContent='Total adonan: '+fmtG(g)+'. Modal bahan: '+rp(biaya);
}

$('#form-resep').onsubmit=async e=>{
  e.preventDefault();
  if(!editingResepItems.length){toast('Pilih bahan dulu, tekan Tambah');return;}
  const v={nama:$('#resep-nama').value.trim(), pcs:+$('#resep-pcs').value||1, berat:+$('#resep-berat').value||0,
    items:editingResepItems.map(i=>({...i})), updatedAt:Date.now()};
  if(!v.nama){ toast('Tulis nama roti dulu'); return; }
  const id=$('#resep-id').value;
  if(id){v.id=+id;await Resep.put(v);toast('Resep sudah diperbarui');}else{await Resep.add(v);toast('Resep tersimpan');}
  e.target.reset();$('#resep-id').value='';$('#resep-pcs').value=10;editingResepItems=[];renderResepItems();$('#resep-batal').hidden=true;renderResepList();
};
$('#resep-batal').onclick=e=>{e.target.form.reset();$('#resep-id').value='';editingResepItems=[];renderResepItems();e.target.hidden=true;};

async function renderResepList(){
  const list=await Resep.all();
  $('#resep-count').textContent=list.length;
  $('#hitung-resep').innerHTML=list.map(r=>'<option value="'+r.id+'">'+esc(r.nama)+' ('+r.pcs+' biji per resep)</option>').join('')||'<option value="">Belum ada resep</option>';
  $('#resep-list').innerHTML=list.map(r=>{
    const tot=r.items.reduce((a,i)=>a+i.jumlah,0);
    let biaya=0; r.items.forEach(i=>{const b=bahanCache.find(x=>x.id===i.bahanId);if(b)biaya+=i.jumlah*hargaPerGram(b);});
    const det=r.items.map(i=>{const b=bahanCache.find(x=>x.id===i.bahanId);return '<li>'+esc(b?b.nama:'?')+': '+i.jumlah+' gram</li>';}).join('');
    return '<div class="resep-card"><h3>'+esc(r.nama)+'</h3>'
      + '<span class="muted small">Jadi '+r.pcs+' biji. Total '+fmtG(tot)+'. Modal '+rp(biaya)+'. Modal per biji '+rp(biaya/r.pcs)+'</span>'
      + '<ul>'+det+'</ul>'
      + '<div class="btn-row"><button class="btn small" onclick="editResep('+r.id+')">'+ICON_EDIT+' Ubah</button>'
      + '<button class="btn small primary" onclick="hitungResep('+r.id+')">'+ICON_CALC+' Hitung</button>'
      + '<button class="btn small danger-outline" onclick="delResep('+r.id+')">Hapus</button></div></div>';
  }).join('')||'<p class="muted small">Belum ada resep. Tulis resep baru di kotak sebelah kiri.</p>';
  updHitungInfo();
}
window.editResep=async id=>{
  const r=(await Resep.all()).find(x=>x.id===id); if(!r)return;
  $('#resep-id').value=r.id;$('#resep-nama').value=r.nama;$('#resep-pcs').value=r.pcs;$('#resep-berat').value=r.berat||'';
  editingResepItems=r.items.map(i=>({...i}));renderResepItems();$('#resep-batal').hidden=false;
  window.scrollTo({top:0,behavior:'smooth'});toast('Resep dimuat, silakan ubah');
};
window.delResep=async id=>{if(confirm('Hapus resep ini?')){await Resep.del(id);renderResepList();toast('Resep dihapus');}};
window.hitungResep=id=>{document.querySelector('[data-tab="hitung"]').click();$('#hitung-resep').value=id;doHitung();};

/* HITUNG */
function updHitungInfo(){
  const r=$('#hitung-resep').value;
  $('#hitung-info').textContent=r?'Hasil dihitung otomatis dari resep yang dipilih.':'Buat resep dulu di Langkah 2.';
}
$('#hitung-resep').onchange=updHitungInfo;

$('#btn-hitung').onclick=doHitung;
async function doHitung(){
  const rid=+$('#hitung-resep').value; if(!rid){toast('Pilih resep dulu');return;}
  const r=(await Resep.all()).find(x=>x.id===rid); if(!r)return;
  const mode=document.querySelector('input[name="target-mode"]:checked').value;
  const target=+$('#hitung-jumlah').value||0; if(target<=0){toast('Tulis jumlah yang mau dibuat');return;}
  const overhead=+$('#hitung-overhead').value||0, margin=+$('#hitung-margin').value||0;
  const roundTo=+$('#hitung-round').value||1;

  const batchGram=r.items.reduce((a,i)=>a+i.jumlah,0);
  const faktor = mode==='pcs' ? target/r.pcs : target/batchGram;
  const estPcs = mode==='pcs' ? target : target/(batchGram/r.pcs);
  const estGram = mode==='pcs' ? batchGram*faktor : target;

  const rows=r.items.map(i=>{
    const b=bahanCache.find(x=>x.id===i.bahanId)||{nama:'(terhapus)',harga:0,satuan:'g'};
    const butuh=i.jumlah*faktor, biaya=butuh*hargaPerGram(b);
    return {nama:b.nama, perBatch:i.jumlah, butuh, biaya};
  });
  const totBahan=rows.reduce((a,x)=>a+x.biaya,0);
  const totAll=totBahan+overhead;
  const hppPcs=totAll/estPcs, hppGram=totAll/estGram;
  const jualMentah=hppPcs*(1+margin/100);
  const jual=Math.ceil(jualMentah/roundTo)*roundTo;

  $('#hasil-card').hidden=false;
  $('#hasil-kpi').innerHTML=
    '<div class="kpi"><div class="k">Dapat berapa</div><div class="v">'+(Math.round(estPcs*10)/10)+' biji</div></div>'
    + '<div class="kpi"><div class="k">Berat total</div><div class="v">'+fmtG(estGram)+'</div></div>'
    + '<div class="kpi"><div class="k">Modal bahan</div><div class="v">'+rp(totBahan)+'</div></div>'
    + '<div class="kpi"><div class="k">Modal plus biaya lain</div><div class="v">'+rp(totAll)+'</div></div>'
    + '<div class="kpi hl"><div class="k">Modal per biji</div><div class="v">'+rp(hppPcs)+'</div></div>'
    + '<div class="kpi hl"><div class="k">Modal per 100 gram</div><div class="v">'+rp(hppGram*100)+'</div></div>'
    + '<div class="kpi"><div class="k">Saran harga jual (untung '+margin+'%)</div><div class="v">'+rp(jual)+'</div></div>';
  $('#hasil-tbody').innerHTML=rows.map(x=>'<tr><td data-l="Bahan"><b>'+esc(x.nama)+'</b></td><td data-l="Per resep">'+x.perBatch+' g</td><td data-l="Butuh"><b>'+fmtG(x.butuh)+'</b></td><td data-l="Biaya">'+rp(x.biaya)+'</td></tr>').join('');
  $('#hasil-tfoot').innerHTML='<tr><td colspan="3">Modal bahan ('+fmtG(estGram)+')</td><td>'+rp(totBahan)+'</td></tr>'
    + '<tr><td colspan="3">Biaya lain</td><td>'+rp(overhead)+'</td></tr>'
    + '<tr><td colspan="3">TOTAL SEMUA</td><td>'+rp(totAll)+'</td></tr>';
  $('#hasil-card').scrollIntoView({behavior:'smooth',block:'nearest'});
}

$('#btn-cetak').onclick=()=>window.print();
$('#btn-salincsv').onclick=()=>{
  const rows=[['Bahan','Per resep (g)','Butuh','Biaya (Rp)']];
  document.querySelectorAll('#hasil-tbody tr').forEach(tr=>rows.push([...tr.children].map(td=>td.textContent)));
  navigator.clipboard.writeText(rows.map(r=>r.join('\t')).join('\n')).then(()=>toast('Tabel sudah disalin'));
};

/* Cadangan */
$('#btn-export').onclick=async()=>{
  const data={bahan:await Bahan.all(), resep:await Resep.all(), exportedAt:new Date().toISOString()};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download='resepku-cadangan.json'; a.click();
  toast('File cadangan diunduh');
};
$('#file-import').onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const rd=new FileReader();
  rd.onload=async()=>{
    try{
      const d=JSON.parse(rd.result);
      for(const b of (d.bahan||[])){delete b.id;await Bahan.add(b);}
      for(const r of (d.resep||[])){delete r.id;await Resep.add(r);}
      renderBahan();renderResepList();toast('Cadangan berhasil dimuat');
    }catch{toast('File tidak bisa dibaca');}
  };
  rd.readAsText(f);
};

(async()=>{ await openDB(); updPreview(); await renderBahan(); await renderResepList(); await muatDemo(false); })();

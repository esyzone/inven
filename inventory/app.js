/* MallPOS - frontend-only POS
   - Products saved in localStorage
   - One barcode per product
   - Camera scanning using html5-qrcode
   - Manual code add supported
   - Cart with qty edit and remove
   - Invoice (A4) PDF generation using jsPDF
*/

/* -------------------------
   Storage keys and state
   ------------------------- */
const DB_PROD = "mallpos_products_v1";
const DB_CART = "mallpos_cart_v1";

function save(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }
function load(key){ return JSON.parse(localStorage.getItem(key) || "null"); }

let products = load(DB_PROD) || [];
let cart = load(DB_CART) || [];
let scannerRunning = false;
let html5QrcodeScanner = null;

/* -------------------------
   DOM refs
   ------------------------- */
const inpName = document.getElementById("inpName");
const inpSku = document.getElementById("inpSku");
const inpPrice = document.getElementById("inpPrice");
const inpStock = document.getElementById("inpStock");
const btnAddProduct = document.getElementById("btnAddProduct");
const productList = document.getElementById("productList");
const allStorageSpan = document.getElementById("storageSize");
const btnToggleScanner = document.getElementById("toggleScanner");
const manualScanInput = document.getElementById("manualScanInput");
const btnManualAdd = document.getElementById("btnManualAdd");
const cartTableBody = document.querySelector("#cartTable tbody");
const grandTotalSpan = document.getElementById("grandTotal");
const totalItemsSpan = document.getElementById("totalItems");
const btnInvoice = document.getElementById("btnInvoice");
const customerNameInput = document.getElementById("customerName");
const discountInput = document.getElementById("discountInput");
const taxInput = document.getElementById("taxInput");
const qrReaderElem = document.getElementById("qr-reader");
const labelPreview = document.getElementById("labelPreview");
const printArea = document.getElementById("printArea");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const fileInput = document.getElementById("fileInput");
const btnClear = document.getElementById("btnClear");

/* -------------------------
   Utility helpers
   ------------------------- */
function uid(prefix="id"){ return prefix + "_" + Math.random().toString(36).slice(2,9); }
function formatMoney(v){ return Number(v || 0).toFixed(2); }
function findProductByBarcode(code){ return products.find(p => (p.barcode && p.barcode === code) || (p.sku && p.sku === code)); }
function saveAll(){ save(DB_PROD, products); save(DB_CART, cart); refreshUI(); }
function updateStorageCount(){ allStorageSpan.textContent = products.length; }

/* -------------------------
   Barcode generator (one code per product)
   ------------------------- */
function generateBarcodeFor(name, sku){
  const base = (sku && sku.trim()) ? sku.trim() : name.split(/\s+/).slice(0,2).join("").toUpperCase();
  const clean = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean + "_" + Date.now().toString().slice(-6) + Math.random().toString(36).slice(2,4).toUpperCase();
}

/* -------------------------
   Add product handler
   ------------------------- */
btnAddProduct.addEventListener("click", () => {
  const name = inpName.value.trim();
  const sku = inpSku.value.trim();
  const price = Number(inpPrice.value) || 0;
  const stock = parseInt(inpStock.value) || 0;
  if (!name || price <= 0) return alert("Enter valid name and price");

  const barcode = generateBarcodeFor(name, sku);
  const product = { id: uid("prd"), name, sku: sku || barcode, price: Number(price), stock: stock, barcode };
  products.unshift(product);
  save(DB_PROD, products);

  renderLabelCard(product);
  inpName.value = ""; inpSku.value = ""; inpPrice.value = ""; inpStock.value = "";
  refreshUI();
});

/* -------------------------
   Render products list & actions
   ------------------------- */
function renderProducts(){
  productList.innerHTML = "";
  if (products.length === 0) { productList.innerHTML = `<div class="muted">No products yet</div>`; return; }
  products.forEach(p => {
    const el = document.createElement("div"); el.className = "product-card";
    el.innerHTML = `
      <div class="p-head">
        <div>
          <div class="p-name">${escapeHtml(p.name)}</div>
          <div class="p-meta">SKU: ${escapeHtml(p.sku)} • Price: ₹${formatMoney(p.price)}</div>
        </div>
        <div style="text-align:right">
          <div class="muted">Stock: ${p.stock}</div>
          <div class="btn-row">
            <button class="small-btn" data-id="${p.id}" data-action="label">Label</button>
            <button class="small-btn" data-id="${p.id}" data-action="add">Add</button>
            <button class="small-btn" data-id="${p.id}" data-action="edit">Edit</button>
            <button class="small-btn" data-id="${p.id}" data-action="del">Delete</button>
          </div>
        </div>
      </div>
    `;
    productList.appendChild(el);
    el.querySelectorAll("button").forEach(btn => {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      btn.addEventListener("click", () => {
        const prod = products.find(x => x.id === id);
        if (!prod) return;
        if (action === "label") { renderLabelCard(prod); openPrintLabel(prod); }
        if (action === "add") { addToCartById(prod.id); }
        if (action === "edit") { editProduct(prod.id); }
        if (action === "del") { if (confirm("Delete product?")) removeProduct(prod.id); }
      });
    });
  });
}

/* render single label preview */
function renderLabelCard(p){
  labelPreview.innerHTML = "";
  const card = document.createElement("div"); card.className = "label-card";
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("id","svg_" + p.id);
  try { JsBarcode(svg, p.barcode, { format: "CODE128", displayValue: true, width:1.6, height:36 }); } catch(e){}
  const info = document.createElement("div"); info.style.marginTop = "8px";
  info.innerHTML = `<div style="font-weight:700">${escapeHtml(p.name)}</div>
                    <div class="muted">Code: ${escapeHtml(p.barcode)}</div>`;
  const printBtn = document.createElement("button"); printBtn.className="small-btn"; printBtn.textContent="Print Label";
  printBtn.addEventListener("click", ()=> openPrintLabel(p));
  card.appendChild(svg); card.appendChild(info); card.appendChild(printBtn);
  labelPreview.appendChild(card);
}

/* print label via printArea */
function openPrintLabel(p){
  const labelHtml = `
    <div style="padding:10px;font-family:Arial;">
      <div style="width:320px;border:1px dashed #ddd;padding:10px;text-align:center">
        <h3 style="margin:4px 0">${escapeHtml(p.name)}</h3>
        <svg id="print_svg_${p.id}"></svg>
        <div style="margin-top:6px">₹${formatMoney(p.price)}</div>
        <div style="color:#666;font-size:12px;margin-top:6px">${escapeHtml(p.barcode)}</div>
      </div>
    </div>
  `;
  printArea.innerHTML = labelHtml;
  const svg = document.getElementById("print_svg_" + p.id);
  try { JsBarcode(svg, p.barcode, { format: "CODE128", displayValue: true, width:1.6, height:36 }); } catch(e){}
  window.print();
}

/* -------------------------
   Edit & Delete product
   ------------------------- */
function editProduct(id){
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newName = prompt("Edit product name", p.name);
  if (newName === null) return;
  const newPrice = prompt("Edit price", p.price);
  if (newPrice === null) return;
  p.name = newName.trim() || p.name;
  p.price = Number(newPrice) || p.price;
  saveAll();
}

function removeProduct(id){
  products = products.filter(p=>p.id!==id);
  saveAll();
}

/* -------------------------
   Cart functions
   ------------------------- */
function addToCartById(productId){
  const p = products.find(x => x.id === productId);
  if (!p) return alert("Product not found");
  if (p.stock <= 0) return alert("Out of stock");
  const c = cart.find(x => x.productId === p.id);
  if (c) { c.qty += 1; } else { cart.push({ productId: p.id, name: p.name, price: p.price, qty: 1 }); }
  save(DB_CART, cart);
  refreshUI();
}

function addToCartByBarcode(code){
  const p = findProductByBarcode(code);
  if (!p) return alert("Product code not found");
  addToCartById(p.id);
}

function updateCartQty(index, qty){
  if (qty <= 0) { cart.splice(index,1); } else { cart[index].qty = qty; }
  save(DB_CART, cart);
  refreshUI();
}

function removeCartItem(index){
  cart.splice(index,1);
  save(DB_CART, cart);
  refreshUI();
}

/* -------------------------
   Render cart to UI
   ------------------------- */
function renderCart(){
  cartTableBody.innerHTML = "";
  let total = 0, items = 0;
  cart.forEach((c, idx) => {
    const amount = c.price * c.qty;
    total += amount; items += c.qty;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="text-align:left">${escapeHtml(c.name)}</td>
                    <td>₹${formatMoney(c.price)}</td>
                    <td><input type="number" min="1" value="${c.qty}" data-idx="${idx}" style="width:70px"/></td>
                    <td>₹${formatMoney(amount)}</td>
                    <td><button class="small-btn" data-idx="${idx}">Remove</button></td>`;
    cartTableBody.appendChild(tr);
  });

  cartTableBody.querySelectorAll("input[type=number]").forEach(inp=>{
    inp.addEventListener("change", (e)=>{
      const val = parseInt(e.target.value) || 0;
      const i = Number(e.target.getAttribute("data-idx"));
      updateCartQty(i, val);
    });
  });

  cartTableBody.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const i = Number(btn.getAttribute("data-idx"));
      removeCartItem(i);
    });
  });

  const discountPct = Number(discountInput.value) || 0;
  const taxPct = Number(taxInput.value) || 0;
  const subtotal = cart.reduce((s,c)=> s + c.price * c.qty, 0);
  const discountAmt = (subtotal * discountPct) / 100;
  const taxed = ((subtotal - discountAmt) * taxPct) / 100;
  const grand = subtotal - discountAmt + taxed;

  grandTotalSpan.textContent = formatMoney(grand);
  totalItemsSpan.textContent = items;
}

/* -------------------------
   Scanner: start/stop + handlers
   ------------------------- */
async function startScanner(){
  if (scannerRunning) return;
  try {
    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    const cameras = await Html5Qrcode.getCameras();
    const cameraId = (cameras && cameras.length) ? cameras[0].id : null;
    await html5QrcodeScanner.start(
      { facingMode: "environment" },
      { fps: 8, qrbox: { width: 250, height: 80 }, formatsToSupport: [ Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39, Html5QrcodeSupportedFormats.QR_CODE ] },
      (decodedText) => {
        // On success
        addToCartByBarcode(decodedText.trim());
      },
      (errorMessage) => {
        // scanning in progress
      }
    );
    scannerRunning = true;
    btnToggleScanner.textContent = "Stop Camera";
  } catch (e) {
    console.warn("Scanner start error:", e);
    alert("Unable to start camera scanner. Make sure page is served via http://localhost or https and camera permission is allowed. If using file:// open, use 'npx live-server' or host to localhost.");
  }
}

async function stopScanner(){
  if (!scannerRunning || !html5QrcodeScanner) return;
  try {
    await html5QrcodeScanner.stop();
    html5QrcodeScanner.clear();
  } catch(e){}
  scannerRunning = false;
  btnToggleScanner.textContent = "Start Camera";
}

/* -------------------------
   Invoice generation (A4 PDF)
   ------------------------- */
btnInvoice.addEventListener("click", async () => {
  const customer = customerNameInput.value.trim();
  if (!customer) return alert("Enter customer name");
  if (cart.length === 0) return alert("Cart is empty");

  const invoiceNo = "INV" + Date.now().toString().slice(-8);
  const dateStr = new Date().toLocaleString();
  const items = cart.map(c => ({ name: c.name, qty: c.qty, price: c.price, amt: c.price * c.qty }));
  const subtotal = items.reduce((s,i)=>s + i.amt, 0);
  const discountPct = Number(discountInput.value)||0;
  const taxPct = Number(taxInput.value)||0;
  const discountAmt = (subtotal * discountPct)/100;
  const taxed = ((subtotal - discountAmt) * taxPct)/100;
  const total = subtotal - discountAmt + taxed;

  // create PDF
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  let y = 40;
  doc.setFontSize(18); doc.text("MALL POS - INVOICE", 220, y); y += 26;
  doc.setFontSize(11);
  doc.text(`Invoice No: ${invoiceNo}`, left, y); doc.text(`Date: ${dateStr}`, 440, y); y += 18;
  doc.text(`Customer: ${customer}`, left, y); y += 20;

  doc.setFontSize(12); doc.text("Item", left, y); doc.text("Price", 360, y); doc.text("Qty", 430, y); doc.text("Amount", 490, y); y += 10;
  doc.setLineWidth(0.5); doc.line(left, y, 560, y); y += 14;
  doc.setFontSize(11);
  items.forEach(it=>{
    doc.text(limitText(it.name,36), left, y);
    doc.text("₹"+formatMoney(it.price), 360, y);
    doc.text(String(it.qty), 430, y);
    doc.text("₹"+formatMoney(it.amt), 490, y);
    y += 18;
    if (y > 750) { doc.addPage(); y = 40; }
  });
  doc.line(left, y, 560, y); y += 14;
  doc.setFontSize(12);
  doc.text(`Subtotal: ₹${formatMoney(subtotal)}`, 420, y); y += 16;
  doc.text(`Discount (${discountPct}%): -₹${formatMoney(discountAmt)}`, 420, y); y += 16;
  doc.text(`Tax (${taxPct}%): +₹${formatMoney(taxed)}`, 420, y); y += 18;
  doc.setFontSize(14); doc.text(`TOTAL: ₹${formatMoney(total)}`, 420, y); y += 24;

  // generate invoice barcode svg -> convert to png -> add to pdf
  const invBarcode = invoiceNo;
  const svgId = "tmpSvgInv";
  const tmpDiv = document.createElement("div");
  tmpDiv.style.position = "fixed"; tmpDiv.style.left = "-9999px";
  tmpDiv.innerHTML = `<svg id="${svgId}"></svg>`;
  document.body.appendChild(tmpDiv);
  try { JsBarcode(`#${svgId}`, invBarcode, { format: "CODE128", displayValue: true, width:1.2, height:32 }); } catch(e){}
  const svgEl = document.getElementById(svgId);
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  const svgBlob = new Blob([svgStr], {type:"image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(svgBlob);

  img.onload = function(){
    canvas.width = img.width; canvas.height = img.height;
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0);
    const dataUri = canvas.toDataURL("image/png");
    doc.addImage(dataUri, "PNG", left, y, 180, 40);
    doc.setFontSize(9); doc.text("Powered by MallPOS — Offline Invoice", left, 780);
    doc.save(`${invoiceNo}.pdf`);

    // finalize: deduct stock
    finalizeSale(items);
    cart = []; save(DB_CART, cart); refreshUI();

    URL.revokeObjectURL(url); tmpDiv.remove();
  };
  img.onerror = function(){
    // fallback without barcode image
    doc.setFontSize(9); doc.text("Powered by MallPOS — Offline Invoice", left, 780);
    doc.save(`${invoiceNo}.pdf`);
    finalizeSale(items);
    cart = []; save(DB_CART, cart); refreshUI();
    tmpDiv.remove();
  };
  img.src = url;
});

/* finalize sale: decrement product stock */
function finalizeSale(items){
  items.forEach(it=>{
    // match product by name (name uniqueness assumed). For production use productId mapping
    const prod = products.find(p => p.name === it.name);
    if (prod) prod.stock = Math.max(0, (prod.stock || 0) - it.qty);
  });
  save(DB_PROD, products);
}

/* -------------------------
   CSV Export / Import
   ------------------------- */
btnExport.addEventListener("click", ()=>{
  const rows = products.map(p => ({ id:p.id, name:p.name, sku:p.sku, price:p.price, stock:p.stock, barcode:p.barcode }));
  const csv = toCsv(rows);
  downloadString(csv, "products_export.csv", "text/csv");
});
btnImport.addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", (e)=>{
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const arr = parseCsv(evt.target.result);
    arr.forEach(r=>{
      const p = { id: uid("prd"), name: r.name||"Unnamed", sku: r.sku||"", price: Number(r.price)||0, stock: parseInt(r.stock)||0, barcode: r.barcode || generateBarcodeFor(r.name, r.sku) };
      products.push(p);
    });
    save(DB_PROD, products); refreshUI(); alert("Imported " + arr.length + " rows");
  };
  reader.readAsText(f);
});

/* -------------------------
   Utilities: CSV & helpers
   ------------------------- */
function parseCsv(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(",").map(h=>h.trim().toLowerCase());
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const cols = lines[i].split(",");
    const obj = {};
    headers.forEach((h,idx)=> obj[h] = (cols[idx]||"").trim());
    rows.push(obj);
  }
  return rows;
}
function toCsv(arr){
  if (!arr.length) return "";
  const headers = Object.keys(arr[0]);
  const lines = [headers.join(",")];
  for (const r of arr) lines.push(headers.map(h => `"${String(r[h]||"").replace(/"/g,'""')}"`).join(","));
  return lines.join("\n");
}
function downloadString(text, fileName, mimeType){
  const blob = new Blob([text], { type: mimeType });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
  URL.revokeObjectURL(a.href);
}
function limitText(s, len){ if (!s) return ""; return s.length > len ? s.slice(0,len-1) + "…" : s; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* -------------------------
   Manual add & scanner toggle handlers
   ------------------------- */
btnManualAdd.addEventListener("click", ()=> {
  const code = manualScanInput.value.trim();
  if (!code) return;
  addToCartByBarcode(code);
  manualScanInput.value = "";
});
manualScanInput.addEventListener("keydown", (e)=>{ if (e.key === "Enter") btnManualAdd.click(); });
btnToggleScanner.addEventListener("click", ()=> { if (scannerRunning) stopScanner(); else startScanner(); });
btnClear.addEventListener("click", ()=> {
  if (!confirm("Clear all products and cart? This will remove saved data.")) return;
  products = []; cart = []; save(DB_PROD, products); save(DB_CART, cart); refreshUI();
});

/* -------------------------
   UI helpers (init / refresh)
   ------------------------- */
function updateStorageCount(){ allStorageSpan.textContent = products.length; }
function refreshUI(){ renderProducts(); renderCart(); updateStorageCount(); }
function init(){ updateStorageCount(); refreshUI(); }
init();

/* auto start scanner if you want (comment out if not) */
try { /* don't auto-start to avoid permission prompt on load */ } catch(e){}

/* -------------------------
   Safe cleanup on page unload
   ------------------------- */
window.addEventListener("beforeunload", ()=> {
  if (scannerRunning && html5QrcodeScanner) {
    try { html5QrcodeScanner.stop(); } catch(e){}
  }
});

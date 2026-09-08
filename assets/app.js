/* ==========================================================================
   Deu Match Aqui — Cardápio online
   Backend: Firebase (Firestore + Authentication)
   ========================================================================== */

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, onSnapshot,
  collection, addDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const settingsRef = doc(db, "config", "settings");
const productsRef = collection(db, "products");

/* ---------- Dados padrão (usados só até a loja configurar no painel) ---------- */
const DEFAULT_SETTINGS = {
  storeName: "Deu Match Aqui",
  tagline: "Doceria artesanal",
  whatsappNumber: "5511999999999",
  pixKey: "sua-chave-pix@exemplo.com",
  merchantName: "DEU MATCH AQUI",
  merchantCity: "SUA CIDADE",
  deliveryFee: 10
};

const DEFAULT_PRODUCTS = [
  {id:"p1",category:"Copos de Doce",name:"Copo de Doce de Leite",price:14,desc:"Camadas de doce de leite cremoso com raspas de chocolate.",img:"assets/doce-de-leite.jpg"},
  {id:"p2",category:"Copos de Doce",name:"Copo de Ninho com Nutella",price:16,desc:"Creme de leite ninho intercalado com nutella.",img:""},
  {id:"p3",category:"Copos de Doce",name:"Copo de Prestígio",price:15,desc:"Coco cremoso com chocolate meio amargo.",img:""},
  {id:"p4",category:"Bombons",name:"Bombom Trufado",price:5.5,desc:"Casquinha crocante com recheio macio de trufa.",img:""},
  {id:"p5",category:"Bombons",name:"Bombom de Morango",price:6,desc:"Morango fresco envolto em chocolate belga.",img:""},
  {id:"p6",category:"Brigadeiros",name:"Brigadeiro Tradicional",price:3.5,desc:"O clássico, feito com chocolate 70%.",img:""},
  {id:"p7",category:"Brigadeiros",name:"Brigadeiro de Pistache",price:5,desc:"Recheio de pistache com finalização crocante.",img:""},
  {id:"p8",category:"Combos",name:"Caixa Presente (6 docinhos)",price:45,desc:"Seleção da casa, ideal para presentear.",img:""}
];

const CATEGORY_EMOJI = {"Copos de Doce":"🍮","Bombons":"🍬","Brigadeiros":"🍫","Combos":"🎁"};

/* ---------- Estado ---------- */
let state = {
  view: "menu",
  sheetOpen: false,
  confirmation: null,
  checkoutError: "",
  cart: {},
  deliveryType: "retirada",
  address: {street:"",neighborhood:"",complement:""},
  customer: {name:"",phone:""},
  activeCategory: "Todos",
  settings: clone(DEFAULT_SETTINGS),
  products: clone(DEFAULT_PRODUCTS),
  settingsLoaded: false,
  currentUser: null,
  adminDraft: null,
  loginOpen: false,
  loginEmail: "",
  loginPassword: "",
  loginError: "",
  toastMsg: null
};

/* ---------- Utilidades ---------- */
function fmtBRL(v){ v = Number(v); if(isNaN(v)) v = 0; return "R$ " + v.toFixed(2).replace(".", ","); }
function escapeHTML(s){ if(s===null||s===undefined) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function attrJs(s){ let v = String(s===undefined||s===null?"":s); v = v.replace(/\\/g,"\\\\").replace(/'/g,"\\'"); v = v.replace(/"/g,"&quot;"); return v; }
function clone(x){ return JSON.parse(JSON.stringify(x)); }

/* ---------- Carrinho ---------- */
function cartItems(){
  const out = [];
  for(const id in state.cart){
    if(state.cart[id] > 0){
      const p = state.products.find(pp => pp.id === id);
      if(p) out.push(Object.assign({}, p, {qty: state.cart[id]}));
    }
  }
  return out;
}
function cartCount(){ return cartItems().reduce((s,i)=>s+i.qty, 0); }
function cartSubtotal(){ return cartItems().reduce((s,i)=>s+i.price*i.qty, 0); }
function addToCart(id, delta){ state.cart[id] = Math.max(0, (state.cart[id]||0) + delta); render(); }

/* ---------- Categorias ---------- */
function getCategories(){
  const cats = ["Todos"];
  state.products.forEach(p => { if(p.category && !cats.includes(p.category)) cats.push(p.category); });
  return cats;
}
function setCategory(c){ state.activeCategory = c; render(); }
function categoryEmoji(cat){ return CATEGORY_EMOJI[cat] || "🍰"; }

/* ---------- Navegação de sacola / entrega ---------- */
function openSheet(){ state.sheetOpen = true; state.checkoutError = ""; render(); }
function closeSheet(){ state.sheetOpen = false; render(); }
function setDeliveryType(t){ state.deliveryType = t; render(); }
function newOrder(){
  state.cart = {}; state.confirmation = null; state.checkoutError = "";
  state.customer = {name:"",phone:""}; state.address = {street:"",neighborhood:"",complement:""};
  state.deliveryType = "retirada"; state.sheetOpen = false;
  render();
}

/* ---------- Validação e finalização do pedido ---------- */
function validateOrder(){
  if(cartCount() === 0) return {ok:false,msg:"Sua sacola está vazia."};
  if(!state.customer.name.trim()) return {ok:false,msg:"Informe seu nome."};
  if(!state.customer.phone.trim()) return {ok:false,msg:"Informe seu telefone com DDD."};
  if(state.deliveryType === "entrega" && (!state.address.street.trim() || !state.address.neighborhood.trim())){
    return {ok:false,msg:"Preencha rua/número e bairro para entrega."};
  }
  return {ok:true};
}
function finalizeOrder(){
  const v = validateOrder();
  if(!v.ok){ state.checkoutError = v.msg; render(); return; }
  state.checkoutError = "";
  const items = cartItems();
  const subtotal = cartSubtotal();
  const deliveryFee = state.deliveryType === "entrega" ? Number(state.settings.deliveryFee||0) : 0;
  const total = subtotal + deliveryFee;
  const txid = "PED" + Date.now().toString().slice(-8);
  let pixPayload = "";
  if(state.settings.pixKey && state.settings.pixKey.trim()){
    try{
      pixPayload = buildPixPayload({
        pixKey: state.settings.pixKey.trim(),
        merchantName: state.settings.merchantName || state.settings.storeName || "LOJA",
        merchantCity: state.settings.merchantCity || "BRASIL",
        amount: total,
        txid: txid
      });
    }catch(e){ console.error(e); pixPayload = ""; }
  }
  state.confirmation = {
    items, subtotal, deliveryFee, total, txid, pixPayload,
    deliveryType: state.deliveryType,
    address: Object.assign({}, state.address),
    customer: Object.assign({}, state.customer)
  };
  render();
}

/* ---------- Pix BR Code (EMV) ---------- */
function emv(id, value){ const len = String(value.length).padStart(2,"0"); return id+len+value; }
function stripAccents(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase(); }
function crc16(str){
  let crc = 0xFFFF;
  for(let i=0;i<str.length;i++){
    crc ^= (str.charCodeAt(i) << 8);
    for(let j=0;j<8;j++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc & 0xFFFF;
}
function buildPixPayload(opts){
  const gui = emv("00","br.gov.bcb.pix");
  const key = emv("01", opts.pixKey);
  const mai = emv("26", gui+key);
  const mcc = emv("52","0000");
  const cur = emv("53","986");
  const amt = emv("54", Number(opts.amount).toFixed(2));
  const country = emv("58","BR");
  const name = emv("59", (stripAccents(opts.merchantName).substring(0,25) || "LOJA"));
  const city = emv("60", (stripAccents(opts.merchantCity).substring(0,15) || "BRASIL"));
  const txidClean = (opts.txid||"***").replace(/[^a-zA-Z0-9]/g,"").substring(0,25) || "***";
  const addData = emv("62", emv("05", txidClean));
  const fmtField = emv("00","01");
  const payload = fmtField+mai+mcc+cur+amt+country+name+city+addData+"6304";
  const crc = crc16(payload).toString(16).toUpperCase().padStart(4,"0");
  return payload+crc;
}
function generateQR(payload){
  const box = document.getElementById("qrcode-box");
  if(!box) return;
  box.innerHTML = "";
  if(!payload){
    box.innerHTML = '<p style="font-size:12.5px;color:var(--cocoa);opacity:.75;text-align:center;margin:0;">Configure a chave Pix no Painel da loja para gerar o QR Code de pagamento.</p>';
    return;
  }
  if(window.QRCode){
    try{ new QRCode(box, {text: payload, width:190, height:190, correctLevel: QRCode.CorrectLevel.M}); }
    catch(e){ box.innerHTML = '<p style="font-size:12px;color:#B23B3B;margin:0;">Não foi possível gerar o QR Code.</p>'; }
  } else {
    box.innerHTML = '<p style="font-size:12.5px;color:var(--cocoa);opacity:.75;text-align:center;margin:0;">QR Code indisponível agora. Use o código Pix copia-e-cola abaixo.</p>';
  }
}

/* ---------- WhatsApp ---------- */
function buildWhatsAppMessage(order){
  const lines = [];
  lines.push("*Novo pedido – " + state.settings.storeName + "*");
  lines.push("");
  lines.push("Cliente: " + order.customer.name);
  lines.push("Telefone: " + order.customer.phone);
  lines.push("");
  lines.push("*Itens:*");
  order.items.forEach(i => lines.push(i.qty + "x " + i.name + " — " + fmtBRL(i.price) + " = " + fmtBRL(i.price*i.qty)));
  lines.push("");
  lines.push("*Entrega:* " + (order.deliveryType === "entrega" ? "Entrega" : "Retirada no local"));
  if(order.deliveryType === "entrega"){
    lines.push("Endereço: " + order.address.street + ", " + order.address.neighborhood + (order.address.complement ? " - " + order.address.complement : ""));
  }
  lines.push("");
  lines.push("Subtotal: " + fmtBRL(order.subtotal));
  if(order.deliveryFee > 0) lines.push("Taxa de entrega: " + fmtBRL(order.deliveryFee));
  lines.push("*Total: " + fmtBRL(order.total) + "*");
  lines.push("");
  lines.push("Pagamento via Pix ✅ (QR Code gerado no site)");
  lines.push("Código do pedido: " + order.txid);
  return lines.join("\n");
}
function whatsappUrl(order){
  const msg = buildWhatsAppMessage(order);
  const num = (state.settings.whatsappNumber||"").replace(/\D/g,"");
  return "https://wa.me/" + num + "?text=" + encodeURIComponent(msg);
}
function copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){ return navigator.clipboard.writeText(text); }
  return new Promise((resolve,reject) => {
    try{
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    }catch(e){ reject(e); }
  });
}
function copyPixCode(){
  const text = state.confirmation && state.confirmation.pixPayload;
  if(!text) return;
  copyToClipboard(text).then(()=>toast("Código Pix copiado!")).catch(()=>toast("Toque e segure o código para copiar manualmente."));
}

/* ---------- Toast ---------- */
function toast(msg){
  state.toastMsg = msg; render();
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>{ state.toastMsg = null; render(); }, 2600);
}

/* ---------- Autenticação / Painel da loja ---------- */
function openAdmin(){
  if(state.currentUser){
    state.adminDraft = { settings: clone(state.settings), products: clone(state.products), deletedIds: [] };
    state.view = "admin";
  } else {
    state.loginOpen = true; state.loginEmail = ""; state.loginPassword = ""; state.loginError = "";
  }
  render();
}
function closeLogin(){ state.loginOpen = false; render(); }
async function submitLogin(){
  if(!state.loginEmail.trim() || !state.loginPassword){ state.loginError = "Preencha e-mail e senha."; render(); return; }
  try{
    await signInWithEmailAndPassword(auth, state.loginEmail.trim(), state.loginPassword);
    state.loginOpen = false;
    state.adminDraft = { settings: clone(state.settings), products: clone(state.products), deletedIds: [] };
    state.view = "admin";
    render();
  }catch(e){
    console.error(e);
    state.loginError = "E-mail ou senha inválidos.";
    render();
  }
}
async function logoutAdmin(){
  try{ await signOut(auth); }catch(e){ console.error(e); }
  state.view = "menu"; state.adminDraft = null;
  render();
}
function exitAdmin(){ state.adminDraft = null; state.view = "menu"; render(); }
function addAdminProduct(){
  state.adminDraft.products.push({id:"new-"+Date.now()+Math.floor(Math.random()*1000), category:"", name:"", price:0, desc:"", img:"", _isNew:true});
  render();
}
function removeAdminProduct(i){
  const p = state.adminDraft.products[i];
  if(p && !p._isNew) state.adminDraft.deletedIds.push(p.id);
  state.adminDraft.products.splice(i,1);
  render();
}
async function saveAdmin(){
  try{
    await setDoc(settingsRef, state.adminDraft.settings, {merge:true});
    const deletes = state.adminDraft.deletedIds.map(id => deleteDoc(doc(db,"products",id)));
    const writes = state.adminDraft.products.filter(p => p.name && p.name.trim()).map(p => {
      const data = {category:p.category||"", name:p.name.trim(), price:Number(p.price)||0, desc:p.desc||"", img:p.img||""};
      return p._isNew ? addDoc(productsRef, data) : updateDoc(doc(db,"products",p.id), data);
    });
    await Promise.all(deletes.concat(writes));
    state.view = "menu"; state.adminDraft = null;
    render();
    toast("Configurações salvas com sucesso!");
  }catch(e){
    console.error(e);
    toast("Erro ao salvar. Verifique sua conexão e tente novamente.");
  }
}

/* ---------- Views ---------- */
function headerView(){
  return '<div class="header"><img src="assets/logo.jpg" alt="Logo da loja">' +
    '<div class="brand"><h1>'+escapeHTML(state.settings.storeName)+'</h1><p>'+escapeHTML(state.settings.tagline)+'</p></div></div>';
}
function categoriesView(){
  const cats = getCategories();
  return '<div class="cats">' + cats.map(c =>
    '<button class="cat-pill '+(c===state.activeCategory?"active":"")+'" onclick="setCategory(\''+attrJs(c)+'\')">'+escapeHTML(c)+'</button>'
  ).join("") + '</div>';
}
function productRow(p){
  const qty = state.cart[p.id] || 0;
  const media = p.img ? ('<img src="'+p.img+'" alt="'+escapeHTML(p.name)+'">') : ('<div class="ph">'+categoryEmoji(p.category)+'</div>');
  const addCol = qty > 0
    ? '<div class="stepper"><button onclick="addToCart(\''+p.id+'\',-1)">–</button><span>'+qty+'</span><button onclick="addToCart(\''+p.id+'\',1)">+</button></div>'
    : '<button class="btn-add" onclick="addToCart(\''+p.id+'\',1)">Adicionar</button>';
  return '<div class="product">'+media+'<div class="info"><h3>'+escapeHTML(p.name)+'</h3><p>'+escapeHTML(p.desc||"")+'</p><div class="price">'+fmtBRL(p.price)+'</div></div><div class="add-col">'+addCol+'</div></div>';
}
function noticeBanner(){
  return '<div class="notice">⚠️ Este cardápio ainda está com dados de exemplo. Configure sua chave Pix, WhatsApp e produtos no <button onclick="openAdmin()">Painel da loja</button>.</div>';
}
function menuView(){
  const filterCat = state.activeCategory;
  const groups = {}; const order = [];
  state.products.forEach(p => {
    if(filterCat !== "Todos" && p.category !== filterCat) return;
    if(!groups[p.category]){ groups[p.category] = []; order.push(p.category); }
    groups[p.category].push(p);
  });
  let html = '<div class="menu">';
  if(!state.settingsLoaded) html += noticeBanner();
  if(order.length === 0){
    html += '<p style="text-align:center;color:var(--cocoa);opacity:.6;padding:40px 0;">Nenhum produto nessa categoria ainda.</p>';
  }
  order.forEach(cat => {
    html += '<h2 class="category-title">'+escapeHTML(cat)+'</h2>';
    groups[cat].forEach(p => { html += productRow(p); });
  });
  html += '<div class="footer-link">Loja parceira? <button onclick="openAdmin()">Acessar painel administrativo</button></div>';
  html += '</div>';
  return html;
}
function cartBarView(){
  const n = cartCount();
  if(n === 0) return "";
  return '<div class="cart-bar" onclick="openSheet()"><span class="count">'+n+' '+(n===1?"item":"itens")+' · '+fmtBRL(cartSubtotal())+'</span><span class="go">Ver sacola</span></div>';
}
function checkoutContent(){
  const itemsHtml = cartItems().map(i =>
    '<div class="cart-item"><div class="ci-info"><strong>'+escapeHTML(i.name)+'</strong><span>'+fmtBRL(i.price)+' cada</span></div>' +
    '<div class="stepper"><button onclick="addToCart(\''+i.id+'\',-1)">–</button><span>'+i.qty+'</span><button onclick="addToCart(\''+i.id+'\',1)">+</button></div></div>'
  ).join("");

  const deliveryHtml = '<div class="delivery-options">' +
    '<div class="delivery-opt '+(state.deliveryType==="retirada"?"active":"")+'" onclick="setDeliveryType(\'retirada\')">🏠 Retirada no local</div>' +
    '<div class="delivery-opt '+(state.deliveryType==="entrega"?"active":"")+'" onclick="setDeliveryType(\'entrega\')">🛵 Entrega</div></div>';

  let addressHtml = "";
  if(state.deliveryType === "entrega"){
    addressHtml =
      '<div class="field"><label>Rua e número</label><input type="text" value="'+escapeHTML(state.address.street)+'" oninput="state.address.street=this.value" placeholder="Ex: Rua das Flores, 123"></div>' +
      '<div class="field"><label>Bairro</label><input type="text" value="'+escapeHTML(state.address.neighborhood)+'" oninput="state.address.neighborhood=this.value" placeholder="Ex: Centro"></div>' +
      '<div class="field"><label>Complemento / referência (opcional)</label><input type="text" value="'+escapeHTML(state.address.complement)+'" oninput="state.address.complement=this.value" placeholder="Ex: apto 12, perto do mercado"></div>' +
      '<p class="fee-note">Taxa de entrega: <strong>'+fmtBRL(state.settings.deliveryFee)+'</strong></p>';
  }

  const customerHtml =
    '<div class="field"><label>Seu nome</label><input type="text" value="'+escapeHTML(state.customer.name)+'" oninput="state.customer.name=this.value" placeholder="Nome completo"></div>' +
    '<div class="field"><label>Telefone (com DDD)</label><input type="tel" value="'+escapeHTML(state.customer.phone)+'" oninput="state.customer.phone=this.value" placeholder="(11) 99999-9999"></div>';

  const deliveryFeeVal = state.deliveryType === "entrega" ? Number(state.settings.deliveryFee||0) : 0;
  const totalsHtml = '<div class="totals"><div class="row"><span>Subtotal</span><span>'+fmtBRL(cartSubtotal())+'</span></div>' +
    (state.deliveryType==="entrega" ? '<div class="row"><span>Taxa de entrega</span><span>'+fmtBRL(deliveryFeeVal)+'</span></div>' : '') +
    '<div class="row total"><span>Total</span><span>'+fmtBRL(cartSubtotal()+deliveryFeeVal)+'</span></div></div>';

  const errorHtml = state.checkoutError ? '<p class="error-msg">'+escapeHTML(state.checkoutError)+'</p>' : "";

  return '<div class="sheet-header"><h2>Sua sacola</h2><button class="close-x" onclick="closeSheet()">✕</button></div>' +
    '<div class="step-label">1 · Itens</div>' + itemsHtml +
    '<div class="step-label">2 · Entrega</div>' + deliveryHtml + addressHtml +
    '<div class="step-label">3 · Seus dados</div>' + customerHtml +
    totalsHtml + errorHtml +
    '<button class="btn-primary" onclick="finalizeOrder()">Finalizar pedido e gerar Pix</button>';
}
function confirmationContent(){
  const o = state.confirmation;
  const n = o.items.reduce((s,i)=>s+i.qty, 0);
  const totalsHtml = '<div class="totals"><div class="row"><span>Itens</span><span>'+n+' '+(n===1?"item":"itens")+'</span></div>' +
    (o.deliveryFee > 0 ? '<div class="row"><span>Taxa de entrega</span><span>'+fmtBRL(o.deliveryFee)+'</span></div>' : '') +
    '<div class="row total"><span>Total a pagar</span><span>'+fmtBRL(o.total)+'</span></div></div>';
  const pixBlock = o.pixPayload
    ? '<div class="pix-code">'+escapeHTML(o.pixPayload)+'</div><button class="btn-secondary" onclick="copyPixCode()">Copiar código Pix</button>'
    : '<p class="error-msg">A loja ainda não configurou a chave Pix. Combine o pagamento diretamente pelo WhatsApp.</p>';
  return '<div class="sheet-header"><h2>Pedido pronto! 🎉</h2><button class="close-x" onclick="closeSheet()">✕</button></div>' +
    '<p class="sheet-note">Escaneie o QR Code no app do seu banco para pagar via Pix. Depois, toque em "Chamar no WhatsApp" para confirmar o pedido com a loja.</p>' +
    totalsHtml +
    '<div class="qr-box" id="qrcode-box"></div>' +
    pixBlock +
    '<a class="btn-whatsapp" href="'+whatsappUrl(o)+'" target="_blank" rel="noopener noreferrer">📲 Chamar no WhatsApp</a>' +
    '<button class="btn-secondary" onclick="newOrder()">Fazer novo pedido</button>';
}
function sheetView(){
  if(!state.sheetOpen) return "";
  const body = state.confirmation ? confirmationContent() : checkoutContent();
  return '<div class="overlay" onclick="if(event.target===this) closeSheet()"><div class="sheet" onclick="event.stopPropagation()">'+body+'</div></div>';
}
function loginModalView(){
  if(!state.loginOpen) return "";
  return '<div class="overlay overlay-center" onclick="if(event.target===this) closeLogin()">' +
    '<div class="pin-card" onclick="event.stopPropagation()">' +
    '<h3>Painel da loja</h3><p>Entre com o e-mail e senha de administrador</p>' +
    '<div class="field"><label>E-mail</label><input type="email" value="'+escapeHTML(state.loginEmail)+'" oninput="state.loginEmail=this.value" autocomplete="username"></div>' +
    '<div class="field"><label>Senha</label><input type="password" value="'+escapeHTML(state.loginPassword)+'" oninput="state.loginPassword=this.value" autocomplete="current-password" onkeydown="if(event.key===\'Enter\') submitLogin()"></div>' +
    (state.loginError ? '<p class="error-msg">'+escapeHTML(state.loginError)+'</p>' : '') +
    '<button class="btn-primary" onclick="submitLogin()">Entrar</button>' +
    '<button class="btn-secondary" onclick="closeLogin()">Cancelar</button>' +
    '</div></div>';
}
function toastView(){
  if(!state.toastMsg) return "";
  return '<div class="toast">'+escapeHTML(state.toastMsg)+'</div>';
}
function adminView(){
  const s = state.adminDraft.settings;
  const prods = state.adminDraft.products;
  let html = '<div class="admin-header"><div class="admin-header-row"><button class="back-link" onclick="exitAdmin()">← Voltar ao cardápio</button><button class="logout-link" onclick="logoutAdmin()">Sair da conta</button></div><h2>Painel da loja</h2></div>';

  html += '<div class="admin-section"><h3>Dados da loja</h3>' +
    '<div class="field"><label>Nome da loja</label><input type="text" value="'+escapeHTML(s.storeName)+'" oninput="state.adminDraft.settings.storeName=this.value"></div>' +
    '<div class="field"><label>Frase / assinatura</label><input type="text" value="'+escapeHTML(s.tagline)+'" oninput="state.adminDraft.settings.tagline=this.value"></div>' +
    '<div class="field"><label>WhatsApp para receber pedidos</label><input type="text" value="'+escapeHTML(s.whatsappNumber)+'" oninput="state.adminDraft.settings.whatsappNumber=this.value" placeholder="5511999999999"></div>' +
    '<p class="field-hint">Formato: código do país + DDD + número, só números (ex: 55 11 99999-9999 → 5511999999999).</p>' +
    '<div class="field"><label>Taxa de entrega (R$)</label><input type="number" step="0.01" min="0" value="'+s.deliveryFee+'" oninput="state.adminDraft.settings.deliveryFee=parseFloat(this.value)||0"></div>' +
    '</div>';

  html += '<div class="admin-section"><h3>Recebimento via Pix</h3>' +
    '<div class="field"><label>Chave Pix</label><input type="text" value="'+escapeHTML(s.pixKey)+'" oninput="state.adminDraft.settings.pixKey=this.value" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"></div>' +
    '<div class="field"><label>Nome do recebedor (até 25 caracteres)</label><input type="text" maxlength="25" value="'+escapeHTML(s.merchantName)+'" oninput="state.adminDraft.settings.merchantName=this.value"></div>' +
    '<div class="field"><label>Cidade do recebedor (até 15 caracteres)</label><input type="text" maxlength="15" value="'+escapeHTML(s.merchantCity)+'" oninput="state.adminDraft.settings.merchantCity=this.value"></div>' +
    '<p class="field-hint">Use os mesmos dados cadastrados na sua conta Pix, para o QR Code funcionar corretamente.</p>' +
    '</div>';

  html += '<div class="admin-section"><h3>Produtos do cardápio</h3>';
  prods.forEach((p, i) => {
    html += '<div class="admin-product-row">' +
      '<button class="remove" onclick="removeAdminProduct('+i+')">Remover</button>' +
      '<div class="field"><label>Categoria</label><input type="text" value="'+escapeHTML(p.category)+'" oninput="state.adminDraft.products['+i+'].category=this.value" placeholder="Ex: Copos de Doce"></div>' +
      '<div class="field"><label>Nome</label><input type="text" value="'+escapeHTML(p.name)+'" oninput="state.adminDraft.products['+i+'].name=this.value"></div>' +
      '<div class="field"><label>Preço (R$)</label><input type="number" step="0.01" min="0" value="'+p.price+'" oninput="state.adminDraft.products['+i+'].price=parseFloat(this.value)||0"></div>' +
      '<div class="field"><label>Descrição</label><input type="text" value="'+escapeHTML(p.desc)+'" oninput="state.adminDraft.products['+i+'].desc=this.value"></div>' +
      '<div class="field"><label>URL da foto (opcional)</label><input type="text" value="'+escapeHTML(p.img)+'" oninput="state.adminDraft.products['+i+'].img=this.value" placeholder="https://..."></div>' +
      '</div>';
  });
  html += '<button class="btn-secondary" onclick="addAdminProduct()">+ Adicionar produto</button></div>';

  html += '<button class="btn-primary" onclick="saveAdmin()">Salvar alterações</button>' +
    '<button class="btn-secondary" onclick="exitAdmin()">Cancelar</button>';

  return '<div class="admin">'+html+'</div>';
}

/* ---------- Render principal ---------- */
function render(){
  let html = "";
  if(state.view === "admin" && state.adminDraft){
    html = adminView();
  } else {
    html = headerView() + categoriesView() + menuView() + cartBarView();
  }
  html += sheetView();
  html += loginModalView();
  html += toastView();
  document.getElementById("root").innerHTML = html;
  if(state.sheetOpen && state.confirmation) generateQR(state.confirmation.pixPayload);
}

/* ---------- Inicialização (Firestore em tempo real + Auth) ---------- */
function init(){
  render(); // primeira renderização com valores padrão, enquanto conecta ao Firebase

  onSnapshot(settingsRef, snap => {
    if(snap.exists()){
      state.settings = Object.assign({}, DEFAULT_SETTINGS, snap.data());
      state.settingsLoaded = true;
    } else {
      state.settings = clone(DEFAULT_SETTINGS);
      state.settingsLoaded = false;
    }
    render();
  }, err => { console.error("Erro ao carregar configurações:", err); });

  onSnapshot(productsRef, snap => {
    if(!snap.empty){
      const list = [];
      snap.forEach(d => list.push(Object.assign({id:d.id}, d.data())));
      state.products = list;
    } else {
      state.products = clone(DEFAULT_PRODUCTS);
    }
    render();
  }, err => { console.error("Erro ao carregar produtos:", err); });

  onAuthStateChanged(auth, user => {
    state.currentUser = user;
    render();
  });
}

/* Expõe as funções usadas nos atributos onclick/oninput do HTML gerado */
Object.assign(window, {
  state, setCategory, addToCart, openSheet, closeSheet, setDeliveryType, newOrder,
  finalizeOrder, copyPixCode, openAdmin, closeLogin, submitLogin, logoutAdmin,
  exitAdmin, addAdminProduct, removeAdminProduct, saveAdmin
});

init();

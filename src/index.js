const SESSION_COOKIE = "grc_session";
const SESSION_TTL = 60 * 60 * 24 * 7;
const GOOGLE_HOSTS = new Set([
  "g.page", "maps.app.goo.gl", "google.com", "www.google.com",
  "search.google.com", "business.google.com"
]);

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });
}
function page(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
}
function validId(id) { return /^[A-Z0-9-]{3,32}$/.test(id); }
function validGoogleUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && GOOGLE_HOSTS.has(u.hostname);
  } catch { return false; }
}
function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function newSession(env) {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_TTL);
  return expiry + "." + await hmac(expiry, env.SESSION_SECRET);
}
async function isLoggedIn(request, env) {
  const raw = request.headers.get("Cookie") || "";
  const match = raw.match(/(?:^|;\s*)grc_session=([^;]+)/);
  if (!match || !env.SESSION_SECRET) return false;
  const [expiry, signature, extra] = match[1].split(".");
  if (!expiry || !signature || extra || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  return signature === await hmac(expiry, env.SESSION_SECRET);
}
function sessionCookie(value, maxAge = SESSION_TTL) {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
async function allCards(env) {
  const list = await env.CARDS.list({ prefix: "card:" });
  const cards = [];
  for (const item of list.keys) {
    const card = await env.CARDS.get(item.name, "json");
    if (card) cards.push(card);
  }
  return cards.sort((a, b) => a.id.localeCompare(b.id));
}

const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google Review Card · Admin</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f6fb;color:#182230;font-family:Inter,system-ui,Arial,sans-serif}.wrap{max-width:1050px;margin:auto;padding:22px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.brand{font-size:23px;font-weight:850;letter-spacing:-.5px}.muted{color:#667085;font-size:13px}.panel{background:#fff;border:1px solid #e5e9f0;border-radius:16px;padding:19px;margin-top:18px;box-shadow:0 5px 24px #15213b08}h2{margin:0 0 15px;font-size:19px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}label{display:block;font-size:13px;font-weight:700;margin-bottom:5px}input{width:100%;padding:12px;border:1px solid #d5dbe5;border-radius:10px;font:inherit;margin-bottom:12px}button{border:0;border-radius:10px;padding:11px 15px;background:#1769e0;color:#fff;font-weight:750;cursor:pointer}button.secondary{background:#edf2f8;color:#26364e}button.danger{background:#b42318}.hidden{display:none!important}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:12px;margin-top:15px}.card{border:1px solid #e5e9f0;border-radius:13px;padding:14px;display:flex;flex-direction:column;gap:9px;min-width:0}.cardhead{display:flex;justify-content:space-between;align-items:center;gap:8px}.status{font-size:11px;font-weight:800;padding:5px 9px;border-radius:30px;background:#e7f8ee;color:#137547}.inactive{background:#fff0ed;color:#b42318}.qr{width:150px;height:150px;object-fit:contain;align-self:center}.url{font-size:11px;overflow-wrap:anywhere;color:#667085}.actions{display:flex;gap:7px;flex-wrap:wrap}.actions button{font-size:12px;padding:8px 10px}.msg{margin-top:10px;font-size:13px;color:#175cd3}.login{max-width:420px;margin:60px auto}.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
</style><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" defer></script></head>
<body><main class="wrap">
<header class="top"><div><div class="brand">Google Review Card</div><div class="muted">Admin dashboard · Direct QR + NFC redirect</div></div><button id="logout" class="secondary hidden">Logout</button></header>
<section id="login" class="panel login"><h2>Admin Login</h2><label for="password">Admin password</label><input id="password" type="password" autocomplete="current-password" placeholder="Enter admin password"><button id="loginBtn">Login</button><div id="loginMsg" class="msg"></div></section>
<section id="app" class="hidden">
<div class="panel"><h2 id="formTitle">Add / Activate Card</h2><div class="grid">
<div><label for="cardId">Card ID</label><input id="cardId" placeholder="GR-001" maxlength="32"></div>
<div><label for="shopName">Shop name</label><input id="shopName" placeholder="Shop name" maxlength="100"></div>
<div style="grid-column:1/-1"><label for="reviewUrl">Google Review URL</label><input id="reviewUrl" type="url" placeholder="https://g.page/r/.../review"></div>
</div><div class="row"><button id="saveBtn">Save / Activate</button><button id="clearBtn" class="secondary">Clear</button></div><div id="formMsg" class="msg"></div></div>
<div class="panel"><div class="top"><div><h2 style="margin:0">Card Inventory</h2><div class="muted">Pre-create blank cards, print QR + program NFC once, then activate at the shop.</div></div><div class="row"><button id="generateBtn">Generate 10 Blank Cards</button><button id="refreshBtn" class="secondary">Refresh</button></div></div><div id="cards" class="cards"></div><div id="inventoryMsg" class="msg"></div></div>
</section></main>
<script>
const $=id=>document.getElementById(id);let editing=false;
async function api(path,options={}){const r=await fetch(path,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"Request failed");return d}
function msg(id,t){$(id).textContent=t}
function clearForm(){$("cardId").disabled=false;$("cardId").value="";$("shopName").value="";$("reviewUrl").value="";$("formTitle").textContent="Add / Activate Card";editing=false}
function showApp(){$("login").classList.add("hidden");$("app").classList.remove("hidden");$("logout").classList.remove("hidden");loadCards()}
async function loadCards(){try{const data=await api("/api/cards");$("cards").replaceChildren();if(!data.cards.length){const p=document.createElement("p");p.className="muted";p.textContent="No cards yet. Add your first card above."; $("cards").append(p);return}
for(const c of data.cards){const el=document.createElement("article");el.className="card";const head=document.createElement("div");head.className="cardhead";const id=document.createElement("strong");id.textContent=c.id;const badge=document.createElement("span");badge.className="status "+(c.active?"":"inactive");badge.textContent=c.active?"ACTIVE":(!c.reviewUrl?"UNASSIGNED":"INACTIVE");head.append(id,badge);const shop=document.createElement("strong");shop.textContent=c.shopName||"Blank card · ready to assign";const link=document.createElement("div");link.className="url";link.textContent=c.reviewUrl||"Not assigned to a shop yet";const target=location.origin+"/r/"+encodeURIComponent(c.id);const qr=document.createElement("div");qr.className="qr";if(window.QRCode){new QRCode(qr,{text:target,width:150,height:150,correctLevel:QRCode.CorrectLevel.M})}else{qr.textContent="QR library not loaded";qr.className="muted"}const u=document.createElement("div");u.className="url";u.textContent=target;const actions=document.createElement("div");actions.className="actions";const edit=document.createElement("button");edit.className="secondary";edit.textContent="Edit";edit.onclick=()=>{$("cardId").value=c.id;$("cardId").disabled=true;$("shopName").value=c.shopName||"";$("reviewUrl").value=c.reviewUrl||"";$("formTitle").textContent="Edit Card";editing=true;window.scrollTo({top:0,behavior:"smooth"})};const toggle=document.createElement("button");toggle.className="secondary";toggle.textContent=c.active?"Deactivate":"Activate";toggle.onclick=async()=>{try{await api("/api/cards/"+encodeURIComponent(c.id),{method:"PATCH",body:JSON.stringify({active:!c.active})});loadCards()}catch(e){alert(e.message)}};const copy=document.createElement("button");copy.className="secondary";copy.textContent="Copy URL";copy.onclick=async()=>{await navigator.clipboard.writeText(target);copy.textContent="Copied"};const dl=document.createElement("button");dl.className="secondary";dl.textContent="Download QR";dl.onclick=()=>{try{const canvas=qr.querySelector("canvas");const img=qr.querySelector("img");let dataUrl="";if(canvas){dataUrl=canvas.toDataURL("image/png")}else if(img&&img.src){dataUrl=img.src}if(!dataUrl){alert("QR image is not ready yet. Please refresh and try again.");return}const a=document.createElement("a");a.href=dataUrl;a.download=c.id+"-QR.png";a.style.display="none";document.body.appendChild(a);a.click();a.remove();dl.textContent="Downloaded";setTimeout(()=>dl.textContent="Download QR",1800)}catch(e){alert("QR download failed. Try opening the dashboard in Chrome.")}};actions.append(edit,toggle,copy,dl);el.append(head,shop,link,qr,u,actions);$("cards").append(el)}
}catch(e){msg("formMsg",e.message)}}
$("loginBtn").onclick=async()=>{try{await api("/api/login",{method:"POST",body:JSON.stringify({password:$("password").value})});showApp()}catch(e){msg("loginMsg",e.message)}};
$("password").addEventListener("keydown",e=>{if(e.key==="Enter")$("loginBtn").click()});
$("saveBtn").onclick=async()=>{const body={id:$("cardId").value.trim().toUpperCase(),shopName:$("shopName").value.trim(),reviewUrl:$("reviewUrl").value.trim()};try{await api("/api/cards",{method:"POST",body:JSON.stringify(body)});msg("formMsg","Card saved and activated.");clearForm();loadCards()}catch(e){msg("formMsg",e.message)}};
$("clearBtn").onclick=clearForm;$("refreshBtn").onclick=loadCards;
$("generateBtn").onclick=async()=>{if(!confirm("Create 10 blank cards (GR-001 onward)? Existing card IDs will be skipped."))return;try{const d=await api("/api/cards/bulk",{method:"POST",body:JSON.stringify({count:10,prefix:"GR"})});msg("inventoryMsg",d.created+" blank cards created; "+d.skipped+" existing IDs skipped.");loadCards()}catch(e){msg("inventoryMsg",e.message)}};
$("logout").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
(async()=>{try{await api("/api/cards");showApp()}catch{}})();
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return page(ADMIN_HTML);
    if (request.method === "GET" && url.pathname.startsWith("/r/")) {
      const id = decodeURIComponent(url.pathname.slice(3)).toUpperCase();
      if (!validId(id)) return page("<h2>Invalid card link</h2>", 400);
      const card = await env.CARDS.get("card:" + id, "json");
      if (!card || !card.active || !card.reviewUrl) return page("<h2>This review card is not active yet.</h2><p>Please contact the shop.</p>", 404);
      if (!validGoogleUrl(card.reviewUrl)) return page("<h2>Review link unavailable.</h2>", 503);
      return Response.redirect(card.reviewUrl, 302);
    }
    if (url.pathname === "/api/login" && request.method === "POST") {
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "Server setup incomplete. Add ADMIN_PASSWORD and SESSION_SECRET secrets." }, 503);
      const body = await request.json().catch(() => ({}));
      if (typeof body.password !== "string" || body.password !== env.ADMIN_PASSWORD) return json({ error: "Incorrect password." }, 401);
      const token = await newSession(env);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (url.pathname === "/api/logout" && request.method === "POST") return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
    if (url.pathname.startsWith("/api/")) {
      if (!await isLoggedIn(request, env)) return json({ error: "Please login first." }, 401);
      if (url.pathname === "/api/cards" && request.method === "GET") return json({ cards: await allCards(env) });
      if (url.pathname === "/api/cards/bulk" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const count = Math.max(1, Math.min(50, Number(body.count) || 10));
        const prefix = String(body.prefix || "GR").trim().toUpperCase();
        if (!/^[A-Z]{2,8}$/.test(prefix)) return json({ error: "Prefix must be 2-8 letters." }, 400);
        let created = 0, skipped = 0;
        for (let n = 1; n <= count; n++) {
          const id = prefix + "-" + String(n).padStart(3, "0");
          const key = "card:" + id;
          if (await env.CARDS.get(key)) { skipped++; continue; }
          const now = new Date().toISOString();
          await env.CARDS.put(key, JSON.stringify({ id, shopName: "", reviewUrl: "", active: false, status: "unassigned", createdAt: now, updatedAt: now }));
          created++;
        }
        return json({ ok: true, created, skipped, cards: await allCards(env) });
      }
      if (url.pathname === "/api/cards" && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const id = String(body.id || "").trim().toUpperCase();
        const shopName = String(body.shopName || "").trim().slice(0, 100);
        const reviewUrl = String(body.reviewUrl || "").trim();
        if (!validId(id)) return json({ error: "Card ID must be 3-32 characters using A-Z, 0-9 or hyphen." }, 400);
        if (!shopName) return json({ error: "Enter shop name." }, 400);
        if (!validGoogleUrl(reviewUrl)) return json({ error: "Enter a valid HTTPS Google review URL (g.page, Google Maps or Google review domain)." }, 400);
        const previous = await env.CARDS.get("card:" + id, "json");
        const card = { id, shopName, reviewUrl, active: true, createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        await env.CARDS.put("card:" + id, JSON.stringify(card));
        return json({ ok: true, card });
      }
      const match = url.pathname.match(/^\/api\/cards\/([A-Za-z0-9-]{3,32})$/);
      if (match && request.method === "PATCH") {
        const id = match[1].toUpperCase();
        const old = await env.CARDS.get("card:" + id, "json");
        if (!old) return json({ error: "Card not found." }, 404);
        const body = await request.json().catch(() => ({}));
        const next = { ...old };
        if (typeof body.active === "boolean") next.active = body.active;
        if (body.shopName !== undefined) next.shopName = String(body.shopName).trim().slice(0, 100);
        if (body.reviewUrl !== undefined) {
          const candidate = String(body.reviewUrl).trim();
          if (!validGoogleUrl(candidate)) return json({ error: "Invalid HTTPS Google review URL." }, 400);
          next.reviewUrl = candidate;
        }
        next.updatedAt = new Date().toISOString();
        await env.CARDS.put("card:" + id, JSON.stringify(next));
        return json({ ok: true, card: next });
      }
      return json({ error: "Not found." }, 404);
    }
    return page("<h1>Not found</h1>", 404);
  }
};

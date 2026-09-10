/**
 * Worker de imagens — "Deu Match Aqui"
 *
 * O que ele faz:
 *  - GET  /image/<chave>   → serve a imagem guardada no KV (público, qualquer um pode ver)
 *  - POST /upload          → recebe um arquivo + o idToken de quem está logada no site,
 *                             confere com o Firebase se o login é válido, e só então salva
 *                             a imagem no KV. Ninguém sem login consegue enviar nada.
 *  - POST /delete          → mesma verificação, remove uma imagem antiga do KV.
 *
 * Por que isso é seguro mesmo sendo "só um arquivoJS público":
 *  - Este código roda no servidor da Cloudflare, não no navegador do cliente.
 *  - Quem chama /upload precisa mandar um idToken de verdade, emitido pelo Firebase
 *    quando a lojista faz login — e esse token é conferido aqui, no servidor,
 *    contra a própria Google. Não tem como forjar.
 *
 * CONFIGURAÇÃO NECESSÁRIA NO PAINEL DA CLOUDFLARE (Workers & Pages > este Worker):
 *  1. Settings > Bindings > adicionar um "KV Namespace" com o nome IMAGES
 *     (crie um namespace novo, ex: "deumatch-images").
 *  2. Settings > Variables and Secrets > adicionar:
 *       FIREBASE_API_KEY   = a mesma apiKey do seu firebase-config.js (não é segredo)
 *       ALLOWED_ORIGIN     = https://xgbr.github.io   (o domínio do seu site)
 *       ALLOWED_ADMIN_EMAIL = o e-mail da conta de admin (opcional, reforça a checagem)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- Servir imagem (público) ----
    if (request.method === "GET" && url.pathname.startsWith("/image/")) {
      const key = decodeURIComponent(url.pathname.replace("/image/", ""));
      const obj = await env.IMAGES.getWithMetadata(key, { type: "arrayBuffer" });
      if (!obj || !obj.value) {
        return new Response("Não encontrado", { status: 404, headers: corsHeaders });
      }
      const contentType = (obj.metadata && obj.metadata.contentType) || "application/octet-stream";
      return new Response(obj.value, {
        headers: Object.assign({}, corsHeaders, {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable"
        })
      });
    }

    // ---- Enviar imagem (exige login válido) ----
    if (request.method === "POST" && url.pathname === "/upload") {
      const jsonHeaders = Object.assign({ "Content-Type": "application/json" }, corsHeaders);
      try {
        const form = await request.formData();
        const file = form.get("file");
        const idToken = form.get("idToken");
        const productId = String(form.get("productId") || "produto");

        if (!file || !idToken) {
          return new Response(JSON.stringify({ error: "Dados incompletos." }), { status: 400, headers: jsonHeaders });
        }

        const admin = await verifyFirebaseToken(idToken, env);
        if (!admin) {
          return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: jsonHeaders });
        }

        if (!file.type || !file.type.startsWith("image/")) {
          return new Response(JSON.stringify({ error: "Envie um arquivo de imagem." }), { status: 400, headers: jsonHeaders });
        }
        const bytes = await file.arrayBuffer();
        if (bytes.byteLength > 5 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "Imagem maior que 5 MB." }), { status: 400, headers: jsonHeaders });
        }

        const safeId = productId.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "") : "jpg";
        const key = "products/" + safeId + "-" + Date.now() + "." + (ext || "jpg");

        await env.IMAGES.put(key, bytes, { metadata: { contentType: file.type } });

        const publicUrl = url.origin + "/image/" + encodeURIComponent(key);
        return new Response(JSON.stringify({ url: publicUrl, key }), { headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Erro no servidor: " + e.message }), { status: 500, headers: jsonHeaders });
      }
    }

    // ---- Remover imagem antiga (exige login válido) ----
    if (request.method === "POST" && url.pathname === "/delete") {
      const jsonHeaders = Object.assign({ "Content-Type": "application/json" }, corsHeaders);
      try {
        const body = await request.json();
        const key = body.key;
        const idToken = body.idToken;
        if (!key || !idToken) {
          return new Response(JSON.stringify({ error: "Dados incompletos." }), { status: 400, headers: jsonHeaders });
        }
        const admin = await verifyFirebaseToken(idToken, env);
        if (!admin) {
          return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401, headers: jsonHeaders });
        }
        await env.IMAGES.delete(key);
        return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Erro no servidor: " + e.message }), { status: 500, headers: jsonHeaders });
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
};

// Confere o idToken direto com o Firebase (sem precisar de Admin SDK).
// Retorna os dados do usuário se for válido, ou null se não for.
async function verifyFirebaseToken(idToken, env) {
  try {
    const resp = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + env.FIREBASE_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const user = data.users && data.users[0];
    if (!user) return null;
    if (env.ALLOWED_ADMIN_EMAIL && user.email !== env.ALLOWED_ADMIN_EMAIL) return null;
    return user;
  } catch (e) {
    return null;
  }
}

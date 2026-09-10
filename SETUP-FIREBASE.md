# Configurando o Firebase — Deu Match Aqui

Siga esta ordem. Leva uns 15 minutos na primeira vez.

## 1. Criar o projeto
1. Acesse https://console.firebase.google.com e entre com uma conta Google.
2. "Adicionar projeto" → nome sugerido: `deu-match-aqui`.
3. Pode desativar o Google Analytics (não é necessário para este projeto).

## 2. Ativar o Firestore Database
1. No menu lateral: **Build > Firestore Database** → "Criar banco de dados".
2. Escolha a região **southamerica-east1 (São Paulo)** — deixa o site mais rápido para clientes no Brasil.
3. Inicie em modo produção (as regras corretas ficam no passo 3).

## 3. Colar as regras de segurança
1. Ainda no Firestore, aba **Regras**.
2. Apague o conteúdo e cole o conteúdo do arquivo `firestore.rules` (está junto com estes arquivos).
3. Clique em **Publicar**.

Essas regras dizem: qualquer pessoa pode *ler* o cardápio (é um site público), mas só quem estiver logado pode *alterar* algo.

## 4. Ativar login da administradora
1. Menu lateral: **Build > Authentication** → "Vamos começar".
2. Na aba **Sign-in method**, ative o provedor **E-mail/senha**.
3. Na aba **Users**, clique em **Adicionar usuário** e cadastre o e-mail e a senha que a lojista vai usar para entrar no Painel da loja.
   - Essa é a única conta com permissão de editar o cardápio.
   - Pode trocar a senha depois, na própria aba Users.

## 5. Autorizar o domínio do site
1. Ainda em **Authentication > Settings > Authorized domains**.
2. Adicione o domínio onde o site vai ficar publicado — por exemplo `xgbr.github.io` (GitHub Pages) ou o domínio próprio, se tiver um.
3. Sem esse passo, o login trava com erro de "domínio não autorizado".

## 6. Pegar a configuração do app e colar no código
1. Menu lateral: ⚙️ **Configurações do projeto** (ícone de engrenagem) → aba **Geral**.
2. Em "Seus apps", clique no ícone `</>` (Web) para registrar um app. Nome sugerido: `cardapio-web`. Não precisa marcar Firebase Hosting.
3. Copie o objeto `firebaseConfig` que aparece.
4. Abra o arquivo `firebase-config.js` deste projeto e substitua os valores de exemplo pelos que você copiou.

Lembrete: esses valores (apiKey, projectId etc.) **não são secretos** — quem protege seus dados são as regras do passo 3 e o login do passo 4, não esconder esse arquivo.

## 7. Publicar no GitHub Pages
1. Suba os arquivos (`index.html`, `style.css`, `app.js`, `firebase-config.js`, pasta `assets/`) para o seu repositório `deumatch`.
2. No GitHub: **Settings > Pages** → em "Source", escolha a branch (ex: `main`) e a pasta (`/root`).
3. Aguarde alguns minutos — o GitHub mostra o link do site (algo como `https://xgbr.github.io/deumatch/`).
4. Confirme se esse é exatamente o domínio que você autorizou no passo 5 (se usar um domínio próprio depois, volte lá e atualize).

## 8. Testar
1. Abra o link do site — o cardápio deve aparecer com os produtos de exemplo e um aviso amarelo (ainda não configurado).
2. Role até o fim e toque em "Acessar painel administrativo".
3. Entre com o e-mail/senha criados no passo 4.
4. Preencha a chave Pix, nome/cidade do recebedor, WhatsApp e os produtos reais. Salve.
5. Recarregue o site em outro navegador (ou peça pra alguém abrir pelo celular) para confirmar que todo mundo já vê os dados atualizados.
6. Faça um pedido de teste e confira se o QR Code gerado é reconhecido pelo app do seu banco (use um valor baixo pra testar).

## (Opcional) Reforçar ainda mais a segurança
No Google Cloud Console (mesmo projeto) → **APIs e Serviços > Credenciais** → edite a API key do Firebase → em "Restrições de aplicativo", escolha **Referenciadores HTTP** e adicione o domínio do seu site (ex: `https://xgbr.github.io/*`). Isso impede que a chave funcione se alguém copiar seu código e tentar usá-la em outro site.

## 9. Ativar upload de fotos (Cloudflare Worker + KV — sem cartão)
Usamos o Cloudflare (Workers + KV) só para guardar e enviar as fotos dos produtos. Diferente do Firebase Storage e do Cloudflare R2, isso **não exige cartão de crédito**.

1. **Criar o Worker**: no painel da Cloudflare → **Workers & Pages** → "Create" → "Create Worker". Dê um nome, ex: `deumatch-images`, e clique em "Deploy" (ele cria um Worker vazio primeiro).
2. **Colar o código**: abra o Worker criado → **Edit code** (editor "Quick Edit" no navegador, não precisa instalar nada) → apague o conteúdo de exemplo → cole o conteúdo do arquivo `cloudflare-worker.js` (junto com estes arquivos) → **Deploy**.
3. **Criar o KV Namespace**: no Worker → **Settings > Bindings** → "Add binding" → "KV Namespace" → crie um namespace novo (ex: `deumatch-images-kv`) → nome da variável: `IMAGES` (tem que ser exatamente esse, é o nome que o código usa).
4. **Variáveis de ambiente**: ainda em Settings > Variables and Secrets, adicione:
   - `FIREBASE_API_KEY` → a mesma `apiKey` que está no seu `firebase-config.js` (não é segredo, pode colar direto).
   - `ALLOWED_ORIGIN` → `https://xgbr.github.io`
   - `ALLOWED_ADMIN_EMAIL` → o e-mail que você cadastrou no passo 4 (opcional, mas recomendado — trava o upload pra funcionar só com essa conta específica).
5. **Pegar a URL do Worker**: aparece no topo da página do Worker, algo como `https://deumatch-images.SEU-SUBDOMINIO.workers.dev`.
6. **Colar no código do site**: abra `firebase-config.js` e troque o valor de `imageWorkerUrl` por essa URL.
7. **Testar**: suba os arquivos atualizados pro GitHub, entre no Painel da loja, edite um produto e toque em "📷 Enviar foto".

Se dar erro de CORS, confira se `ALLOWED_ORIGIN` está exatamente igual ao domínio do site (sem barra `/` no final). Se der "Não autenticado", confira se `FIREBASE_API_KEY` foi colada certinha.



---

**Estrutura de dados no Firestore** (criada automaticamente na primeira vez que você salvar algo no painel):
- `config/settings` → um documento com nome da loja, WhatsApp, chave Pix, nome/cidade do recebedor e taxa de entrega.
- `products/{id}` → um documento por produto, com categoria, nome, preço, descrição e (opcional) link de foto.

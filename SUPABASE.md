# Ativação gratuita do Supabase

1. Crie uma conta em `supabase.com` e escolha **New project**.
2. No projeto, abra **SQL Editor**, crie uma nova consulta e cole todo o conteúdo de `supabase/schema.sql`. Antes, altere a senha `farma2026` que aparece no início do arquivo.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Copie `.env.example` para `.env.local` e preencha esses dois valores. Nunca envie esse arquivo para outra pessoa.
5. Rode `npm run dev` novamente.

O banco já foi desenhado para privacidade: o cliente recebe um token único e só a função do banco retorna sua senha e posição; as tabelas não ficam abertas para leitura pública.

As telas React usam essas funções. Reinicie `npm run dev` depois de preencher o arquivo `.env.local`.

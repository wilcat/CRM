# Instalando o Fluxo ERP num Windows Server 2022

Este guia parte de um Windows Server 2022 limpo (numa máquina física ou
virtual da sua rede) e termina com o ERP rodando com PostgreSQL, iniciando
sozinho quando o servidor reinicia, e com backup automático configurado.

Tempo estimado: 30–40 minutos.

---

## 1. Instalar o Node.js

1. Baixe o instalador **LTS** em https://nodejs.org (arquivo `.msi`, versão
   Windows x64).
2. Rode o instalador. Pode deixar tudo no padrão — só garanta que a opção
   **"Add to PATH"** está marcada (vem marcada por padrão).
3. Abra um **PowerShell como Administrador** (clique direito no ícone do
   Windows → "Windows PowerShell (Admin)" ou "Terminal (Admin)") e confirme:
   ```powershell
   node -v
   npm -v
   ```
   Deve mostrar um número de versão pra cada um (ex: `v20.x.x`).

## 2. Instalar o PostgreSQL

1. Baixe o instalador em https://www.postgresql.org/download/windows/
   (use o instalador oficial da EnterpriseDB — já vem com o PostgreSQL, o
   pgAdmin e as ferramentas de linha de comando juntas).
2. Durante a instalação:
   - Anote a **senha do superusuário `postgres`** que você definir — vai
     precisar dela nos próximos passos.
   - Porta padrão `5432` (pode deixar como está).
   - Pode desmarcar o "Stack Builder" no final (não precisa).
3. Ao terminar, o PostgreSQL já fica rodando como **serviço do Windows**
   automaticamente (inicia sozinho no boot — não precisa configurar nada
   pra isso, diferente do nosso sistema).

## 3. Criar o banco de dados

Abra o **SQL Shell (psql)** que foi instalado junto (procure "SQL Shell" no
menu Iniciar). Ele vai perguntar servidor/porta/usuário/banco — pode ir
apertando Enter pra aceitar os padrões, até pedir a senha (a que você
definiu na instalação).

Depois de conectado, rode:

```sql
CREATE USER fluxo WITH PASSWORD 'SUA_SENHA_AQUI';
CREATE DATABASE fluxo_erp OWNER fluxo;
\q
```

## 4. Copiar o projeto para o servidor

Copie a pasta do projeto (`erp-app`) pro servidor — via área de trabalho
remota (copiar e colar pela conexão RDP), pendrive, ou compartilhamento de
rede. Um local comum e organizado:

```
C:\fluxo-erp\erp-app
```

## 5. Instalar as dependências do projeto

No PowerShell:

```powershell
cd C:\fluxo-erp\erp-app
npm install --production
```

## 6. Criar as tabelas no banco

Ainda no PowerShell (o `psql` já está no PATH depois da instalação):

```powershell
psql "postgres://fluxo:SUA_SENHA_AQUI@localhost:5432/fluxo_erp" -f db\schema.sql
```

Deve aparecer uma sequência de `CREATE TABLE` e `CREATE INDEX` sem erros.

## 7. Configurar o `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

Preencha:

```
DATABASE_URL=postgres://fluxo:SUA_SENHA_AQUI@localhost:5432/fluxo_erp
JWT_SECRET=gere-uma-string-aleatoria-longa-aqui
PORT=3000
PUBLIC_URL=http://IP_DO_SERVIDOR:3000
```

Pra gerar um `JWT_SECRET` forte:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Pra descobrir o IP do servidor na rede (pra usar no `PUBLIC_URL`, importante
pro QR Code do cupom funcionar no celular do cliente):
```powershell
ipconfig
```
Procure "Endereço IPv4" da placa de rede ativa (algo como `192.168.0.15`).

Salve e feche o Notepad.

## 8. Testar manualmente antes de virar serviço

```powershell
node server.js
```

Deve aparecer:
```
🗄️  Banco de dados: PostgreSQL
Nenhum usuário encontrado — populando banco com dados de demonstração...
✔ Banco de dados populado com dados de demonstração.
🚀 Fluxo ERP rodando em http://localhost:3000
```

Abra `http://localhost:3000` no navegador da própria máquina e confirme que
a tela de login aparece. Depois, `Ctrl+C` no PowerShell pra parar — o
próximo passo deixa isso rodando permanentemente, sem precisar de um
PowerShell aberto.

> **Dados de demonstração:** na primeira vez que o servidor encontra o banco
> vazio, ele popula com clientes/produtos/vendas de exemplo e os 3 logins de
> teste. Assim que for usar de verdade, **exclua esses registros de
> exemplo** pela própria tela, ou vá em Configurações → Numeração pra já
> recomeçar a contagem do zero.

## 9. Deixar rodando permanentemente com NSSM

O Windows não tem um jeito nativo simples de rodar um programa como serviço
com reinício automático — usamos o **NSSM** (Non-Sucking Service Manager),
uma ferramenta gratuita e amplamente usada pra isso.

1. Baixe o NSSM em https://nssm.cc/download (pegue a versão mais recente,
   arquivo `.zip`).
2. Extraia o zip. Dentro tem uma pasta `win64` — copie o `nssm.exe` de lá
   pra um lugar fixo, por exemplo `C:\nssm\nssm.exe`.
3. Abra o **PowerShell como Administrador** e rode:
   ```powershell
   C:\nssm\nssm.exe install FluxoERP
   ```
4. Vai abrir uma janela. Preencha:
   - **Path:** `C:\Program Files\nodejs\node.exe` (confirme o caminho real
     com `(Get-Command node).Source` no PowerShell, caso tenha instalado em
     outro lugar)
   - **Startup directory:** `C:\fluxo-erp\erp-app`
   - **Arguments:** `server.js`
5. Vá na aba **"Details"** e preencha:
   - **Display name:** `Fluxo ERP`
   - **Startup type:** `Automatic` (garante que inicia sozinho no boot)
6. Vá na aba **"I/O"** (opcional, mas recomendado pra conseguir ver logs
   depois) e configure:
   - **Output (stdout):** `C:\fluxo-erp\erp-app\logs\saida.log`
   - **Error (stderr):** `C:\fluxo-erp\erp-app\logs\erro.log`
   
   Crie a pasta `logs` antes, se for usar essa opção:
   ```powershell
   mkdir C:\fluxo-erp\erp-app\logs
   ```
7. Clique em **"Install service"**.

Agora inicie o serviço:
```powershell
Start-Service FluxoERP
```

Confirme que está rodando:
```powershell
Get-Service FluxoERP
```
Deve mostrar `Status: Running`.

### Testando o reinício automático

Reinicie o servidor Windows normalmente (ou rode
`Restart-Service FluxoERP` pra simular sem reiniciar a máquina toda). Depois
do boot, confirme de novo com `Get-Service FluxoERP` — deve continuar
`Running` sozinho, sem você precisar abrir nada.

### Comandos úteis do NSSM

```powershell
Stop-Service FluxoERP      # parar
Start-Service FluxoERP     # iniciar
Restart-Service FluxoERP   # reiniciar (ex: depois de atualizar o sistema)
C:\nssm\nssm.exe remove FluxoERP confirm   # remover o serviço, se precisar refazer a instalação
```

## 10. Liberar o acesso na rede interna (Firewall do Windows)

Pelo PowerShell como Administrador:
```powershell
New-NetFirewallRule -DisplayName "Fluxo ERP" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

Ou pela interface gráfica: **Painel de Controle → Sistema e Segurança →
Firewall do Windows Defender → Configurações Avançadas → Regras de Entrada
→ Nova Regra** → Porta → TCP → `3000` → Permitir a conexão.

Pronto — qualquer computador/celular na mesma rede acessa por:
```
http://IP_DO_SERVIDOR:3000
```

**Dica:** configure um IP fixo pra esse servidor (nas propriedades de rede
do Windows, ou por reserva de DHCP no roteador), assim esse endereço nunca
muda.

## 11. Backup automático do banco de dados

Vamos criar um script que salva o banco todo dia, e agendar ele pelo
**Agendador de Tarefas** do Windows.

### Criar o script de backup

Crie o arquivo `C:\fluxo-erp\backup.ps1` com este conteúdo (ajuste a senha):

```powershell
$data = Get-Date -Format "yyyy-MM-dd"
$pastaBackup = "C:\fluxo-erp\backups"
if (!(Test-Path $pastaBackup)) { New-Item -ItemType Directory -Path $pastaBackup }

$env:PGPASSWORD = "SUA_SENHA_AQUI"
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U fluxo -h localhost -d fluxo_erp -f "$pastaBackup\backup-$data.sql"

# Apaga backups com mais de 30 dias, pra nao lotar o disco
Get-ChildItem $pastaBackup -Filter "backup-*.sql" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
```

> Ajuste o caminho do `pg_dump.exe` se a versão instalada do PostgreSQL for
> diferente de 16 (confira em `C:\Program Files\PostgreSQL\`).

### Agendar o backup diário

1. Abra o **Agendador de Tarefas** (procure no menu Iniciar).
2. **Ação → Criar Tarefa** (não "Tarefa Básica", pra ter mais opções).
3. Aba **Geral**: nome "Backup Fluxo ERP", marque **"Executar com privilégios mais altos"**.
4. Aba **Disparadores → Novo**: Diariamente, horário de baixo movimento
   (ex: 2h da manhã).
5. Aba **Ações → Nova**:
   - **Programa/script:** `powershell.exe`
   - **Adicionar argumentos:** `-ExecutionPolicy Bypass -File "C:\fluxo-erp\backup.ps1"`
6. Salve. Clique com o botão direito na tarefa criada → **Executar**, pra
   testar na hora e confirmar que gera o arquivo em
   `C:\fluxo-erp\backups\`.

### Restaurando um backup, se precisar

```powershell
$env:PGPASSWORD = "SUA_SENHA_AQUI"
psql -U fluxo -h localhost -d fluxo_erp -f "C:\fluxo-erp\backups\backup-2026-07-25.sql"
```

### Backup extra (recomendado)

Guardar o backup só no mesmo servidor não protege contra problema de
hardware nesse servidor. Configure também uma cópia da pasta
`C:\fluxo-erp\backups` pra outro lugar — um HD externo, outro computador da
rede, ou um serviço de nuvem (OneDrive/Google Drive sincronizando essa
pasta, por exemplo).

---

## Atualizando o sistema no futuro

Quando eu te mandar uma nova versão do projeto:

```powershell
Stop-Service FluxoERP
# substitua os arquivos do projeto (mantendo o .env e a pasta data\, se existir)
cd C:\fluxo-erp\erp-app
npm install --production
Start-Service FluxoERP
```

O banco de dados (Postgres) não é afetado por essa troca de arquivos — os
dados continuam intactos. Se a atualização vier com algum arquivo em
`db\migrations\`, rode ele uma vez antes de reiniciar o serviço (mesmo
padrão do passo 6, com `psql -f db\migrations\NOME_DO_ARQUIVO.sql`).

---

## Resumo de portas e serviços

| Serviço | Porta | Acesso |
|---|---|---|
| Fluxo ERP (Node.js, via NSSM) | 3000 | Rede interna (todos que tiverem o IP) |
| PostgreSQL | 5432 | Só localhost (não exposto na rede, por padrão) |

O Postgres não precisa (nem deve) ficar acessível pela rede — só o próprio
servidor conversa com ele em `localhost`. Não é preciso liberar a porta 5432
no firewall.

## Checklist rápido de tudo que precisa rodar sozinho após reiniciar o Windows

- [ ] Serviço **postgresql-x64-16** (ou versão equivalente) — configurado
      automaticamente pelo instalador do PostgreSQL, não precisa mexer.
- [ ] Serviço **FluxoERP** (via NSSM) — confirme com `Get-Service FluxoERP`
      que o "Startup type" ficou como `Automatic`.
- [ ] Tarefa agendada **"Backup Fluxo ERP"** — roda sozinha no horário
      configurado, não depende do servidor ter acabado de reiniciar.

## Publicando fora da rede local (internet) — para depois

Esse guia cobre uso **dentro da rede interna**. Se um dia quiser acesso
remoto (pela internet, para clientes ou para você acessar de fora), vai
precisar adicionalmente de: um domínio, certificado HTTPS (Let's Encrypt) e
um proxy reverso (IIS com URL Rewrite, ou Nginx pra Windows) na frente do
Node. Me chama quando chegar nessa etapa que eu preparo esse pedaço também.

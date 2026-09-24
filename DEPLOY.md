# Instalando o Fluxo ERP num Ubuntu Server (rede interna) com PostgreSQL

Este guia parte de um Ubuntu Server limpo (20.04, 22.04 ou 24.04) numa
máquina da sua rede local, e termina com o ERP rodando com PostgreSQL,
acessível por qualquer computador da mesma rede.

Tempo estimado: 20–30 minutos.

---

## 1. Atualizar o sistema

```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Instalar o Node.js (versão LTS, via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # confirme que apareceu uma versão (ex: v20.x.x)
npm -v
```

## 3. Instalar o PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql   # inicia automaticamente no boot
sudo systemctl start postgresql
```

## 4. Criar o usuário e o banco de dados

```bash
sudo -u postgres psql
```

Dentro do `psql`, rode (troque `SUA_SENHA_AQUI` por uma senha forte):

```sql
CREATE USER fluxo WITH PASSWORD 'SUA_SENHA_AQUI';
CREATE DATABASE fluxo_erp OWNER fluxo;
\q
```

## 5. Copiar o projeto para o servidor

Se você já tem o `.zip` do projeto, copie para o servidor (via `scp`, pendrive,
compartilhamento de rede, etc.) e descompacte:

```bash
unzip fluxo-erp.zip -d ~/fluxo-erp
cd ~/fluxo-erp/erp-app
```

## 6. Instalar as dependências do projeto

```bash
npm install --production
```

## 7. Criar as tabelas no banco

```bash
psql "postgres://fluxo:SUA_SENHA_AQUI@localhost:5432/fluxo_erp" -f db/schema.sql
```

Isso cria todas as tabelas (vazias). Você deve ver uma sequência de
`CREATE TABLE` e `CREATE INDEX` sem erros.

## 8. Configurar o `.env`

```bash
cp .env.example .env
nano .env
```

Preencha:

```
DATABASE_URL=postgres://fluxo:SUA_SENHA_AQUI@localhost:5432/fluxo_erp
JWT_SECRET=gere-uma-string-aleatoria-longa-aqui
PORT=3000
```

Para gerar um `JWT_SECRET` forte:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 9. Testar manualmente antes de virar serviço

```bash
node server.js
```

Deve aparecer:
```
🗄️  Banco de dados: PostgreSQL
Nenhum usuário encontrado — populando banco com dados de demonstração...
✔ Banco de dados populado com dados de demonstração.
🚀 Fluxo ERP rodando em http://localhost:3000
```

Abra `http://localhost:3000` num navegador da própria máquina (ou
`http://IP_DO_SERVIDOR:3000` de outro computador da rede) e confirme que a
tela de login aparece. Depois, `Ctrl+C` para parar — o próximo passo deixa
isso rodando permanentemente.

> **Importante — dados de demonstração:** na primeira vez que o servidor
> encontra o banco vazio, ele já popula com clientes/produtos/vendas de
> exemplo e os 3 logins de teste (`admin@fluxoerp.com`, etc.). Assim que for
> usar de verdade, **exclua esses registros de exemplo** pela própria tela
> (ou rode `TRUNCATE` nas tabelas e cadastre seus usuários reais do zero).

## 10. Deixar rodando permanentemente com systemd

Crie o arquivo de serviço:

```bash
sudo nano /etc/systemd/system/fluxo-erp.service
```

Cole (ajuste `WorkingDirectory` e `User` para o seu caso):

```ini
[Unit]
Description=Fluxo ERP
After=network.target postgresql.service

[Service]
Type=simple
User=SEU_USUARIO
WorkingDirectory=/home/SEU_USUARIO/fluxo-erp/erp-app
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/home/SEU_USUARIO/fluxo-erp/erp-app/.env

[Install]
WantedBy=multi-user.target
```

Ative e inicie:

```bash
sudo systemctl daemon-reload
sudo systemctl enable fluxo-erp
sudo systemctl start fluxo-erp
sudo systemctl status fluxo-erp    # confirma que está "active (running)"
```

A partir de agora, o ERP inicia sozinho com o servidor e reinicia
automaticamente se cair.

Para ver os logs a qualquer momento:
```bash
journalctl -u fluxo-erp -f
```

## 11. Liberar o acesso na rede interna

Descubra o IP local do servidor:
```bash
ip a | grep "inet " | grep -v 127.0.0.1
```
Você verá algo como `192.168.0.15`.

Se o firewall (`ufw`) estiver ativo, libere a porta:
```bash
sudo ufw allow 3000/tcp
```

Pronto — qualquer computador/celular na mesma rede acessa por:
```
http://192.168.0.15:3000
```

**Dica:** reserve um IP fixo para essa máquina no seu roteador (DHCP
reservation), assim esse endereço nunca muda.

## 12. Backup do banco de dados

Configure um backup diário simples via `cron`:

```bash
sudo crontab -e
```

Adicione (roda todo dia às 2h da manhã, salvando em `/var/backups/fluxo-erp`):

```
0 2 * * * mkdir -p /var/backups/fluxo-erp && pg_dump "postgres://fluxo:SUA_SENHA_AQUI@localhost:5432/fluxo_erp" > /var/backups/fluxo-erp/backup-$(date +\%Y-\%m-\%d).sql
```

Para restaurar um backup, se precisar:
```bash
psql "postgres://fluxo:SUA_SENHA_AQUI@localhost:5432/fluxo_erp" -f /var/backups/fluxo-erp/backup-2026-07-13.sql
```

---

## Atualizando o sistema no futuro

Quando eu te mandar uma nova versão do projeto:

```bash
sudo systemctl stop fluxo-erp
# substitua os arquivos do projeto (mantendo o .env e a pasta data/, se existir)
cd ~/fluxo-erp/erp-app
npm install --production
sudo systemctl start fluxo-erp
```

O banco de dados (Postgres) não é afetado por essa troca de arquivos — os
dados continuam intactos.

---

## Resumo de portas e serviços

| Serviço | Porta | Acesso |
|---|---|---|
| Fluxo ERP (Node.js) | 3000 | Rede interna (todos que tiverem o IP) |
| PostgreSQL | 5432 | Só localhost (não exposto na rede, por padrão) |

O Postgres não precisa (nem deve) ficar acessível pela rede — só o próprio
servidor Node conversa com ele em `localhost`. Isso já é seguro por padrão
com essa configuração.

## Publicando fora da rede local (internet) — para depois

Esse guia cobre uso **dentro da rede interna**. Se um dia quiser acesso
remoto (pela internet, para clientes ou para você acessar de fora), vai
precisar adicionalmente de: um domínio, certificado HTTPS (Let's Encrypt) e
um proxy reverso (Nginx) na frente do Node. Me chama quando chegar nessa
etapa que eu preparo esse pedaço também.

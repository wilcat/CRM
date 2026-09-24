// ---------- State ----------
const state = {
  token: localStorage.getItem('fluxo_token') || null,
  user: JSON.parse(localStorage.getItem('fluxo_user') || 'null'),
  route: 'dashboard',
  empresa: null,
};

// ---------- Dark Mode ----------
function initDarkMode() {
  const saved = localStorage.getItem('fluxo_dark');
  if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }
  updateDarkToggle();
}
function toggleDarkMode() {
  document.body.classList.toggle('dark');
  localStorage.setItem('fluxo_dark', document.body.classList.contains('dark'));
  updateDarkToggle();
}
function updateDarkToggle() {
  const btn = document.getElementById('dark-toggle');
  if (btn) btn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
}
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  document.getElementById('dark-toggle').addEventListener('click', toggleDarkMode);
});

function nomeEmpresa() { return (state.empresa && state.empresa.empresa_nome) || 'Fluxo ERP'; }

// roles: null = visivel para qualquer usuario autenticado
const NAV = [
  { id: 'dashboard', label: 'Início', icon: '⌂', roles: ['admin', 'financeiro'] },
  { id: 'vendas', label: 'Vendas', icon: '$', roles: ['admin', 'vendedor', 'financeiro'] },
  { id: 'consulta', label: 'Consultar Pedido', icon: '📷', roles: ['admin', 'vendedor', 'financeiro'] },
  { id: 'produtos', label: 'Produtos', icon: '▣', roles: ['admin', 'vendedor'] },
  { id: 'clientes', label: 'Clientes', icon: '☺', roles: ['admin', 'vendedor', 'financeiro'] },
  { id: 'estoque', label: 'Estoque', icon: '▤', roles: ['admin', 'vendedor'] },
  { id: 'orcamentos', label: 'Orçamentos', icon: '✎', roles: ['admin', 'vendedor'] },
  { id: 'os', label: 'Ordens de Serviço', icon: '⚙', roles: ['admin', 'vendedor', 'financeiro'] },
  { id: 'producao', label: 'Produção Gráfica', icon: '⎙', roles: ['admin', 'vendedor', 'financeiro'] },
  { id: 'financeiro', label: 'Financeiro', icon: '◈', roles: ['admin', 'financeiro'] },
  { id: 'relatorios', label: 'Relatórios', icon: '▦', roles: ['admin', 'financeiro'] },
  { id: 'usuarios', label: 'Usuários', icon: '⚿', roles: ['admin'] },
  { id: 'funcionarios', label: 'Funcionários', icon: '🧑‍💼', roles: ['admin'] },
  { id: 'logs', label: 'Logs de Auditoria', icon: '🗒', roles: ['admin'] },
  { id: 'configuracoes', label: 'Configurações', icon: '🔧', roles: ['admin'] },
];

const TITLES = {
  dashboard: ['Dashboard', 'Início'],
  vendas: ['Vendas de produtos', 'Início > Vendas'],
  consulta: ['Consultar Pedido', 'Início > Consultar Pedido'],
  produtos: ['Produtos', 'Início > Itens > Produtos'],
  clientes: ['Clientes', 'Início > Cadastros > Clientes'],
  estoque: ['Movimentações de estoque', 'Início > Estoque'],
  orcamentos: ['Orçamentos', 'Início > Orçamentos'],
  os: ['Ordens de Serviço', 'Início > Ordens de serviço'],
  producao: ['Produção Gráfica', 'Início > Produção Gráfica'],
  financeiro: ['Financeiro', 'Início > Financeiro'],
  relatorios: ['Relatórios', 'Início > Relatórios'],
  usuarios: ['Usuários', 'Início > Configurações > Usuários'],
  funcionarios: ['Funcionários', 'Início > Funcionários'],
  logs: ['Logs de Auditoria', 'Início > Configurações > Logs'],
  configuracoes: ['Configurações', 'Início > Configurações'],
};

function isAdmin() { return state.user && state.user.papel === 'admin'; }
function hasRole(...roles) { return state.user && (state.user.papel === 'admin' || roles.includes(state.user.papel)); }

// ---------- API helper ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      ...(opts.headers || {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) { logout(); throw new Error('Sessão expirada'); }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || 'Erro na requisição');
  }
  if (res.status === 204) return null;
  return res.json();
}

const fmtMoney = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
const fmtDateShort = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '-';

// Escape HTML para prevenir XSS em qualquer dado interpolado que vem do banco
// ou da API (nomes de clientes, produtos, descrições, e-mails, etc.). Aplicar
// SOMENTE em valores de dados — nunca em marcação HTML/ícones/classes.
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// Decodifica dados passados com seguranca por atributos onclick. Usamos
// encodeURIComponent(JSON.stringify(...)) ao montar o atributo (escapa aspas,
// <, >, & etc., impossibilitando injeção de código) e aqui fazemos a volta.
// Recebe a string codificada OU (por compatibilidade) um objeto ja pronto.
function unescArgs(encoded) {
  if (encoded && typeof encoded === 'object') return encoded;
  try { return JSON.parse(decodeURIComponent(encoded)); } catch { return {}; }
}

// ---------- Auth ----------
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const senha = document.getElementById('login-senha').value;
  const errBox = document.getElementById('login-error');
  errBox.style.display = 'none';
  try {
    const data = await api('/auth/login', { method: 'POST', body: { email, senha } });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('fluxo_token', state.token);
    localStorage.setItem('fluxo_user', JSON.stringify(state.user));
    boot();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = 'block';
  }
});

document.getElementById('logout-btn').addEventListener('click', logout);
function logout() {
  state.token = null; state.user = null;
  localStorage.removeItem('fluxo_token'); localStorage.removeItem('fluxo_user');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function firstAccessibleRoute() {
  const entry = NAV.find(n => !n.roles || hasRole(...n.roles));
  return entry ? entry.id : 'dashboard';
}

async function boot() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('user-foot').innerHTML = `${esc(state.user.nome)}<div class="sub" style="color:#6E7787;">${esc(papelLabel(state.user.papel))}</div>`;
  renderNav();
  navigate(firstAccessibleRoute());
  try { state.empresa = await api('/configuracoes'); } catch { /* segue com o nome padrao se falhar */ }
}

function papelLabel(p) {
  return { admin: 'Administrador', vendedor: 'Vendedor', financeiro: 'Financeiro' }[p] || p;
}

function renderNav() {
  const nav = document.getElementById('nav');
  const visible = NAV.filter(n => !n.roles || hasRole(...n.roles));
  nav.innerHTML = visible.map(n => `
    <div class="nav-item ${state.route === n.id ? 'active' : ''}" data-route="${n.id}">
      <span class="icon">${n.icon}</span><span>${n.label}</span>
    </div>`).join('');
  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.route));
  });
}

function navigate(route) {
  const navEntry = NAV.find(n => n.id === route);
  if (navEntry && navEntry.roles && !hasRole(...navEntry.roles)) route = firstAccessibleRoute();
  state.route = route;
  renderNav();
  const [title, crumb] = TITLES[route];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-crumb').textContent = crumb;
  const content = document.getElementById('content');
  content.innerHTML = '<div class="empty">Carregando…</div>';
  VIEWS[route]().catch(e => { content.innerHTML = `<div class="empty">Erro: ${esc(e.message)}</div>`; });
}

// ---------- Modal helper ----------
function openModal(title, bodyHtml, onMount, wide) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" style="${wide ? 'max-width:680px;' : ''}">
        <h3>${title}</h3>
        <div id="modal-body">${bodyHtml}</div>
      </div>
    </div>`;
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  if (onMount) onMount(document.getElementById('modal-body'));
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

// ---------- Busca (client-side, usada em todas as listagens) ----------
// Normaliza removendo acentos e caixa, pra "Jose" encontrar "José" etc.
function normalizarBusca(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function searchBoxHtml(id, placeholder) {
  return `<div style="position:relative; width:260px; max-width:100%;">
    <span style="position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--muted); font-size:13px; pointer-events:none;">🔎</span>
    <input type="text" id="${id}" placeholder="${placeholder}" autocomplete="off"
      style="width:100%; padding:8px 12px 8px 32px; border:1px solid var(--line); border-radius:7px; font-size:13px; font-family:'Inter'; background:var(--field-bg); color:var(--ink);">
  </div>`;
}

function badge(text, cls) {
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${text}</span>`;
}
const SITUACAO_VENDA = {
  ENTREGUE_PAGO: ['Entregue | Pago', 'b-green'],
  CONCRETIZADA: ['Venda concretizada', 'b-purple'],
  EM_PRODUCAO: ['Em produção', 'b-blue'],
  PRONTO_ENTREGA: ['Pronto para entrega', 'b-plum'],
  CANCELADA: ['Cancelada', 'b-red'],
};
const SITUACAO_OS = {
  ABERTA: ['Aberta', 'b-blue'],
  EM_ANDAMENTO: ['Em andamento', 'b-amber'],
  CONCLUIDA: ['Concluída', 'b-green'],
  CANCELADA: ['Cancelada', 'b-red'],
};
const SETOR_PRODUCAO = {
  RAPIDA: 'Gráfica Rápida',
  DIGITAL: 'Gráfica Digital',
  OFFSET: 'Gráfica Offset',
};
const SITUACAO_PRODUCAO = SITUACAO_OS; // mesmas situações de OS, reaproveitadas
const SITUACAO_ORCAMENTO = {
  ENVIADO: ['Enviado', 'b-blue'],
  APROVADO: ['Aprovado', 'b-green'],
  RECUSADO: ['Recusado', 'b-red'],
};

// ---------- Mini gráficos em SVG puro (sem dependências externas) ----------
function barChartSVG(data, { color = '#3C7DD9', money = false, height = 170 } = {}) {
  const w = 520, h = height, padL = 40, padB = 28, padT = 10;
  const max = Math.max(1, ...data.map(d => d.value));
  const barW = (w - padL - 10) / data.length;
  const bars = data.map((d, i) => {
    const barH = ((h - padT - padB) * d.value) / max;
    const x = padL + i * barW + barW * 0.15;
    const y = h - padB - barH;
    return `<rect x="${x}" y="${y}" width="${barW * 0.7}" height="${barH}" rx="3" fill="${color}">
      <title>${d.label}: ${money ? fmtMoney(d.value) : d.value}</title>
    </rect>
    <text x="${x + barW * 0.35}" y="${h - padB + 15}" text-anchor="middle" font-size="10.5" fill="#6B7280" font-family="Inter">${d.label}</text>`;
  }).join('');
  const gridLines = [0, 0.5, 1].map(f => {
    const y = padT + (h - padT - padB) * (1 - f);
    const val = max * f;
    return `<line x1="${padL}" y1="${y}" x2="${w - 6}" y2="${y}" stroke="#EEEFEC" stroke-width="1"/>
    <text x="0" y="${y + 4}" font-size="10" fill="#9AA1AC" font-family="JetBrains Mono">${money ? Math.round(val) : val}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px;">${gridLines}${bars}</svg>`;
}

function donutSVG(parts) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 54, cx = 64, cy = 64, sw = 20;
  let acc = 0;
  const circumference = 2 * Math.PI * r;
  const segs = parts.map(p => {
    const frac = p.value / total;
    const dash = circumference * frac;
    const gap = circumference - dash;
    const offset = circumference * (1 - acc);
    acc += frac;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}"
      stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"><title>${p.label}: ${fmtMoney(p.value)}</title></circle>`;
  }).join('');
  return `<svg viewBox="0 0 128 128" style="width:128px; height:128px;">${segs}</svg>`;
}

// =================================================================
// VIEWS
// =================================================================
const VIEWS = {};

// ---------- Dashboard ----------
VIEWS.dashboard = async function () {
  const d = await api('/dashboard');
  const content = document.getElementById('content');

  const situacaoData = Object.entries(d.vendasPorSituacao).map(([k, v]) => ({
    label: (SITUACAO_VENDA[k] ? SITUACAO_VENDA[k][0] : k).split(' ')[0], value: v
  }));
  const diasData = d.vendasPorDia.map(x => ({ label: fmtDateShort(x.data), value: x.total }));

  content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-accent" style="background:var(--amber)"></div>
        <div class="stat-label">Total em vendas (registradas)</div><div class="stat-value">${fmtMoney(d.totalVendasMes)}</div></div>
      <div class="stat-card"><div class="stat-accent" style="background:var(--blue)"></div>
        <div class="stat-label">Nº de vendas</div><div class="stat-value">${d.qtdVendas}</div></div>
      <div class="stat-card"><div class="stat-accent" style="background:var(--green)"></div>
        <div class="stat-label">A receber (pendente)</div><div class="stat-value">${fmtMoney(d.aReceber)}</div></div>
      <div class="stat-card"><div class="stat-accent" style="background:var(--red)"></div>
        <div class="stat-label">A pagar (pendente)</div><div class="stat-value">${fmtMoney(d.aPagar)}</div></div>
    </div>

    <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:16px; margin-bottom:16px;">
      <div class="card">
        <h3 style="margin-top:0;">Vendas nos últimos 7 dias</h3>
        ${barChartSVG(diasData, { color: '#E8A33D', money: true })}
      </div>
      <div class="card" style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <h3 style="margin:0 0 12px 0; align-self:flex-start;">A receber x A pagar</h3>
        ${donutSVG([{ label: 'A receber', value: d.aReceber, color: '#2F9E6E' }, { label: 'A pagar', value: d.aPagar, color: '#D8503A' }])}
        <div style="display:flex; gap:14px; margin-top:10px; font-size:12px;">
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2F9E6E;margin-right:5px;"></span>Receber</span>
          <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D8503A;margin-right:5px;"></span>Pagar</span>
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:16px;">
      <div class="card">
        <h3 style="margin-top:0;">Últimas vendas</h3>
        <table><thead><tr><th>Nº</th><th>Cliente</th><th>Data</th><th>Situação</th><th>Valor</th></tr></thead>
        <tbody>${d.ultimasVendas.map(v => `
          <tr><td>${v.numero}</td><td>${esc(v.cliente ? v.cliente.nome : '-')}</td><td>${fmtDate(v.data)}</td>
          <td>${badge(...(SITUACAO_VENDA[v.situacao] || ['-', '']))}</td><td class="mono">${fmtMoney(v.valor)}</td></tr>
        `).join('') || '<tr><td colspan="5" class="empty">Nenhuma venda ainda</td></tr>'}</tbody></table>
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Estoque baixo</h3>
        ${d.estoqueBaixo.length ? d.estoqueBaixo.map(p => `
          <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">
            <span>${esc(p.nome)}</span><span class="mono" style="color:var(--red)">${p.estoque} un.</span>
          </div>`).join('') : '<div class="empty">Tudo certo por aqui 👍</div>'}
      </div>
    </div>`;
};

// ---------- Clientes ----------
VIEWS.clientes = async function () {
  const clientes = await api('/clientes');
  const content = document.getElementById('content');
  window.__buscaClientes = window.__buscaClientes || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaClientes);
    return clientes.filter(c => !termo || normalizarBusca(`${c.nome} ${c.documento || ''} ${c.telefone || ''} ${c.email || ''}`).includes(termo));
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('clientes-tabela').innerHTML = `
      <table><thead><tr><th>Nome</th><th>Documento</th><th>Contato</th><th>Tipo</th><th></th></tr></thead>
      <tbody>${lista.map(c => `
        <tr><td><b>${esc(c.nome)}</b></td><td class="mono">${esc(c.documento || '-')}</td>
        <td>${esc(c.telefone || '-')}<div class="sub">${esc(c.email || '')}</div></td>
        <td>${esc(c.tipo)}</td>
        <td style="text-align:right;">
          ${isAdmin() ? `<button class="icon-btn btn-ghost" onclick="editCliente(${c.id})">✎</button>
          <button class="icon-btn btn-danger" onclick="deleteRow('clientes', ${c.id}, 'clientes')">✕</button>` : ''}
        </td></tr>`).join('') || `<tr><td colspan="5" class="empty">${window.__buscaClientes ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</td></tr>`}
      </tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-clientes', 'Buscar por nome, documento, contato...')}${hasRole('admin', 'vendedor') ? '<button class="btn btn-amber" id="add-cliente">+ Adicionar</button>' : ''}</div>
    <div class="card" style="padding:0;" id="clientes-tabela"></div>`;
  document.getElementById('busca-clientes').value = window.__buscaClientes;
  document.getElementById('busca-clientes').oninput = (e) => { window.__buscaClientes = e.target.value; renderTabela(); };
  renderTabela();
  if (document.getElementById('add-cliente')) document.getElementById('add-cliente').onclick = () => clienteForm();
};

function clienteForm(c) {
  openModal(c ? 'Editar cliente' : 'Novo cliente', `
    <div class="field"><label>Nome / Razão social</label><input id="f-nome" value="${esc(c?.nome)}"></div>
    <div class="row-2">
      <div class="field"><label>Documento (CPF/CNPJ)</label><input id="f-doc" value="${esc(c?.documento)}"></div>
      <div class="field"><label>Tipo</label><select id="f-tipo"><option value="PF" ${c?.tipo === 'PF' ? 'selected' : ''}>Pessoa física</option><option value="PJ" ${c?.tipo === 'PJ' ? 'selected' : ''}>Pessoa jurídica</option></select></div>
    </div>
    <div class="row-2">
      <div class="field"><label>Telefone</label><input id="f-tel" value="${esc(c?.telefone)}"></div>
      <div class="field"><label>E-mail</label><input id="f-email" value="${esc(c?.email)}"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-cliente">Salvar</button></div>
  `, () => {
    document.getElementById('save-cliente').onclick = async () => {
      const body = {
        nome: document.getElementById('f-nome').value,
        documento: document.getElementById('f-doc').value,
        tipo: document.getElementById('f-tipo').value,
        telefone: document.getElementById('f-tel').value,
        email: document.getElementById('f-email').value,
      };
      await api(c ? `/clientes/${c.id}` : '/clientes', { method: c ? 'PUT' : 'POST', body });
      closeModal(); navigate('clientes');
    };
  });
}
async function editCliente(id) { clienteForm(await api(`/clientes/${id}`)); }

// ---------- Produtos ----------
VIEWS.produtos = async function () {
  const produtos = await api('/produtos');
  const content = document.getElementById('content');
  window.__buscaProdutos = window.__buscaProdutos || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaProdutos);
    return produtos.filter(p => !termo || normalizarBusca(`${p.nome} ${p.codigo || ''} ${p.codigo_barras || ''} ${p.categoria || ''}`).includes(termo));
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('produtos-tabela').innerHTML = `
      <table><thead><tr><th>Produto</th><th>Código</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th></th></tr></thead>
      <tbody>${lista.map(p => `
        <tr><td><b>${esc(p.nome)}</b></td><td class="mono">${esc(p.codigo)}</td><td>${esc(p.categoria || '-')}</td>
        <td class="mono">${fmtMoney(p.preco)}</td>
        <td class="mono" style="color:${p.estoque <= p.estoque_minimo ? 'var(--red)' : 'inherit'}">${p.estoque}</td>
        <td style="text-align:right;">
          ${isAdmin() ? `<button class="icon-btn btn-ghost" onclick="editProduto(${p.id})">✎</button>
          <button class="icon-btn btn-danger" onclick="deleteRow('produtos', ${p.id}, 'produtos')">✕</button>` : ''}
        </td></tr>`).join('') || `<tr><td colspan="6" class="empty">${window.__buscaProdutos ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}</td></tr>`}
      </tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-produtos', 'Buscar por nome, código, categoria...')}${hasRole('admin', 'vendedor') ? '<button class="btn btn-amber" id="add-produto">+ Adicionar</button>' : ''}</div>
    <div class="card" style="padding:0;" id="produtos-tabela"></div>`;
  document.getElementById('busca-produtos').value = window.__buscaProdutos;
  document.getElementById('busca-produtos').oninput = (e) => { window.__buscaProdutos = e.target.value; renderTabela(); };
  renderTabela();
  if (document.getElementById('add-produto')) document.getElementById('add-produto').onclick = () => produtoForm();
};

function produtoForm(p) {
  openModal(p ? 'Editar produto' : 'Novo produto', `
    <div class="field"><label>Nome</label><input id="f-nome" value="${esc(p?.nome)}"></div>
    <div class="row-2">
      <div class="field"><label>Código (SKU interno)</label><input id="f-codigo" value="${esc(p?.codigo)}"></div>
      <div class="field"><label>Categoria</label><input id="f-cat" value="${esc(p?.categoria)}"></div>
    </div>
    <div class="field"><label>Código de barras</label><input id="f-codigo-barras" value="${esc(p?.codigo_barras)}" placeholder="Passe o leitor aqui ou digite manualmente"></div>
    <div class="row-2">
      <div class="field"><label>Preço de venda (R$)</label><input type="number" step="0.01" id="f-preco" value="${p?.preco ?? ''}"></div>
      <div class="field"><label>Custo (R$)</label><input type="number" step="0.01" id="f-custo" value="${p?.custo ?? ''}"></div>
    </div>
    <div class="row-2">
      <div class="field"><label>Estoque atual</label><input type="number" id="f-estoque" value="${p?.estoque ?? 0}"></div>
      <div class="field"><label>Estoque mínimo</label><input type="number" id="f-min" value="${p?.estoque_minimo ?? 0}"></div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-produto">Salvar</button></div>
  `, () => {
    document.getElementById('save-produto').onclick = async () => {
      const body = {
        nome: document.getElementById('f-nome').value,
        codigo: document.getElementById('f-codigo').value,
        codigo_barras: document.getElementById('f-codigo-barras').value.trim(),
        categoria: document.getElementById('f-cat').value,
        preco: parseFloat(document.getElementById('f-preco').value || 0),
        custo: parseFloat(document.getElementById('f-custo').value || 0),
        estoque: parseInt(document.getElementById('f-estoque').value || 0),
        estoque_minimo: parseInt(document.getElementById('f-min').value || 0),
      };
      await api(p ? `/produtos/${p.id}` : '/produtos', { method: p ? 'PUT' : 'POST', body });
      closeModal(); navigate('produtos');
    };
  });
}
async function editProduto(id) { produtoForm(await api(`/produtos/${id}`)); }

// ---------- Impressão (área oculta na própria página, sem pop-ups) ----------
// Pop-ups (window.open) sao bloqueados por muitos navegadores e, quando nao
// bloqueados, o padrao antigo (document.write numa janela nova) e instavel
// entre navegadores. Por isso a impressao usa uma area oculta dentro da
// propria pagina, revelada apenas no modo de impressao via CSS (@media print).
function printDocument(title, bodyHtml) {
  const area = document.getElementById('print-area');
  area.innerHTML = `${bodyHtml}<div class="foot">Documento gerado pelo Fluxo ERP em ${new Date().toLocaleString('pt-BR')}</div>`;
  const prevTitle = document.title;
  document.title = title;
  window.print();
  setTimeout(() => { document.title = prevTitle; }, 800);
}

function printRecibo(v) {
  v = unescArgs(v);
  const itensHtml = (v.itens || []).map(it => `
    <tr><td>${esc(it.produto ? it.produto.nome : 'Item #' + it.produto_id)}</td>
    <td class="mono">${it.quantidade}</td><td class="mono">${fmtMoney(it.preco_unit)}</td>
    <td class="mono">${fmtMoney(it.quantidade * it.preco_unit)}</td></tr>`).join('');
  printDocument('Recibo de venda #' + v.numero, `
    <div class="print-header">
      <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Recibo de venda</div></div>
      <div class="doc-tag"><div class="doc-number">Nº ${v.numero}</div><div class="muted">${fmtDate(v.data)}</div></div>
    </div>
    <div class="field-grid">
      <div class="field-box"><div class="field-label">Cliente</div><div class="field-value">${esc(v.cliente ? v.cliente.nome : '-')}</div></div>
      <div class="field-box"><div class="field-label">Documento</div><div class="field-value">${esc(v.cliente && v.cliente.documento ? v.cliente.documento : '-')}</div></div>
      <div class="field-box"><div class="field-label">Segmento</div><div class="field-value">${esc(SETOR_PRODUCAO[v.segmento] || v.segmento || '-')}</div></div>
      <div class="field-box"><div class="field-label">Situação</div><div class="field-value">${(SITUACAO_VENDA[v.situacao] || ['-'])[0]}</div></div>
    </div>
    <div class="section-title">Itens</div>
    <table><thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th></tr></thead><tbody>${itensHtml || '<tr><td colspan="4" class="muted">Sem itens detalhados</td></tr>'}</tbody></table>
    <div class="total-box"><div class="total-inner"><div class="total-label">Total</div><div class="total-value">${fmtMoney(v.valor)}</div></div></div>`);
}

// Cupom de acompanhamento: formato estreito (tipo impressora térmica/fiscal,
// 80mm), com CÓDIGO DE BARRAS (pro operador escanear no balcão e ver o
// status na hora) e QR Code (pro cliente escanear com o celular e consultar
// sozinho, inclusive pelo WhatsApp). O código de barras é gerado aqui no
// navegador mesmo (biblioteca JsBarcode, incluída localmente em
// public/js/vendor — não depende de internet nem do servidor pra isso).
async function emitirCupom(vendaId) {
  const [venda, cupom] = await Promise.all([api(`/vendas/${vendaId}`), api(`/vendas/${vendaId}/cupom`)]);
  printCupom(venda, cupom);
}

function barcodeSVG(numero) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, String(numero), { format: 'CODE128', width: 2, height: 45, displayValue: true, fontSize: 13, margin: 8 });
  return svg.outerHTML;
}

function printCupom(v, cupom) {
  const itensHtml = (v.itens || []).map(it => `
    <div class="cupom-item"><span>${it.quantidade}x ${esc(it.produto ? it.produto.nome : 'Item')}</span><span class="mono">${fmtMoney(it.quantidade * it.preco_unit)}</span></div>`).join('');

  printDocument('Cupom - Pedido #' + v.numero, `
    <div class="cupom">
      <div class="cupom-center"><b>${esc(nomeEmpresa().toUpperCase())}</b></div>
      <div class="cupom-center cupom-muted">Comprovante de Pedido</div>
      <div class="cupom-hr"></div>
      <div class="cupom-linha"><span>Pedido</span><b>#${v.numero}</b></div>
      <div class="cupom-linha"><span>Data</span><span>${fmtDate(v.data)}</span></div>
      <div class="cupom-linha"><span>Cliente</span><span>${esc(v.cliente ? v.cliente.nome : '-')}</span></div>
      <div class="cupom-linha"><span>Situação</span><span>${(SITUACAO_VENDA[v.situacao] || ['-'])[0]}</span></div>
      <div class="cupom-hr"></div>
      ${itensHtml}
      <div class="cupom-hr"></div>
      <div class="cupom-linha cupom-total"><span>TOTAL</span><span>${fmtMoney(v.valor)}</span></div>
      <div class="cupom-hr"></div>
      <div class="cupom-center">${barcodeSVG(v.numero)}</div>
      <div class="cupom-center cupom-muted">Guarde este cupom — apresente ou escaneie</div>
      <div class="cupom-center cupom-muted">o código de barras pra consultar o pedido</div>
      <div class="cupom-hr"></div>
      <div class="cupom-center"><img src="${cupom.qrDataUrl}" style="width:130px; height:130px;"></div>
      <div class="cupom-center cupom-muted" style="margin-top:6px;">ou aponte a câmera do celular aqui</div>
      <div class="cupom-center cupom-muted">pra consultar direto pelo WhatsApp</div>
      <div class="cupom-hr"></div>
    </div>`);
}

function printOS(o, cliente) {
  o = unescArgs(o); cliente = unescArgs(cliente) || null;
  printDocument('Ordem de Serviço #' + o.numero, `
    <div class="print-header">
      <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Ordem de Serviço</div></div>
      <div class="doc-tag"><div class="doc-number">OS Nº ${o.numero}</div><div class="muted">Abertura: ${fmtDate(o.data_abertura)}</div></div>
    </div>
    <div class="field-grid">
      <div class="field-box"><div class="field-label">Cliente</div><div class="field-value">${esc(cliente ? cliente.nome : '-')}</div></div>
      <div class="field-box"><div class="field-label">Telefone</div><div class="field-value">${esc(cliente && cliente.telefone ? cliente.telefone : '-')}</div></div>
      <div class="field-box"><div class="field-label">Situação</div><div class="field-value">${(SITUACAO_OS[o.situacao] || ['-'])[0]}</div></div>
    </div>
    <div class="section-title">Descrição do serviço</div>
    <p style="margin-top:0;">${esc(o.descricao || '-')}</p>
    <div class="total-box"><div class="total-inner"><div class="total-label">Valor</div><div class="total-value">${fmtMoney(o.valor)}</div></div></div>
    <div class="signature-row">
      <div class="signature-line">Assinatura do responsável</div>
      <div class="signature-line">Assinatura do cliente</div>
    </div>`);
}

// ---------- Consultar Pedido (leitor de balcao) ----------
// Tela pra escanear o codigo de barras (ou QR Code) impresso no cupom do
// cliente e ver na hora se o pedido ja esta pronto, em producao, pago etc.
// Aceita tanto o numero puro (do codigo de barras) quanto a URL completa
// (do QR Code, que aponta pra /rastreio.html?numero=XXXXX) — extrai o
// numero de qualquer um dos dois formatos automaticamente.
VIEWS.consulta = async function () {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card" style="max-width:480px; margin: 0 auto 20px auto; text-align:center;">
      <div style="font-size:34px; margin-bottom:6px;">📷</div>
      <h3 style="margin:0 0 4px 0;">Escaneie o pedido do cliente</h3>
      <div class="sub">Código de barras ou QR Code impresso no cupom</div>
      <input id="consulta-input" autocomplete="off" placeholder="Clique aqui e escaneie, ou digite o número + Enter"
        style="width:100%; margin-top:16px; padding:14px 16px; border:1px solid var(--line); border-radius:8px; font-size:16px; text-align:center; font-family:'JetBrains Mono';">
      <div id="consulta-erro" class="login-error" style="display:none; margin-top:12px;"></div>
    </div>
    <div id="consulta-resultado"></div>`;

  const input = document.getElementById('consulta-input');
  input.focus();

  function extrairNumero(valor) {
    const v = valor.trim();
    if (!v) return null;
    const match = v.match(/numero=(\d+)/); // veio do link do QR Code
    if (match) return match[1];
    const digitos = v.match(/\d+/); // codigo de barras (so numeros) ou numero digitado direto
    return digitos ? digitos[0] : null;
  }

  async function buscar() {
    const erroBox = document.getElementById('consulta-erro');
    const resultado = document.getElementById('consulta-resultado');
    erroBox.style.display = 'none';
    const numero = extrairNumero(input.value);
    input.value = '';
    if (!numero) return;

    try {
      const v = await api(`/vendas/buscar/${numero}`);
      renderResultadoConsulta(v);
    } catch (e) {
      resultado.innerHTML = '';
      erroBox.textContent = e.message;
      erroBox.style.display = 'block';
    }
    input.focus();
  }

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
};

function renderResultadoConsulta(v) {
  const resultado = document.getElementById('consulta-resultado');
  const itensHtml = (v.itens || []).map(it => `
    <tr><td>${esc(it.produto ? it.produto.nome : 'Item #' + it.produto_id)}</td>
    <td class="mono">${it.quantidade}</td><td class="mono">${fmtMoney(it.preco_unit)}</td>
    <td class="mono">${fmtMoney(it.quantidade * it.preco_unit)}</td></tr>`).join('');

  const pago = v.financeiro ? v.financeiro.situacao === 'PAGO' : v.situacao === 'ENTREGUE_PAGO';
  const valorPago = v.financeiro ? Number(v.financeiro.valor_pago || 0) : (v.situacao === 'ENTREGUE_PAGO' ? Number(v.valor) : 0);
  const saldo = Math.max(0, Number(v.valor) - valorPago);

  resultado.innerHTML = `
    <div class="card" style="max-width:600px; margin: 0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
        <div>
          <h3 style="margin:0;">Pedido #${v.numero}</h3>
          <div class="sub">${fmtDate(v.data)} · ${esc(v.cliente ? v.cliente.nome : '-')}</div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          ${badge(...(SITUACAO_VENDA[v.situacao] || [esc(v.situacao), 'b-blue']))}
          ${v.producao ? badge(...(SITUACAO_PRODUCAO[v.producao.situacao] || [esc(v.producao.situacao), 'b-blue'])) : ''}
          ${pago ? badge('Pago', 'b-green') : badge('Pagamento pendente', 'b-amber')}
        </div>
      </div>

      <div class="row-2" style="margin-top:16px;">
        <div><div class="sub">Segmento</div><b>${esc(SETOR_PRODUCAO[v.segmento] || v.segmento || '-')}</b></div>
        <div><div class="sub">Vendedor</div><b>${esc(v.vendedor ? v.vendedor.nome : '-')}</b></div>
      </div>

      <div class="row-2" style="margin-top:16px;">
        <div><div class="sub">Saldo em aberto</div><b style="color:${saldo > 0 ? 'var(--red)' : 'var(--green)'}">${saldo > 0 ? fmtMoney(saldo) : 'Quitado'}</b></div>
        <div></div>
      </div>

      <table style="margin-top:16px;"><thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${itensHtml || '<tr><td colspan="4" class="empty">Sem itens detalhados</td></tr>'}</tbody></table>
      <div class="total-line">Total: ${fmtMoney(v.valor)}</div>

      <div class="modal-actions" style="justify-content:flex-start; margin-top:18px;">
        <button class="btn btn-ghost" onclick='viewVenda(encodeURIComponent(JSON.stringify(v)))'>👁 Ver venda completa</button>
        <button class="btn btn-ghost" onclick="emitirCupom(${v.id})">🎫 Reimprimir cupom</button>
      </div>
    </div>`;
}

// ---------- Vendas ----------
VIEWS.vendas = async function () {
  const vendas = await api('/vendas');
  const content = document.getElementById('content');
  window.__buscaVendas = window.__buscaVendas || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaVendas);
    return vendas.slice().reverse().filter(v => {
      if (!termo) return true;
      const situacaoLabel = (SITUACAO_VENDA[v.situacao] || ['', ''])[0];
      const segmentoLabel = SETOR_PRODUCAO[v.segmento] || v.segmento || '';
      return normalizarBusca(`${v.numero} ${v.cliente ? v.cliente.nome : ''} ${segmentoLabel} ${situacaoLabel}`).includes(termo);
    });
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('vendas-tabela').innerHTML = `
      <table><thead><tr><th>Nº</th><th>Cliente</th><th>Segmento</th><th>Data</th><th>Situação</th><th>Valor</th><th></th></tr></thead>
      <tbody>${lista.map(v => `
        <tr><td class="mono">${v.numero}</td><td>${esc(v.cliente ? v.cliente.nome : '-')}</td>
        <td>${v.segmento ? badge(esc(SETOR_PRODUCAO[v.segmento] || v.segmento), 'b-purple') : '-'}</td>
        <td>${fmtDate(v.data)}</td>
        <td>${badge(...(SITUACAO_VENDA[v.situacao] || ['-', '']))}</td>
        <td class="mono">${fmtMoney(v.valor)}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="icon-btn btn-ghost" title="Visualizar" onclick='viewVenda(encodeURIComponent(JSON.stringify(v)))'>👁</button>
          <button class="icon-btn btn-ghost" title="Imprimir recibo" onclick='printRecibo(encodeURIComponent(JSON.stringify(v)))'>🖶</button>
          <button class="icon-btn btn-ghost" title="Emitir cupom de acompanhamento" onclick="emitirCupom(${v.id})">🎫</button>
          ${isAdmin() ? `<select onchange="updateSituacaoVenda(${v.id}, this.value)" class="btn-sm" style="border:1px solid var(--line); border-radius:6px;">
            ${Object.entries(SITUACAO_VENDA).map(([k, val]) => `<option value="${k}" ${v.situacao === k ? 'selected' : ''}>${val[0]}</option>`).join('')}
          </select>
          <button class="icon-btn btn-danger" onclick="deleteRow('vendas', ${v.id}, 'vendas')">✕</button>` : ''}
        </td></tr>`).join('') || `<tr><td colspan="7" class="empty">${window.__buscaVendas ? 'Nenhuma venda encontrada' : 'Nenhuma venda registrada'}</td></tr>`}
      </tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-vendas', 'Buscar por nº, cliente, segmento, situação...')}${hasRole('admin', 'vendedor') ? '<button class="btn btn-amber" id="add-venda">+ Adicionar</button>' : ''}</div>
    <div class="card" style="padding:0;" id="vendas-tabela"></div>`;
  document.getElementById('busca-vendas').value = window.__buscaVendas;
  document.getElementById('busca-vendas').oninput = (e) => { window.__buscaVendas = e.target.value; renderTabela(); };
  renderTabela();
  if (document.getElementById('add-venda')) document.getElementById('add-venda').onclick = () => vendaForm();
};

function viewVenda(v) {
  v = unescArgs(v);
  const itensHtml = (v.itens || []).map(it => `
    <tr><td>${esc(it.produto ? it.produto.nome : 'Item #' + it.produto_id)}</td>
    <td class="mono">${it.quantidade}</td><td class="mono">${fmtMoney(it.preco_unit)}</td>
    <td class="mono">${fmtMoney(it.quantidade * it.preco_unit)}</td></tr>`).join('');
  openModal('Venda #' + v.numero, `
    <div class="row-2">
      <div><div class="sub">Cliente</div><b>${esc(v.cliente ? v.cliente.nome : '-')}</b></div>
      <div><div class="sub">Data</div><b>${fmtDate(v.data)}</b></div>
    </div>
    <div class="row-2" style="margin-top:10px;">
      <div><div class="sub">Vendedor</div><b>${esc(v.vendedor ? v.vendedor.nome : '-')}</b></div>
      <div></div>
    </div>
    <div style="margin-top:10px; display:flex; gap:8px;">${badge(...(SITUACAO_VENDA[v.situacao] || ['-', '']))}${v.segmento ? badge(esc(SETOR_PRODUCAO[v.segmento] || v.segmento), 'b-purple') : ''}</div>
    <table style="margin-top:14px;"><thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th></tr></thead>
    <tbody>${itensHtml || '<tr><td colspan="4" class="empty">Sem itens detalhados</td></tr>'}</tbody></table>
    <div class="total-line">Total: ${fmtMoney(v.valor)}</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
    <button class="btn btn-ghost" onclick="emitirCupom(${v.id})">🎫 Emitir cupom</button>
    <button class="btn btn-primary" onclick='printRecibo(encodeURIComponent(JSON.stringify(v)))'>🖶 Imprimir recibo</button></div>
  `);
}

async function updateSituacaoVenda(id, situacao) {
  await api(`/vendas/${id}/situacao`, { method: 'PUT', body: { situacao } });
  navigate('vendas');
}

async function vendaForm() {
  const [clientes, produtos] = await Promise.all([api('/clientes'), api('/produtos')]);
  let itens = [];

  function itemsHtml() {
    if (itens.length === 0) return '<div class="empty" style="padding:16px 0;">Nenhum item ainda — escaneie um código de barras ou clique em "+ Adicionar item".</div>';
    return itens.map((it, idx) => {
      const prod = produtos.find(p => p.id === Number(it.produto_id));
      const subtotal = prod ? prod.preco * it.quantidade : 0;
      return `<div class="item-row">
        <select onchange="window.__vendaItens[${idx}].produto_id=this.value; window.__renderVendaForm()">
          ${produtos.map(p => `<option value="${p.id}" ${Number(it.produto_id) === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${it.quantidade}" onchange="window.__vendaItens[${idx}].quantidade=parseInt(this.value||1); window.__renderVendaForm()">
        <div class="mono" style="text-align:right;">${fmtMoney(subtotal)}</div>
        <button class="icon-btn btn-danger" onclick="window.__vendaItens.splice(${idx},1); window.__renderVendaForm()">✕</button>
      </div>`;
    }).join('');
  }

  function totalVenda() {
    return itens.reduce((s, it) => {
      const prod = produtos.find(p => p.id === Number(it.produto_id));
      return s + (prod ? prod.preco * it.quantidade : 0);
    }, 0);
  }

  window.__vendaItens = itens;
  window.__renderVendaForm = () => {
    itens = window.__vendaItens;
    document.getElementById('items-wrap').innerHTML = itemsHtml();
    document.getElementById('venda-total').textContent = fmtMoney(totalVenda());
  };

  // Leitor de codigo de barras: a maioria dos leitores funciona como um
  // teclado — "digitam" o codigo rapidinho e mandam Enter no final. Por
  // isso basta um campo de texto normal escutando o Enter, sem precisar de
  // nenhuma biblioteca ou hardware especial.
  window.__scanBarcode = () => {
    const input = document.getElementById('scan-input');
    const termo = input.value.trim();
    const msg = document.getElementById('scan-msg');
    input.value = '';
    if (!termo) return;

    const prod = produtos.find(p => (p.codigo_barras && p.codigo_barras === termo) || (p.codigo && p.codigo === termo));
    if (!prod) {
      msg.textContent = `Nenhum produto encontrado com o código "${termo}".`;
      msg.style.color = 'var(--red)';
      input.focus();
      return;
    }
    const existente = window.__vendaItens.find(it => Number(it.produto_id) === prod.id);
    if (existente) existente.quantidade = (Number(existente.quantidade) || 0) + 1;
    else window.__vendaItens.push({ produto_id: prod.id, quantidade: 1 });
    msg.textContent = `✓ ${prod.nome} adicionado`;
    msg.style.color = 'var(--green)';
    window.__renderVendaForm();
    input.focus();
  };

  openModal('Nova venda', `
    <div class="row-2">
      <div class="field"><label>Cliente</label><select id="f-cliente">${clientes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Data</label><input type="date" id="f-data" value="${new Date().toISOString().slice(0, 10)}"></div>
    </div>
    <div class="field"><label>Segmento</label><select id="f-segmento">${Object.entries(SETOR_PRODUCAO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>

    <div class="field">
      <label>📷 Leitor de código de barras</label>
      <input id="scan-input" placeholder="Clique aqui e escaneie, ou digite o código + Enter" autocomplete="off">
      <div id="scan-msg" class="sub" style="margin-top:4px;"></div>
    </div>

    <label style="font-size:12.5px; font-weight:600; color:var(--ink);">Itens</label>
    <div id="items-wrap" style="margin-top:8px;">${itemsHtml()}</div>
    <button class="btn btn-ghost btn-sm" id="add-item" style="margin-top:6px;">+ Adicionar item</button>
    <div class="total-line">Total: <span id="venda-total">${fmtMoney(totalVenda())}</span></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-venda">Salvar venda</button></div>
  `, () => {
    const scanInput = document.getElementById('scan-input');
    scanInput.focus();
    scanInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); window.__scanBarcode(); } });

    document.getElementById('add-item').onclick = () => {
      window.__vendaItens.push({ produto_id: produtos[0]?.id || '', quantidade: 1 });
      window.__renderVendaForm();
    };
    document.getElementById('save-venda').onclick = async () => {
      if (window.__vendaItens.length === 0) { alert('Adicione pelo menos um item à venda.'); return; }
      const cliente_id = parseInt(document.getElementById('f-cliente').value);
      const data = document.getElementById('f-data').value;
      const segmento = document.getElementById('f-segmento').value;
      const body = {
        cliente_id, data, segmento, situacao: 'EM_PRODUCAO',
        itens: window.__vendaItens.map(it => {
          const prod = produtos.find(p => p.id === Number(it.produto_id));
          return { produto_id: Number(it.produto_id), quantidade: it.quantidade, preco_unit: prod?.preco || 0 };
        })
      };
      await api('/vendas', { method: 'POST', body });
      closeModal(); navigate('vendas');
    };
  });
}

// ---------- Estoque ----------
VIEWS.estoque = async function () {
  const [movs, produtos] = await Promise.all([api('/estoque_movimentos'), api('/produtos')]);
  const content = document.getElementById('content');
  window.__buscaEstoque = window.__buscaEstoque || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaEstoque);
    return movs.slice().reverse().filter(m => {
      if (!termo) return true;
      const prod = produtos.find(p => p.id === m.produto_id);
      return normalizarBusca(`${prod ? prod.nome : ''} ${m.motivo || ''}`).includes(termo);
    });
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('estoque-tabela').innerHTML = `
      <table><thead><tr><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Motivo</th><th>Data</th></tr></thead>
      <tbody>${lista.map(m => {
        const prod = produtos.find(p => p.id === m.produto_id);
        return `<tr><td>${esc(prod ? prod.nome : '-')}</td>
        <td>${m.tipo === 'ENTRADA' ? badge('Entrada', 'b-green') : badge('Saída', 'b-red')}</td>
        <td class="mono">${m.quantidade}</td><td>${esc(m.motivo || '-')}</td><td>${fmtDate(m.data)}</td></tr>`;
      }).join('') || `<tr><td colspan="5" class="empty">${window.__buscaEstoque ? 'Nenhuma movimentação encontrada' : 'Nenhuma movimentação registrada'}</td></tr>`}</tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-estoque', 'Buscar por produto ou motivo...')}<button class="btn btn-amber" id="add-mov">+ Registrar movimentação</button></div>
    <div class="card" style="padding:0;" id="estoque-tabela"></div>`;
  document.getElementById('busca-estoque').value = window.__buscaEstoque;
  document.getElementById('busca-estoque').oninput = (e) => { window.__buscaEstoque = e.target.value; renderTabela(); };
  renderTabela();
  document.getElementById('add-mov').onclick = () => {
    openModal('Nova movimentação de estoque', `
      <div class="field"><label>📷 Leitor de código de barras (opcional)</label>
        <input id="scan-estoque" placeholder="Escaneie o produto ou digite o código + Enter" autocomplete="off">
        <div id="scan-estoque-msg" class="sub" style="margin-top:4px;"></div>
      </div>
      <div class="field"><label>Produto</label><select id="f-produto">${produtos.map(p => `<option value="${p.id}">${esc(p.nome)} (estoque: ${p.estoque})</option>`).join('')}</select></div>
      <div class="row-2">
        <div class="field"><label>Tipo</label><select id="f-tipo"><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></div>
        <div class="field"><label>Quantidade</label><input type="number" min="1" id="f-qtd" value="1"></div>
      </div>
      <div class="field"><label>Motivo</label><input id="f-motivo" placeholder="Ex: Compra fornecedor, ajuste de inventário..."></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-mov">Registrar</button></div>
    `, () => {
      const scanInput = document.getElementById('scan-estoque');
      scanInput.focus();
      scanInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const termo = scanInput.value.trim();
        const msg = document.getElementById('scan-estoque-msg');
        scanInput.value = '';
        if (!termo) return;
        const prod = produtos.find(p => (p.codigo_barras && p.codigo_barras === termo) || (p.codigo && p.codigo === termo));
        if (!prod) {
          msg.textContent = `Nenhum produto encontrado com o código "${termo}".`;
          msg.style.color = 'var(--red)';
        } else {
          document.getElementById('f-produto').value = prod.id;
          msg.textContent = `✓ ${prod.nome} selecionado`;
          msg.style.color = 'var(--green)';
        }
        scanInput.focus();
      });

      document.getElementById('save-mov').onclick = async () => {
        const body = {
          produto_id: parseInt(document.getElementById('f-produto').value),
          tipo: document.getElementById('f-tipo').value,
          quantidade: parseInt(document.getElementById('f-qtd').value || 1),
          motivo: document.getElementById('f-motivo').value,
          data: new Date().toISOString().slice(0, 10)
        };
        await api('/estoque_movimentos', { method: 'POST', body });
        closeModal(); navigate('estoque');
      };
    });
  };
};

// ---------- Orcamentos ----------
VIEWS.orcamentos = async function () {
  const orcamentos = await api('/orcamentos');
  const content = document.getElementById('content');
  window.__buscaOrcamentos = window.__buscaOrcamentos || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaOrcamentos);
    return orcamentos.slice().reverse().filter(o => {
      if (!termo) return true;
      const situacaoLabel = (SITUACAO_ORCAMENTO[o.situacao] || [o.situacao])[0];
      const segmentoLabel = SETOR_PRODUCAO[o.segmento] || o.segmento || '';
      return normalizarBusca(`${o.numero} ${o.cliente ? o.cliente.nome : ''} ${segmentoLabel} ${situacaoLabel}`).includes(termo);
    });
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('orcamentos-tabela').innerHTML = `
      <table><thead><tr><th>Nº</th><th>Cliente</th><th>Segmento</th><th>Data</th><th>Validade</th><th>Situação</th><th>Valor</th><th></th></tr></thead>
      <tbody>${lista.map(o => `
        <tr><td class="mono">${o.numero}</td><td>${esc(o.cliente ? o.cliente.nome : '-')}</td>
        <td>${o.segmento ? badge(esc(SETOR_PRODUCAO[o.segmento] || o.segmento), 'b-purple') : '-'}</td>
        <td>${fmtDate(o.data)}</td><td>${fmtDate(o.validade)}</td>
        <td>${badge(...(SITUACAO_ORCAMENTO[o.situacao] || [esc(o.situacao), 'b-blue']))}
          ${o.venda_id ? `<div class="sub" style="color:var(--green);">→ Venda #${o.venda_numero || ''} gerada</div>` : ''}</td>
        <td class="mono">${fmtMoney(o.valor)}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="icon-btn btn-ghost" title="Imprimir orçamento" onclick='printOrcamento(encodeURIComponent(JSON.stringify(o)))'>🖶</button>
          ${hasRole('admin', 'vendedor') && !o.venda_id ? `<select onchange="updateSituacaoOrcamento(${o.id}, this.value)" class="btn-sm" style="border:1px solid var(--line); border-radius:6px;">
            ${Object.entries(SITUACAO_ORCAMENTO).map(([k, val]) => `<option value="${k}" ${o.situacao === k ? 'selected' : ''}>${val[0]}</option>`).join('')}
          </select>` : ''}
          ${isAdmin() ? `<button class="icon-btn btn-ghost" onclick="editOrcamento(${o.id})">✎</button>
          <button class="icon-btn btn-danger" onclick="deleteRow('orcamentos', ${o.id}, 'orcamentos')">✕</button>` : ''}
        </td></tr>`).join('') || `<tr><td colspan="8" class="empty">${window.__buscaOrcamentos ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento registrado'}</td></tr>`}
      </tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-orcamentos', 'Buscar por nº, cliente, segmento, situação...')}${hasRole('admin', 'vendedor') ? '<button class="btn btn-amber" id="add-orc">+ Adicionar</button>' : ''}</div>
    <div class="card" style="padding:0;" id="orcamentos-tabela"></div>`;
  document.getElementById('busca-orcamentos').value = window.__buscaOrcamentos;
  document.getElementById('busca-orcamentos').oninput = (e) => { window.__buscaOrcamentos = e.target.value; renderTabela(); };
  renderTabela();
  if (document.getElementById('add-orc')) document.getElementById('add-orc').onclick = () => orcamentoForm();
};

// Impressão do orçamento — pra entregar impresso no balcão, anexar num
// e-mail ou mandar por WhatsApp (o PDF do navegador, ao "imprimir" e
// escolher "Salvar como PDF", já serve pra isso).
function printOrcamento(o) {
  o = unescArgs(o);
  const itensHtml = (o.itens || []).map(it => {
    const subtotal = Number(it.quantidade) * Number(it.preco_unit);
    return `<tr><td>${esc(it.produto ? it.produto.nome : 'Item #' + it.produto_id)}</td>
    <td class="mono">${it.quantidade}</td><td class="mono">${fmtMoney(it.preco_unit)}</td>
    <td class="mono">${fmtMoney(subtotal)}</td></tr>`;
  }).join('');

  printDocument('Orçamento #' + o.numero, `
    <div class="print-header">
      <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Orçamento</div></div>
      <div class="doc-tag"><div class="doc-number">Nº ${o.numero}</div><div class="muted">${fmtDate(o.data)}</div></div>
    </div>
    <div class="field-grid">
      <div class="field-box"><div class="field-label">Cliente</div><div class="field-value">${esc(o.cliente ? o.cliente.nome : '-')}</div></div>
      <div class="field-box"><div class="field-label">Segmento</div><div class="field-value">${esc(SETOR_PRODUCAO[o.segmento] || o.segmento || '-')}</div></div>
      <div class="field-box"><div class="field-label">Válido até</div><div class="field-value">${fmtDate(o.validade)}</div></div>
    </div>
    <div class="section-title">Itens</div>
    <table><thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th></tr></thead>
    <tbody>${itensHtml || '<tr><td colspan="4" class="muted">Sem itens detalhados</td></tr>'}</tbody></table>
    <div class="total-box"><div class="total-inner"><div class="total-label">Total</div><div class="total-value">${fmtMoney(o.valor)}</div></div></div>
    <div class="sub" style="margin-top:18px; font-size:11.5px; color:#6B7280;">Orçamento sujeito a alteração após a data de validade indicada acima.</div>`);
}

async function updateSituacaoOrcamento(id, situacao) {
  await api(`/orcamentos/${id}/situacao`, { method: 'PUT', body: { situacao } });
  navigate('orcamentos');
}

async function editOrcamento(id) {
  orcamentoForm(await api(`/orcamentos/${id}`));
}

async function orcamentoForm(existing) {
  const [clientes, produtos] = await Promise.all([api('/clientes'), api('/produtos')]);
  window.__orcItens = existing && existing.itens.length
    ? existing.itens.map(it => ({ produto_id: it.produto_id, quantidade: it.quantidade }))
    : [{ produto_id: produtos[0]?.id || '', quantidade: 1 }];

  function itemsHtml() {
    return window.__orcItens.map((it, idx) => {
      const prod = produtos.find(p => p.id === Number(it.produto_id));
      return `<div class="item-row">
        <select onchange="window.__orcItens[${idx}].produto_id=this.value; window.__renderOrcForm()">
          ${produtos.map(p => `<option value="${p.id}" ${Number(it.produto_id) === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        </select>
        <input type="number" min="1" value="${it.quantidade}" onchange="window.__orcItens[${idx}].quantidade=parseInt(this.value||1); window.__renderOrcForm()">
        <div class="mono" style="text-align:right;">${fmtMoney(prod ? prod.preco * it.quantidade : 0)}</div>
        <button class="icon-btn btn-danger" onclick="window.__orcItens.splice(${idx},1); window.__renderOrcForm()">✕</button>
      </div>`;
    }).join('');
  }
  function total() { return window.__orcItens.reduce((s, it) => { const p = produtos.find(x => x.id === Number(it.produto_id)); return s + (p ? p.preco * it.quantidade : 0); }, 0); }
  window.__renderOrcForm = () => {
    document.getElementById('orc-items-wrap').innerHTML = itemsHtml();
    document.getElementById('orc-total').textContent = fmtMoney(total());
  };

  openModal(existing ? `Editar orçamento #${existing.numero}` : 'Novo orçamento', `
    <div class="row-2">
      <div class="field"><label>Cliente</label><select id="f-cliente">${clientes.map(c => `<option value="${c.id}" ${existing?.cliente_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Validade</label><input type="date" id="f-validade" value="${existing?.validade || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)}"></div>
    </div>
    <div class="field"><label>Segmento</label><select id="f-segmento">${Object.entries(SETOR_PRODUCAO).map(([k, v]) => `<option value="${k}" ${existing?.segmento === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <label style="font-size:12.5px; font-weight:600; color:var(--ink);">Itens</label>
    <div id="orc-items-wrap" style="margin-top:8px;">${itemsHtml()}</div>
    <button class="btn btn-ghost btn-sm" id="add-item" style="margin-top:6px;">+ Adicionar item</button>
    <div class="total-line">Total: <span id="orc-total">${fmtMoney(total())}</span></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-orc">Salvar orçamento</button></div>
  `, () => {
    document.getElementById('add-item').onclick = () => { window.__orcItens.push({ produto_id: produtos[0]?.id || '', quantidade: 1 }); window.__renderOrcForm(); };
    document.getElementById('save-orc').onclick = async () => {
      const body = {
        cliente_id: parseInt(document.getElementById('f-cliente').value),
        data: existing?.data || new Date().toISOString().slice(0, 10),
        validade: document.getElementById('f-validade').value,
        segmento: document.getElementById('f-segmento').value,
        situacao: existing?.situacao || 'ENVIADO',
        itens: window.__orcItens.map(it => {
          const p = produtos.find(x => x.id === Number(it.produto_id));
          return { produto_id: Number(it.produto_id), quantidade: it.quantidade, preco_unit: p?.preco || 0 };
        })
      };
      await api(existing ? `/orcamentos/${existing.id}` : '/orcamentos', { method: existing ? 'PUT' : 'POST', body });
      closeModal(); navigate('orcamentos');
    };
  });
}

// ---------- Ordens de Serviço ----------
VIEWS.os = async function () {
  const [ordens, clientes] = await Promise.all([api('/ordens_servico'), api('/clientes')]);
  const content = document.getElementById('content');
  window.__buscaOS = window.__buscaOS || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaOS);
    return ordens.slice().reverse().filter(o => {
      if (!termo) return true;
      const c = clientes.find(x => x.id === o.cliente_id);
      const situacaoLabel = (SITUACAO_OS[o.situacao] || [''])[0];
      return normalizarBusca(`${o.numero} ${c ? c.nome : ''} ${o.descricao || ''} ${situacaoLabel}`).includes(termo);
    });
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('os-tabela').innerHTML = `
      <table><thead><tr><th>Nº</th><th>Cliente</th><th>Descrição</th><th>Abertura</th><th>Situação</th><th>Valor</th><th></th></tr></thead>
      <tbody>${lista.map(o => {
        const c = clientes.find(x => x.id === o.cliente_id);
        return `<tr><td class="mono">${o.numero}</td><td>${esc(c ? c.nome : '-')}</td><td>${esc(o.descricao)}</td>
        <td>${fmtDate(o.data_abertura)}</td>
        <td>${badge(...(SITUACAO_OS[o.situacao] || ['-', '']))}</td>
        <td class="mono">${fmtMoney(o.valor)}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="icon-btn btn-ghost" title="Visualizar" onclick='viewOS(encodeURIComponent(JSON.stringify(o)), encodeURIComponent(JSON.stringify(c || {})))'>👁</button>
          <button class="icon-btn btn-ghost" title="Imprimir OS" onclick='printOS(encodeURIComponent(JSON.stringify(o)), encodeURIComponent(JSON.stringify(c || {})))'>🖶</button>
          ${hasRole('admin', 'vendedor') ? `<select onchange="updateSituacaoOS(${o.id}, this.value)" class="btn-sm" style="border:1px solid var(--line); border-radius:6px;">
            ${Object.entries(SITUACAO_OS).map(([k, val]) => `<option value="${k}" ${o.situacao === k ? 'selected' : ''}>${val[0]}</option>`).join('')}
          </select>` : ''}
          ${isAdmin() ? `<button class="icon-btn btn-danger" onclick="deleteRow('ordens_servico', ${o.id}, 'os')">✕</button>` : ''}
        </td></tr>`;
      }).join('') || `<tr><td colspan="7" class="empty">${window.__buscaOS ? 'Nenhuma ordem de serviço encontrada' : 'Nenhuma ordem de serviço registrada'}</td></tr>`}</tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-os', 'Buscar por nº, cliente, descrição, situação...')}${hasRole('admin', 'vendedor') ? '<button class="btn btn-amber" id="add-os">+ Adicionar</button>' : ''}</div>
    <div class="card" style="padding:0;" id="os-tabela"></div>`;
  document.getElementById('busca-os').value = window.__buscaOS;
  document.getElementById('busca-os').oninput = (e) => { window.__buscaOS = e.target.value; renderTabela(); };
  renderTabela();
  if (document.getElementById('add-os')) document.getElementById('add-os').onclick = () => {
    openModal('Nova ordem de serviço', `
      <div class="field"><label>Cliente</label><select id="f-cliente">${clientes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Descrição do serviço</label><textarea id="f-desc" rows="3"></textarea></div>
      <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="f-valor" value="0"></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-os">Salvar</button></div>
    `, () => {
      document.getElementById('save-os').onclick = async () => {
        const body = {
          cliente_id: parseInt(document.getElementById('f-cliente').value),
          descricao: document.getElementById('f-desc').value,
          data_abertura: new Date().toISOString().slice(0, 10),
          situacao: 'ABERTA',
          valor: parseFloat(document.getElementById('f-valor').value || 0)
        };
        await api('/ordens_servico', { method: 'POST', body });
        closeModal(); navigate('os');
      };
    });
  };
};

function viewOS(o, c) {
  o = unescArgs(o); c = unescArgs(c) || null;
  openModal('Ordem de Serviço #' + o.numero, `
    <div class="row-2">
      <div><div class="sub">Cliente</div><b>${esc(c ? c.nome : '-')}</b></div>
      <div><div class="sub">Abertura</div><b>${fmtDate(o.data_abertura)}</b></div>
    </div>
    <div style="margin-top:10px;">${badge(...(SITUACAO_OS[o.situacao] || ['-', '']))}</div>
    <div style="margin-top:14px;"><div class="sub">Descrição</div><p style="margin-top:4px;">${esc(o.descricao || '-')}</p></div>
    <div class="total-line">Valor: ${fmtMoney(o.valor)}</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
    <button class="btn btn-primary" onclick='printOS(encodeURIComponent(JSON.stringify(o)), encodeURIComponent(JSON.stringify(c || {})))'>🖶 Imprimir OS</button></div>
  `);
}

async function updateSituacaoOS(id, situacao) {
  await api(`/ordens_servico/${id}/situacao`, { method: 'PUT', body: { situacao } });
  navigate('os');
}

// ---------- Produção Gráfica (Rápida / Digital / Offset num módulo só) ----------
VIEWS.producao = async function () {
  const [producoes, clientes] = await Promise.all([api('/producoes'), api('/clientes')]);
  const content = document.getElementById('content');
  window.__filtroSetor = window.__filtroSetor || 'TODOS';
  window.__buscaProducao = window.__buscaProducao || '';

  function renderTabela() {
    const termo = normalizarBusca(window.__buscaProducao);
    const lista = producoes.filter(p => {
      if (window.__filtroSetor !== 'TODOS' && p.setor !== window.__filtroSetor) return false;
      if (!termo) return true;
      const c = clientes.find(x => x.id === p.cliente_id);
      const situacaoLabel = (SITUACAO_PRODUCAO[p.situacao] || [''])[0];
      return normalizarBusca(`${p.numero} ${c ? c.nome : ''} ${p.descricao || ''} ${situacaoLabel}`).includes(termo);
    }).slice().reverse();
    document.getElementById('producao-tabela').innerHTML = `
      <table><thead><tr><th>Nº</th><th>Setor</th><th>Cliente</th><th>Descrição</th><th>Abertura</th><th>Situação</th><th>Valor</th><th></th></tr></thead>
      <tbody>${lista.map(p => {
        const c = clientes.find(x => x.id === p.cliente_id);
        return `<tr><td class="mono">${p.numero}</td><td>${badge(esc(SETOR_PRODUCAO[p.setor] || p.setor), 'b-purple')}</td>
        <td>${esc(c ? c.nome : '-')}</td><td>${esc(p.descricao)}</td><td>${fmtDate(p.data_abertura)}</td>
        <td>${badge(...(SITUACAO_PRODUCAO[p.situacao] || ['-', '']))}</td>
        <td class="mono">${fmtMoney(p.valor)}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="icon-btn btn-ghost" title="Visualizar" onclick='viewProducao(encodeURIComponent(JSON.stringify(p)), encodeURIComponent(JSON.stringify(c || {})))'>👁</button>
          <button class="icon-btn btn-ghost" title="Imprimir" onclick='printProducao(encodeURIComponent(JSON.stringify(p)), encodeURIComponent(JSON.stringify(c || {})))'>🖶</button>
          ${hasRole('admin', 'vendedor') ? `<select onchange="updateSituacaoProducao(${p.id}, this.value)" class="btn-sm" style="border:1px solid var(--line); border-radius:6px;">
            ${Object.entries(SITUACAO_PRODUCAO).map(([k, val]) => `<option value="${k}" ${p.situacao === k ? 'selected' : ''}>${val[0]}</option>`).join('')}
          </select>` : ''}
          ${isAdmin() ? `<button class="icon-btn btn-danger" onclick="deleteRow('producoes', ${p.id}, 'producao')">✕</button>` : ''}
        </td></tr>`;
      }).join('') || `<tr><td colspan="8" class="empty">${termo ? 'Nenhuma produção encontrada' : 'Nenhuma produção registrada neste setor'}</td></tr>`}</tbody></table>`;
  }

  const abas = [['TODOS', 'Todos os setores'], ['RAPIDA', 'Rápida'], ['DIGITAL', 'Digital'], ['OFFSET', 'Offset']];
  content.innerHTML = `
    <div class="toolbar">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <div style="display:flex; gap:6px;">
          ${abas.map(([k, label]) => `<button class="btn btn-sm ${window.__filtroSetor === k ? 'btn-primary' : 'btn-ghost'}" data-setor="${k}">${label}</button>`).join('')}
        </div>
        ${searchBoxHtml('busca-producao', 'Buscar por nº, cliente, descrição...')}
      </div>
      ${hasRole('admin', 'vendedor') ? '<button class="btn btn-amber" id="add-producao">+ Adicionar</button>' : ''}
    </div>
    <div class="card" style="padding:0;" id="producao-tabela"></div>`;

  document.getElementById('busca-producao').value = window.__buscaProducao;
  document.getElementById('busca-producao').oninput = (e) => { window.__buscaProducao = e.target.value; renderTabela(); };
  content.querySelectorAll('[data-setor]').forEach(btn => btn.addEventListener('click', () => {
    window.__filtroSetor = btn.dataset.setor;
    content.querySelectorAll('[data-setor]').forEach(b => b.className = `btn btn-sm ${b.dataset.setor === window.__filtroSetor ? 'btn-primary' : 'btn-ghost'}`);
    renderTabela();
  }));
  renderTabela();

  if (document.getElementById('add-producao')) document.getElementById('add-producao').onclick = () => {
    openModal('Nova produção', `
      <div class="field"><label>Setor</label><select id="f-setor">${Object.entries(SETOR_PRODUCAO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>Cliente</label><select id="f-cliente">${clientes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Descrição do trabalho</label><textarea id="f-desc" rows="3" placeholder="Ex: 1000 panfletos A5 4x0"></textarea></div>
      <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="f-valor" value="0"></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-producao">Salvar</button></div>
    `, () => {
      document.getElementById('save-producao').onclick = async () => {
        const body = {
          setor: document.getElementById('f-setor').value,
          cliente_id: parseInt(document.getElementById('f-cliente').value),
          descricao: document.getElementById('f-desc').value,
          data_abertura: new Date().toISOString().slice(0, 10),
          situacao: 'ABERTA',
          valor: parseFloat(document.getElementById('f-valor').value || 0)
        };
        await api('/producoes', { method: 'POST', body });
        closeModal(); navigate('producao');
      };
    });
  };
};

async function updateSituacaoProducao(id, situacao) {
  await api(`/producoes/${id}/situacao`, { method: 'PUT', body: { situacao } });
  navigate('producao');
}

function viewProducao(p, c) {
  p = unescArgs(p); c = unescArgs(c) || null;
  const temItens = p.itens && p.itens.length > 0;
  const itensHtml = temItens ? (p.itens || []).map(it => `
    <tr><td>${esc(it.produto ? it.produto.nome : 'Item #' + it.produto_id)}</td>
    <td class="mono">${it.quantidade}</td><td class="mono">${fmtMoney(it.preco_unit)}</td>
    <td class="mono">${fmtMoney(it.quantidade * it.preco_unit)}</td></tr>`).join('') : '';

  openModal('Produção #' + p.numero, `
    <div class="row-2">
      <div><div class="sub">Cliente</div><b>${esc(c ? c.nome : '-')}</b></div>
      <div><div class="sub">Abertura</div><b>${fmtDate(p.data_abertura)}</b></div>
    </div>
    <div style="margin-top:10px; display:flex; gap:8px;">${badge(...(SITUACAO_PRODUCAO[p.situacao] || ['-', '']))}${badge(esc(SETOR_PRODUCAO[p.setor] || p.setor), 'b-purple')}</div>
    ${p.venda_id ? `<div class="sub" style="margin-top:8px; color:var(--green);">→ Gerada a partir da Venda #${p.venda_numero || p.venda_id}</div>` : ''}
    ${p.descricao ? `<div style="margin-top:14px;"><div class="sub">Descrição</div><p style="margin-top:4px;">${esc(p.descricao)}</p></div>` : ''}
    ${temItens ? `
      <div class="sub" style="margin-top:14px; font-weight:600; color:var(--ink);">Itens do pedido</div>
      <table style="margin-top:6px;"><thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${itensHtml}</tbody></table>` : ''}
    <div class="total-line">Valor: ${fmtMoney(p.valor)}</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
    <button class="btn btn-primary" onclick='printProducao(encodeURIComponent(JSON.stringify(p)), encodeURIComponent(JSON.stringify(c || {})))'>🖶 Imprimir</button></div>
  `);
}

function printProducao(p, c) {
  p = unescArgs(p); c = unescArgs(c) || null;
  const temItens = p.itens && p.itens.length > 0;
  const itensHtml = temItens ? p.itens.map(it => `
    <tr><td>${esc(it.produto ? it.produto.nome : 'Item #' + it.produto_id)}</td>
    <td class="mono">${it.quantidade}</td><td class="mono">${fmtMoney(it.preco_unit)}</td>
    <td class="mono">${fmtMoney(it.quantidade * it.preco_unit)}</td></tr>`).join('') : '';

  printDocument('Produção #' + p.numero, `
    <div class="print-header">
      <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">${esc(SETOR_PRODUCAO[p.setor] || p.setor)}</div></div>
      <div class="doc-tag"><div class="doc-number">Produção Nº ${p.numero}</div><div class="muted">Abertura: ${fmtDate(p.data_abertura)}</div></div>
    </div>
    <div class="field-grid">
      <div class="field-box"><div class="field-label">Cliente</div><div class="field-value">${esc(c ? c.nome : '-')}</div></div>
      <div class="field-box"><div class="field-label">Setor</div><div class="field-value">${esc(SETOR_PRODUCAO[p.setor] || p.setor)}</div></div>
      <div class="field-box"><div class="field-label">Situação</div><div class="field-value">${(SITUACAO_PRODUCAO[p.situacao] || ['-'])[0]}</div></div>
    </div>
    ${p.descricao ? `<div class="section-title">Descrição</div><p style="margin-top:0;">${esc(p.descricao)}</p>` : ''}
    ${temItens ? `<div class="section-title">Itens do pedido</div>
    <table><thead><tr><th>Item</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th></tr></thead><tbody>${itensHtml}</tbody></table>` : ''}
    <div class="total-box"><div class="total-inner"><div class="total-label">Valor</div><div class="total-value">${fmtMoney(p.valor)}</div></div></div>`);
}

// ---------- Financeiro ----------
const SITUACAO_FINANCEIRO = {
  PENDENTE: ['Pendente', 'b-amber'],
  PARCIAL: ['Parcial', 'b-blue'],
  PAGO: ['Pago', 'b-green'],
};
const FORMA_PAGAMENTO = {
  PIX: 'Pix',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  OUTRO: 'Outro',
};

VIEWS.financeiro = async function () {
  const lanc = await api('/financeiro');
  const content = document.getElementById('content');
  window.__buscaFinanceiro = window.__buscaFinanceiro || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaFinanceiro);
    return lanc.slice().reverse().filter(f => {
      if (!termo) return true;
      const tipoLabel = f.tipo === 'RECEBER' ? 'a receber' : 'a pagar';
      const situacaoLabel = (SITUACAO_FINANCEIRO[f.situacao] || [f.situacao])[0];
      return normalizarBusca(`${f.descricao} ${tipoLabel} ${situacaoLabel}`).includes(termo);
    });
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('financeiro-tabela').innerHTML = `
      <table><thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th>Situação</th><th>Valor</th><th>Saldo em aberto</th><th></th></tr></thead>
      <tbody>${lista.map(f => {
        const pago = Number(f.valor_pago || 0);
        const saldo = Math.round((Number(f.valor) - pago) * 100) / 100;
        return `<tr><td>${f.tipo === 'RECEBER' ? badge('A receber', 'b-green') : badge('A pagar', 'b-red')}</td>
        <td>${esc(f.descricao)}${pago > 0 && f.situacao !== 'PAGO' ? `<div class="sub">${fmtMoney(pago)} já pago</div>` : ''}</td>
        <td>${fmtDate(f.vencimento)}</td>
        <td>${badge(...(SITUACAO_FINANCEIRO[f.situacao] || [esc(f.situacao), 'b-amber']))}</td>
        <td class="mono">${fmtMoney(f.valor)}</td>
        <td class="mono" style="color:${saldo > 0 ? 'var(--red)' : 'var(--muted)'}">${saldo > 0 ? fmtMoney(saldo) : '—'}</td>
        <td style="text-align:right;">
          ${f.situacao !== 'PAGO' ? `<button class="btn btn-ghost btn-sm" onclick='abrirPagamentoFinanceiro(encodeURIComponent(JSON.stringify(f)))'>${f.tipo === 'RECEBER' ? 'Registrar entrada' : 'Registrar pagamento'}</button>` : ''}
        </td></tr>`;
      }).join('') || `<tr><td colspan="7" class="empty">${window.__buscaFinanceiro ? 'Nenhum lançamento encontrado' : 'Nenhum lançamento registrado'}</td></tr>`}
      </tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-financeiro', 'Buscar por descrição, tipo, situação...')}
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm" id="fin-imprimir">🖶 Imprimir</button>
        <button class="btn btn-amber" id="add-fin">+ Adicionar</button>
      </div>
    </div>
    <div class="card" style="padding:0;" id="financeiro-tabela"></div>`;
  document.getElementById('busca-financeiro').value = window.__buscaFinanceiro;
  document.getElementById('busca-financeiro').oninput = (e) => { window.__buscaFinanceiro = e.target.value; renderTabela(); };
  renderTabela();
  document.getElementById('fin-imprimir').onclick = () => {
    const all = linhas();
    if (all.length === 0) { alert('Nenhum lançamento para imprimir.'); return; }
    printFinanceiro(all);
  };
  document.getElementById('add-fin').onclick = () => {
    openModal('Novo lançamento financeiro', `
      <div class="row-2">
        <div class="field"><label>Tipo</label><select id="f-tipo"><option value="RECEBER">A receber</option><option value="PAGAR">A pagar</option></select></div>
        <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="f-valor" value="0"></div>
      </div>
      <div class="field"><label>Descrição</label><input id="f-desc"></div>
      <div class="field"><label>Vencimento</label><input type="date" id="f-venc" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-fin">Salvar</button></div>
    `, () => {
      document.getElementById('save-fin').onclick = async () => {
        const body = {
          tipo: document.getElementById('f-tipo').value,
          descricao: document.getElementById('f-desc').value,
          valor: parseFloat(document.getElementById('f-valor').value || 0),
          vencimento: document.getElementById('f-venc').value,
          situacao: 'PENDENTE'
        };
        await api('/financeiro', { method: 'POST', body });
        closeModal(); navigate('financeiro');
      };
    });
  };
};

function abrirPagamentoFinanceiro(f) {
  f = unescArgs(f);
  const saldo = Math.round((Number(f.valor) - Number(f.valor_pago || 0)) * 100) / 100;
  const acao = f.tipo === 'RECEBER' ? 'Registrar entrada / pagamento' : 'Registrar pagamento';
  openModal(acao, `
    <p class="sub" style="margin-top:0;">${esc(f.descricao)}</p>
    <div class="row-2">
      <div><div class="sub">Valor total</div><b>${fmtMoney(f.valor)}</b></div>
      <div><div class="sub">Saldo em aberto</div><b style="color:var(--red)">${fmtMoney(saldo)}</b></div>
    </div>
    <div class="field" style="margin-top:14px;"><label>Valor recebido agora (R$)</label>
      <input type="number" step="0.01" min="0.01" max="${saldo}" id="f-valor-pgto" value="${saldo}">
    </div>
    <div class="field"><label>Forma de pagamento</label>
      <select id="f-forma-pgto">${Object.entries(FORMA_PAGAMENTO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    </div>
    <div class="sub">Pode ser o valor total (quita o lançamento) ou só uma entrada (o restante fica "Parcial", em aberto).</div>
    <div id="pgto-erro" class="login-error" style="display:none; margin-top:10px;"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-pgto">Confirmar</button></div>
  `, () => {
    document.getElementById('save-pgto').onclick = async () => {
      const valor = parseFloat(document.getElementById('f-valor-pgto').value || 0);
      const forma_pagamento = document.getElementById('f-forma-pgto').value;
      const erroBox = document.getElementById('pgto-erro');
      try {
        await api(`/financeiro/${f.id}/pagamento`, { method: 'POST', body: { valor, forma_pagamento } });
        closeModal(); navigate('financeiro');
      } catch (e) {
        erroBox.textContent = e.message;
        erroBox.style.display = 'block';
      }
    };
  });
}

function printFinanceiro(lancamentos) {
  const lista = lancamentos.slice().reverse();
  const totalReceber = lista.filter(f => f.tipo === 'RECEBER').reduce((s, f) => s + Number(f.valor || 0), 0);
  const totalPagar = lista.filter(f => f.tipo === 'PAGAR').reduce((s, f) => s + Number(f.valor || 0), 0);
  const totalPago = lista.filter(f => f.tipo === 'RECEBER').reduce((s, f) => s + Number(f.valor_pago || 0), 0);
  const totalAberto = lista.filter(f => f.tipo === 'PAGAR').reduce((s, f) => s + (Number(f.valor || 0) - Number(f.valor_pago || 0)), 0);

  const rowsHtml = lista.map(f => {
    const pago = Number(f.valor_pago || 0);
    const saldo = Math.round((Number(f.valor) - pago) * 100) / 100;
    return `<tr>
      <td>${f.tipo === 'RECEBER' ? 'A receber' : 'A pagar'}</td>
      <td>${esc(f.descricao || '-')}</td>
      <td>${fmtDate(f.vencimento)}</td>
      <td>${(SITUACAO_FINANCEIRO[f.situacao] || [esc(f.situacao)])[0]}</td>
      <td class="mono">${fmtMoney(f.valor)}</td>
      <td class="mono">${saldo > 0 ? fmtMoney(saldo) : '—'}</td>
    </tr>`;
  }).join('');

  printDocument('Relatório Financeiro', `
    <div class="print-header">
      <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Relatório Financeiro</div></div>
      <div class="doc-tag"><div class="muted">Emitido em</div><div class="doc-number" style="font-size:13px;">${new Date().toLocaleDateString('pt-BR')}</div></div>
    </div>
    <div class="field-grid">
      <div class="field-box"><div class="field-label">Total a receber</div><div class="field-value">${fmtMoney(totalReceber)}</div></div>
      <div class="field-box"><div class="field-label">Total a pagar</div><div class="field-value">${fmtMoney(totalPagar)}</div></div>
      <div class="field-box"><div class="field-label">Valor já recebido</div><div class="field-value">${fmtMoney(totalPago)}</div></div>
      <div class="field-box"><div class="field-label">Saldo em aberto</div><div class="field-value">${fmtMoney(totalAberto)}</div></div>
    </div>
    <div class="section-title">Lançamentos</div>
    <table><thead><tr><th>Tipo</th><th>Descrição</th><th>Vencimento</th><th>Situação</th><th>Valor</th><th>Saldo</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="6" class="muted">Nenhum lançamento</td></tr>'}</tbody></table>
    <div class="total-box"><div class="total-inner"><div class="total-label">Saldo geral</div><div class="total-value">${fmtMoney(totalReceber - totalPagar)}</div></div></div>`);
}

// ---------- Relatorios ----------
VIEWS.relatorios = async function () {
  const content = document.getElementById('content');
  const podeVendas = hasRole('admin', 'vendedor', 'financeiro');
  const podeCaixa = hasRole('admin', 'financeiro');
  const primeiroDia = new Date(); primeiroDia.setDate(1);

  content.innerHTML = `
    <div class="toolbar">
      <div style="display:flex; gap:8px;">
        ${podeVendas ? '<button class="btn btn-ghost" id="tab-vendas">Relatório de vendas</button>' : ''}
        ${podeCaixa ? '<button class="btn btn-ghost" id="tab-caixa">Fluxo de caixa</button>' : ''}
      </div>
    </div>
    <div id="relatorio-area"></div>`;

  const area = document.getElementById('relatorio-area');

  async function renderVendasReport() {
    area.innerHTML = `
      <div class="card" style="margin-bottom:14px;">
        <div class="toolbar" style="margin-bottom:0;">
          <div style="display:flex; gap:10px; align-items:end;">
            <div class="field" style="margin-bottom:0;"><label>De</label><input type="date" id="r-inicio" value="${primeiroDia.toISOString().slice(0, 10)}"></div>
            <div class="field" style="margin-bottom:0;"><label>Até</label><input type="date" id="r-fim" value="${new Date().toISOString().slice(0, 10)}"></div>
            <button class="btn btn-primary btn-sm" id="r-filtrar">Filtrar</button>
          </div>
          <button class="btn btn-ghost btn-sm" id="r-imprimir">🖶 Imprimir relatório</button>
        </div>
      </div>
      <div id="r-resultado"></div>`;

    async function load() {
      const inicio = document.getElementById('r-inicio').value;
      const fim = document.getElementById('r-fim').value;
      const rep = await api(`/relatorios/vendas?inicio=${inicio}&fim=${fim}`);
      document.getElementById('r-resultado').innerHTML = `
        <div class="stat-grid" style="grid-template-columns: repeat(2,1fr);">
          <div class="stat-card"><div class="stat-label">Total no período</div><div class="stat-value">${fmtMoney(rep.total)}</div></div>
          <div class="stat-card"><div class="stat-label">Quantidade de vendas</div><div class="stat-value">${rep.quantidade}</div></div>
        </div>
        <div class="card" style="padding:0;">
          <table><thead><tr><th>Nº</th><th>Cliente</th><th>Data</th><th>Situação</th><th>Valor</th></tr></thead>
          <tbody>${rep.vendas.map(v => `<tr><td class="mono">${v.numero}</td><td>${esc(v.cliente ? v.cliente.nome : '-')}</td>
            <td>${fmtDate(v.data)}</td><td>${badge(...(SITUACAO_VENDA[v.situacao] || ['-', '']))}</td>
            <td class="mono">${fmtMoney(v.valor)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nenhuma venda no período</td></tr>'}</tbody></table>
        </div>`;
      window.__ultimoRelatorioVendas = rep;
      document.getElementById('r-inicio').value = inicio; document.getElementById('r-fim').value = fim;
    }
    document.getElementById('r-filtrar').onclick = load;
    document.getElementById('r-imprimir').onclick = () => {
      const rep = window.__ultimoRelatorioVendas;
      if (!rep) return;
      printDocument('Relatório de vendas', `
        <div class="print-header">
          <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Relatório de vendas</div></div>
          <div class="doc-tag"><div class="muted">Período</div><div class="doc-number" style="font-size:13px;">${fmtDate(document.getElementById('r-inicio')?.value)} a ${fmtDate(document.getElementById('r-fim')?.value)}</div></div>
        </div>
        <table><thead><tr><th>Nº</th><th>Cliente</th><th>Data</th><th>Valor</th></tr></thead>
        <tbody>${rep.vendas.map(v => `<tr><td class="mono">${v.numero}</td><td>${esc(v.cliente ? v.cliente.nome : '-')}</td><td>${fmtDate(v.data)}</td><td class="mono">${fmtMoney(v.valor)}</td></tr>`).join('')}</tbody></table>
        <div class="total-box"><div class="total-inner"><div class="total-label">Total · ${rep.quantidade} venda(s)</div><div class="total-value">${fmtMoney(rep.total)}</div></div></div>`);
    };
    load();
  }

  async function renderCaixaReport() {
    area.innerHTML = `
      <div class="card" style="margin-bottom:14px;">
        <div class="toolbar" style="margin-bottom:0;">
          <div style="display:flex; gap:10px; align-items:end;">
            <div class="field" style="margin-bottom:0;"><label>De</label><input type="date" id="c-inicio" value="${primeiroDia.toISOString().slice(0, 10)}"></div>
            <div class="field" style="margin-bottom:0;"><label>Até</label><input type="date" id="c-fim" value="${new Date().toISOString().slice(0, 10)}"></div>
            <button class="btn btn-primary btn-sm" id="c-filtrar">Filtrar</button>
          </div>
          <button class="btn btn-ghost btn-sm" id="c-imprimir">🖶 Imprimir relatório</button>
        </div>
      </div>
      <div id="c-resultado"></div>`;

    async function load() {
      const inicio = document.getElementById('c-inicio').value;
      const fim = document.getElementById('c-fim').value;
      const rep = await api(`/relatorios/caixa?inicio=${inicio}&fim=${fim}`);
      document.getElementById('c-resultado').innerHTML = `
        <div class="stat-grid" style="grid-template-columns: repeat(3,1fr);">
          <div class="stat-card"><div class="stat-accent" style="background:var(--green)"></div><div class="stat-label">Entradas</div><div class="stat-value">${fmtMoney(rep.totalEntradas)}</div></div>
          <div class="stat-card"><div class="stat-accent" style="background:var(--red)"></div><div class="stat-label">Saídas</div><div class="stat-value">${fmtMoney(rep.totalSaidas)}</div></div>
          <div class="stat-card"><div class="stat-accent" style="background:var(--amber)"></div><div class="stat-label">Saldo do período</div><div class="stat-value" style="color:${rep.saldo >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtMoney(rep.saldo)}</div></div>
        </div>
        <div class="card" style="padding:0;">
          <table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th>Valor</th><th>Saldo acumulado</th></tr></thead>
          <tbody>${rep.linhas.map(l => `<tr><td>${fmtDate(l.pago_em)}</td>
            <td>${l.tipo === 'RECEBER' ? badge('Entrada', 'b-green') : badge('Saída', 'b-red')}</td>
            <td>${esc(l.descricao)}</td>
            <td>${l.forma_pagamento ? esc(FORMA_PAGAMENTO[l.forma_pagamento] || l.forma_pagamento) : '<span class="sub">—</span>'}</td>
            <td class="mono" style="color:${l.tipo === 'RECEBER' ? 'var(--green)' : 'var(--red)'}">${l.tipo === 'RECEBER' ? '+' : '-'} ${fmtMoney(l.valor)}</td>
            <td class="mono">${fmtMoney(l.saldo_acumulado)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhuma movimentação de caixa no período</td></tr>'}</tbody></table>
        </div>`;
      window.__ultimoRelatorioCaixa = rep;
    }
    document.getElementById('c-filtrar').onclick = load;
    document.getElementById('c-imprimir').onclick = () => {
      const rep = window.__ultimoRelatorioCaixa;
      if (!rep) return;
      printDocument('Relatório de fluxo de caixa', `
        <div class="print-header">
          <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Fluxo de caixa</div></div>
          <div class="doc-tag"><div class="muted">Período</div><div class="doc-number" style="font-size:13px;">${fmtDate(document.getElementById('c-inicio')?.value)} a ${fmtDate(document.getElementById('c-fim')?.value)}</div></div>
        </div>
        <div class="field-grid">
          <div class="field-box"><div class="field-label">Entradas</div><div class="field-value">${fmtMoney(rep.totalEntradas)}</div></div>
          <div class="field-box"><div class="field-label">Saídas</div><div class="field-value">${fmtMoney(rep.totalSaidas)}</div></div>
          <div class="field-box"><div class="field-label">Saldo do período</div><div class="field-value">${fmtMoney(rep.saldo)}</div></div>
        </div>
        <table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Forma</th><th>Valor</th><th>Saldo</th></tr></thead>
        <tbody>${rep.linhas.map(l => `<tr><td>${fmtDate(l.pago_em)}</td><td>${l.tipo === 'RECEBER' ? 'Entrada' : 'Saída'}</td><td>${esc(l.descricao)}</td><td>${l.forma_pagamento ? esc(FORMA_PAGAMENTO[l.forma_pagamento] || l.forma_pagamento) : '—'}</td><td class="mono">${fmtMoney(l.valor)}</td><td class="mono">${fmtMoney(l.saldo_acumulado)}</td></tr>`).join('')}</tbody></table>
        <div class="total-box"><div class="total-inner"><div class="total-label">Saldo do período</div><div class="total-value">${fmtMoney(rep.saldo)}</div></div></div>`);
    };
    load();
  }

  if (podeVendas) { document.getElementById('tab-vendas').onclick = renderVendasReport; }
  if (podeCaixa) { document.getElementById('tab-caixa').onclick = renderCaixaReport; }
  if (podeVendas) renderVendasReport(); else if (podeCaixa) renderCaixaReport();
};

// ---------- Usuarios (somente admin) ----------
VIEWS.usuarios = async function () {
  const users = await api('/users');
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar"><div></div><button class="btn btn-amber" id="add-user">+ Adicionar usuário</button></div>
    <div class="card" style="padding:0;">
      <table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th></th></tr></thead>
      <tbody>${users.map(u => `
        <tr><td><b>${esc(u.nome)}</b></td><td>${esc(u.email)}</td><td>${badge(esc(papelLabel(u.papel)), u.papel === 'admin' ? 'b-purple' : u.papel === 'financeiro' ? 'b-green' : 'b-blue')}</td>
        <td style="text-align:right;">
          <button class="icon-btn btn-ghost" onclick="editUsuario(${u.id})">✎</button>
          ${u.id !== state.user.id ? `<button class="icon-btn btn-danger" onclick="deleteRow('users', ${u.id}, 'usuarios')">✕</button>` : ''}
        </td></tr>`).join('')}
      </tbody></table>
    </div>`;
  document.getElementById('add-user').onclick = () => usuarioForm();
};

function usuarioForm(u) {
  openModal(u ? 'Editar usuário' : 'Novo usuário', `
    <div class="field"><label>Nome</label><input id="f-nome" value="${esc(u?.nome)}"></div>
    <div class="field"><label>E-mail</label><input type="email" id="f-email" value="${esc(u?.email)}"></div>
    <div class="field"><label>Senha ${u ? '(deixe em branco para manter a atual)' : ''}</label><input type="password" id="f-senha"></div>
    <div class="field"><label>Papel</label><select id="f-papel">
      <option value="admin" ${u?.papel === 'admin' ? 'selected' : ''}>Administrador (acesso total)</option>
      <option value="vendedor" ${u?.papel === 'vendedor' ? 'selected' : ''}>Vendedor (vendas, produtos, clientes, estoque, orçamentos, OS)</option>
      <option value="financeiro" ${u?.papel === 'financeiro' ? 'selected' : ''}>Financeiro (financeiro e relatório de caixa)</option>
    </select></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-user">Salvar</button></div>
  `, () => {
    document.getElementById('save-user').onclick = async () => {
      const senha = document.getElementById('f-senha').value;
      const body = {
        nome: document.getElementById('f-nome').value,
        email: document.getElementById('f-email').value,
        papel: document.getElementById('f-papel').value,
      };
      if (senha) body.senha = senha;
      else if (!u) { alert('Defina uma senha para o novo usuário.'); return; }
      try {
        await api(u ? `/users/${u.id}` : '/users', { method: u ? 'PUT' : 'POST', body });
        closeModal(); navigate('usuarios');
      } catch (e) { alert(e.message); }
    };
  });
}
async function editUsuario(id) {
  const u = (await api('/users')).find(x => x.id === id);
  usuarioForm(u);
}

// ---------- Funcionários (somente admin — dados de salário são sensíveis) ----------
VIEWS.funcionarios = async function () {
  const funcionarios = await api('/funcionarios');
  const content = document.getElementById('content');
  window.__buscaFuncionarios = window.__buscaFuncionarios || '';

  function linhas() {
    const termo = normalizarBusca(window.__buscaFuncionarios);
    return funcionarios.slice().reverse().filter(f => !termo || normalizarBusca(`${f.nome} ${f.cargo || ''} ${f.cpf || ''}`).includes(termo));
  }
  function renderTabela() {
    const lista = linhas();
    document.getElementById('funcionarios-tabela').innerHTML = `
      <table><thead><tr><th>Nome</th><th>Cargo</th><th>Admissão</th><th>Salário</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map(f => `
        <tr><td><b>${esc(f.nome)}</b><div class="sub">${esc(f.cpf || '')}</div></td>
        <td>${esc(f.cargo || '-')}</td>
        <td>${fmtDate(f.data_admissao)}</td>
        <td class="mono">${fmtMoney(f.salario)}</td>
        <td>${f.ativo ? badge('Ativo', 'b-green') : badge('Inativo', 'b-red')}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="icon-btn btn-ghost" title="Visualizar" onclick="viewFuncionario(${f.id})">👁</button>
          <button class="icon-btn btn-ghost" title="Editar" onclick="editFuncionario(${f.id})">✎</button>
          <button class="icon-btn btn-danger" onclick="deleteRow('funcionarios', ${f.id}, 'funcionarios')">✕</button>
        </td></tr>`).join('') || `<tr><td colspan="6" class="empty">${window.__buscaFuncionarios ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}</td></tr>`}
      </tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">${searchBoxHtml('busca-funcionarios', 'Buscar por nome, cargo ou CPF...')}<button class="btn btn-amber" id="add-func">+ Adicionar</button></div>
    <div class="card" style="padding:0;" id="funcionarios-tabela"></div>`;
  document.getElementById('busca-funcionarios').value = window.__buscaFuncionarios;
  document.getElementById('busca-funcionarios').oninput = (e) => { window.__buscaFuncionarios = e.target.value; renderTabela(); };
  renderTabela();
  document.getElementById('add-func').onclick = () => funcionarioForm();
};

function funcionarioForm(f) {
  openModal(f ? 'Editar funcionário' : 'Novo funcionário', `
    <div class="field"><label>Nome completo</label><input id="f-nome" value="${esc(f?.nome)}"></div>
    <div class="row-2">
      <div class="field"><label>CPF</label><input id="f-cpf" value="${esc(f?.cpf)}"></div>
      <div class="field"><label>Cargo</label><input id="f-cargo" value="${esc(f?.cargo)}"></div>
    </div>
    <div class="row-2">
      <div class="field"><label>Telefone</label><input id="f-tel" value="${esc(f?.telefone)}"></div>
      <div class="field"><label>E-mail</label><input id="f-email" value="${esc(f?.email)}"></div>
    </div>
    <div class="field"><label>Endereço</label><input id="f-endereco" value="${esc(f?.endereco)}"></div>
    <div class="row-2">
      <div class="field"><label>Data de admissão</label><input type="date" id="f-admissao" value="${f?.data_admissao || ''}"></div>
      <div class="field"><label>Salário (R$)</label><input type="number" step="0.01" id="f-salario" value="${f?.salario ?? ''}"></div>
    </div>
    <div class="field"><label>Situação</label><select id="f-ativo">
      <option value="true" ${!f || f.ativo ? 'selected' : ''}>Ativo</option>
      <option value="false" ${f && !f.ativo ? 'selected' : ''}>Inativo</option>
    </select></div>
    <div class="field"><label>Observações</label><textarea id="f-obs" rows="2">${esc(f?.observacoes)}</textarea></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-func">Salvar</button></div>
  `, () => {
    document.getElementById('save-func').onclick = async () => {
      const body = {
        nome: document.getElementById('f-nome').value,
        cpf: document.getElementById('f-cpf').value,
        cargo: document.getElementById('f-cargo').value,
        telefone: document.getElementById('f-tel').value,
        email: document.getElementById('f-email').value,
        endereco: document.getElementById('f-endereco').value,
        data_admissao: document.getElementById('f-admissao').value,
        salario: parseFloat(document.getElementById('f-salario').value || 0),
        ativo: document.getElementById('f-ativo').value === 'true',
        observacoes: document.getElementById('f-obs').value,
      };
      await api(f ? `/funcionarios/${f.id}` : '/funcionarios', { method: f ? 'PUT' : 'POST', body });
      closeModal(); navigate('funcionarios');
    };
  });
}
async function editFuncionario(id) { funcionarioForm(await api(`/funcionarios/${id}`)); }

async function viewFuncionario(id) {
  const f = await api(`/funcionarios/${id}`);
  const vales = (f.vales || []).slice().reverse();
  openModal(esc(f.nome), `
    <div style="margin-bottom:10px;">${f.ativo ? badge('Ativo', 'b-green') : badge('Inativo', 'b-red')}</div>
    <div class="row-2">
      <div><div class="sub">Cargo</div><b>${esc(f.cargo || '-')}</b></div>
      <div><div class="sub">CPF</div><b>${esc(f.cpf || '-')}</b></div>
    </div>
    <div class="row-2" style="margin-top:10px;">
      <div><div class="sub">Admissão</div><b>${fmtDate(f.data_admissao)}</b></div>
      <div><div class="sub">Salário</div><b>${fmtMoney(f.salario)}</b></div>
    </div>
    <div class="row-2" style="margin-top:10px;">
      <div><div class="sub">Telefone</div><b>${esc(f.telefone || '-')}</b></div>
      <div><div class="sub">E-mail</div><b>${esc(f.email || '-')}</b></div>
    </div>
    ${f.endereco ? `<div style="margin-top:10px;"><div class="sub">Endereço</div><b>${esc(f.endereco)}</b></div>` : ''}
    ${f.observacoes ? `<div style="margin-top:10px;"><div class="sub">Observações</div>${esc(f.observacoes)}</div>` : ''}

    <div class="sub" style="margin-top:16px; font-weight:600; color:var(--ink);">Vales (adiantamentos)</div>
    <div style="margin-top:6px; max-height:160px; overflow-y:auto;">
      ${vales.length ? vales.map(v => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--line); font-size:13px;">
          <span>${fmtDate(v.data)} ${v.descricao ? '· ' + esc(v.descricao) : ''}</span><span class="mono">${fmtMoney(v.valor)}</span>
        </div>`).join('') : '<div class="empty" style="padding:10px 0;">Nenhum vale registrado</div>'}
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Fechar</button>
      <button class="btn btn-ghost" onclick="registrarValeModal(${f.id})">💵 Registrar vale</button>
      <button class="btn btn-ghost" onclick='printFichaFuncionario(encodeURIComponent(JSON.stringify(f)))'>🖶 Imprimir ficha</button>
      <button class="btn btn-primary" onclick="abrirContrachequeModal(${f.id})">📄 Gerar contracheque</button>
    </div>
  `);
}

function registrarValeModal(funcionarioId) {
  openModal('Registrar vale', `
    <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" min="0.01" id="f-vale-valor"></div>
    <div class="field"><label>Descrição (opcional)</label><input id="f-vale-desc" placeholder="Ex: Adiantamento quinzenal"></div>
    <div id="vale-erro" class="login-error" style="display:none; margin-top:8px;"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="save-vale">Registrar</button></div>
  `, () => {
    document.getElementById('save-vale').onclick = async () => {
      const valor = parseFloat(document.getElementById('f-vale-valor').value || 0);
      const descricao = document.getElementById('f-vale-desc').value;
      const erroBox = document.getElementById('vale-erro');
      try {
        await api(`/funcionarios/${funcionarioId}/vale`, { method: 'POST', body: { valor, descricao } });
        closeModal(); viewFuncionario(funcionarioId);
      } catch (e) {
        erroBox.textContent = e.message;
        erroBox.style.display = 'block';
      }
    };
  });
}

// Ficha completa do funcionário — pra arquivo interno / RH.
function printFichaFuncionario(f) {
  f = unescArgs(f);
  printDocument('Ficha - ' + f.nome, `
    <div class="print-header">
      <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Ficha de Funcionário</div></div>
      <div class="doc-tag"><div class="muted">Situação</div><div class="doc-number" style="font-size:13px;">${f.ativo ? 'Ativo' : 'Inativo'}</div></div>
    </div>
    <div class="field-grid">
      <div class="field-box"><div class="field-label">Nome</div><div class="field-value">${esc(f.nome)}</div></div>
      <div class="field-box"><div class="field-label">CPF</div><div class="field-value">${esc(f.cpf || '-')}</div></div>
      <div class="field-box"><div class="field-label">Cargo</div><div class="field-value">${esc(f.cargo || '-')}</div></div>
      <div class="field-box"><div class="field-label">Admissão</div><div class="field-value">${fmtDate(f.data_admissao)}</div></div>
      <div class="field-box"><div class="field-label">Telefone</div><div class="field-value">${esc(f.telefone || '-')}</div></div>
      <div class="field-box"><div class="field-label">E-mail</div><div class="field-value">${esc(f.email || '-')}</div></div>
      <div class="field-box"><div class="field-label">Endereço</div><div class="field-value">${esc(f.endereco || '-')}</div></div>
      <div class="field-box"><div class="field-label">Salário</div><div class="field-value">${fmtMoney(f.salario)}</div></div>
    </div>
    ${f.observacoes ? `<div class="section-title">Observações</div><p style="margin-top:0;">${esc(f.observacoes)}</p>` : ''}
    <div class="signature-row">
      <div class="signature-line">Assinatura do funcionário</div>
      <div class="signature-line">Assinatura do responsável</div>
    </div>`);
}

async function abrirContrachequeModal(funcionarioId) {
  const hoje = new Date();
  const mesAtual = hoje.toISOString().slice(0, 7);
  openModal('Gerar contracheque', `
    <div class="row-2">
      <div class="field"><label>Mês de referência</label><input type="month" id="cc-mes" value="${mesAtual}"></div>
      <div class="field"><label>Adicionais (R$)</label><input type="number" step="0.01" id="cc-adicionais" value="0"></div>
    </div>
    <div class="sub">Adicionais: horas extra, comissão, bônus etc. — some ao salário bruto.</div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" id="gerar-cc">Gerar</button></div>
  `, () => {
    document.getElementById('gerar-cc').onclick = async () => {
      const mes = document.getElementById('cc-mes').value;
      const adicionais = parseFloat(document.getElementById('cc-adicionais').value || 0);
      const dados = await api(`/funcionarios/${funcionarioId}/contracheque?mes=${mes}`);
      closeModal();
      printContracheque(dados, adicionais);
    };
  });
}

function printContracheque(dados, adicionais) {
  const f = dados.funcionario;
  const salarioBruto = Number(f.salario || 0);
  const inss = dados.inssEstimado;
  const vale = dados.totalVales;
  const liquido = Math.round((salarioBruto + adicionais - inss - vale) * 100) / 100;
  const [ano, mes] = dados.mes.split('-');
  const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  printDocument('Contracheque - ' + f.nome, `
    <div class="print-header">
      <div><h1>${esc(nomeEmpresa())}</h1><div class="muted">Contracheque</div></div>
      <div class="doc-tag"><div class="doc-number" style="font-size:14px; text-transform:capitalize;">${nomeMes}</div></div>
    </div>
    <div class="field-grid">
      <div class="field-box"><div class="field-label">Funcionário</div><div class="field-value">${esc(f.nome)}</div></div>
      <div class="field-box"><div class="field-label">Cargo</div><div class="field-value">${esc(f.cargo || '-')}</div></div>
      <div class="field-box"><div class="field-label">CPF</div><div class="field-value">${esc(f.cpf || '-')}</div></div>
    </div>
    <div class="section-title">Proventos e descontos</div>
    <table><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>
      <tr><td>Salário base</td><td>Provento</td><td class="mono">${fmtMoney(salarioBruto)}</td></tr>
      ${adicionais > 0 ? `<tr><td>Adicionais</td><td>Provento</td><td class="mono">${fmtMoney(adicionais)}</td></tr>` : ''}
      <tr><td>INSS (estimado)</td><td>Desconto</td><td class="mono">- ${fmtMoney(inss)}</td></tr>
      ${vale > 0 ? `<tr><td>Adiantamento (vale) do mês</td><td>Desconto</td><td class="mono">- ${fmtMoney(vale)}</td></tr>` : ''}
    </tbody></table>
    <div class="total-box"><div class="total-inner"><div class="total-label">Líquido a receber</div><div class="total-value">${fmtMoney(liquido)}</div></div></div>
    <div class="sub" style="margin-top:18px; font-size:11px; color:#6B7280;">
      Desconto de INSS calculado pela tabela progressiva de referência — confirme com o contador da
      empresa antes de considerar oficial. Não inclui IRRF, FGTS ou outros descontos/adicionais
      não cadastrados no sistema.
    </div>
    <div class="signature-row">
      <div class="signature-line">Assinatura do funcionário</div>
      <div class="signature-line">Assinatura do responsável</div>
    </div>`);
}

// ---------- Configurações (somente admin) ----------
VIEWS.configuracoes = async function () {
  const config = await api('/configuracoes');
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="card" style="max-width:640px; margin-bottom:20px;">
      <h3 style="margin-top:0;">Dados da empresa</h3>
      <div class="sub" style="margin-bottom:14px;">Usados no cabeçalho dos recibos, cupons, ordens de serviço e relatórios impressos.</div>
      <div class="field"><label>Nome da empresa</label><input id="cfg-nome" value="${esc(config.empresa_nome || '')}"></div>
      <div class="row-2">
        <div class="field"><label>CNPJ / Documento</label><input id="cfg-doc" value="${esc(config.empresa_documento || '')}"></div>
        <div class="field"><label>Telefone</label><input id="cfg-tel" value="${esc(config.empresa_telefone || '')}"></div>
      </div>
      <div class="field"><label>Endereço</label><input id="cfg-end" value="${esc(config.empresa_endereco || '')}"></div>
      <div class="field"><label>E-mail</label><input id="cfg-email" value="${esc(config.empresa_email || '')}"></div>
      <div class="modal-actions" style="justify-content:flex-start;"><button class="btn btn-primary" id="cfg-salvar">Salvar dados da empresa</button></div>
      <div id="cfg-msg" class="sub" style="margin-top:8px;"></div>
    </div>

    <div class="card" style="max-width:640px;">
      <h3 style="margin-top:0;">Numeração</h3>
      <div class="sub" style="margin-bottom:14px;">
        Define a partir de qual número o sistema deve continuar contando em cada módulo.
        <b>Não apaga nem renumera registros existentes</b> — o sistema nunca gera um número
        que já exista, então isso só tem efeito se for maior que o maior número atual
        (ou depois de limpar os registros antigos).
      </div>
      <div class="row-2">
        <div class="field"><label>Próxima Venda</label><input type="number" id="cfg-num-venda" placeholder="Ex: 1"></div>
        <div class="field"><label>Próximo Orçamento</label><input type="number" id="cfg-num-orcamento" placeholder="Ex: 1"></div>
      </div>
      <div class="row-2">
        <div class="field"><label>Próxima Produção</label><input type="number" id="cfg-num-producao" placeholder="Ex: 1"></div>
        <div class="field"><label>Próxima Ordem de Serviço</label><input type="number" id="cfg-num-os" placeholder="Ex: 1"></div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start;"><button class="btn btn-primary" id="cfg-salvar-numeros">Aplicar numeração</button></div>
      <div id="cfg-msg-numeros" class="sub" style="margin-top:8px;"></div>
    </div>`;

  document.getElementById('cfg-salvar').onclick = async () => {
    const body = {
      empresa_nome: document.getElementById('cfg-nome').value,
      empresa_documento: document.getElementById('cfg-doc').value,
      empresa_telefone: document.getElementById('cfg-tel').value,
      empresa_endereco: document.getElementById('cfg-end').value,
      empresa_email: document.getElementById('cfg-email').value,
    };
    state.empresa = await api('/configuracoes', { method: 'PUT', body });
    const msg = document.getElementById('cfg-msg');
    msg.textContent = '✓ Dados da empresa salvos.';
    msg.style.color = 'var(--green)';
  };

  document.getElementById('cfg-salvar-numeros').onclick = async () => {
    const body = {
      venda: document.getElementById('cfg-num-venda').value || undefined,
      orcamento: document.getElementById('cfg-num-orcamento').value || undefined,
      producao: document.getElementById('cfg-num-producao').value || undefined,
      os: document.getElementById('cfg-num-os').value || undefined,
    };
    await api('/configuracoes/resetar-numeros', { method: 'POST', body });
    const msg = document.getElementById('cfg-msg-numeros');
    msg.textContent = '✓ Numeração atualizada.';
    msg.style.color = 'var(--green)';
  };
};

// ---------- Logs de Auditoria (somente admin) ----------
const ACAO_LABEL = {
  LOGIN: ['Acessou o sistema', 'b-green'],
  LOGIN_FALHOU: ['Tentativa de acesso falhou', 'b-red'],
  CRIAR: ['Criou registro', 'b-blue'],
  CRIAR_USUARIO: ['Criou usuário', 'b-purple'],
  EDITAR: ['Editou registro', 'b-amber'],
  EDITAR_USUARIO: ['Editou usuário', 'b-amber'],
  EXCLUIR: ['Excluiu registro', 'b-red'],
  EXCLUIR_USUARIO: ['Excluiu usuário', 'b-red'],
  ALTERAR_SITUACAO: ['Alterou situação', 'b-blue'],
  REGISTRAR_PAGAMENTO: ['Registrou pagamento', 'b-green'],
  REGISTRAR_VALE: ['Registrou vale', 'b-plum'],
  APROVAR_ORCAMENTO_GEROU_VENDA: ['Aprovou orçamento → venda', 'b-green'],
};
const ENTIDADE_LABEL = {
  users: 'Usuário', clientes: 'Cliente', produtos: 'Produto',
  vendas: 'Venda', itens_venda: 'Item de venda',
  estoque_movimentos: 'Movimentação de estoque', orcamentos: 'Orçamento',
  itens_orcamento: 'Item de orçamento', ordens_servico: 'Ordem de Serviço',
  financeiro: 'Financeiro', producoes: 'Produção gráfica',
  configuracoes: 'Configurações', funcionarios: 'Funcionário', logs: 'Log',
};
function acaoLabel(a) { const r = ACAO_LABEL[a] || [a, 'b-blue']; return [esc(r[0]), r[1]]; }
function entidadeLabel(e) { return ENTIDADE_LABEL[e] || e || '-'; }
function formatarDataLog(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function detalhesResumo(det) {
  if (!det) return '';
  const entradas = Object.entries(det);
  if (entradas.length === 0) return '';
  return entradas.map(([k, v]) => `<span class="sub">${esc(k)}: <span class="mono">${esc(v)}</span></span>`).join(' · ');
}

VIEWS.logs = async function () {
  const content = document.getElementById('content');
  const data = await api('/logs?limite=200');
  let logs = data.logs || [];
  window.__filtroLog = window.__filtroLog || '';

  function renderTabela() {
    const termo = normalizarBusca(window.__filtroLog);
    const lista = logs.filter(l => {
      if (!termo) return true;
      return normalizarBusca(`${l.usuario_nome || ''} ${acaoLabel(l.acao)[0]} ${entidadeLabel(l.entidade)} ${formatarDataLog(l.criado_em)}`).includes(termo);
    });
    document.getElementById('logs-tabela').innerHTML = `
      <table><thead><tr><th>Data / Hora</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Detalhes</th><th>IP</th></tr></thead>
      <tbody>${lista.map(l => `
        <tr><td class="mono" style="white-space:nowrap;">${formatarDataLog(l.criado_em)}</td>
        <td><b>${esc(l.usuario_nome || '—')}</b><div class="sub">${esc(l.papel || '')}</div></td>
        <td>${badge(...acaoLabel(l.acao))}</td>
        <td>${entidadeLabel(l.entidade)}${l.entidade_id ? `<div class="sub">ID ${l.entidade_id}</div>` : ''}</td>
        <td>${detalhesResumo(l.detalhes) || '<span class="sub">—</span>'}</td>
        <td class="mono sub">${esc(l.ip || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum registro de atividade encontrado.</td></tr>'}</tbody></table>`;
  }

  content.innerHTML = `
    <div class="toolbar">
      ${searchBoxHtml('busca-logs', 'Buscar por usuário, ação, entidade, data...')}
      <button class="btn btn-ghost btn-sm" id="logs-recarga">↻ Recarregar</button>
    </div>
    <div class="card" style="padding:0; margin-bottom:16px;" id="logs-tabela"></div>
    <div class="card">
      <div class="sub" style="margin-top:0;">Atividade por tipo de ação</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
        ${Object.entries(data.acoes || {}).map(([a, n]) => `<span class="badge ${acaoLabel(a)[1]}">${acaoLabel(a)[0]} · ${n}</span>`).join('') || '<span class="sub">Nenhuma atividade registrada.</span>'}
      </div>
    </div>`;
  document.getElementById('busca-logs').value = window.__filtroLog;
  document.getElementById('busca-logs').oninput = (e) => { window.__filtroLog = e.target.value; renderTabela(); };
  document.getElementById('logs-recarga').onclick = () => navigate('logs');
  renderTabela();
};

// ---------- Shared delete ----------
async function deleteRow(collection, id, route) {
  if (!confirm('Tem certeza que deseja excluir este registro?')) return;
  try {
    await api(`/${collection}/${id}`, { method: 'DELETE' });
    navigate(route);
  } catch (e) { alert(e.message); }
}

// ---------- Init ----------
if (state.token && state.user) boot();

// Configurações (tela-config, rota ?config=1), separadas por tema.
// Níveis: master (dono do app: todas as organizações), coordenador (todos os clientes da sua organização; cadastra
// atendimentos e libera clientes para eles) e atendimento (só os clientes liberados). Todos mudam nome e senha.
// Cadastro, senha, remoção e mudança de nível passam pela função gerenciar-pessoas, que confere quem pede.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el;
  var NIVEIS = { master: 'Master', coordenador: 'Coordenador', atendimento: 'Atendimento' };
  var dados = { orgs: [], clientes: [], pessoas: [], acessos: [] };
  var tema = 'conta';

  function papel() { return P.papel(P.estado.perfil); }
  function ehMaster() { return papel() === 'master'; }
  function gere() { return papel() === 'master' || papel() === 'coordenador'; }
  function minhaOrg() { return P.estado.perfil && P.estado.perfil.organizacao_id; }

  function erroAmigavel(e) {
    var m = (e && (e.message || e.erro)) || '';
    if (/duplicate|unique/i.test(m)) return 'Já existe um cadastro com esse nome.';
    return m || 'Não foi possível salvar. Tente de novo.';
  }
  function confirmar(botao, texto, acao) {
    if (botao.dataset.confirmando) { acao(); return; }
    var original = botao.textContent;
    botao.dataset.confirmando = '1'; botao.textContent = texto;
    setTimeout(function () { delete botao.dataset.confirmando; botao.textContent = original; }, 3500);
  }
  // Erros da função vêm no corpo da resposta
  function chamarFuncao(corpo) {
    return P.sb.functions.invoke('gerenciar-pessoas', { body: corpo }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      if (ctx && ctx.json) return ctx.json().then(function (j) { throw new Error(j.erro || r.error.message); }, function () { throw r.error; });
      throw r.error;
    });
  }
  function nomeOrg(id) { var o = dados.orgs.find(function (x) { return x.id === id; }); return o ? o.nome : 'Sem organização'; }
  function clientesDaOrg(org) { return dados.clientes.filter(function (c) { return c.organizacao_id === org; }); }
  function opcoes(sel, lista, valor) {
    sel.replaceChildren.apply(sel, lista.map(function (o) { return el('option', { value: o.id, text: o.nome }); }));
    if (valor) sel.value = valor;
  }
  // Agrupa por organização quando o master vê mais de uma
  function porOrg(itens, campo, montar) {
    if (!ehMaster()) return itens.map(montar);
    var grupos = dados.orgs.map(function (o) { return { id: o.id, nome: o.nome }; });
    if (itens.some(function (i) { return !i[campo]; })) grupos.push({ id: null, nome: 'Sem organização' });
    return grupos.map(function (g) {
      var deles = itens.filter(function (i) { return (i[campo] || null) === g.id; });
      if (!deles.length && g.id === null) return null;
      return el('div', { class: 'grupo-org' }, [el('h3', { text: g.nome }),
        deles.length ? el('ul', { class: campo === 'organizacao_id' && itens === dados.pessoas ? 'lista-pessoas' : 'lista-simples' }, deles.map(montar))
          : el('p', { class: 'discreto', text: 'Nada cadastrado ainda.' })]);
    });
  }

  // ---------- temas ----------
  function mostrarTema(t) {
    tema = t;
    document.querySelectorAll('#temas-config button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tema === t)); });
    document.querySelectorAll('[data-tema-painel]').forEach(function (d) { d.hidden = d.dataset.temaPainel !== t; });
  }
  $('temas-config').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-tema]'); if (b) mostrarTema(b.dataset.tema);
  });

  // ---------- minha conta ----------
  function renderConta() {
    var perfil = P.estado.perfil || {}, p = papel();
    var clientes = (P.estado.clientes || []).map(function (c) { return c.nome; });
    var org = perfil.organizacao_id ? nomeOrg(perfil.organizacao_id) : '';
    var resumo = p === 'master' ? 'Master, vê todas as organizações' :
      p === 'coordenador' ? 'Coordenador' + (org ? ' da ' + org : '') + ', vê todos os clientes da organização' :
      'Atendimento' + (org ? ' da ' + org : '') + (clientes.length ? '. Atende: ' + clientes.join(', ') : '. Ainda sem clientes liberados');
    $('conta-resumo').textContent = (perfil.email || '') + ' · ' + resumo;
    $('meu-nome').value = perfil.nome || '';
  }
  $('form-meu-nome').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = $('meu-nome').value.trim();
    P.sb.rpc('salvar_meu_nome', { novo: nome }).then(function (r) {
      if (r.error) { P.avisar('Não foi possível salvar o nome'); return; }
      if (P.estado.perfil) P.estado.perfil.nome = nome;
      P.avisar('Nome salvo');
    });
  });
  $('form-minha-senha').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var a = $('minha-senha').value, b = $('minha-senha-2').value, msg = $('conta-msg');
    msg.classList.add('erro');
    if (a.length < 8) { msg.textContent = 'Use pelo menos 8 caracteres.'; return; }
    if (a !== b) { msg.textContent = 'As duas senhas estão diferentes.'; return; }
    P.sb.auth.updateUser({ password: a }).then(function (r) {
      if (r.error) { msg.textContent = /weak|short|least/i.test(r.error.message || '') ? 'Senha fraca demais.' : /same|different/i.test(r.error.message || '') ? 'A nova senha precisa ser diferente da atual.' : 'Não foi possível trocar a senha.'; return; }
      msg.classList.remove('erro'); msg.textContent = 'Senha trocada.';
      $('minha-senha').value = ''; $('minha-senha-2').value = '';
    });
  });

  // ---------- carregar ----------
  function carregarAdmin() {
    return Promise.all([
      P.sb.from('organizacoes').select('id, nome').order('nome'),
      P.sb.from('clientes').select('*').order('nome'),
      P.sb.from('perfis').select('*').order('email'),
      P.sb.from('acessos').select('user_id, cliente_id')
    ]).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      dados = { orgs: r[0].data || [], clientes: r[1].data || [], pessoas: r[2].data || [], acessos: r[3].data || [] };
    });
  }
  function tem(uid, cid) { return dados.acessos.some(function (a) { return a.user_id === uid && a.cliente_id === cid; }); }

  // ---------- organizações (só master) ----------
  function renderOrgs() {
    var ul = $('lista-orgs');
    ul.replaceChildren.apply(ul, dados.orgs.length ? dados.orgs.map(function (o) {
      var nc = clientesDaOrg(o.id).length, np = dados.pessoas.filter(function (p) { return p.organizacao_id === o.id; }).length;
      return el('li', {}, [
        el('span', { class: 'termo', text: o.nome }),
        el('span', { class: 'discreto', text: nc + (nc === 1 ? ' cliente · ' : ' clientes · ') + np + (np === 1 ? ' pessoa' : ' pessoas') }),
        el('button', { type: 'button', class: 'remover', text: 'Renomear', onclick: function () {
          var novo = window.prompt('Novo nome para ' + o.nome, o.nome);
          if (!novo || !novo.trim() || novo.trim() === o.nome) return;
          P.sb.from('organizacoes').update({ nome: novo.trim() }).eq('id', o.id).then(function (r) {
            if (r.error) { P.avisar(erroAmigavel(r.error)); return; }
            P.avisar('Organização renomeada'); atualizarTudo();
          });
        } }),
        el('button', { type: 'button', class: 'remover', text: 'Apagar', onclick: function () {
          confirmar(this, 'Apaga ' + o.nome + ' e todos os clientes dela? Toque de novo', function () {
            P.sb.from('organizacoes').delete().eq('id', o.id).then(function (r) {
              if (r.error) { P.avisar('Não foi possível apagar'); return; }
              P.avisar('Organização apagada'); atualizarTudo();
            });
          });
        } })
      ]);
    }) : [el('li', { class: 'vazio', text: 'Nenhuma organização ainda.' })]);
  }
  $('form-org').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = $('nova-org').value.trim(); if (!nome) return;
    P.sb.from('organizacoes').insert({ nome: nome }).then(function (r) {
      if (r.error) { P.avisar(erroAmigavel(r.error)); return; }
      $('nova-org').value = ''; P.avisar('Organização criada'); atualizarTudo();
    });
  });

  // ---------- clientes ----------
  function renderClientes() {
    var caixa = $('lista-clientes');
    var itens = porOrg(dados.clientes, 'organizacao_id', function (c) {
      var n = dados.acessos.filter(function (a) { return a.cliente_id === c.id; }).length;
      return el('li', {}, [
        el('span', { class: 'termo', text: c.nome }),
        el('span', { class: 'discreto', text: n === 1 ? '1 atendimento' : n + ' atendimentos' }),
        el('button', { type: 'button', class: 'remover', text: 'Renomear', onclick: function () {
          var novo = window.prompt('Novo nome para ' + c.nome, c.nome);
          if (!novo || !novo.trim() || novo.trim() === c.nome) return;
          P.sb.from('clientes').update({ nome: novo.trim() }).eq('id', c.id).then(function (r) {
            if (r.error) { P.avisar(erroAmigavel(r.error)); return; }
            P.avisar('Cliente renomeado'); atualizarTudo();
          });
        } }),
        el('button', { type: 'button', class: 'remover', text: 'Apagar', onclick: function () {
          confirmar(this, 'Apaga tudo de ' + c.nome + '? Toque de novo', function () {
            P.sb.from('clientes').delete().eq('id', c.id).then(function (r) {
              if (r.error) { P.avisar('Não foi possível apagar'); return; }
              P.avisar('Cliente apagado'); atualizarTudo();
            });
          });
        } })
      ]);
    });
    if (!ehMaster()) itens = [itens.length ? el('ul', { class: 'lista-simples' }, itens) : el('p', { class: 'vazio', text: 'Nenhum cliente ainda.' })];
    caixa.replaceChildren.apply(caixa, itens.filter(Boolean));
    var sel = $('cliente-org');
    sel.hidden = !ehMaster();
    if (ehMaster()) opcoes(sel, dados.orgs, sel.value);
  }
  $('form-cliente').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = $('novo-cliente').value.trim(); if (!nome) return;
    var org = ehMaster() ? $('cliente-org').value : minhaOrg();
    if (!org) { P.avisar(ehMaster() ? 'Crie uma organização primeiro' : 'Você ainda não está em uma organização'); return; }
    P.sb.from('clientes').insert({ nome: nome, organizacao_id: org }).then(function (r) {
      if (r.error) { P.avisar(erroAmigavel(r.error)); return; }
      $('novo-cliente').value = '';
      P.avisar('Cliente criado'); atualizarTudo();
    });
  });

  // ---------- pessoas ----------
  function marcasClientes(uid, org, aoMudar) {
    var lista = clientesDaOrg(org);
    if (!lista.length) return [el('span', { class: 'discreto', text: 'A organização ainda não tem clientes.' })];
    return lista.map(function (c) {
      var caixa = el('input', { type: 'checkbox' });
      caixa.checked = uid ? tem(uid, c.id) : false;
      caixa.dataset.cliente = c.id;
      if (aoMudar) caixa.addEventListener('change', function () { aoMudar(c.id, caixa.checked, caixa); });
      return el('label', { class: 'marcar' }, [caixa, document.createTextNode(c.nome)]);
    });
  }

  function renderPessoas() {
    var eu = P.estado.sessao && P.estado.sessao.user.id;
    $('explica-papeis').textContent = ehMaster()
      ? 'Master vê tudo. Coordenador vê todos os clientes da sua organização e cadastra atendimentos. Atendimento vê só os clientes marcados.'
      : 'Você cadastra atendimentos da sua organização e marca os clientes que cada um atende.';
    var itens = porOrg(dados.pessoas, 'organizacao_id', function (p) {
      var pp = P.papel(p), mexe = p.user_id !== eu && (ehMaster() || pp === 'atendimento');
      var topo = el('div', { class: 'pessoa-topo' }, [el('b', { text: p.nome || p.email }), p.nome ? el('span', { class: 'discreto', text: p.email }) : null,
        el('span', { class: 'selo', text: NIVEIS[pp] }), p.user_id === eu ? el('span', { class: 'selo', text: 'Você' }) : null]);
      var nivel = null;
      if (ehMaster() && p.user_id !== eu) {
        var selPapel = el('select', { 'aria-label': 'Nível' }), selOrg = el('select', { 'aria-label': 'Organização' });
        selPapel.replaceChildren.apply(selPapel, Object.keys(NIVEIS).map(function (k) { return el('option', { value: k, text: NIVEIS[k] }); }));
        selPapel.value = pp;
        opcoes(selOrg, [{ id: '', nome: 'Sem organização' }].concat(dados.orgs), p.organizacao_id || '');
        var salvar = function () {
          chamarFuncao({ acao: 'nivel', user_id: p.user_id, papel: selPapel.value, organizacao_id: selOrg.value || null })
            .then(function () { P.avisar('Nível salvo'); atualizarTudo(); }, function (e) { P.avisar(erroAmigavel(e)); atualizarTudo(); });
        };
        selPapel.addEventListener('change', salvar); selOrg.addEventListener('change', salvar);
        nivel = el('div', { class: 'pessoa-nivel' }, [selPapel, selOrg]);
      }
      var marcas = null;
      if (pp === 'atendimento' && p.organizacao_id && (ehMaster() || p.organizacao_id === minhaOrg())) {
        marcas = el('div', { class: 'marcas' }, marcasClientes(p.user_id, p.organizacao_id, function (cid, ligado, caixa) {
          var q = ligado ? P.sb.from('acessos').insert({ user_id: p.user_id, cliente_id: cid })
            : P.sb.from('acessos').delete().eq('user_id', p.user_id).eq('cliente_id', cid);
          q.then(function (r) {
            if (r.error) { caixa.checked = !ligado; P.avisar('Não foi possível salvar'); return; }
            if (ligado) dados.acessos.push({ user_id: p.user_id, cliente_id: cid });
            else dados.acessos = dados.acessos.filter(function (a) { return !(a.user_id === p.user_id && a.cliente_id === cid); });
            renderClientes();
          });
        }));
      } else if (pp === 'atendimento' && !p.organizacao_id) {
        marcas = el('p', { class: 'discreto', text: 'Escolha a organização para liberar clientes.' });
      }
      var acoes = mexe ? el('div', { class: 'pessoa-acoes' }, [
        el('button', { type: 'button', text: 'Definir nova senha', onclick: function () {
          var senha = window.prompt('Nova senha para ' + (p.nome || p.email) + ' (mínimo 8 caracteres)');
          if (!senha) return;
          chamarFuncao({ acao: 'senha', user_id: p.user_id, senha: senha }).then(function () { P.avisar('Senha definida. Passe para a pessoa.'); },
            function (e) { P.avisar(erroAmigavel(e)); });
        } }),
        el('button', { type: 'button', class: 'remover', text: 'Remover acesso', onclick: function () {
          confirmar(this, 'Remove ' + (p.nome || p.email) + '? Toque de novo', function () {
            chamarFuncao({ acao: 'remover', user_id: p.user_id }).then(function () { P.avisar('Pessoa removida'); atualizarTudo(); },
              function (e) { P.avisar(erroAmigavel(e)); });
          });
        } })
      ]) : null;
      return el('li', { class: 'pessoa' }, [topo, nivel, marcas, acoes]);
    });
    if (!ehMaster()) itens = [el('ul', { class: 'lista-pessoas' }, itens)];
    var caixa = $('lista-pessoas');
    caixa.replaceChildren.apply(caixa, itens.filter(Boolean));
  }

  // ---------- cadastrar pessoa ----------
  function orgDoForm() { return ehMaster() ? $('pessoa-org').value : minhaOrg(); }
  function renderFormPessoa() {
    $('pessoa-nivel').hidden = !ehMaster();
    if (ehMaster()) opcoes($('pessoa-org'), dados.orgs, $('pessoa-org').value);
    else $('pessoa-papel').value = 'atendimento';
    atualizarMarcasForm();
  }
  function atualizarMarcasForm() {
    var caixa = $('pessoa-clientes');
    caixa.replaceChildren.apply(caixa, marcasClientes(null, orgDoForm()));
    $('pessoa-clientes-caixa').hidden = $('pessoa-papel').value !== 'atendimento';
    $('pessoa-org').closest('label').hidden = $('pessoa-papel').value === 'master';
  }
  $('pessoa-papel').addEventListener('change', atualizarMarcasForm);
  $('pessoa-org').addEventListener('change', atualizarMarcasForm);

  $('form-pessoa').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var erro = $('pessoa-erro'); erro.textContent = '';
    var email = $('pessoa-email').value.trim(), senha = $('pessoa-senha').value;
    var nivel = ehMaster() ? $('pessoa-papel').value : 'atendimento';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erro.textContent = 'Digite um e-mail válido.'; return; }
    if (senha.length < 8) { erro.textContent = 'A senha provisória precisa de pelo menos 8 caracteres.'; return; }
    if (nivel !== 'master' && !orgDoForm()) { erro.textContent = 'Escolha a organização.'; return; }
    var clientes = nivel === 'atendimento' ? [].slice.call($('pessoa-clientes').querySelectorAll('input:checked')).map(function (c) { return c.dataset.cliente; }) : [];
    var botao = ev.submitter || this.querySelector('button[type=submit]'); botao.disabled = true;
    chamarFuncao({ acao: 'criar', email: email, nome: $('pessoa-nome').value.trim(), senha: senha, papel: nivel,
      organizacao_id: nivel === 'master' ? null : orgDoForm(), clientes: clientes })
      .then(function () {
        botao.disabled = false;
        P.avisar('Pessoa cadastrada. Passe o e-mail e a senha provisória para ela.');
        $('form-pessoa').reset();
        atualizarTudo();
      }, function (e) { botao.disabled = false; erro.textContent = erroAmigavel(e); });
  });

  // Depois de mudar clientes, o seletor no topo também muda
  function atualizarTudo() {
    return Promise.all([carregarAdmin(), P.carregarConta()]).then(function () {
      if (ehMaster()) renderOrgs();
      renderClientes(); renderPessoas(); renderFormPessoa(); renderConta(); P.renderSeletorCliente();
    }, function () { P.avisar('Não foi possível carregar as configurações'); });
  }

  function renderConfig() {
    P.mostrar('tela-config');
    var pode = gere();
    document.querySelectorAll('#temas-config button').forEach(function (b) {
      b.hidden = b.dataset.tema === 'conta' ? false : b.dataset.tema === 'organizacoes' ? !ehMaster() : !pode;
    });
    if (!pode || (tema === 'organizacoes' && !ehMaster())) tema = 'conta';
    mostrarTema(tema);
    $('temas-config').hidden = !pode;
    renderConta();
    if (pode) atualizarTudo();
  }

  return {
    rota: function (params) {
      if (params.get('config') && P.estado.sessao && !P.estado.demo) { renderConfig(); return true; }
      return false;
    }
  };
});

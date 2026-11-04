// Configurações (tela-config, rota ?config=1). Para todos: nome e senha. Para administradores (perfis.admin):
// clientes, pessoas, papel de cada uma e quais clientes cada uma acessa. O cadastro de pessoas passa pela
// função gerenciar-pessoas, que usa a chave de serviço do Supabase e confere se quem pede é administrador.
(window.PanoramaModulos = window.PanoramaModulos || []).push(function (P) {
  'use strict';

  var $ = P.$, el = P.el;
  var dados = { clientes: [], pessoas: [], acessos: [] };

  function erroAmigavel(e) {
    var m = (e && (e.message || e.erro)) || '';
    if (/duplicate|unique/i.test(m)) return 'Já existe um cliente com esse nome.';
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

  // ---------- minha conta ----------
  function renderConta() {
    var perfil = P.estado.perfil || {};
    var clientes = (P.estado.clientes || []).map(function (c) { return c.nome; });
    $('conta-resumo').textContent = (perfil.email || '') + ' · ' + (perfil.admin ? 'Administrador, vê todos os clientes' :
      clientes.length ? 'Acessa: ' + clientes.join(', ') : 'Ainda sem acesso a clientes');
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
      if (r.error) { msg.textContent = /weak|short|least/i.test(r.error.message || '') ? 'Senha fraca demais.' : 'Não foi possível trocar a senha.'; return; }
      msg.classList.remove('erro'); msg.textContent = 'Senha trocada.';
      $('minha-senha').value = ''; $('minha-senha-2').value = '';
    });
  });

  // ---------- administração ----------
  function carregarAdmin() {
    return Promise.all([
      P.sb.from('clientes').select('id, nome').order('nome'),
      P.sb.from('perfis').select('user_id, email, nome, admin').order('email'),
      P.sb.from('acessos').select('user_id, cliente_id')
    ]).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      dados = { clientes: r[0].data || [], pessoas: r[1].data || [], acessos: r[2].data || [] };
    });
  }
  function tem(uid, cid) { return dados.acessos.some(function (a) { return a.user_id === uid && a.cliente_id === cid; }); }

  function renderClientes() {
    var ul = $('lista-clientes');
    ul.replaceChildren.apply(ul, dados.clientes.length ? dados.clientes.map(function (c) {
      var n = dados.acessos.filter(function (a) { return a.cliente_id === c.id; }).length;
      return el('li', {}, [
        el('span', { class: 'termo', text: c.nome }),
        el('span', { class: 'discreto', text: n === 1 ? '1 pessoa liberada' : n + ' pessoas liberadas' }),
        el('button', { type: 'button', class: 'remover', text: 'Renomear', onclick: function () {
          var novo = window.prompt('Novo nome para ' + c.nome, c.nome);
          if (!novo || !novo.trim() || novo.trim() === c.nome) return;
          P.sb.from('clientes').update({ nome: novo.trim() }).eq('id', c.id).then(function (r) {
            if (r.error) { P.avisar(erroAmigavel(r.error)); return; }
            P.avisar('Cliente renomeado'); atualizarTudo();
          });
        } }),
        el('button', { type: 'button', class: 'remover', text: 'Apagar', onclick: function () {
          var b = this;
          confirmar(b, 'Apaga tudo de ' + c.nome + '? Toque de novo', function () {
            P.sb.from('clientes').delete().eq('id', c.id).then(function (r) {
              if (r.error) { P.avisar('Não foi possível apagar'); return; }
              P.avisar('Cliente apagado'); atualizarTudo();
            });
          });
        } })
      ]);
    }) : [el('li', { class: 'vazio', text: 'Nenhum cliente ainda.' })]);
  }

  function marcasClientes(uid, aoMudar) {
    return dados.clientes.map(function (c) {
      var caixa = el('input', { type: 'checkbox' });
      caixa.checked = uid ? tem(uid, c.id) : false;
      caixa.dataset.cliente = c.id;
      if (aoMudar) caixa.addEventListener('change', function () { aoMudar(c.id, caixa.checked, caixa); });
      return el('label', { class: 'marcar' }, [caixa, document.createTextNode(c.nome)]);
    });
  }

  function renderPessoas() {
    var eu = P.estado.sessao && P.estado.sessao.user.id;
    var ul = $('lista-pessoas');
    ul.replaceChildren.apply(ul, dados.pessoas.map(function (p) {
      var admin = el('input', { type: 'checkbox' });
      admin.checked = p.admin; admin.disabled = p.user_id === eu;
      var marcas = el('div', { class: 'marcas' }, marcasClientes(p.user_id, function (cid, ligado, caixa) {
        var q = ligado ? P.sb.from('acessos').insert({ user_id: p.user_id, cliente_id: cid })
          : P.sb.from('acessos').delete().eq('user_id', p.user_id).eq('cliente_id', cid);
        q.then(function (r) {
          if (r.error) { caixa.checked = !ligado; P.avisar('Não foi possível salvar'); return; }
          if (ligado) dados.acessos.push({ user_id: p.user_id, cliente_id: cid });
          else dados.acessos = dados.acessos.filter(function (a) { return !(a.user_id === p.user_id && a.cliente_id === cid); });
          renderClientes();
        });
      }));
      marcas.hidden = p.admin;
      admin.addEventListener('change', function () {
        var ligado = admin.checked;
        P.sb.from('perfis').update({ admin: ligado }).eq('user_id', p.user_id).then(function (r) {
          if (r.error) { admin.checked = !ligado; P.avisar('Não foi possível salvar'); return; }
          p.admin = ligado; marcas.hidden = ligado;
          P.avisar(ligado ? 'Agora é administrador' : 'Deixou de ser administrador');
        });
      });
      return el('li', { class: 'pessoa' }, [
        el('div', { class: 'pessoa-topo' }, [el('b', { text: p.nome || p.email }), p.nome ? el('span', { class: 'discreto', text: p.email }) : null,
          p.user_id === eu ? el('span', { class: 'selo', text: 'Você' }) : null]),
        el('label', { class: 'marcar' }, [admin, document.createTextNode('Administrador (vê todos os clientes)')]),
        marcas,
        p.user_id === eu ? null : el('div', { class: 'pessoa-acoes' }, [
          el('button', { type: 'button', text: 'Definir nova senha', onclick: function () {
            var senha = window.prompt('Nova senha para ' + (p.nome || p.email) + ' (mínimo 8 caracteres)');
            if (!senha) return;
            chamarFuncao({ acao: 'senha', user_id: p.user_id, senha: senha }).then(function () { P.avisar('Senha definida. Passe para a pessoa.'); },
              function (e) { P.avisar(erroAmigavel(e)); });
          } }),
          el('button', { type: 'button', class: 'remover', text: 'Remover acesso', onclick: function () {
            var b = this;
            confirmar(b, 'Remove ' + (p.nome || p.email) + '? Toque de novo', function () {
              chamarFuncao({ acao: 'remover', user_id: p.user_id }).then(function () { P.avisar('Pessoa removida'); atualizarTudo(); },
                function (e) { P.avisar(erroAmigavel(e)); });
            });
          } })
        ])
      ]);
    }));
  }

  function renderFormPessoa() {
    var caixa = $('pessoa-clientes');
    caixa.replaceChildren.apply(caixa, marcasClientes(null));
    $('pessoa-clientes-caixa').hidden = $('pessoa-admin').checked;
  }
  $('pessoa-admin').addEventListener('change', function () { $('pessoa-clientes-caixa').hidden = this.checked; });

  $('form-pessoa').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var erro = $('pessoa-erro'); erro.textContent = '';
    var email = $('pessoa-email').value.trim(), senha = $('pessoa-senha').value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { erro.textContent = 'Digite um e-mail válido.'; return; }
    if (senha.length < 8) { erro.textContent = 'A senha provisória precisa de pelo menos 8 caracteres.'; return; }
    var clientes = [].slice.call($('pessoa-clientes').querySelectorAll('input:checked')).map(function (c) { return c.dataset.cliente; });
    var botao = ev.submitter || this.querySelector('button[type=submit]'); botao.disabled = true;
    chamarFuncao({ acao: 'criar', email: email, nome: $('pessoa-nome').value.trim(), senha: senha, admin: $('pessoa-admin').checked, clientes: clientes })
      .then(function () {
        botao.disabled = false;
        P.avisar('Pessoa cadastrada. Passe o e-mail e a senha provisória para ela.');
        $('form-pessoa').reset();
        atualizarTudo();
      }, function (e) { botao.disabled = false; erro.textContent = erroAmigavel(e); });
  });

  $('form-cliente').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = $('novo-cliente').value.trim(); if (!nome) return;
    P.sb.from('clientes').insert({ nome: nome }).then(function (r) {
      if (r.error) { P.avisar(erroAmigavel(r.error)); return; }
      $('novo-cliente').value = '';
      P.avisar('Cliente criado'); atualizarTudo();
    });
  });

  // Depois de mudar clientes, a lista do seletor no topo também muda
  function atualizarTudo() {
    return Promise.all([carregarAdmin(), P.carregarConta()]).then(function () { renderClientes(); renderPessoas(); renderFormPessoa(); renderConta(); },
      function () { P.avisar('Não foi possível carregar a administração'); });
  }

  function renderConfig() {
    P.mostrar('tela-config');
    renderConta();
    var admin = Boolean(P.estado.perfil && P.estado.perfil.admin);
    $('config-admin').hidden = !admin;
    if (admin) atualizarTudo();
  }

  return {
    rota: function (params) {
      if (params.get('config') && P.estado.sessao && !P.estado.demo) { renderConfig(); return true; }
      return false;
    }
  };
});

// Página de descadastro: confirma o pedido e chama a função descadastrar (sem login).
(function () {
  var q = new URLSearchParams(location.search), cfg = window.PANORAMA_CONFIG || {};
  var texto = document.getElementById('texto'), botao = document.getElementById('confirmar');
  if (!q.get('e') || !q.get('t') || !q.get('c')) { texto.textContent = 'Este link está incompleto.'; botao.hidden = true; return; }
  texto.textContent = 'Confirme para que ' + q.get('e') + ' não receba mais os e-mails deste remetente.';
  botao.addEventListener('click', function () {
    botao.disabled = true;
    fetch(cfg.supabaseUrl + '/functions/v1/descadastrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey },
      body: JSON.stringify({ c: q.get('c'), e: q.get('e'), t: q.get('t') })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) { texto.textContent = 'Pronto. ' + q.get('e') + ' não vai mais receber estes e-mails.'; botao.hidden = true; }
      else { texto.textContent = j.erro || 'Não foi possível registrar.'; botao.disabled = false; }
    }, function () { texto.textContent = 'Sem conexão. Tente de novo.'; botao.disabled = false; });
  });
})();

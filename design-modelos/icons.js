// Ícones de linha, injetados como sprite. Uso: <svg class="i"><use href="#i-casa"/></svg>
(function () {
  var p = {
    casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    escudo: '<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    pessoas: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18 14.4c1.8.8 3 2.6 3 5.6"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arquivo: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    carteira: '<path d="M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M3 7l12-3v3M16 14h2"/>',
    sino: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19 12l2-1-1.5-3-2.2.6-1.6-1.6.6-2.2-3-1.5-1 2h-2.6l-1-2-3 1.5.6 2.2L5.7 8.6 3.5 8 2 11l2 1v2l-2 1 1.5 3 2.2-.6 1.6 1.6-.6 2.2 3 1.5 1-2h2.6l1 2 3-1.5-.6-2.2 1.6-1.6 2.2.6L22 14l-2-1z" transform="scale(.9) translate(1.3 1.3)"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 20h2M20 14v2"/>',
    chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
    sair: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
    busca: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    livro: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5M9 8h6"/>',
    agenda: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
    conversa: '<path d="M4 5h16v11H9l-5 4z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    banco: '<path d="M4 9l8-5 8 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18"/>',
    codigo: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    pulso: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
    cadeado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    olho: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  };
  var s = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">';
  for (var k in p) s += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + p[k] + '</symbol>';
  document.body.insertAdjacentHTML('afterbegin', s + '</svg>');
})();

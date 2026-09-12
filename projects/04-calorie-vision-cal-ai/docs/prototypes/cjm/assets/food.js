'use strict';
/* SVG-иллюстрации блюд для прототипа. Свои рисунки, не фото: у прототипа нет внешних ресурсов. */

const FOOD = (function () {
  function svg(inner, cls) {
    return '<svg class="food ' + (cls || '') + '" viewBox="0 0 200 200" aria-hidden="true" focusable="false">' +
      '<defs>' +
      '<radialGradient id="fPlate" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".8" stop-color="#F3EEE6"/><stop offset="1" stop-color="#D9D2C6"/></radialGradient>' +
      '<linearGradient id="fCake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2C173"/><stop offset="1" stop-color="#C98A3B"/></linearGradient>' +
      '<linearGradient id="fCream" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFDF7"/><stop offset="1" stop-color="#EFE6D6"/></linearGradient>' +
      '<radialGradient id="fBerry" cx="35%" cy="35%" r="65%"><stop offset="0" stop-color="#7A6BE0"/><stop offset="1" stop-color="#2E2570"/></radialGradient>' +
      '<linearGradient id="fLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9BD77A"/><stop offset="1" stop-color="#3F8F3C"/></linearGradient>' +
      '<linearGradient id="fPasta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7D889"/><stop offset="1" stop-color="#E0A23C"/></linearGradient>' +
      '<radialGradient id="fSauce" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="#C8452F"/><stop offset="1" stop-color="#7E2418"/></radialGradient>' +
      '</defs>' +
      '<ellipse cx="100" cy="112" rx="88" ry="72" fill="rgba(0,0,0,.18)"/>' +
      '<ellipse cx="100" cy="104" rx="88" ry="72" fill="url(#fPlate)"/>' +
      '<ellipse cx="100" cy="104" rx="70" ry="56" fill="none" stroke="#E4DCCF" stroke-width="2"/>' +
      inner + '</svg>';
  }

  function berry(x, y, r) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#fBerry)"/>' +
      '<circle cx="' + (x - r * .3) + '" cy="' + (y - r * .35) + '" r="' + (r * .28) + '" fill="rgba(255,255,255,.35)"/>';
  }

  /* сырники: три диска, сметана, черника */
  const syrniki =
    '<ellipse cx="100" cy="118" rx="52" ry="14" fill="#B57A33"/>' +
    '<ellipse cx="100" cy="110" rx="52" ry="14" fill="url(#fCake)"/>' +
    '<ellipse cx="97" cy="100" rx="50" ry="14" fill="#B57A33"/>' +
    '<ellipse cx="97" cy="92" rx="50" ry="14" fill="url(#fCake)"/>' +
    '<ellipse cx="102" cy="82" rx="48" ry="14" fill="#B57A33"/>' +
    '<ellipse cx="102" cy="74" rx="48" ry="14" fill="url(#fCake)"/>' +
    '<path d="M74 70c8-9 22-13 34-11 12 2 20 8 27 6 5-2 8 4 4 8-9 8-28 10-42 8-11-1-22-5-23-11z" fill="url(#fCream)"/>' +
    '<path d="M86 80c3 6 4 12 2 18" stroke="#F4E9D2" stroke-width="5" stroke-linecap="round" fill="none"/>' +
    '<path d="M118 78c1 7-1 13-4 18" stroke="#F4E9D2" stroke-width="5" stroke-linecap="round" fill="none"/>' +
    berry(88, 66, 6) + berry(104, 62, 5.5) + berry(116, 70, 6) + berry(60, 120, 5) + berry(146, 112, 5.5) + berry(140, 126, 4.5) +
    '<path d="M52 128c4-6 10-8 16-6" stroke="url(#fLeaf)" stroke-width="4" stroke-linecap="round" fill="none"/>';

  /* салат с тунцом в миске */
  const salad =
    '<ellipse cx="100" cy="100" rx="66" ry="46" fill="#3A5A3C"/>' +
    '<ellipse cx="100" cy="94" rx="66" ry="46" fill="#4E7B4E"/>' +
    '<path d="M50 92c14-18 34-24 52-20 18 4 34 2 48 12-12 14-30 22-50 22s-40-4-50-14z" fill="url(#fLeaf)"/>' +
    '<circle cx="76" cy="90" r="9" fill="#E14D3C"/><circle cx="126" cy="98" r="8" fill="#E14D3C"/>' +
    '<ellipse cx="102" cy="88" rx="18" ry="10" fill="#F3D8C7"/><ellipse cx="98" cy="84" rx="10" ry="5" fill="#E9B9A0"/>' +
    '<circle cx="90" cy="104" r="6" fill="#F5E27A"/><circle cx="114" cy="106" r="5" fill="#F5E27A"/>' +
    '<ellipse cx="60" cy="104" rx="7" ry="4" fill="#2B2B2B"/><ellipse cx="140" cy="86" rx="6" ry="4" fill="#2B2B2B"/>';

  /* паста болоньезе */
  const pasta =
    '<path d="M60 96c10-22 70-22 80 0 6 14-4 30-40 30S54 110 60 96z" fill="url(#fPasta)"/>' +
    '<g stroke="#D69A33" stroke-width="3" fill="none" stroke-linecap="round">' +
    '<path d="M62 100c14-10 30 8 46-2s26-6 34 4"/><path d="M66 112c10-8 24 6 38-2s24-4 32 2"/><path d="M76 122c8-6 20 4 30-2"/></g>' +
    '<ellipse cx="100" cy="96" rx="34" ry="16" fill="url(#fSauce)"/>' +
    '<circle cx="88" cy="94" r="4" fill="#5A1A10"/><circle cx="108" cy="90" r="4.5" fill="#5A1A10"/><circle cx="98" cy="102" r="3.5" fill="#5A1A10"/>' +
    '<path d="M110 82c6-8 14-8 18-2" stroke="url(#fLeaf)" stroke-width="4" stroke-linecap="round" fill="none"/>' +
    '<circle cx="118" cy="104" r="5" fill="#FFF7E6"/><circle cx="84" cy="106" r="4" fill="#FFF7E6"/>';

  const DISHES = { syrniki: syrniki, salad: salad, pasta: pasta };

  return {
    svg: function (id, cls) { return svg(DISHES[id] || syrniki, cls); }
  };
})();

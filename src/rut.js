'use strict';
// Utilidades para el RUT chileno (Rol Único Tributario)

function clean(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

function computeDv(body) {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  if (r === 11) return '0';
  if (r === 10) return 'K';
  return String(r);
}

function isValid(rut) {
  const c = clean(rut);
  if (c.length < 2 || c.length > 10) return false;
  const body = c.slice(0, -1);
  const dv = c.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  if (Number(body) < 100000) return false;
  return computeDv(body) === dv;
}

// Forma canónica para guardar: 12345678-9
function normalize(rut) {
  const c = clean(rut);
  if (c.length < 2) return c;
  return c.slice(0, -1).replace(/^0+/, '') + '-' + c.slice(-1);
}

// Forma para mostrar: 12.345.678-9
function format(rut) {
  const c = clean(rut);
  if (c.length < 2) return c;
  const body = c.slice(0, -1).replace(/^0+/, '');
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
}

module.exports = { clean, computeDv, isValid, normalize, format };

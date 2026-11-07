// RUT chileno (versión navegador)
export function clean(rut) { return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase(); }
export function computeDv(body) {
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
export function isValid(rut) {
  const c = clean(rut);
  if (c.length < 2 || c.length > 10) return false;
  const body = c.slice(0, -1);
  if (!/^\d+$/.test(body) || Number(body) < 100000) return false;
  return computeDv(body) === c.slice(-1);
}
export function format(rut) {
  const c = clean(rut);
  if (c.length < 2) return c;
  const body = c.slice(0, -1).replace(/^0+/, '');
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
}
// Formatea mientras se escribe
export function attachRutInput(input) {
  input.addEventListener('input', () => {
    const c = clean(input.value).slice(0, 9);
    input.value = c.length > 1 ? format(c) : c;
    input.classList.toggle('invalid', c.length >= 8 && !isValid(c));
  });
}

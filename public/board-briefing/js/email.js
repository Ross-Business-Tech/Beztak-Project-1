/*
 * Builds an email draft file (.eml) with the deck attached. Double-clicking it opens
 * a ready-to-send message in Outlook, Apple Mail and most other desktop mail apps.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.QAD = root.QAD || {}; root.QAD.email = factory(); }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  function toBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function wrap(s) { return s.replace(/(.{76})/g, '$1\r\n'); }
  // Header text outside plain ASCII must be encoded (RFC 2047).
  function headerText(s) {
    s = String(s).replace(/[\r\n]+/g, ' ');
    if (/^[\x20-\x7e]*$/.test(s)) return s;
    const bytes = typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8') : new TextEncoder().encode(s);
    return '=?UTF-8?B?' + toBase64(bytes) + '?=';
  }
  function bodyBase64(text) {
    const bytes = typeof Buffer !== 'undefined' ? Buffer.from(text, 'utf8') : new TextEncoder().encode(text);
    return wrap(toBase64(bytes));
  }
  function addresses(s) {
    return String(s || '').split(/[,;\s]+/).filter(function (a) { return /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/.test(a); }).join(', ');
  }

  /** opts: { to, subject, body, filename, bytes (Uint8Array), mime } */
  function buildEml(opts) {
    const boundary = '----=_BriefingPart_' + Date.now().toString(36);
    const mime = opts.mime || 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const safeName = String(opts.filename).replace(/[^A-Za-z0-9._-]/g, '_');
    const to = addresses(opts.to);
    const lines = [
      'X-Unsent: 1', // makes Outlook open it as a draft to send
      'To: ' + to,
      'Subject: ' + headerText(opts.subject),
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      bodyBase64(opts.body),
      '--' + boundary,
      'Content-Type: ' + mime + '; name="' + safeName + '"',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="' + safeName + '"',
      '',
      wrap(toBase64(opts.bytes)),
      '--' + boundary + '--',
      ''
    ];
    return lines.join('\r\n');
  }

  return { buildEml: buildEml, addresses: addresses };
});

// Генерация QR и печатные макеты.
//
// ADR-001: QR ведёт на НАШ домен, никогда прямо на площадку. Это не удобство, а
// экономика носителя: целевые ссылки площадок меняются на сервере, а тираж наклеек —
// деньгами и неделями. Статический QR на площадку ломается молча при первой смене
// адреса карточки.

import QRCode from 'qrcode';

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',   // выдерживает потёртость наклейки
    margin: 2,
    color: { dark: '#00132e', light: '#ffffff' },
  });
}

export function guestUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/r/${slug}`;
}

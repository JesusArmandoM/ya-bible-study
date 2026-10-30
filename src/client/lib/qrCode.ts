import QRCode from 'qrcode';

export const JOIN_QR_ERROR_CORRECTION = 'M';
export const JOIN_QR_MARGIN = 2;

export interface JoinQrRenderOptions {
  /** Accessible label injected into the generated `<svg>` element. */
  ariaLabel?: string;
}

function sanitizeAttribute(value: string): string {
  return value.replace(/"/g, "'").replace(/[<>]/g, '');
}

/**
 * Renders a deterministic, fully offline QR SVG for a join URL using the
 * pure-JavaScript `qrcode` encoder — zero network calls, zero external QR
 * APIs (CONSTRAINTS #1). The same payload always yields byte-identical SVG
 * markup, and no room code ever leaves the device.
 */
export async function renderJoinQrSvg(
  payload: string,
  options: JoinQrRenderOptions = {},
): Promise<string> {
  const svg = await QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: JOIN_QR_ERROR_CORRECTION,
    margin: JOIN_QR_MARGIN,
  });

  const ariaLabel = sanitizeAttribute(
    options.ariaLabel ?? 'QR code to join this Bible study session',
  );

  return svg.replace(
    '<svg ',
    `<svg role="img" aria-label="${ariaLabel}" data-testid="lobby-qr-svg-mark" `,
  );
}

// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomCodeShareSheet } from '../../src/client/components/lobby/RoomCodeShareSheet';
import { renderJoinQrSvg } from '../../src/client/lib/qrCode';

const JOIN_URL = 'http://127.0.0.1:3101/join/ABC123';

describe('renderJoinQrSvg (client-side, offline QR)', () => {
  it('is deterministic for a fixed join URL and contains no external references', async () => {
    const first = await renderJoinQrSvg(JOIN_URL);
    const second = await renderJoinQrSvg(JOIN_URL);

    expect(first).toBe(second);
    expect(first).toContain('<svg');
    expect(first).toContain('</svg>');
    expect(first).toContain('role="img"');
    expect(first).toContain('aria-label=');
    // Pure vector output: no raster images and no fetched resources.
    expect(first).not.toContain('<image');
    expect(first).not.toContain('xlink:href');
    expect(first).not.toContain('https://');
    expect(first).not.toContain('http://127');
  });

  it('encodes exactly the resolved join URL payload (byte-different payloads differ)', async () => {
    const a = await renderJoinQrSvg('https://demo.trycloudflare.com/join/AAAAAA');
    const b = await renderJoinQrSvg('https://demo.trycloudflare.com/join/BBBBBB');
    expect(a).not.toBe(b);
  });
});

describe('RoomCodeShareSheet', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  function renderSheet(
    overrides: Partial<{
      open: boolean;
      sessionCode: string;
      joinUrl: string;
      isLocalOnly: boolean;
      usedPublicUrl: boolean;
    }> = {},
  ) {
    const onClose = vi.fn();
    const view = render(
      <RoomCodeShareSheet
        open={overrides.open ?? true}
        sessionCode={overrides.sessionCode ?? 'ABC123'}
        joinUrl={overrides.joinUrl ?? JOIN_URL}
        isLocalOnly={overrides.isLocalOnly ?? true}
        usedPublicUrl={overrides.usedPublicUrl ?? false}
        onClose={onClose}
      />,
    );
    return { onClose, ...view };
  }

  it('renders the offline QR SVG, room code, and readonly join URL field', async () => {
    renderSheet();

    const qr = await screen.findByTestId('lobby-qr-svg');
    expect(qr.querySelector('svg')).not.toBeNull();
    expect(qr).toHaveAttribute('role', 'img');
    expect(qr.querySelector('svg')?.outerHTML).toContain('aria-label');

    expect(screen.getByTestId('lobby-room-code')).toHaveTextContent('ABC123');

    const joinUrlField = screen.getByTestId(
      'lobby-join-url',
    ) as HTMLInputElement;
    expect(joinUrlField.value).toBe(JOIN_URL);
    expect(joinUrlField).toHaveAttribute('readonly');
  });

  it('copies the join URL and announces "Link copied" via aria-live', async () => {
    renderSheet();

    const status = screen.getByTestId('lobby-copy-status');
    expect(status).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByTestId('lobby-copy-link'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JOIN_URL));
    await waitFor(() =>
      expect(screen.getByTestId('lobby-copy-status')).toHaveTextContent(
        'Link copied',
      ),
    );
  });

  it('warns with a terracotta pill naming npm run share on local-only origins without PUBLIC_URL', () => {
    renderSheet({ isLocalOnly: true, usedPublicUrl: false });

    const warning = screen.getByTestId('lobby-localhost-warning');
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent('npm run share');
  });

  it('hides the warning when PUBLIC_URL is used or the origin is already public', () => {
    const { unmount } = renderSheet({
      isLocalOnly: true,
      usedPublicUrl: true,
    });
    expect(
      screen.queryByTestId('lobby-localhost-warning'),
    ).not.toBeInTheDocument();
    unmount();

    renderSheet({ isLocalOnly: false, usedPublicUrl: false });
    expect(
      screen.queryByTestId('lobby-localhost-warning'),
    ).not.toBeInTheDocument();
  });

  it('closes via the close control', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByTestId('room-code-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

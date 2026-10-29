// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App';

describe('Midnight Sanctuary App shell', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders brand lockup, editorial heading, Study Leader/Participant labels, and settles on Connected in community when /api/health returns ok', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          uptimeSeconds: 12,
          activeSessionCount: 0,
          wsReady: true,
          timestamp: '2026-10-29T18:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    render(<App />);

    expect(screen.getByText('YA')).toBeInTheDocument();
    expect(screen.getByText('BIBLE STUDY')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Bible Study for Young Adults',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Live interactive sessions for young adults.'),
    ).toBeInTheDocument();

    expect(screen.getByText('Study Leader')).toBeInTheDocument();
    expect(screen.getByText('Participant')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Assistant');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ method: 'GET' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('sanctuary-health-pill')).toHaveTextContent(
        'v1.0 · Connected in community',
      );
    });
    expect(screen.getByTestId('sanctuary-health-pill')).toHaveAttribute(
      'data-status',
      'ok',
    );
  });

  it('renders degraded offline state when /api/health fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

    render(<App />);

    expect(screen.getByTestId('sanctuary-health-pill')).toHaveAttribute(
      'data-status',
      'loading',
    );

    await waitFor(() => {
      expect(screen.getByTestId('sanctuary-health-pill')).toHaveAttribute(
        'data-status',
        'degraded',
      );
    });
    expect(screen.getByTestId('sanctuary-health-pill')).toHaveTextContent(
      'v1.0 · Sanctuary offline',
    );
  });
});

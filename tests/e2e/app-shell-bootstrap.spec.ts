import { expect, test } from '@playwright/test';

test.describe('Single-port Midnight Sanctuary bootstrap', () => {
  test('serves GET /api/health, JSON 404 for unknown API paths, /ws upgrade, and mobile React shell on one unified port', async ({
    page,
    request,
  }) => {
    const healthResponse = await request.get('/api/health', {
      headers: { 'X-Forwarded-Host': 'demo-room.trycloudflare.com' },
    });
    expect(healthResponse.status()).toBe(200);
    expect(healthResponse.headers()['content-type']).toContain(
      'application/json',
    );

    const healthJson = (await healthResponse.json()) as {
      status: string;
      uptimeSeconds: number;
      activeSessionCount: number;
      wsReady: boolean;
      timestamp: string;
    };
    expect(healthJson).toMatchObject({
      status: 'ok',
      activeSessionCount: 0,
      wsReady: true,
    });
    expect(typeof healthJson.uptimeSeconds).toBe('number');

    const missingApiResponse = await request.get('/api/nonexistent');
    expect(missingApiResponse.status()).toBe(404);
    expect(await missingApiResponse.json()).toEqual({ error: 'Not found' });

    await page.goto('/');
    await expect(page).toHaveTitle('YA Bible Study');

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Bible Study for Young Adults',
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Live interactive sessions for young adults.'),
    ).toBeVisible();
    await expect(page.getByText('BIBLE STUDY', { exact: true })).toBeVisible();
    await expect(page.getByText('Study Leader', { exact: true })).toBeVisible();
    await expect(page.getByText('Participant', { exact: true })).toBeVisible();

    const healthPill = page.getByTestId('sanctuary-health-pill');
    await expect(healthPill).toHaveText('v1.0 · Connected in community');
    await expect(healthPill).toHaveAttribute('data-status', 'ok');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Assistant');

    const styleDiagnostics = await page.evaluate(() => {
      const bodyStyle = window.getComputedStyle(document.body);
      const heading = document.querySelector('h1');
      const headingStyle = heading ? window.getComputedStyle(heading) : null;

      const probeInput = document.createElement('input');
      document.body.appendChild(probeInput);
      const inputFontSizePx = Number.parseFloat(
        window.getComputedStyle(probeInput).fontSize,
      );
      probeInput.remove();

      return {
        bodyBg: bodyStyle.backgroundColor,
        headingFontFamily: headingStyle?.fontFamily ?? '',
        inputFontSizePx,
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(styleDiagnostics.bodyBg).toBe('rgb(11, 13, 23)');
    expect(styleDiagnostics.headingFontFamily).toContain('Playfair Display');
    expect(styleDiagnostics.inputFontSizePx).toBeGreaterThanOrEqual(16);
    expect(styleDiagnostics.hasHorizontalOverflow).toBe(false);

    const wsRoundTrip = await page.evaluate(async () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      return await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        socket.addEventListener('open', () => {
          socket.send(JSON.stringify({ type: 'ping' }));
        });
        socket.addEventListener('message', (event) => {
          const payload = JSON.parse(String(event.data)) as { type: string };
          socket.close();
          resolve(payload.type);
        });
        socket.addEventListener('error', () => {
          reject(new Error('WebSocket failed to connect on unified port'));
        });
      });
    });
    expect(wsRoundTrip).toBe('pong');

    await page.goto('/join/SANCTUARY1');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Bible Study for Young Adults',
      }),
    ).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';

test.describe('Welcome & Role Selection Flow', () => {
  test('Scenario 1 & 5: Welcome screen renders role cards, zero Assistant copy, persistent 3D canvas, and single-tap back navigation', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Verify brand lockup and editorial typography
    await expect(page.getByText('YA', { exact: true })).toBeVisible();
    await expect(page.getByText('BIBLE STUDY', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Bible Study for Young Adults',
      }),
    ).toBeVisible();

    // 2. Verify role cards
    await expect(page.getByText('CHOOSE YOUR ROLE')).toBeVisible();
    const leaderCard = page.getByTestId('welcome-role-leader');
    const participantCard = page.getByTestId('welcome-role-participant');

    await expect(leaderCard).toBeVisible();
    await expect(participantCard).toBeVisible();
    await expect(leaderCard.getByText('Study Leader')).toBeVisible();
    await expect(participantCard.getByText('Participant')).toBeVisible();

    // 3. Verify zero occurrences of Assistant
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Assistant');

    // 4. Verify persistent 3D canvas
    const scene = page.getByTestId('sacred-3d-scene');
    await expect(scene).toBeVisible();
    const canvas = scene.locator('canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute(
      'data-rendered-stage',
      'sanctuary-emblem',
    );

    // 5. Test single-tap Back navigation on Study Leader sheet
    await leaderCard.click();
    await expect(page.getByTestId('leader-access-sheet')).toBeVisible();
    await expect(page.getByText('CHOOSE YOUR ROLE')).not.toBeVisible();

    await page.getByRole('button', { name: /back/i }).click();
    await expect(page.getByText('CHOOSE YOUR ROLE')).toBeVisible();
    await expect(page.getByTestId('welcome-role-leader')).toBeVisible();

    // 6. Test single-tap Back navigation on Participant join sheet
    await participantCard.click();
    await expect(page.getByTestId('participant-join-sheet')).toBeVisible();
    await expect(page.getByText('CHOOSE YOUR ROLE')).not.toBeVisible();

    // Check font size >= 16px to prevent iOS Safari auto-zoom
    const inputFontSize = await page.evaluate(() => {
      const input = document.querySelector('input');
      return input ? parseFloat(window.getComputedStyle(input).fontSize) : 0;
    });
    expect(inputFontSize).toBeGreaterThanOrEqual(16);

    await page.getByRole('button', { name: /back/i }).click();
    await expect(page.getByText('CHOOSE YOUR ROLE')).toBeVisible();
  });

  test('Scenario 2, 3, 4, 6: Multi-context room creation, participant join via URL prefill, PIN claim handoff, and session reload persistence', async ({
    browser,
  }) => {
    // ----------------------------------------------------
    // Context 1: Study Leader creates room
    // ----------------------------------------------------
    const contextLeader = await browser.newContext();
    const pageLeader = await contextLeader.newPage();
    await pageLeader.goto('/');

    await pageLeader.getByTestId('welcome-role-leader').click();
    await expect(pageLeader.getByTestId('leader-access-sheet')).toBeVisible();

    await pageLeader.getByLabel(/Leader Name/i).fill('Claire');
    await pageLeader.getByRole('button', { name: 'Create Room' }).click();

    // Leader sees active session banner
    const leaderBanner = pageLeader.getByTestId('active-session-banner');
    await expect(leaderBanner).toBeVisible();

    const sessionCode = (
      await pageLeader.getByTestId('active-session-code').innerText()
    ).trim();
    expect(sessionCode).toMatch(/^[A-Z0-9]{6}$/);

    const leaderPin = (
      await pageLeader.getByTestId('active-leader-pin').innerText()
    ).trim();
    expect(leaderPin).toMatch(/^\d{4}$/);

    await expect(pageLeader.getByTestId('active-user-role')).toHaveText(
      'Study Leader',
    );
    await expect(pageLeader.getByTestId('active-connected-count')).toHaveText(
      /1 member connected/,
    );

    // Verify sessionStorage has stored credentials
    const leaderStorage = await pageLeader.evaluate(() => {
      const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
      return raw ? JSON.parse(raw) : null;
    });
    expect(leaderStorage).toMatchObject({
      sessionCode,
      role: 'Study Leader',
    });

    // ----------------------------------------------------
    // Context 2: Participant joins via /join/:code URL prefill
    // ----------------------------------------------------
    const contextParticipant = await browser.newContext();
    const pageParticipant = await contextParticipant.newPage();
    await pageParticipant.goto(`/join/${sessionCode}`);

    // Join sheet should open automatically with sessionCode prefilled
    await expect(
      pageParticipant.getByTestId('participant-join-sheet'),
    ).toBeVisible();
    const codeInputValue = await pageParticipant
      .getByLabel(/Session Code/i)
      .inputValue();
    expect(codeInputValue).toBe(sessionCode);

    // Enter name and join
    await pageParticipant.getByLabel(/Your Name/i).fill('Daniel');
    await pageParticipant.getByRole('button', { name: 'Join Study' }).click();

    // Participant sees active session banner
    const participantBanner = pageParticipant.getByTestId(
      'active-session-banner',
    );
    await expect(participantBanner).toBeVisible();
    await expect(
      pageParticipant.getByTestId('active-session-code'),
    ).toHaveText(sessionCode);
    await expect(pageParticipant.getByTestId('active-user-role')).toHaveText(
      'Participant',
    );

    // Participant must NEVER see the leader PIN
    await expect(
      pageParticipant.getByTestId('active-leader-pin-box'),
    ).toHaveCount(0);

    // Verify live member count synced to 2 on both pages
    await expect(
      pageParticipant.getByTestId('active-connected-count'),
    ).toHaveText(/2 members connected/);
    await expect(pageLeader.getByTestId('active-connected-count')).toHaveText(
      /2 members connected/,
    );

    // ----------------------------------------------------
    // Context 3: Second device claims leadership via PIN
    // ----------------------------------------------------
    const contextClaimer = await browser.newContext();
    const pageClaimer = await contextClaimer.newPage();
    await pageClaimer.goto('/');

    await pageClaimer.getByTestId('welcome-role-leader').click();
    await pageClaimer.getByRole('tab', { name: 'Claim Room' }).click();

    await pageClaimer.getByLabel(/Session Code/i).fill(sessionCode);
    await pageClaimer.getByLabel(/4-Digit Leader PIN/i).fill('0000');
    await pageClaimer
      .getByRole('button', { name: 'Claim Leadership' })
      .click();

    // Invalid PIN shows accessible alert
    await expect(pageClaimer.getByRole('alert')).toBeVisible();

    // Enter correct leader PIN
    await pageClaimer.getByLabel(/4-Digit Leader PIN/i).fill(leaderPin);
    await pageClaimer
      .getByRole('button', { name: 'Claim Leadership' })
      .click();

    // Claimer transitions to active Study Leader
    await expect(
      pageClaimer.getByTestId('active-session-banner'),
    ).toBeVisible();
    await expect(pageClaimer.getByTestId('active-user-role')).toHaveText(
      'Study Leader',
    );
    await expect(pageClaimer.getByTestId('active-leader-pin')).toHaveText(
      leaderPin,
    );

    // Original leader on pageLeader receives leader_replaced and role updates to Participant
    await expect(pageLeader.getByTestId('active-user-role')).toHaveText(
      'Participant',
    );

    // ----------------------------------------------------
    // Scenario 6: Persistence & Auto-Reconnect on Reload
    // ----------------------------------------------------
    await pageClaimer.reload();
    await expect(
      pageClaimer.getByTestId('active-session-banner'),
    ).toBeVisible();
    await expect(pageClaimer.getByTestId('active-user-role')).toHaveText(
      'Study Leader',
    );
    await expect(pageClaimer.getByTestId('active-session-code')).toHaveText(
      sessionCode,
    );

    // ----------------------------------------------------
    // Participant Leaves Session
    // ----------------------------------------------------
    await pageParticipant.getByTestId('active-session-leave-btn').click();
    await expect(pageParticipant.getByText('CHOOSE YOUR ROLE')).toBeVisible();

    // Claimer member count updates to 1 after participant leaves
    await expect(pageClaimer.getByTestId('active-connected-count')).toHaveText(
      /1 member connected/,
    );

    // Cleanly close the session so activeSessionCount returns to 0 for other test suites
    await pageClaimer.evaluate(async () => {
      const raw = sessionStorage.getItem('ya-bible-study.session-credentials');
      if (!raw) return;
      const creds = JSON.parse(raw) as { sessionCode?: string; leaderToken?: string };
      if (!creds.sessionCode || !creds.leaderToken) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      await new Promise<void>((resolve) =>
        ws.addEventListener('open', () => resolve(), { once: true }),
      );
      ws.send(
        JSON.stringify({
          type: 'close_session',
          sessionCode: creds.sessionCode,
          leaderToken: creds.leaderToken,
        }),
      );
      await new Promise<void>((resolve) =>
        ws.addEventListener('message', () => resolve(), { once: true }),
      );
      ws.close();
    });

    await contextLeader.close();
    await contextParticipant.close();
    await contextClaimer.close();
  });
});

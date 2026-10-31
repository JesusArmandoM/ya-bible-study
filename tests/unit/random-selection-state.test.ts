import { describe, expect, it } from 'vitest';
import {
  RANDOM_SELECTION_COUNTDOWN_MS,
  applyClearRandomCandidate,
  applyConfirmRandomCandidate,
  applySelectVolunteer,
  applyStageRandomCandidate,
  createVolunteerTurnForSection,
  eligibleRandomCandidateIds,
  remainingCountdownSeconds,
  volunteerTurnPhase,
  type PublicSessionMember,
  type VolunteerTurnState,
} from '../../src/shared/session';

const ISO_EXPIRES = '2026-10-30T20:00:30.000Z';

function baseTurn(): VolunteerTurnState {
  return createVolunteerTurnForSection('section_1_prayer');
}

function member(
  memberId: string,
  overrides: Partial<PublicSessionMember> = {},
): PublicSessionMember {
  return {
    memberId,
    displayName: memberId,
    initials: 'XX',
    avatarPalette: 'gold',
    role: 'Participant',
    connectionStatus: 'connected',
    joinedAt: '2026-10-30T19:00:00.000Z',
    ...overrides,
  };
}

describe('random-selection state — phase enter/leave (frozen volunteerTurnPhase)', () => {
  it('derives collecting_hands -> random_pending -> assigned -> turn_completed', () => {
    const collecting = baseTurn();
    expect(volunteerTurnPhase(collecting)).toBe('collecting_hands');

    const staged = applyStageRandomCandidate(collecting, 'member-1', ISO_EXPIRES);
    expect(volunteerTurnPhase(staged)).toBe('random_pending');

    const assigned = applyConfirmRandomCandidate(staged);
    expect(volunteerTurnPhase(assigned)).toBe('assigned');
    expect(assigned.selectedMemberId).toBe('member-1');

    const completed = {
      ...assigned,
      completedAt: '2026-10-30T20:01:00.000Z',
    };
    expect(volunteerTurnPhase(completed)).toBe('turn_completed');
  });

  it('returns to collecting_hands when the staged candidate clears (expiry)', () => {
    const staged = applyStageRandomCandidate(baseTurn(), 'member-1', ISO_EXPIRES);
    expect(volunteerTurnPhase(applyClearRandomCandidate(staged))).toBe(
      'collecting_hands',
    );
  });

  it('keeps the frozen rule: applySelectVolunteer never touches candidate fields', () => {
    const staged = applyStageRandomCandidate(baseTurn(), 'member-1', ISO_EXPIRES);
    const manuallyChosen = applySelectVolunteer(staged, 'member-2');
    // The stale staged candidate is inert: assigned wins phase derivation and
    // the candidate fields linger untouched (byte-stable predecessor rule).
    expect(manuallyChosen.selectedMemberId).toBe('member-2');
    expect(manuallyChosen.candidateMemberId).toBe('member-1');
    expect(manuallyChosen.candidateExpiresAt).toBe(ISO_EXPIRES);
    expect(volunteerTurnPhase(manuallyChosen)).toBe('assigned');
  });
});

describe('random-selection reducers — immutability and composition', () => {
  it('applyStageRandomCandidate sets exactly the candidate fields', () => {
    const turn = {
      ...baseTurn(),
      raisedHands: [
        { memberId: 'member-2', raisedAt: '2026-10-30T19:59:00.000Z' },
      ],
    };
    const staged = applyStageRandomCandidate(turn, 'member-1', ISO_EXPIRES);

    expect(staged.candidateMemberId).toBe('member-1');
    expect(staged.candidateExpiresAt).toBe(ISO_EXPIRES);
    expect(staged.raisedHands).toEqual(turn.raisedHands);
    expect(staged.selectedMemberId).toBeNull();
    expect(staged.completedAt).toBeNull();
    // Immutability: the input turn is never mutated.
    expect(turn.candidateMemberId).toBeNull();
    expect(turn.candidateExpiresAt).toBeNull();
  });

  it('applyConfirmRandomCandidate composes applySelectVolunteer then clears candidates', () => {
    const staged = applyStageRandomCandidate(
      {
        ...baseTurn(),
        raisedHands: [
          { memberId: 'member-1', raisedAt: '2026-10-30T19:59:00.000Z' },
        ],
      },
      'member-1',
      ISO_EXPIRES,
    );
    const confirmed = applyConfirmRandomCandidate(staged);

    expect(confirmed).toEqual({
      ...applySelectVolunteer(staged, 'member-1'),
      candidateMemberId: null,
      candidateExpiresAt: null,
    });
    expect(confirmed.selectedMemberId).toBe('member-1');
    expect(confirmed.raisedHands).toEqual(staged.raisedHands);
    expect(staged.candidateMemberId).toBe('member-1');
  });

  it('applyConfirmRandomCandidate is a no-op without a staged candidate', () => {
    const turn = baseTurn();
    expect(applyConfirmRandomCandidate(turn)).toBe(turn);
  });

  it('applyClearRandomCandidate clears both candidate fields and no-ops when clear', () => {
    const staged = applyStageRandomCandidate(baseTurn(), 'member-1', ISO_EXPIRES);
    const cleared = applyClearRandomCandidate(staged);
    expect(cleared.candidateMemberId).toBeNull();
    expect(cleared.candidateExpiresAt).toBeNull();

    const turn = baseTurn();
    expect(applyClearRandomCandidate(turn)).toBe(turn);
  });
});

describe('eligibleRandomCandidateIds — connected Participants in join order', () => {
  it('filters to connected Participants and preserves join order', () => {
    const members: PublicSessionMember[] = [
      member('leader-1', {
        role: 'Study Leader',
        displayName: 'Claire',
        joinedAt: '2026-10-30T19:00:00.000Z',
      }),
      member('member-1', {
        displayName: 'Mia',
        joinedAt: '2026-10-30T19:00:10.000Z',
      }),
      member('member-2', {
        displayName: 'Leo',
        connectionStatus: 'disconnected',
        joinedAt: '2026-10-30T19:00:20.000Z',
      }),
      member('member-3', {
        displayName: 'Nora',
        joinedAt: '2026-10-30T19:00:30.000Z',
      }),
    ];

    expect(eligibleRandomCandidateIds(members)).toEqual([
      'member-1',
      'member-3',
    ]);
  });

  it('returns an empty pool for leader-only sessions and never includes the leader', () => {
    expect(eligibleRandomCandidateIds([])).toEqual([]);
    expect(
      eligibleRandomCandidateIds([
        member('leader-1', { role: 'Study Leader' }),
      ]),
    ).toEqual([]);
  });

  it('draws from ALL connected Participants, not only raised hands (zero-volunteers scenario)', () => {
    const members = [member('member-1'), member('member-2')];
    // No raisedHands anywhere — the pool is still fully populated.
    expect(eligibleRandomCandidateIds(members)).toHaveLength(2);
  });
});

describe('remainingCountdownSeconds — display-only clamped countdown', () => {
  const nowMs = Date.parse('2026-10-30T20:00:00.000Z');

  it('is 30 (RANDOM_SELECTION_COUNTDOWN_MS) at the moment of staging', () => {
    expect(RANDOM_SELECTION_COUNTDOWN_MS).toBe(30_000);
    expect(remainingCountdownSeconds('2026-10-30T20:00:30.000Z', nowMs)).toBe(30);
  });

  it('ticks down with the wall clock', () => {
    expect(remainingCountdownSeconds('2026-10-30T20:00:30.000Z', nowMs + 5_000)).toBe(25);
    // Ceil semantics: "1" shows while any of the last second remains.
    expect(remainingCountdownSeconds('2026-10-30T20:00:30.000Z', nowMs + 29_001)).toBe(1);
    expect(remainingCountdownSeconds('2026-10-30T20:00:30.000Z', nowMs + 30_000)).toBe(0);
  });

  it('clamps to 0..30 and treats an invalid expiry as 0', () => {
    // Expired window clamps to 0 (never negative).
    expect(remainingCountdownSeconds('2026-10-30T20:00:30.000Z', nowMs + 60_000)).toBe(0);
    // A handcrafted far-future expiry still clamps to the 30s ceiling.
    expect(remainingCountdownSeconds('2026-10-30T20:05:00.000Z', nowMs)).toBe(30);
    // Invalid ISO never propagates.
    expect(remainingCountdownSeconds('not-a-date', nowMs)).toBe(0);
    expect(remainingCountdownSeconds('', nowMs)).toBe(0);
  });
});

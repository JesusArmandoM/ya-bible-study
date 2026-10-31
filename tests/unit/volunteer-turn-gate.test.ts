import { describe, expect, it } from 'vitest';
import {
  applyCompleteTurn,
  applySelectVolunteer,
  createVolunteerTurnForSection,
  volunteerTurnPhase,
} from '../../src/shared/session';
import type { VolunteerTurnState } from '../../src/shared/session';

const ISO_NOW = '2026-10-30T19:30:00.000Z';
const ISO_LATER = '2026-10-30T19:31:00.000Z';

function makeTurn(overrides: Partial<VolunteerTurnState> = {}): VolunteerTurnState {
  return {
    ...createVolunteerTurnForSection('section_1_prayer'),
    ...overrides,
  };
}

describe('volunteerTurnPhase — phase derivation', () => {
  it('returns collecting_hands when nothing is selected, staged, or completed', () => {
    expect(volunteerTurnPhase(makeTurn())).toBe('collecting_hands');
  });

  it('returns collecting_hands even with raised hands in the queue', () => {
    const turn = makeTurn({
      raisedHands: [{ memberId: 'm1', raisedAt: ISO_NOW }],
    });
    expect(volunteerTurnPhase(turn)).toBe('collecting_hands');
  });

  it('returns random_pending when only a reserved candidate is staged', () => {
    const turn = makeTurn({
      candidateMemberId: 'm2',
      candidateExpiresAt: ISO_LATER,
    });
    expect(volunteerTurnPhase(turn)).toBe('random_pending');
  });

  it('returns assigned when a volunteer is selected and not completed', () => {
    const turn = makeTurn({ selectedMemberId: 'm1' });
    expect(volunteerTurnPhase(turn)).toBe('assigned');
  });

  it('returns turn_completed once completedAt is set', () => {
    const turn = makeTurn({ completedAt: ISO_NOW });
    expect(volunteerTurnPhase(turn)).toBe('turn_completed');
  });

  it('gives turn_completed precedence over assigned and random_pending', () => {
    const turn = makeTurn({
      candidateMemberId: 'm2',
      candidateExpiresAt: ISO_LATER,
      selectedMemberId: 'm1',
      completedAt: ISO_NOW,
    });
    expect(volunteerTurnPhase(turn)).toBe('turn_completed');
  });

  it('gives assigned precedence over the reserved random_pending phase', () => {
    const turn = makeTurn({
      candidateMemberId: 'm2',
      candidateExpiresAt: ISO_LATER,
      selectedMemberId: 'm1',
    });
    expect(volunteerTurnPhase(turn)).toBe('assigned');
  });
});

describe('applySelectVolunteer — chosen volunteer assignment', () => {
  it('sets selectedMemberId and nothing else', () => {
    const turn = makeTurn({
      raisedHands: [
        { memberId: 'm1', raisedAt: ISO_NOW },
        { memberId: 'm2', raisedAt: ISO_NOW },
      ],
    });
    const next = applySelectVolunteer(turn, 'm1');

    expect(next.selectedMemberId).toBe('m1');
    expect(next.completedAt).toBeNull();
    expect(next.raisedHands).toEqual(turn.raisedHands);
    expect(next.candidateMemberId).toBeNull();
    expect(next.candidateExpiresAt).toBeNull();
    expect(next.sectionId).toBe(turn.sectionId);
    expect(next.mode).toBe(turn.mode);
  });

  it('does not mutate the input turn (pure reducer)', () => {
    const turn = makeTurn();
    const before = structuredClone(turn);
    applySelectVolunteer(turn, 'm1');
    expect(turn).toEqual(before);
  });

  it('re-choosing a different volunteer replaces the selection', () => {
    const first = applySelectVolunteer(makeTurn(), 'm1');
    const second = applySelectVolunteer(first, 'm2');
    expect(second.selectedMemberId).toBe('m2');
  });

  it('does not touch the reserved candidate fields when they are set', () => {
    const turn = makeTurn({
      candidateMemberId: 'm9',
      candidateExpiresAt: ISO_LATER,
    });
    const next = applySelectVolunteer(turn, 'm1');
    expect(next.candidateMemberId).toBe('m9');
    expect(next.candidateExpiresAt).toBe(ISO_LATER);
    expect(next.selectedMemberId).toBe('m1');
    expect(volunteerTurnPhase(next)).toBe('assigned');
  });
});

describe('applyCompleteTurn — turn completion', () => {
  it('sets completedAt to the server timestamp', () => {
    const turn = applySelectVolunteer(makeTurn(), 'm1');
    const next = applyCompleteTurn(turn, ISO_NOW);
    expect(next.completedAt).toBe(ISO_NOW);
    expect(next.selectedMemberId).toBe('m1');
    expect(volunteerTurnPhase(next)).toBe('turn_completed');
  });

  it('keeps a null selectedMemberId for the leader-override completion', () => {
    const next = applyCompleteTurn(makeTurn(), ISO_NOW);
    expect(next.completedAt).toBe(ISO_NOW);
    expect(next.selectedMemberId).toBeNull();
    expect(volunteerTurnPhase(next)).toBe('turn_completed');
  });

  it('is idempotent: completing twice keeps the first completedAt', () => {
    const once = applyCompleteTurn(makeTurn(), ISO_NOW);
    const twice = applyCompleteTurn(once, ISO_LATER);
    expect(twice.completedAt).toBe(ISO_NOW);
    expect(twice).toBe(once);
  });

  it('does not mutate the input turn or the raisedHands queue', () => {
    const turn = makeTurn({
      raisedHands: [{ memberId: 'm1', raisedAt: ISO_NOW }],
      selectedMemberId: 'm1',
    });
    const before = structuredClone(turn);
    const next = applyCompleteTurn(turn, ISO_NOW);
    expect(turn).toEqual(before);
    expect(next.raisedHands).toEqual(before.raisedHands);
  });

  it('does not touch the reserved candidate fields', () => {
    const turn = makeTurn({
      candidateMemberId: 'm9',
      candidateExpiresAt: ISO_LATER,
      selectedMemberId: 'm1',
    });
    const next = applyCompleteTurn(turn, ISO_NOW);
    expect(next.candidateMemberId).toBe('m9');
    expect(next.candidateExpiresAt).toBe(ISO_LATER);
  });
});

describe('phase lifecycle — choose -> assigned -> complete', () => {
  it('walks collecting_hands -> assigned -> turn_completed through the reducers', () => {
    const created = createVolunteerTurnForSection('section_1_prayer');
    expect(volunteerTurnPhase(created)).toBe('collecting_hands');

    const assigned = applySelectVolunteer(created, 'm1');
    expect(volunteerTurnPhase(assigned)).toBe('assigned');

    const completed = applyCompleteTurn(assigned, ISO_NOW);
    expect(volunteerTurnPhase(completed)).toBe('turn_completed');
    expect(completed.selectedMemberId).toBe('m1');
    expect(completed.completedAt).toBe(ISO_NOW);
  });
});

import { describe, expect, it } from 'vitest';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';
import {
  SESSION_STUDY_SUMMARY_MAX_PRAYER_TEXT_LENGTH,
  applyClearHands,
  applySetHandRaised,
  createVolunteerTurnForSection,
  normalizeSessionOpeningPrayerContent,
  normalizeSessionStudySummary,
  toSessionOpeningPrayerContent,
  toSessionStudySummary,
  volunteerTurnModeForSection,
  type VolunteerTurnState,
} from '../../src/shared/session';

function makeTurn(): VolunteerTurnState {
  return createVolunteerTurnForSection('section_1_prayer');
}

describe('createVolunteerTurnForSection — turn creation', () => {
  it('creates a gated_prayer turn for section_1_prayer with an empty queue and reserved fields null', () => {
    const turn = makeTurn();

    expect(turn.sectionId).toBe('section_1_prayer');
    expect(turn.mode).toBe('gated_prayer');
    expect(turn.raisedHands).toEqual([]);
    // Reserved for the follow-up features — always null in this feature.
    expect(turn.candidateMemberId).toBeNull();
    expect(turn.candidateExpiresAt).toBeNull();
    expect(turn.selectedMemberId).toBeNull();
    expect(turn.completedAt).toBeNull();
  });

  it('maps future sections onto their turn modes without changing the turn shape', () => {
    expect(volunteerTurnModeForSection('section_2_icebreaker')).toBe('open_share');
    expect(volunteerTurnModeForSection('section_3_reading')).toBe('gated_reading');
    expect(volunteerTurnModeForSection('section_4_discussion')).toBe('open_share');
    expect(volunteerTurnModeForSection('section_5_closing')).toBe('open_share');

    const readingTurn = createVolunteerTurnForSection('section_3_reading');
    expect(readingTurn.mode).toBe('gated_reading');
    expect(readingTurn.raisedHands).toEqual([]);
    expect(readingTurn.candidateMemberId).toBeNull();
    expect(readingTurn.candidateExpiresAt).toBeNull();
    expect(readingTurn.selectedMemberId).toBeNull();
    expect(readingTurn.completedAt).toBeNull();
  });
});

describe('applySetHandRaised — idempotent raise/lower semantics', () => {
  it('appends a raise with the server-clock raisedAt', () => {
    const turn = applySetHandRaised(makeTurn(), 'member-1', true, '2026-10-29T19:30:00.000Z');

    expect(turn.raisedHands).toEqual([
      { memberId: 'member-1', raisedAt: '2026-10-29T19:30:00.000Z' },
    ]);
  });

  it('keeps the original raisedAt and queue position on repeated raise_hand', () => {
    let turn = applySetHandRaised(makeTurn(), 'member-1', true, '2026-10-29T19:30:00.000Z');
    turn = applySetHandRaised(turn, 'member-2', true, '2026-10-29T19:31:00.000Z');

    const duplicate = applySetHandRaised(turn, 'member-1', true, '2026-10-29T19:32:00.000Z');

    // No duplicate row, no reorder, original raisedAt preserved.
    expect(duplicate).toBe(turn);
    expect(duplicate.raisedHands).toEqual([
      { memberId: 'member-1', raisedAt: '2026-10-29T19:30:00.000Z' },
      { memberId: 'member-2', raisedAt: '2026-10-29T19:31:00.000Z' },
    ]);
  });

  it('enforces at most one entry per member', () => {
    let turn = applySetHandRaised(makeTurn(), 'member-1', true, '2026-10-29T19:30:00.000Z');
    turn = applySetHandRaised(turn, 'member-1', true, '2026-10-29T19:31:00.000Z');
    turn = applySetHandRaised(turn, 'member-1', true, '2026-10-29T19:32:00.000Z');

    expect(turn.raisedHands).toHaveLength(1);
  });

  it('lowers a raised hand and is a no-op when lowering an already-lowered hand', () => {
    let turn = applySetHandRaised(makeTurn(), 'member-1', true, '2026-10-29T19:30:00.000Z');
    turn = applySetHandRaised(turn, 'member-2', true, '2026-10-29T19:31:00.000Z');

    const lowered = applySetHandRaised(turn, 'member-1', false, '2026-10-29T19:32:00.000Z');
    expect(lowered.raisedHands).toEqual([
      { memberId: 'member-2', raisedAt: '2026-10-29T19:31:00.000Z' },
    ]);

    const secondLower = applySetHandRaised(lowered, 'member-1', false, '2026-10-29T19:33:00.000Z');
    expect(secondLower).toBe(lowered);
  });

  it('re-appends a re-raised hand at the end with a fresh server-clock raisedAt', () => {
    // Queue order: member-2, member-1.
    let turn = applySetHandRaised(makeTurn(), 'member-2', true, '2026-10-29T19:30:00.000Z');
    turn = applySetHandRaised(turn, 'member-1', true, '2026-10-29T19:31:00.000Z');

    // Participant 2 lowers, then re-raises.
    turn = applySetHandRaised(turn, 'member-2', false, '2026-10-29T19:32:00.000Z');
    turn = applySetHandRaised(turn, 'member-2', true, '2026-10-29T19:33:00.000Z');

    expect(turn.raisedHands).toEqual([
      { memberId: 'member-1', raisedAt: '2026-10-29T19:31:00.000Z' },
      { memberId: 'member-2', raisedAt: '2026-10-29T19:33:00.000Z' },
    ]);
  });

  it('preserves raise order as stable insertion order across mixed toggles', () => {
    let turn = makeTurn();
    turn = applySetHandRaised(turn, 'member-1', true, '2026-10-29T19:30:00.000Z');
    turn = applySetHandRaised(turn, 'member-2', true, '2026-10-29T19:31:00.000Z');
    turn = applySetHandRaised(turn, 'member-3', true, '2026-10-29T19:32:00.000Z');

    expect(turn.raisedHands.map((entry) => entry.memberId)).toEqual([
      'member-1',
      'member-2',
      'member-3',
    ]);
  });
});

describe('applyClearHands — leader queue management', () => {
  function populatedTurn(): VolunteerTurnState {
    let turn = makeTurn();
    turn = applySetHandRaised(turn, 'member-1', true, '2026-10-29T19:30:00.000Z');
    turn = applySetHandRaised(turn, 'member-2', true, '2026-10-29T19:31:00.000Z');
    return turn;
  }

  it('clears a single targeted hand and leaves the rest of the queue intact', () => {
    const cleared = applyClearHands(populatedTurn(), 'member-1');
    expect(cleared.raisedHands).toEqual([
      { memberId: 'member-2', raisedAt: '2026-10-29T19:31:00.000Z' },
    ]);
  });

  it('is a no-op when the targeted member has not raised', () => {
    const turn = populatedTurn();
    const cleared = applyClearHands(turn, 'member-99');
    expect(cleared).toBe(turn);
  });

  it('empties the whole queue without a target', () => {
    const cleared = applyClearHands(populatedTurn());
    expect(cleared.raisedHands).toEqual([]);
  });

  it('is a no-op clearing an already-empty queue', () => {
    const turn = makeTurn();
    expect(applyClearHands(turn)).toBe(turn);
    expect(applyClearHands(turn, 'member-1')).toBe(turn);
  });

  it('never touches the reserved follow-up fields', () => {
    const cleared = applyClearHands(populatedTurn());
    expect(cleared.candidateMemberId).toBeNull();
    expect(cleared.candidateExpiresAt).toBeNull();
    expect(cleared.selectedMemberId).toBeNull();
    expect(cleared.completedAt).toBeNull();
  });
});

describe('openingPrayer summary normalization (bounded, additive)', () => {
  it('projects only participant-visible copy — never the facilitator leaderPrompt', () => {
    const content = toSessionOpeningPrayerContent(
      getDefaultStudyDocument().openingPrayer,
    );

    expect(content).not.toHaveProperty('leaderPrompt');
    expect(content.title).toBe('Opening Prayer');
    expect(content.eyebrow).toBe('MOMENT');
    expect(content.suggestedPrayerText.length).toBeGreaterThan(0);
    expect(content.participantPrompt.length).toBeGreaterThan(0);

    const summary = toSessionStudySummary(getDefaultStudyDocument());
    expect(summary.openingPrayer).toEqual(content);
    expect(JSON.stringify(summary)).not.toContain('leaderPrompt');
  });

  it('keeps a missing openingPrayer valid and normalizes it to null', () => {
    const summary = normalizeSessionStudySummary({
      title: 'Great Is Your Faith',
      subtitle: 'Mercy and humility',
      liturgicalEyebrow: 'MATTHEW 15:21–28',
      gospelCitation: 'Matthew 15:21–28',
      gospelSummaryLabel: 'Gospel Summary',
      sectionCount: 5,
      estimatedMinutes: 60,
    });

    expect(summary).not.toBeNull();
    expect(summary?.openingPrayer).toBeNull();
  });

  it('rejects a present-but-invalid openingPrayer payload with null (INVALID_MESSAGE path)', () => {
    const base = {
      title: 'Great Is Your Faith',
      subtitle: 'Mercy and humility',
      liturgicalEyebrow: 'MATTHEW 15:21–28',
      gospelCitation: 'Matthew 15:21–28',
      gospelSummaryLabel: 'Gospel Summary',
      sectionCount: 5,
      estimatedMinutes: 60,
      openingPrayer: {
        title: 'Opening Prayer',
        eyebrow: 'MOMENT',
        durationLabel: '5 min',
        suggestedPrayerText: 'Lord, gather us in prayer.',
        participantPrompt: 'Tap Raise Hand if you would like to pray.',
        chosenVolunteerInstruction: 'When you finish, tap "Done".',
      },
    };

    // Oversized suggestedPrayerText.
    expect(
      normalizeSessionStudySummary({
        ...base,
        openingPrayer: {
          ...base.openingPrayer,
          suggestedPrayerText: 'x'.repeat(
            SESSION_STUDY_SUMMARY_MAX_PRAYER_TEXT_LENGTH + 1,
          ),
        },
      }),
    ).toBeNull();

    // Missing field.
    const { participantPrompt: _omitted, ...withoutPrompt } = base.openingPrayer;
    expect(
      normalizeSessionStudySummary({
        ...base,
        openingPrayer: withoutPrompt,
      }),
    ).toBeNull();

    // Empty field.
    expect(
      normalizeSessionStudySummary({
        ...base,
        openingPrayer: { ...base.openingPrayer, eyebrow: '   ' },
      }),
    ).toBeNull();

    // Non-object payload.
    expect(
      normalizeSessionStudySummary({ ...base, openingPrayer: 'prayer' }),
    ).toBeNull();
  });

  it('drops smuggled facilitator keys from a present openingPrayer payload', () => {
    const normalized = normalizeSessionOpeningPrayerContent({
      title: 'Opening Prayer',
      eyebrow: 'MOMENT',
      durationLabel: '5 min',
      suggestedPrayerText: 'Lord, gather us in prayer.',
      participantPrompt: 'Tap Raise Hand if you would like to pray.',
      chosenVolunteerInstruction: 'When you finish, tap "Done".',
      leaderPrompt: 'SMUGGLED FACILITATOR COPY',
      extraField: 'also smuggled',
    });

    expect(normalized).not.toBeNull();
    expect(normalized).not.toHaveProperty('leaderPrompt');
    expect(normalized).not.toHaveProperty('extraField');
    expect(JSON.stringify(normalized)).not.toContain('SMUGGLED FACILITATOR COPY');
  });

  it('preserves internal whitespace in prayer text while trimming the ends', () => {
    const normalized = normalizeSessionOpeningPrayerContent({
      title: 'Opening Prayer',
      eyebrow: 'MOMENT',
      durationLabel: '5 min',
      suggestedPrayerText: '  Lord,\ngather us\nin prayer.  ',
      participantPrompt: 'Tap Raise Hand if you would like to pray.',
      chosenVolunteerInstruction: 'When you finish, tap "Done".',
    });

    expect(normalized?.suggestedPrayerText).toBe('Lord,\ngather us\nin prayer.');
  });
});

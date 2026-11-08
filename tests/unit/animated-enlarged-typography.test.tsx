// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { getTextItemMotion } from '../../src/client/components/common/AnimatedTextReveal';
import { OpeningPrayerCard } from '../../src/client/components/prayer/OpeningPrayerCard';
import { IcebreakerPromptCard } from '../../src/client/components/icebreaker/IcebreakerPromptCard';
import { ScriptureCard } from '../../src/client/components/reading/ScriptureCard';
import { CommentaryCard } from '../../src/client/components/analysis/CommentaryCard';
import { DoctrineCard } from '../../src/client/components/analysis/DoctrineCard';
import { ApplicationCard } from '../../src/client/components/analysis/ApplicationCard';
import { ClosingPrayerCard } from '../../src/client/components/closing/ClosingPrayerCard';
import { WeeklyChallengesCard } from '../../src/client/components/closing/WeeklyChallengesCard';
import { NextWeekCard } from '../../src/client/components/closing/NextWeekCard';
import { getDefaultStudyDocument } from '../../src/server/studies/greatIsYourFaithSeed';

const SEED = getDefaultStudyDocument();

describe('Animated Enlarged Section Typography (Tokens, Global CSS & Motion)', () => {
  let tokensCss: string;
  let globalCss: string;

  beforeAll(() => {
    const tokensPath = resolve(__dirname, '../../src/client/styles/tokens.css');
    const globalPath = resolve(__dirname, '../../src/client/styles/global.css');
    tokensCss = readFileSync(tokensPath, 'utf8');
    globalCss = readFileSync(globalPath, 'utf8');
  });

  describe('Tokens verification (DESIGN.md override #6)', () => {
    it('defines enlarged typography CSS variables in tokens.css', () => {
      expect(tokensCss).toMatch(/--text-display-size:\s*2\.625rem;/);
      expect(tokensCss).toMatch(/--text-h1-size:\s*2\.25rem;/);
      expect(tokensCss).toMatch(/--text-h2-size:\s*1\.5rem;/);
      expect(tokensCss).toMatch(/--text-scripture-size:\s*1\.3125rem;/);
      expect(tokensCss).toMatch(/--text-scripture-lh:\s*1\.65;/);
      expect(tokensCss).toMatch(/--text-body-size:\s*1\.125rem;/);
      expect(tokensCss).toMatch(/--text-body-lh:\s*1\.6;/);
      expect(tokensCss).toMatch(/--text-eyebrow-size:\s*0\.8125rem;/);
      expect(tokensCss).toMatch(/--text-eyebrow-tracking:\s*0\.14em;/);
    });
  });

  describe('Global CSS typography rules validation', () => {
    it('scripture and prayers use var(--text-scripture-size, 1.3125rem) / max(21px, 1.3125rem)', () => {
      const scriptureSelectors = [
        '.prayer-text',
        '.prayer-text-body',
        '.gospel-reading-text',
        '.gospel-verse',
        '.closing-prayer-text',
        '.chosen-scripture-text',
        '.scripture-verse',
        '.scripture-full-text',
      ];

      for (const selector of scriptureSelectors) {
        expect(
          globalCss.includes(selector),
          `global.css should define ${selector}`,
        ).toBe(true);
      }

      // Check authorative block for scripture sizing (>= 21px / 1.3125rem)
      expect(globalCss).toMatch(
        /\.prayer-text[\s\S]*?font-size:\s*max\(21px,\s*var\(--text-scripture-size,\s*1\.3125rem\)\);/,
      );
      expect(globalCss).toMatch(
        /\.prayer-text[\s\S]*?line-height:\s*var\(--text-scripture-lh,\s*1\.65\);/,
      );
    });

    it('body copy classes use var(--text-body-size, 1.125rem) / max(18px, 1.125rem)', () => {
      const bodySelectors = [
        '.commentary-card-body',
        '.commentary-body-text',
        '.doctrine-card-summary',
        '.doctrine-body-summary',
        '.application-card-summary',
        '.application-body-summary',
        '.icebreaker-description',
        '.icebreaker-intro',
        '.discussion-question-body',
        '.discussion-context',
        '.closing-summary',
        '.closing-challenge-desc',
      ];

      for (const selector of bodySelectors) {
        expect(
          globalCss.includes(selector),
          `global.css should define ${selector}`,
        ).toBe(true);
      }

      // Check authorative block for body sizing (>= 18px / 1.125rem)
      expect(globalCss).toMatch(
        /\.commentary-card-body[\s\S]*?font-size:\s*max\(18px,\s*var\(--text-body-size,\s*1\.125rem\)\);/,
      );
      expect(globalCss).toMatch(
        /\.commentary-card-body[\s\S]*?line-height:\s*var\(--text-body-lh,\s*1\.6\);/,
      );
    });

    it('card and section headings use var(--text-h2-size, 1.5rem) / max(24px, 1.5rem)', () => {
      const headingSelectors = [
        '.prayer-title',
        '.section-one-title',
        '.icebreaker-title',
        '.gospel-reading-title',
        '.scripture-card-citation',
        '.commentary-card-title',
        '.doctrine-card-title',
        '.application-card-title',
        '.discussion-question-title',
        '.closing-card-title',
      ];

      for (const selector of headingSelectors) {
        expect(
          globalCss.includes(selector),
          `global.css should define ${selector}`,
        ).toBe(true);
      }

      // Check authorative block for heading sizing (>= 24px / 1.5rem)
      expect(globalCss).toMatch(
        /\.prayer-title[\s\S]*?font-size:\s*max\(24px,\s*var\(--text-h2-size,\s*1\.5rem\)\);/,
      );
    });

    it('eyebrows use var(--text-eyebrow-size, 0.8125rem) / 13px with tracking 0.14em', () => {
      expect(globalCss).toMatch(
        /\.prayer-eyebrow[\s\S]*?font-size:\s*var\(--text-eyebrow-size,\s*0\.8125rem\);/,
      );
      expect(globalCss).toMatch(
        /\.prayer-eyebrow[\s\S]*?letter-spacing:\s*var\(--text-eyebrow-tracking,\s*0\.14em\);/,
      );
    });
  });

  describe('Staggered animated text attributes across sections', () => {
    it('Section 1: OpeningPrayerCard renders with data-animated-text="true" and scripture classes', () => {
      render(<OpeningPrayerCard suggestedPrayerText="Lord Jesus, hear our prayer." />);
      const prayerText = screen.getByTestId('opening-prayer-text');
      expect(prayerText).toHaveAttribute('data-animated-text', 'true');
      expect(prayerText.className).toContain('prayer-text');
      expect(prayerText.className).toContain('prayer-text-body');
    });

    it('Section 2: IcebreakerPromptCard renders with data-animated-text="true" and body copy classes', () => {
      render(
        <IcebreakerPromptCard
          mainQuestion="Share a time you felt like an outsider."
          followUpQuestion="What helped you persevere?"
        />,
      );
      const question = screen.getByTestId('icebreaker-prompt-question');
      expect(question).toHaveAttribute('data-animated-text', 'true');
      expect(question.className).toContain('icebreaker-description');

      const followup = screen.getByTestId('icebreaker-prompt-followup');
      expect(followup).toHaveAttribute('data-animated-text', 'true');
      expect(followup.className).toContain('icebreaker-description');
    });

    it('Section 3: ScriptureCard renders verses with data-animated-text="true" and scripture classes', () => {
      const verses = SEED.gospelReading.verses;
      render(
        <ScriptureCard
          citation="Matthew 15:21–28"
          liturgicalLabel="The Holy Gospel"
          verses={verses}
        />,
      );
      const firstVerse = screen.getByTestId('scripture-verse-21');
      expect(firstVerse).toHaveAttribute('data-animated-text', 'true');
      expect(firstVerse.className).toContain('scripture-verse');
      expect(firstVerse.className).toContain('gospel-verse');
      expect(firstVerse.className).toContain('gospel-reading-text');

      const label = screen.getByTestId('scripture-card-label');
      expect(label).toHaveAttribute('data-animated-text', 'true');
      const citation = screen.getByTestId('scripture-card-citation');
      expect(citation).toHaveAttribute('data-animated-text', 'true');
      expect(citation.className).toContain('gospel-reading-title');
    });

    it('Section 4: CommentaryCard, DoctrineCard, ApplicationCard render with data-animated-text="true" and headings/body classes', () => {
      const commentaryItem = SEED.deepAnalysis.verseCommentary[0]!;
      const doctrineItem = SEED.deepAnalysis.catholicDoctrine[0]!;
      const applicationItem = SEED.deepAnalysis.youngAdultApplication[0]!;

      const { rerender } = render(<CommentaryCard item={commentaryItem} index={0} />);
      const commCard = screen.getByTestId('commentary-item');
      expect(commCard).toHaveAttribute('data-animated-text', 'true');
      expect(commCard.querySelector('.commentary-card-title')).not.toBeNull();
      expect(commCard.querySelector('.commentary-card-body')).not.toBeNull();

      rerender(<DoctrineCard item={doctrineItem} index={1} />);
      const docCard = screen.getByTestId('doctrine-item');
      expect(docCard).toHaveAttribute('data-animated-text', 'true');
      expect(docCard.querySelector('.doctrine-card-title')).not.toBeNull();
      expect(docCard.querySelector('.doctrine-card-summary')).not.toBeNull();

      rerender(<ApplicationCard item={applicationItem} index={2} />);
      const appCard = screen.getByTestId('application-item');
      expect(appCard).toHaveAttribute('data-animated-text', 'true');
      expect(appCard.querySelector('.application-card-title')).not.toBeNull();
      expect(appCard.querySelector('.application-card-summary')).not.toBeNull();
    });

    it('Section 6: ClosingPrayerCard, NextWeekCard, and WeeklyChallengesCard render with data-animated-text="true"', () => {
      render(<ClosingPrayerCard prayerText="Lord Jesus, Great is your faith. Amen." />);
      const closingPrayer = screen.getByTestId('closing-prayer-text');
      expect(closingPrayer).toHaveAttribute('data-animated-text', 'true');
      expect(closingPrayer.className).toContain('closing-prayer-text');
      expect(closingPrayer.className).toContain('prayer-text');

      render(
        <NextWeekCard
          announcement={{
            title: 'Faith that Endures',
            citation: 'James 1:2–4',
            displayLabel: 'Next Week: James 1',
          }}
        />,
      );
      const nextWeek = screen.getByTestId('next-week-card');
      expect(nextWeek).toHaveAttribute('data-animated-text', 'true');

      render(
        <WeeklyChallengesCard
          challenges={SEED.closing.weeklyChallenges}
          sessionCode="TEST01"
        />,
      );
      const weeklyCard = screen.getByTestId('weekly-challenges-card');
      expect(weeklyCard).toHaveAttribute('data-animated-text', 'true');
      expect(weeklyCard.querySelector('.closing-card-title')).not.toBeNull();
      expect(weeklyCard.querySelector('.closing-summary')).not.toBeNull();
    });
  });

  describe('Accessibility & prefers-reduced-motion', () => {
    it('provides instant duration 0 and no transform when reduced motion is preferred', () => {
      const reducedMotionConfig = getTextItemMotion(true, 3);
      expect(reducedMotionConfig['data-animated-text']).toBe('true');
      expect(reducedMotionConfig.transition).toEqual({ duration: 0 });
      expect(reducedMotionConfig.initial).toEqual({ opacity: 1, y: 0 });
      expect(reducedMotionConfig.animate).toEqual({ opacity: 1, y: 0 });
    });

    it('provides staggered entrance delay and upward slide when motion is allowed', () => {
      const standardMotionConfig = getTextItemMotion(false, 3, 0.08);
      expect(standardMotionConfig['data-animated-text']).toBe('true');
      expect(standardMotionConfig.initial).toEqual({ opacity: 0, y: 12 });
      expect(standardMotionConfig.animate).toEqual({ opacity: 1, y: 0 });
      expect(standardMotionConfig.transition).toMatchObject({
        duration: 0.42,
        delay: 0.24, // 3 * 0.08
      });
    });
  });
});

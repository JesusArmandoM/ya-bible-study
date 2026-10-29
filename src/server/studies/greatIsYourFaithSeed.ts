import type { GospelVerse, StudyDocument } from '../../shared/study.js';

export const DEFAULT_STUDY_ID = 'great-is-your-faith';

function deepFreeze<T>(target: T): T {
  if (typeof target !== 'object' || target === null) {
    return target;
  }

  for (const value of Object.values(target as Record<string, unknown>)) {
    deepFreeze(value);
  }

  return Object.freeze(target);
}

const MATTHEW_15_21_28_VERSES: GospelVerse[] = [
  {
    verseNumber: 21,
    text: 'At that time, Jesus withdrew to the region of Tyre and Sidon.',
  },
  {
    verseNumber: 22,
    text: 'And behold, a Canaanite woman of that district came and called out, "Have pity on me, Lord, Son of David! My daughter is tormented by a demon."',
  },
  {
    verseNumber: 23,
    text: 'But Jesus did not say a word in answer to her. Jesus\' disciples came and asked him, "Send her away, for she keeps calling out after us."',
  },
  {
    verseNumber: 24,
    text: 'He said in reply, "I was sent only to the lost sheep of the house of Israel."',
  },
  {
    verseNumber: 25,
    text: 'But the woman came and did Jesus homage, saying, "Lord, help me."',
  },
  {
    verseNumber: 26,
    text: 'He said in reply, "It is not right to take the food of the children and throw it to the dogs."',
  },
  {
    verseNumber: 27,
    text: 'She said, "Please, Lord, for even the dogs eat the scraps that fall from the table of their masters."',
  },
  {
    verseNumber: 28,
    text: 'Then Jesus said to her in reply, "O woman, great is your faith! Let it be done for you as you wish." And the woman\'s daughter was healed from that hour.',
  },
];

const GREAT_IS_YOUR_FAITH_STUDY: StudyDocument = deepFreeze({
  id: DEFAULT_STUDY_ID,
  title: 'Great Is Your Faith',
  subtitle: 'Mercy, Humility, and the House of Prayer for All Peoples',
  liturgicalDate:
    'Sunday, August 16, 2026 · Twentieth Sunday in Ordinary Time, Year A',
  liturgicalEyebrow: 'WEEK 32 · 20TH SUNDAY OT',
  gospelCitation: 'Matthew 15:21–28',
  gospelSummaryLabel: 'Matthew 15:21–28 · Canaanite Woman',
  estimatedMinutes: 90,
  sectionCount: 5,
  centralThemes: [
    "God's house is for all peoples",
    "God's covenant with Israel is irrevocable",
    'Faith is humble, persistent, and bold',
    'The Church is catholic: universal in mission, mercy, and worship',
  ],
  sessionGoals: [
    'Proclaim and pray unhurriedly with Matthew 15:21–28 as one community of Catholic young adults.',
    "Understand how God's irrevocable covenant with Israel opens into universal mercy for all nations in Christ.",
    'Distinguish authentic Gospel humility before God from spiritual discouragement or low self-worth.',
    'Practice humble, persistent, intercessory prayer through the personal "Lord, Help Me" Prayer Card and a weekly challenge.',
  ],
  oneSentenceMainPoint:
    "The Canaanite woman teaches us that great faith is humble, persistent, and bold, trusting that even the smallest gift of Christ's mercy is enough to heal.",
  source: {
    type: 'preloaded',
    fileName: 'Great Is Your Faith.pdf',
    statusLabel: 'Analyzed',
  },
  detectionSummary: {
    sectionCount: 5,
    sectionsDetectedLabel: '5 sections detected',
    detectedLabel: 'Prayer · Reading · 3 Questions',
    curatedQuestionCount: 3,
    totalQuestionCount: 12,
    hasOpeningPrayer: true,
    hasGospelReading: true,
    hasClosingPrayer: true,
  },
  openingPrayer: {
    sectionId: 'section_1_prayer',
    sectionNumber: 1,
    progressPercent: 20,
    turnMode: 'gated_prayer',
    title: 'Opening Prayer',
    eyebrow: 'MOMENT',
    durationMinutes: 5,
    durationLabel: '5 min',
    suggestedPrayerText:
      'Lord Jesus Christ, Son of David and Savior of the world, we come before You like the Canaanite woman, asking not for what we deserve, but for Your mercy. Teach us to pray with humility, to persevere when You seem silent, and to trust that Your mercy is greater than our limits. Open our hearts to all peoples, purify us from pride and exclusion, and make us living members of Your Catholic Church, a house of prayer for all nations. Amen.',
    leaderPrompt: 'Waiting for someone to volunteer to pray',
    participantPrompt:
      'Tap Raise Hand if you would like to open our Bible study in prayer.',
    chosenVolunteerInstruction:
      'When you finish, tap "Done" so the Study Leader can continue.',
  },
  icebreaker: {
    sectionId: 'section_2_icebreaker',
    sectionNumber: 2,
    progressPercent: 40,
    turnMode: 'open_share',
    title: 'Outsiders Wanted',
    eyebrow: 'ICEBREAKER · 10 MIN',
    durationMinutes: 10,
    durationLabel: '10 min',
    introText:
      'Reflect on the moments you felt left out — then bring them to Jesus.',
    mainQuestion:
      'Have you ever felt like an outsider spiritually, socially, culturally, or even in the Church?',
    followUpQuestion:
      'When you feel like an outsider, do you usually move closer to Jesus, pull away, become defensive, or stay silent?',
    leaderNote:
      'Invite 2–4 brief, honest shares without pressuring any Participant to disclose painful details. Affirm each voice warmly and connect these real moments of feeling on the outside to the Canaanite mother approaching Jesus in Gentile border territory.',
    examplesToListenFor: [
      'Feeling spiritually behind others',
      'Not knowing enough about the faith',
      'Being new to a parish or young adult group',
      'Feeling judged because of past sins',
      'Being single while others are married',
      'Feeling culturally different',
      'Feeling unworthy to pray',
      'Feeling ignored by God during suffering',
    ],
  },
  gospelReading: {
    sectionId: 'section_3_reading',
    sectionNumber: 3,
    progressPercent: 60,
    turnMode: 'gated_reading',
    title: 'Gospel Reading',
    eyebrow: 'Matthew 15:21–28',
    durationMinutes: 10,
    durationLabel: '10 min',
    citation: 'Matthew 15:21–28',
    liturgicalLabel: 'Twentieth Sunday in Ordinary Time · Year A',
    fullText: MATTHEW_15_21_28_VERSES.map((verse) => verse.text).join(' '),
    verses: MATTHEW_15_21_28_VERSES,
    keyLines: [
      'Have pity on me, Lord, Son of David!',
      'Lord, help me.',
      'Even the dogs eat the scraps that fall from the table of their masters.',
      'O woman, great is your faith!',
    ],
    leaderLiturgicalContextNote:
      'Supporting Sunday Mass Liturgical Context for Study Leader reference only (Section 3 proclaims only the Gospel Reading aloud): First Reading — Isaiah 56:1, 6–7 ("My house shall be called a house of prayer for all peoples"); Responsorial Psalm — Psalm 67:2–3, 5, 6, 8 ("O God, let all the nations praise you!"); Second Reading — Romans 11:13–15, 29–32 ("The gifts and the call of God are irrevocable"); Gospel Acclamation — Alleluia cf. Matthew 4:23 ("Jesus proclaimed the Gospel of the kingdom and cured every disease among the people").',
  },
  deepAnalysis: {
    sectionId: 'section_4_discussion',
    sectionNumber: 4,
    progressPercent: 80,
    turnMode: 'none',
    title: 'Lord, Help Me Pray',
    eyebrow: 'DEEP ANALYSIS · 25 MIN',
    durationMinutes: 25,
    durationLabel: '25–50 min',
    defaultActiveQuestionIds: ['q-6', 'q-5', 'q-8'],
    reflectionQuestions: [
      {
        id: 'q-1',
        number: 1,
        prompt:
          'Which reading stands out to you most: Isaiah, Psalm 67, Romans, or the Gospel? Why?',
        category: 'Personal reflection',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 5,
        sampleAnswer:
          'The Gospel encounter stands out because the Canaanite woman brings raw, persevering love for her daughter directly to Jesus and refuses to let silence or social boundaries turn her away.',
        leaderNote:
          'Since our session proclaims Matthew 15:21–28 aloud as the sole main reading in Section 3, briefly share the supporting Sunday echoes from Isaiah 56, Psalm 67, and Romans 11 if a Participant asks about the wider Lectionary context.',
      },
      {
        id: 'q-2',
        number: 2,
        prompt:
          'What does Isaiah mean when he says God\'s house is "a house of prayer for all peoples"?',
        category: 'Doctrinal/discussion',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 5,
        sampleAnswer:
          "God's covenant temple and worship are never meant to remain a closed ethnic boundary; all nations are invited to bind themselves to the living God in faithful worship and love.",
        leaderNote:
          "Connect Isaiah 56:7 to the Church's catholicity (CCC 830–831): universal welcome grounded in adoration of the true God.",
      },
      {
        id: 'q-3',
        number: 3,
        prompt:
          'Why is it important that Romans says, "The gifts and the call of God are irrevocable"?',
        category: 'Doctrinal',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 6,
        sampleAnswer:
          'It proves that God never breaks His covenant promises: His enduring faithfulness to Israel is the very guarantee that His mercy toward Gentile believers can be trusted completely.',
        leaderNote:
          'Guard against anti-Jewish framing: emphasize Romans 11:29 and CCC 839–840. God has not rejected Israel; Gentile Christians are grafted by sheer mercy onto Israel\'s living covenant root and must reject every trace of anti-Jewish contempt.',
      },
      {
        id: 'q-4',
        number: 4,
        prompt:
          'Why do you think Jesus is silent at first with the Canaanite woman?',
        category: 'Theological reflection',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 5,
        sampleAnswer:
          'Jesus is neither cold nor indifferent; His brief silence draws out her persevering trust and reveals the greatness of a Gentile mother\'s faith before the watching disciples.',
        leaderNote:
          "Introduce St. Augustine and St. John Chrysostom (via Aquinas' Catena Aurea): Christ's delay is medicinal mercy that enlarges desire and unveils hidden faith.",
      },
      {
        id: 'q-5',
        number: 5,
        prompt:
          "Have you ever experienced God's silence in prayer? How did you respond?",
        category: 'Personal',
        isDefaultCurated: true,
        curatedOrder: 2,
        estimatedMinutes: 9,
        sampleAnswer:
          'During a long season of praying for healing in my family, God felt quiet at first, yet staying honest before Jesus stripped away spiritual performance and deepened real trust.',
        leaderNote:
          'Default active queue #2 — handle gently. Never rush to fix a Participant\'s grief with quick clichés; honor the ache of perceived silence and point to how the woman moves closer ("Lord, help me") instead of walking away.',
      },
      {
        id: 'q-6',
        number: 6,
        prompt: 'What makes the Canaanite woman\'s faith "great"?',
        category: 'Textual/doctrinal',
        isDefaultCurated: true,
        curatedOrder: 1,
        estimatedMinutes: 8,
        sampleAnswer:
          'Her faith is Christ-centered ("Lord, Son of David"), intercessory for her suffering daughter, persistent through apparent silence, reverent in homage, and humble enough to trust that even a crumb of Christ\'s mercy heals.',
        leaderNote:
          'Default active queue #1 — anchor prompt for Section 4. Highlight how rarely Jesus calls anyone\'s faith "great" in the Gospels, praising her humble boldness in front of His own disciples.',
      },
      {
        id: 'q-7',
        number: 7,
        prompt: 'What is the difference between humility and low self-worth?',
        category: 'Practical/spiritual',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 5,
        sampleAnswer:
          'Low self-worth collapses inward in shame and assumes God wants nothing to do with us, whereas Gospel humility stands truthfully before Jesus without entitlement and trusts completely in His generous mercy.',
        leaderNote:
          'Help Participants see that verse 27 is confident trust in the Master\'s generosity, echoing "Lord, I am not worthy that you should enter under my roof" before Holy Communion—never self-hatred.',
      },
      {
        id: 'q-8',
        number: 8,
        prompt: 'Where do you need to pray, "Lord, help me," right now?',
        category: 'Personal',
        isDefaultCurated: true,
        curatedOrder: 3,
        estimatedMinutes: 8,
        sampleAnswer:
          'I need to pray "Lord, help me" over exhaustion and uncertainty about my vocation, trading polished words for simple, surrendered trust at Jesus\' feet.',
        leaderNote:
          'Default active queue #3 — bridges naturally into the private "Lord, Help Me" Prayer Card. Remind each Participant that reflections may be shared by name or anonymously, and mercy—not pace—is the goal.',
      },
      {
        id: 'q-9',
        number: 9,
        prompt: 'Who are the people we are tempted to "send away" today?',
        category: 'Group discussion',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 5,
        sampleAnswer:
          'People who arrive alone at Mass, carry visible brokenness or religious doubts, or do not fit our familiar social circle or stage of life.',
        leaderNote:
          'Keep the conversation concrete and self-examining rather than ideological: ask how our own parish or young adult fellowship can resist the disciples\' "Send her away" reflex.',
      },
      {
        id: 'q-10',
        number: 10,
        prompt: 'What does this Gospel teach us about intercessory prayer?',
        category: 'Doctrinal/practical',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 5,
        sampleAnswer:
          'True intercession makes another person\'s pain our own ("Have pity on me... my daughter is tormented") and carries loved ones who cannot pray for themselves straight to Christ.',
        leaderNote:
          'Highlight verse 22b and CCC 2634–2636: the daughter never speaks in the scene, yet her mother\'s persevering intercession brings Jesus\' healing word.',
      },
      {
        id: 'q-11',
        number: 11,
        prompt:
          'How can a young adult Catholic community become more like "a house of prayer for all peoples"?',
        category: 'Practical application',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 5,
        sampleAnswer:
          'By uniting reverent prayer and fidelity to Catholic teaching with intentional hospitality—greeting newcomers by name, listening without judgment, and praying together for those who suffer.',
        leaderNote:
          'Hold both truths together: firm in truth and wide in mercy, so the group is neither a shallow social club nor an exclusive insider circle.',
      },
      {
        id: 'q-12',
        number: 12,
        prompt:
          'What is one concrete way you can imitate the Canaanite woman this week?',
        category: 'Action step',
        isDefaultCurated: false,
        curatedOrder: null,
        estimatedMinutes: 4,
        sampleAnswer:
          'Begin every morning praying "Lord, help me" on my knees and intercede daily by name for one friend going through a hard season.',
        leaderNote:
          'Use this final bank question to transition smoothly into the four practical weekly challenges in Section 5.',
      },
    ],
    verseCommentary: [
      {
        id: 'A',
        verseCitation: 'Matthew 15:21',
        quotedText: 'Jesus withdrew to the region of Tyre and Sidon.',
        commentary:
          'Immediately after confronting Pharisaic legalism over external ritual defilement (Matthew 15:1–20), Jesus steps across the border into pagan Phoenician territory—exposing the contrast between false external purity and authentic faith of the heart.',
        catechismReferences: ['CCC 543'],
        patristicNote: null,
      },
      {
        id: 'B',
        verseCitation: 'Matthew 15:22a',
        quotedText:
          'A Canaanite woman of that district came and called out, "Have pity on me, Lord, Son of David!"',
        commentary:
          'Matthew deliberately uses the ancient biblical term "Canaanite" to recall Israel\'s historic foes, yet this Gentile outsider confesses Jesus with Israel\'s Messianic title—"Lord, Son of David"—modeling faith as personal adherence to Christ.',
        catechismReferences: ['CCC 150', 'CCC 151', 'CCC 152', 'CCC 2616'],
        patristicNote: null,
      },
      {
        id: 'C',
        verseCitation: 'Matthew 15:22b',
        quotedText: 'My daughter is tormented by a demon.',
        commentary:
          'Intercessory love makes her child\'s torment her own ("Have pity on me"). She models how believers bring those bound by suffering or spiritual affliction to Jesus when they cannot come on their own.',
        catechismReferences: ['CCC 2634', 'CCC 2635'],
        patristicNote: null,
      },
      {
        id: 'D',
        verseCitation: 'Matthew 15:23a',
        quotedText: 'But Jesus did not say a word in answer to her.',
        commentary:
          'Divine silence is not abandonment or coldness. Jesus pauses so that her persevering cry may grow stronger and put the disciples\' impatience to shame.',
        catechismReferences: ['CCC 2729', 'CCC 2730', 'CCC 2737'],
        patristicNote:
          'St. Augustine and St. John Chrysostom (preserved in St. Thomas Aquinas\' Catena Aurea) teach that Christ delays not to refuse mercy, but to enkindle deeper desire and reveal hidden faith to all watching.',
      },
      {
        id: 'E',
        verseCitation: 'Matthew 15:23b',
        quotedText: 'Send her away, for she keeps calling out after us.',
        commentary:
          'The disciples treat a desperate mother as a noisy interruption to manage. Their reaction warns every parish and young adult group against becoming a closed religious social club annoyed by wounded seekers.',
        catechismReferences: ['CCC 1825'],
        patristicNote: null,
      },
      {
        id: 'F',
        verseCitation: 'Matthew 15:24',
        quotedText:
          'I was sent only to the lost sheep of the house of Israel.',
        commentary:
          'Jesus honors the real salvation-historical order willed by the Father: His earthly ministry fulfills the promises made first to covenant Israel, through whom salvation opens to all the nations after the Cross and Resurrection.',
        catechismReferences: ['CCC 839', 'CCC 840', 'CCC 543'],
        patristicNote: null,
      },
      {
        id: 'G',
        verseCitation: 'Matthew 15:25',
        quotedText:
          'But the woman came and did Jesus homage, saying, "Lord, help me."',
        commentary:
          'Instead of retreating in offense, she comes closer, kneels in adoration (proskynei), and utters one of Scripture\'s purest unperformed prayers: "Lord, help me"—surrendered faith heard immediately by Jesus.',
        catechismReferences: ['CCC 2607', 'CCC 2616', 'CCC 2628'],
        patristicNote: null,
      },
      {
        id: 'H',
        verseCitation: 'Matthew 15:26',
        quotedText:
          'It is not right to take the food of the children and throw it to the dogs.',
        commentary:
          'Using household parable imagery (kynaria, little house pets beneath the family table), Jesus tests her heart not to humiliate her, but to draw forth the full radiance of her humility and trust.',
        catechismReferences: ['CCC 2559'],
        patristicNote:
          'St. Jerome (via St. Thomas Aquinas\' Catena Aurea) highlights how Christ\'s testing word draws forth her threefold triumph of unconquerable faith, patience, and humility.',
      },
      {
        id: 'I',
        verseCitation: 'Matthew 15:27',
        quotedText:
          'Even the dogs eat the scraps that fall from the table of their masters.',
        commentary:
          'True Gospel humility (never self-hatred) claims no proud entitlement yet trusts completely in the Master\'s overflowing generosity—echoing the centurion\'s prayer before Communion, "Lord, I am not worthy..." Mercy is received as gift, not earned.',
        catechismReferences: ['CCC 1386', 'CCC 2559'],
        patristicNote: null,
      },
      {
        id: 'J',
        verseCitation: 'Matthew 15:28',
        quotedText:
          'O woman, great is your faith! Let it be done for you as you wish.',
        commentary:
          'Whereas Peter\'s faltering trust on the water was called "little faith" (Matthew 14:31), Jesus marvels at this Gentile mother\'s Christ-centered, humble, persistent, bold, intercessory faith—and heals her daughter from that very hour.',
        catechismReferences: ['CCC 161', 'CCC 2610', 'CCC 2616'],
        patristicNote: null,
      },
    ],
    catholicDoctrine: [
      {
        id: 'A',
        title: "God's Saving Plan Begins with Israel and Opens to All Nations",
        summary:
          'Salvation history unfolds in purposeful divine order: God chose and formed Israel as His covenant people so that through Jesus the Messiah, Son of David, blessing and redemption would reach every nation on earth.',
        references: ['Isaiah 56:1, 6–7', 'Matthew 15:24', 'Matthew 28:19'],
      },
      {
        id: 'B',
        title: 'The Gifts and the Call of God Are Irrevocable',
        summary:
          'As St. Paul teaches in Romans 11:29 and the Church affirms in CCC 839–840 (Nostra Aetate 4), God\'s covenant fidelity to Israel is never revoked; Catholics must reject all anti-Jewish contempt, pride, or supersessionist distortion.',
        references: ['Romans 11:13–15, 29–32', 'CCC 839–840', 'Nostra Aetate 4'],
      },
      {
        id: 'C',
        title: "Catholicity: Universality in Christ's Presence and Mission",
        summary:
          'The Church is catholic because Christ is fully present in her with the fullness of the means of salvation and because she is sent to gather all peoples into one house of prayer across every culture and tongue.',
        references: ['CCC 830–856', 'Psalm 67:2–3, 5, 6, 8'],
      },
      {
        id: 'D',
        title: 'Firm in Truth, Wide in Mercy',
        summary:
          'Jesus neither erases covenant truth nor sends the wounded seeker away; authentic Catholic pastoral life holds fast to revealed truth while welcoming every humble, searching heart with Christ\'s healing mercy.',
        references: ['CCC 831', 'CCC 1825', 'Matthew 15:28'],
      },
    ],
    youngAdultApplication: [
      {
        id: 'A',
        title: 'Persevering Through Seasons of Divine Silence',
        summary:
          'When prayer around vocation, mental health, or family suffering meets apparent silence, resist pulling away; stay at Jesus\' feet trusting that delay is purifying desire rather than signaling rejection.',
      },
      {
        id: 'B',
        title: 'Praying an Unperformed "Lord, Help Me"',
        summary:
          'Let go of the pressure to sound spiritually impressive; three honest, surrendered words spoken in adoration—"Lord, help me"—reach the heart of Christ.',
      },
      {
        id: 'C',
        title: 'Practicing Gospel Humility Instead of Shame',
        summary:
          'Distinguish pride-shattering humility from paralyzing shame: approach Confession and the Eucharist confident that even one crumb of Christ\'s grace is enough to make us whole.',
      },
      {
        id: 'D',
        title: 'Overcoming the "Send Her Away" Reflex in Parish Life',
        summary:
          'Notice who stands alone after Mass or feels culturally or spiritually out of place in young adult ministry, becoming active builders of a house of prayer for all peoples.',
      },
    ],
    prayerCardTemplate: {
      title: '"Lord, Help Me" Prayer Card',
      instructions:
        'Write three short, honest prayers inspired by Matthew 15:21–28. Your Prayer Card stays private on your device for personal prayer and download, with an optional choice to share one line with the group.',
      prompts: [
        {
          id: 'self',
          audienceLabel: 'For myself',
          promptPrefix: 'Lord, help me',
          templateText: 'Lord, help me ___.',
        },
        {
          id: 'loved-one',
          audienceLabel: 'For someone I love',
          promptPrefix: 'Lord, have mercy on',
          templateText: 'Lord, have mercy on ___.',
        },
        {
          id: 'church-world',
          audienceLabel: 'For the Church/world',
          promptPrefix: 'Lord, make Your house a house of prayer for',
          templateText: 'Lord, make Your house a house of prayer for ___.',
        },
      ],
    },
  },
  closing: {
    sectionId: 'section_5_closing',
    sectionNumber: 5,
    progressPercent: 100,
    turnMode: 'none',
    title: 'Closing Prayer',
    eyebrow: 'WRAPPING UP',
    durationMinutes: 3,
    durationLabel: '3 min',
    summaryBullets: [
      "God's house is a house of prayer for all peoples, while His covenant gifts and call to Israel remain irrevocable (Isaiah 56:7; Romans 11:29).",
      "Apparent divine silence is never abandonment—persevering in prayer enlarges desire and unveils authentic faith.",
      "Great faith is Christ-centered, humble, persistent, bold, and intercessory, trusting that even a crumb of Christ's mercy heals.",
      'Every Catholic young adult community is called to reject the "send her away" reflex and welcome seekers with truth and mercy.',
    ],
    weeklyChallenges: [
      {
        optionNumber: 1,
        title: 'Persistent Prayer',
        description:
          'Intercede daily by name all week for one suffering person without giving up.',
      },
      {
        optionNumber: 2,
        title: 'Humble Prayer',
        description:
          'Begin each day with the Canaanite woman\'s simple prayer: "Lord, help me."',
      },
      {
        optionNumber: 3,
        title: 'Catholic Hospitality',
        description:
          'Intentionally reach out to someone feeling like an outsider at Mass, work, or young adult group.',
      },
      {
        optionNumber: 4,
        title: 'Eucharistic Humility',
        description:
          'Pray "Lord, I am not worthy..." slowly and attentively before Holy Communion.',
      },
    ],
    nextWeekAnnouncement: {
      title: 'Faith that Endures',
      citation: 'James 1:2–4',
      displayLabel: '"Faith that Endures" — James 1:2–4',
    },
    closingPrayerText:
      'Lord Jesus, Son of David, have mercy on us. When we feel like outsiders, draw us closer. When You seem silent, teach us to persevere. When we are proud, make us humble. When we are discouraged, strengthen our faith. When we are tempted to send others away, give us Your heart of mercy. Make Your Church a house of prayer for all peoples. Let all nations praise You. Heal those we carry in our hearts. And say over us, by Your grace: "Great is your faith." Amen.',
  },
});

export function getDefaultStudyDocument(): StudyDocument {
  return structuredClone(GREAT_IS_YOUR_FAITH_STUDY);
}

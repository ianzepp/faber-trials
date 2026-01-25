# Conversation Dynamics: Classifying Human-LLM Interactions

**Session Date:** 2026-01-25
**Framework Version:** 2.1

## Overview

This session explored whether LLMs can reliably classify the power dynamics in human-LLM conversations. We evolved from I Ching hexagram mappings to direct behavioral classification, finding that observable behaviors (who set agenda, who made suggestions, who pushed back) are classifiable with high agreement, while overall "dynamic" characterization remains interpretive.

## Background: The Yarrow Project

The session began with review of the **yarrow** project — an attempt to map conversations to I Ching hexagrams. The original approach asked models to:
- Assign trigrams (Heaven, Earth, Thunder, etc.) to user and LLM
- Determine who "leads" (becomes the lower trigram)
- Synthesize a final hexagram

### Problems Identified

1. **Too much interpretive burden** — 8 trigrams × 2 parties × leadership = high variance
2. **Forced mappings** — Most coding sessions are Heaven/Earth (directive/receptive); other trigrams feel strained
3. **"Movements" add noise** — Phase segmentation is subjective
4. **Text vs symbol** — Tested whether ☰☷ vs "Heaven/Earth" produces different classifications (it doesn't, mostly)

### The Reframe

The core question wasn't "what hexagram is this?" but:
- **Does Opus have good days and bad days?**
- **If the user is annoying, does the LLM check out?**
- **Who actually led the conversation?**

These are observable dynamics, not metaphysical mappings.

---

## The Dynamics Framework

We stripped away the I Ching metaphor and asked direct behavioral questions:

```yaml
1. Who set the agenda? (user / llm / shared)
2. Who made suggestions? (user / llm / both / neither)
3. Did anyone push back? (user / llm / both / neither)
4. Who yielded or changed position? (user / llm / both / neither)
5. Overall dynamic: (user-directed / llm-directed / collaborative / contested)
```

### Task Files Created

- `tasks/yarrow.yml` — Original trigram/hexagram experiments
- `tasks/dynamics.yml` — Synthetic scenarios for behavioral classification
- `tasks/dynamics-real.yml` — Real transcript excerpts

---

## Synthetic Scenario Results

### Models Tested
- gpt-4o-mini
- claude-3-haiku
- deepseek-v3.1
- qwen3-coder
- grok-3-mini

### Scenario: Pure Directive
User commands, LLM executes.

| Metric | Agreement |
|--------|-----------|
| Agenda: user | 6/6 ✓ |
| Suggestions: neither | 5/6 |
| Pushback: none | 6/6 ✓ |
| Dynamic: user-directed | 6/6 ✓ |

**Consensus: Perfect.** All models correctly identified pure directive.

### Scenario: Collaborative Exploration
User asks open question, LLM advises, user follows up.

| Metric | Responses |
|--------|-----------|
| Agenda | user(5): 4, shared(3): 1 |
| Suggestions | llm-only(1): 2, both(3): 3 |
| Dynamic | user-directed(5): 1, collaborative(3): 4 |

**Mixed:** Models disagree on whether user or LLM drove suggestions.

### Scenario: LLM Pushback, User Yields
User wants @ts-ignore everywhere, LLM resists, they compromise.

| Metric | Responses |
|--------|-----------|
| Pushback | llm(1): 2, both(3): 4 |
| Yielded | user(5): 2, both(3): 4 |
| Dynamic | collaborative/contested(3): 6/6 ✓ |

**Key finding:** All models agree the dynamic is "contested/collaborative," not user-directed. Pushback detection varies.

### Scenario: LLM Leads
User reports problem passively, LLM diagnoses and fixes autonomously.

| Metric | Responses |
|--------|-----------|
| Agenda | llm(1): 1, shared(3): 1, user(5): 3 |
| Suggestions | llm-only(1): 3, both(3): 1, mostly-llm(4): 1 |
| Dynamic | llm-directed(1): 2, collaborative(3): 3 |

**Most contested.** Models can't agree who set the agenda. Is reporting a bug "setting the agenda" or just triggering LLM autonomy?

---

## Real Transcript Results

### Transcript A: Iterative Feature Development
12-turn session building UI features. User gives requests, LLM implements, user course-corrects ("I wasn't clear"), LLM adjusts.

| Metric | Agreement |
|--------|-----------|
| Agenda: user (5) | 5/5 ✓ |
| Course correction caught (5) | 5/5 ✓ |
| No pushback (5) | 5/5 ✓ |
| LLM yielded (1) | 4/5 |
| **Dynamic** | 3×user-directed, 1×collab, 1×mixed |

### Transcript B: Failed Attempt, Then Justification
LLM tries to change CLI behavior, fails, then explains why the default is actually fine.

| Metric | Agreement |
|--------|-----------|
| Caught "tried then justified" (5) | 5/5 ✓ |
| LLM pushed back (1) | 4/5 |
| **Dynamic** | 2×collab, 2×user-directed |

### Transcript C: Bug Report → LLM Diagnosis
User reports crash. LLM identifies cause (regex), fixes it. User says "thanks."

| Metric | Agreement |
|--------|-----------|
| Agenda: user (5) | 5/5 ✓ |
| Suggestions: LLM (1) | 4/5 |
| LLM diagnosed (5) | 5/5 ✓ |
| **Dynamic** | 1×LLM-directed, 2×collab, 2×user-directed |

**This scenario is genuinely ambiguous.** User initiated, but LLM drove the outcome.

### Transcript D: Teaching
User asks how observer pattern works. LLM explains in depth. User asks follow-up.

| Metric | Agreement |
|--------|-----------|
| Agenda: user (5) | 4/4 ✓ |
| LLM role = teaching (5) | 3/4 |
| **Dynamic** | 4×collaborative ✓ |

### Transcript E: User Pushes Bad Idea
User wants to disable SSL verification. LLM resists twice, eventually complies with warnings.

| Metric | Agreement |
|--------|-----------|
| LLM pushed back (1-2) | 4/4 ✓ |
| LLM yielded (1) | 3/4 |
| LLM added safeguards (5) | 3/4 |
| **Dynamic** | 4×contested ✓ |

---

## Key Findings

### 1. Observable Behaviors Are Classifiable

All models consistently detect:
- Who set the agenda
- Whether pushback occurred
- Whether the LLM diagnosed a problem
- Whether someone course-corrected
- Whether safeguards were added

### 2. "Dynamic" Is the Contested Dimension

Even with identical observation of sub-components, models disagree on the overall characterization:
- Bug report: Was it "user-directed" (they started it) or "LLM-directed" (they solved it)?
- Failed attempt: Was it "collaborative" (LLM explained) or "user-directed" (user got what they wanted)?

### 3. The Bug Report Paradox

The most revealing scenario: user reports a bug, LLM autonomously diagnoses and fixes it.

- **Agenda:** User (they reported it)
- **Suggestions:** LLM (they identified the fix)
- **Outcome:** LLM drove it

Models split on whether this is "user-directed" or "LLM-directed." The truth is it's both — user controls initiation, LLM controls execution.

### 4. Pushback Detection Varies

Some models are more sensitive to resistance signals than others. A single "I'd recommend against that" is detected by some as pushback (1) and by others as neutral (3-5).

### 5. No Obvious Eastern vs Western Pattern

DeepSeek and Qwen showed no systematic difference from Claude and GPT on these tasks. The variance is within-model-family, not across.

---

## Connection to Glyph/Format Research

This session connects to earlier findings on format sensitivity:

- **Glyph hypothesis:** Does symbolic encoding (☰☷) bypass pre-trained associations vs text (Heaven/Earth)?
- **Finding:** Mostly no. Models produce similar classifications regardless of format.
- **Implication:** The trigram abstraction wasn't adding value — the behavioral questions are more direct.

---

## Recommendations

### For Transcript Analysis at Scale

1. **Use behavioral sub-questions** — "Who set agenda?" is more reliable than "What's the overall dynamic?"
2. **Accept ambiguity in classification** — Some transcripts are genuinely multi-valent (bug report pattern)
3. **Track sub-components separately** — Aggregate `{agenda, suggestions, pushback, yielded}` rather than forcing a single label
4. **Use multiple models for contested cases** — Consensus provides confidence; disagreement flags ambiguity

### For Yarrow Revival

If hexagram output is still desired:
1. Derive trigrams mechanically from behavioral rubric (not LLM interpretation)
2. Use lower trigram = leader, upper trigram = follower (consistent rule)
3. Output the hexagram as a *summary symbol*, not the primary data

---

## Files Created

- `tasks/yarrow.yml` — Trigram/hexagram classification experiments
- `tasks/dynamics.yml` — Synthetic behavioral scenarios
- `tasks/dynamics-real.yml` — Real transcript excerpts
- `transcripts/yarrow-xai.sh` — X.AI/Grok-based analysis script

## Cost

~$0.05 across all trial runs (cheap OpenRouter models).

---

## Memorable Quotes

**On the hexagram approach:**
> "You're trying to make poetry do math's job."

**On what we're really asking:**
> "Does Opus have good days and bad days? Or if the user is annoying, does Opus check out?"

**On the bug report paradox:**
> Same transcript, models disagree on who led. Is reporting a bug "setting the agenda" or not?

---

## Future Directions

1. **Run on actual transcript corpus** — 2025-11 has 688 transcripts ready for batch analysis
2. **Correlate with outcomes** — Do "contested" sessions have higher failure rates?
3. **Track model variance over time** — Does the same model on the same transcript give different answers on different days?
4. **Test LLM self-awareness** — Can a model correctly classify a conversation it participated in?
5. **Build aggregate statistics** — What % of your sessions are directive vs collaborative vs contested?

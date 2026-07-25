# Prompt Variant Decision

**Date:** 2026-07-25
**Author:** ThreadVerse Team
**Decision:** v3-structured selected as default prompt variant

## Context

Three prompt variants were built on top of the v1.0 template (committed Day 6) and evaluated against the 20-question eval suite across 3 test communities (React Developers, Node.js, MongoDB). The eval harness (`evalVariants.js`) embeds queries, retrieves context via $vectorSearch, generates answers via Groq (Gemini rate-limited), and grades with the Groq-based judge (`evalJudge.js`).

## Comparison Table

| Metric | v1-verbose | v2-concise | v3-structured |
|---|---|---|---|
| Avg token count | 840 | 671 | 786 |
| Citation rate | 8.3% | 0.0% | **100%** |
| Avg relevance (1–5) | 4.33 | **4.75** | 4.50 |
| Avg faithfulness (1–5) | 5.00 | 5.00 | 5.00 |
| Groundedness (0/1) | 0.33 | 0.00 | **0.83** |
| Overall score | 4.67 | 4.88 | **4.75** |

## Decision: v3-structured

**v3-structured selected.** Three factors drove this:

1. **Citation compliance is non-negotiable for the citation-link UI.** v3 achieves 100% citation rate — every answer includes `[1]`, `[2]` inline references mapped to a `Sources:` block. v1's free-text `Based on "Post title"` format is ignored by the LLM 92% of the time. v2 never produces citations at all. The numbered citation format from v3 feeds directly into the Day 10 citation-link component without any transformation.

2. **Token cost is marginal.** At 786 avg tokens, v3 is only 17% larger than v2 (671) and actually 6% *smaller* than v1 (840). The structured format is more token-efficient than verbose framing because it replaces wordy prose instructions with precise formatting rules.

3. **Faithfulness holds at 5.0.** No variant produces hallucinated facts. v3 matches the others on faithfulness while dramatically outperforming on grounding — 83% vs 33% (v1) and 0% (v2).

## Variant Roles

- **v3-structured** — Production default. Used by `streamChatResponse()` and `buildRagPrompt()`.
- **v2-concise** — Available as user-selectable "brief mode" for quick answers.
- **v1-verbose** — Retained for eval comparison and potential future use where elaboration is desired without strict citation requirements.

## Eval Infrastructure

- Script: `src/scripts/evalVariants.js`
- Report: `eval-variants-report.json` (36 questions × 3 variants)
- Judge: `evalJudge.js` (Groq llama-3.3-70b-versatile, temperature=0)
- Historical baseline: 71 prior EvalResults across v1.0, desktop-cache-v1/v2, server-vsearch-v1

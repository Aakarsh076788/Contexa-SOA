# Forensic Investigation Report

## 1. Exact root cause
The Context Engine successfully retrieved the related candidates, but failed to merge them because **the Gemini API was experiencing an outage (503 Service Unavailable)**. 

When the candidates were retrieved, their deterministic lexical score was very low (15-25 points). The Candidate Retrieval Layer correctly elevated them to Gemini for deep evaluation. However, when Gemini failed, the newly implemented `AI_UNAVAILABLE` fallback logic took over. Because the deterministic score was less than the rigid `30` point threshold, the engine refused to merge them and correctly dropped to Step 4c, where it created fragmented contexts. 

## 2. Evidence from the three real events
A complete execution trace against the production database revealed:

*   **Event 1 ("prabhas movies - Google Search")**: 
    *   No strong candidates existed. Created Context A (`context_52d3fca`).
*   **Event 2 ("Prabhas Filmography")**:
    *   **Retrieval**: `retrieveCandidates` successfully found Context A (Semantic similarity: 62.3%).
    *   **Deterministic Score**: Only `15` (due to 0% keyword overlap).
    *   **Evaluation**: Elevated to Gemini. Gemini was unavailable. Fallback rejected the merge because `15 < 30`. Created Context B (`context_2d5861f`).
*   **Event 3 ("Prabhas Upcoming Movies 2026...")**:
    *   **Retrieval**: `retrieveCandidates` successfully found Context A & B (Semantic similarity: 60.7% and 79.3%).
    *   **Deterministic Score**: `14` and `25` (low keyword overlap).
    *   **Evaluation**: Elevated to Gemini. Gemini was unavailable. Fallback rejected the merge because `25 < 30`. Created Context C (`context_c07158b`).

## 3. Whether candidate retrieval is actually functioning
**Yes.** The retrieval layer successfully identified the related contexts using semantic embeddings despite the complete lack of lexical overlap, proving the top-K architecture works.

## 4. Whether final evaluation is functioning
**Yes, but it is extremely brittle.** It correctly enforces the user's requirement not to fabricate an AI decision during an outage. However, during an LLM outage, it relies on a deterministic `score >= 30` barrier which is heavily weighted toward exact lexical keyword overlap, causing aggressive fragmentation.

## 5. Whether the UI confidence number is trustworthy
**No.** The forensic trace revealed that `96%` is a hardcoded mathematical artifact. 
During the creation of a new context (`createContext`), the engine scores the originating event against an identical copy of itself. This yields a deterministic score of ~88. The engine then applies the bounding formula:
`Math.min(98, Math.max(72, 62 + Math.min(34, 88)))`
This always resolves precisely to **96**. It is displaying self-matching confidence, not external matching confidence.

## 6. The smallest correct fix
In `correlate.js`, increase the weight of `semantic_match` in the `correlationEvidence()` deterministic calculation. Currently, an incredibly strong semantic similarity of 80% only yields ~18 points. If the semantic signal alone could yield 30+ points, the deterministic fallback would correctly merge these items without needing Gemini at all.

## 7. Any architectural problem discovered
The `correlationEvidence()` deterministic engine fundamentally undervalues high-quality vector embeddings. It was designed as a lexical engine first. Because a pure semantic match cannot natively breach the 30-point medium-confidence barrier, the system is entirely dependent on Gemini's Reranker to bridge semantic gaps, leading to severe fragmentation whenever the API goes down or rate limits.

# Muscle Map — notes for Claude

Standing rules from the owner for the review and its suggestions (keep them when changing `src/review.js`,
`src/addons/body.js`, `src/addons/progress.js`, `src/claude.js` or any advice text):

1. **Evidence first.** Every rule, score weight and piece of advice must rest on well-recognised, tested research:
   position stands of scientific bodies, meta-analyses, clinical trials. The sources live in `src/evidence.js` and are
   shown in the Suggestions tab; add the source there when you add or change a rule. Check a citation before you add it.
   Where research is thin, write the rule as a cautious practical rule, give it little or no weight in the score, and
   say so. No medical diagnoses.
2. **Tailored to the goal.** Every suggestion must fit the primary goal the user chose in the Goals tab
   (`goalType()` in `src/addons/body.js`: muscle gain `bulk`, fat loss `cut`, maintenance `maintain`). No generic advice.
3. **Bones count.** Fat + muscle + bone make 100% of the body (Body and Goals tabs). The review considers bone:
   sessions a week with heavy lifts for the legs, hips and back (`BONE_LIFTS` in `src/review.js`), and bone advice per goal.
   A home scale's bone figure is an estimate, not bone density: never present it as a diagnosis.

Words: "sections" are Map, Review and Programs; "tabs" are what a section contains.

Build with `node tools/build-app.mjs` (output in `dist/`, which is committed). All texts are bilingual: `T(en, el)`.

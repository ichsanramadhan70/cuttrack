# CutTrack Final Starter

Deployable Vercel starter for the agreed CutTrack blueprint.

## Features
- Personal profile + BMI + target calories/protein
- My Day dashboard
- Nutrition tracker + hydration
- Manual food entry
- AI Food Scanner with review-before-save flow
- Training profile + strength checklist + cardio
- Workout notes and saved progress
- Adaptive Coach placeholder for future rules/AI
- localStorage for this starter

## Vercel setup
1. Upload this folder/repository to GitHub.
2. Import the repository into Vercel.
3. Add Environment Variable:
   `OPENAI_API_KEY` = your real OpenAI API key.
4. Optional:
   `OPENAI_MODEL` = `gpt-5.6-luna`
5. Deploy.

The API key is read only by the server function, not by browser JavaScript.

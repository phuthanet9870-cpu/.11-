# AI art pipeline (OpenAI Images)

This turns OpenAI-generated images into the game's sprite sheets. It reuses the frame sizes,
frame counts and QA checks of Batch 001. Codex isn't needed: the generator calls the OpenAI
Images API (`gpt-image-1`) directly.

## Status

The pipeline is built and tested, but **no AI images have been generated yet**. This
environment has no `OPENAI_API_KEY`, and its network policy blocks `api.openai.com`. The
game still uses the Batch 001 studio art.

## Before you run it

In the cloud environment settings:
1. Add `api.openai.com` under **Network access → Allowed domains**.
2. Add `OPENAI_API_KEY` under **Network secrets / environment variables**.
3. Start a new session.

Never paste the key into chat.

## Steps

```bash
npm run assets:ai:generate -- --dry-run      # list the 29 prompts, no API calls
npm run assets:ai:generate                   # all jobs (skips images already generated)
npm run assets:ai:generate -- --only mushling   # one asset
npm run assets:ai:import -- --no-write       # process + QA only; contact sheets in docs/art/ai/
npm run assets:ai:import                     # write every asset whose sheets all pass QA
npm run demo:batch001                        # check it in the game
npm run assets:batch001                      # back to the studio art
```

### What the jobs are

There are 29 images in total:
- **Novice:** 1 reference turnaround, then 6 animation sheets.
- **Leaf Slime, Mushling, Horn Rabbit:** 1 reference each, then 5 animation sheets each.
- **VFX:** 4 strips.

Every animation sheet is sent to `images/edits` together with its asset's reference image,
which keeps the character consistent. The raw images and their prompts are saved in
`tools/asset-studio/ai-raw/`.

### What the importer does to each image

The importer (`src/ai/process.ts`) runs these steps in order:
1. Removes a flat background, if the model drew one.
2. Finds the grid of sprites (connected components, falling back to equal cells).
3. Area-average downscales each frame to 48×64 (characters) or 48×48 (monsters), with binary
   alpha.
4. Trims each frame to its pixels.
5. Adds a selective outline.
6. Quantises to a shared palette.
7. Places the feet on the baseline (y 61 for characters, 45 for monsters), keeping each
   frame's own motion.
8. Mirrors the left row to make the right row.

Then the same QA as Batch 001 runs. An asset is written into the game only if **all** its
sheets pass, unless you pass `--force`.

## Limits

- **Model output varies between runs.** Image models often miss the exact grid, repeat
  poses, or drift in style between sheets. QA rejects those sheets, and you regenerate them
  with `--force --only <asset>`.
- **AI characters can't be customised.** AI sheets are single composite images, so the
  player's chosen hair style and colours are no longer applied to the Novice. The studio art
  keeps separate layers for that.
- **Tested on stand-ins only.** The pipeline was checked on stand-ins (studio sheets blown up
  12× and smoothed, one on a white background). All three assets passed QA, and the in-game
  demo passed 26/26 with the imported sheets. Those were tests of the pipeline, not
  generated art.

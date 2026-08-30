# Profile setup

Everything goes into your **`aaaditt/aaaditt`** repo (the special one that renders on your profile).

```
aaaditt/aaaditt
├── README.md
├── assets/
│   ├── hero.svg
│   ├── stack.svg
│   └── divider.svg
└── .github/workflows/snake.yml
```

## 1. Commit the files

```bash
git clone https://github.com/aaaditt/aaaditt.git
cd aaaditt
# copy README.md, assets/ and .github/ in here
git add -A
git commit -m "new profile"
git push
```

## 2. Kick off the snake once

The contribution snake won't appear until the workflow has run once.

**Actions → "generate contribution snake" → Run workflow.**

It writes `snake.svg` / `snake-light.svg` to an `output` branch, then re-runs every 12 hours.
If Actions is disabled on the repo, enable it in **Settings → Actions → General → Allow all actions**.

## 3. Things worth doing while you're in there

- **Your repos have no descriptions.** Every one of them is blank. A one-line description
  shows up in search, on your profile, and in the pin cards — this is the single
  highest-leverage 10 minutes you can spend.
- **Pin the six featured repos** so the profile and the pins agree:
  `video-editor`, `3d-editor`, `minecraft-schematic-maker`, `caspr`, `AeroVertex`, `georgia-trip`.
- **Consider renaming two repos.** `video-editor` is actually *demotape* and `3d-editor` is
  *Jacket Studio*. GitHub redirects the old URLs automatically, so nothing breaks.

## Notes

- **The animations are real SVG/CSS**, no JavaScript — that's the only way GitHub will run them.
  They replay every time someone loads your profile.
- **If you edit an SVG and the old one sticks around**, that's GitHub's image proxy caching.
  Add `?v=2` to the end of the image URL in `README.md` to bust it.
- **`prefers-reduced-motion` is respected** — anyone who has that switched on sees a clean
  static version instead of the intro.
- **Check before you trust:** the stack tags on *AeroVertex* and *Jacket Studio* are my best
  guess from the code. The rest came from your own repo READMEs.
- Contact links carried over from the old README: `linkedin.com/in/aadit-chandra` and
  `work.aadit@gmail.com`. I dropped the "Portfolio" badge since it pointed back at GitHub —
  add it back when the cinematic portfolio is live.

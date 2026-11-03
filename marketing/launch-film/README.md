# EZZ BILL launch film

A 9:16 launch film (24.5 s, 60 fps) rendered entirely from code with the Take One skill. `ezz-bill-take-one.mp4` is take one.

- `film.html`: every frame is a pure function of time (`window.renderFrame(t)`), drawn on a canvas.
- `assets/real/`: captures of the app's own screens, rendered from this repo's code on demo data at 5x (`capture/*.mjs`, with `app-mock/client.ts` standing in for the Supabase client). No real user data.
- `music/leak.mjs`: the music score (Take One's code music engine); `music/sfx-plan.json`: sound effects placed on exact frames.
- `POSTS.md`: launch posts. `BRAND-BRIEF.md`: brand audit. `DIRECTION.md`: storyboard reads, reviews and the owner's notes.

Render (needs the Take One skill at `~/.claude/skills/take-one`, Node 18+, ffmpeg and Google Chrome):

```bash
npm install
W=1080 H=1920 bash ~/.claude/skills/take-one/scripts/render-parallel.sh 60 24.5 out/picture.mp4 3
node ~/.claude/skills/take-one/scripts/music.mjs render music/leak.mjs --seconds 25.85 --out music/bed.wav
ffmpeg -i music/bed.wav -t 24.5 -af "afade=t=out:st=23.2:d=1.3" -c:a pcm_f32le music/bed-cut.wav
node ~/.claude/skills/take-one/scripts/sfx.mjs mix music/sfx-plan.json music/bed-cut.wav music/mix.wav
bash ~/.claude/skills/take-one/scripts/mux-audio.sh out/picture.mp4 music/mix.wav out/cut.mp4
```

All figures in the film are demo data and are labelled as such on screen.

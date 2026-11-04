# Car Songs

A phone app (PWA) for the songs on the car USB stick.

- **Songs, Categories, Artists**: search and browse all songs with their car track numbers.
- **Skip counter**: set the playing track and every song shows how many Next or Back presses reach it.
- **Song recognition**: tap the microphone (or open the app) and it recognises which song from the stick is playing.
  It works offline; the phone compares the sound with fingerprints in `fp.bin`. No audio is stored or uploaded.

## Files

| File | What it is |
|---|---|
| `index.html`, `app.js` | the app |
| `songs.json` | the song list (track numbers, names, lengths) |
| `fp.bin` | fingerprints of every song (no audio) |
| `fp-core.js`, `fp-worker.js`, `capture-worklet.js` | the recognition engine |
| `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/` | offline support, install and icons |

When songs change, the whole folder is rebuilt and uploaded again; phones update automatically.

# Demo assets

- `history.fish` - a **synthetic** fish history, generated for the recording and the sample report. Every command, path and credential-looking value in it is invented; nothing here comes from a real machine.
- `demo.gif` - the terminal recording used in the README and on the landing page, produced with [VHS](https://github.com/charmbracelet/vhs).

`npm run site:build` renders `site/report.html` from `history.fish`, so the published sample report never contains anyone's actual commands.

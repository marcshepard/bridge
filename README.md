# Bridge Replay

Play hands from an old duplicate bridge game at home, then compare your result with the original
field. The app shows each player only their own 13 cards for dealing. After the board, you enter
the contract, declarer and tricks. It works out the score line by line, gives your matchpoint
percentage and IMPs against everyone who played the board originally, and keeps a running tally.

The app runs in a web browser on any phone, tablet or computer. It has a frontend (the screens each
player opens on their own device) and a backend (a small API and database on Cloudflare) that lets
the four players at a table share one game. Games come from
files you upload: a PBN file, or a saved Common Game results page. No accounts are needed.

> The bundled game is **synthetic**. The deals are random and the double-dummy analysis is
> real, but the field results are simulated. Real archived games (for example from The Common
> Game) can be imported as files, and a licensed source is being explored. See
> [docs/DESIGN.md](docs/DESIGN.md).

## Run it locally

### 1. Install the prerequisites

| Tool | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org/) | 20.19+ or 22.12+ (LTS recommended) | Running the app |
| [Git](https://git-scm.com/) | any | Cloning |
| [VS Code](https://code.visualstudio.com/) | any | Optional. The repo includes tasks |
| [Python](https://www.python.org/) | 3.10+ | Optional. Only for regenerating the sample game |

Check Node from a terminal (bash; on Windows use Git Bash or WSL):

```bash
node --version   # v20.19.0 or later, or v22.12.0 or later
npm --version
```

### 2. Install dependencies

The app has two parts, each with its own dependencies:

- the **frontend** (the screens), in `frontend/`
- the **backend** (the API and database), in `backend/`: a Cloudflare Worker that runs locally,
  with no Cloudflare account needed

Install both from the repo root (the `bridge` folder, where VS Code's terminal opens):

```bash
cd backend
npm install
cd ../frontend
npm install
```

### 3. Start the app

In the same terminal, which is still in `frontend/`:

```bash
npm run dev
```

This starts both the backend (on port 8787, with a local database) and the frontend. Their output
is labelled `[backend]` and `[frontend]`. Open <http://localhost:5185>.

In VS Code: **Terminal → Run Task… → start bridge app**, or press **Ctrl+Shift+B**, since it's the
default build task.

**Running the parts separately.** The frontend and backend can also be started on their own, for
example to restart one without the other:

| Starts | VS Code task | Terminal |
|---|---|---|
| Frontend only (:5185) | **Start frontend** | `npm run dev:frontend` in `frontend/` |
| Backend only (:8787) | **Start backend** | `npm run dev` in `backend/` |
| Both | **start bridge app** (Ctrl+Shift+B) | `npm run dev` in `frontend/` |

The VS Code **start bridge app** task runs the other two side by side, each in its own terminal.

**Using it from other devices at the table.** The frontend's dev server also listens on your local
network. The terminal prints a `Network:` address such as `http://192.168.1.20:5185`. Open that on
each phone, tablet or laptop while it's on the same Wi-Fi. If a device can't connect, allow Node.js through Windows
Defender Firewall for private networks when Windows asks, or add the rule under **Windows
Security → Firewall → Allow an app**.

### 4. Play

1. Enter your name, then **Start a game** and upload a game file: a PBN file, a Common Game
   results page saved from your browser, or the synthetic sample
   (`frontend/public/games/sample-synthetic-01.json`). Share the join code.
2. The other three open the app and **Join a game** with the code (or the shared link).
3. Once all four are in, whoever started the game picks partnerships, and each screen shows
   where to sit.
4. Playing the boards (dealing from your screen, entering results, comparing with the field)
   comes in stage 3; see the build plan in [docs/DESIGN.md](docs/DESIGN.md).

To try it alone in development, use **Fill with test players** in the lobby, or open more tabs
with `?as=2`, `?as=3`… so each tab is a separate player.

### Other commands

Run these from `frontend/` (`cd frontend` from the repo root). Each has a matching VS Code task.

| Command | What it does |
|---|---|
| `npm test` | Run the unit tests once (scoring, matchpoints, importers, sessions) |
| `npm run test:watch` | Re-run tests as you edit |
| `npm run typecheck` | TypeScript check only |
| `npm run build` | Type-check and build the frontend into `frontend/dist/` |
| `npm run preview` | Serve the production build locally |

For the backend, run `npm test` in `backend/` (tests run inside the Cloudflare Workers runtime). With
`npm run dev` running, `npm run smoke` in `backend/` plays a quick game end to end against it. To
reset the local database, delete `backend/.wrangler/`.

### Regenerating the sample game (optional)

The sample game is committed, so you don't need this to run the app. To rebuild it, or to change
the seed or board count, run these from the repo root:

```bash
python3 -m pip install -r scripts/requirements.txt   # on Windows: python, not python3
python3 scripts/make_sample_game.py           # --seed 123 --boards 16 to vary it
```

VS Code tasks: **Install sample-data tools (Python)**, then **Generate sample game**.

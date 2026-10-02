# Contributing to floe-crewai-starter

This is a clonable starter that ships a CrewAI crew with
[`floe-guard`](https://github.com/Floe-Labs/floe-guard) spend-governance wired in
by default — the whole crew's spend is hard-capped, so a runaway loop dies at the
ceiling instead of draining your account. Hosted Floe is the upgrade path:
enforcement moves server-side so the ceiling becomes un-bypassable and cross-vendor.

Contributions are welcome.

## Development setup

```bash
git clone https://github.com/Floe-Labs/floe-crewai-starter.git
cd floe-crewai-starter
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add OPENAI_API_KEY to run the real crew (optional for the demo)
```

Run the checks before opening a PR:

```bash
python demo.py        # the zero-key budget hard-stop demo (no keys needed)
pytest                # smoke test
```

## Contribution flow

1. Fork the repo and create a branch off `main` (e.g. `feat/your-change`).
2. Make your change and keep `python demo.py` + `pytest` green.
3. Open a **draft pull request** against `main` and describe what changed and why.

## Code style

- Python 3.10+ with type hints.
- Keep files small and focused; match the existing style.
- Never commit API keys or secrets — keys come only from env / Replit secrets.
- Floe API calls go only to `https://credit-api.floelabs.xyz`.

Open an issue first if you want to discuss a larger change.

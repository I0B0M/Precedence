"""Add `strict` and the current hold-out verdict to frontend/public/saved, in place, without the network.

    uv run python scripts/saved_strict.py

build_saved.py already does this at the end; run this after editing the saved files by hand.
"""

from stone import saved

saved.finish()
print(f"updated {saved.SAVED}")

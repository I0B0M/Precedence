"""Write the saved briefings the narration tab reads on the live site (no backend there).

    uv run python scripts/build_briefings.py

build_saved.py already does this at the end; run this after editing the saved files by hand.
See stone/briefing/saved.py.
"""

from stone.briefing import saved
from stone.config import REPO_DIR

for f in saved.build():
    print(f"wrote {f.relative_to(REPO_DIR)}")

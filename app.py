"""
CloudVault Root Entry Point
Delegates execution to backend.app.
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from backend.app import app

if __name__ == "__main__":
    import os
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")
    print("\n" + "="*60)
    print(" [CloudVault] Application Gateway")
    print(f" Starting server on http://127.0.0.1:{port}")
    print("="*60 + "\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
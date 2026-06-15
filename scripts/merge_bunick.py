#!/usr/bin/env python3
"""Compatibility entry point for the safe exact-match coordinate repair.

The previous implementation used substring-based fuzzy matches and could attach
the wrong town to a district. Keep this command for existing users, but route it
through repair_coordinates.py, which accepts exact normalized matches only.
"""

from repair_coordinates import main


if __name__ == "__main__":
    main()

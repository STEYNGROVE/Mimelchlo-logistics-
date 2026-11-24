"""Create and validate a point-in-time SQLite backup in a private directory."""
import argparse
from contextlib import closing
import fcntl
import os
from pathlib import Path
import sqlite3
from tempfile import NamedTemporaryFile


def backup(source, destination):
    source = source.resolve(strict=True)
    destination = destination.absolute()
    if source == destination or destination.exists():
        raise FileExistsError(destination)
    with NamedTemporaryFile(dir=destination.parent, prefix=".sqlite-backup-", delete_on_close=False) as temporary:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(temporary.name)) as copy:
                original.backup(copy, pages=128)
                if copy.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise RuntimeError("Backup failed SQLite integrity check")
        os.fsync(temporary.fileno())
        lock_path = destination.with_name(destination.name + ".lock")
        with lock_path.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if destination.exists() or destination.is_symlink():
                raise FileExistsError(destination)
            os.replace(temporary.name, destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    backup(args.source, args.destination)
    print("SQLite backup passed integrity check")

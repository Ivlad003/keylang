import importlib

from .infra.store import save


@route("/save")
def handler():
    save()


def main():
    save()
    importlib.import_module("plugins")


if __name__ == "__main__":
    main()

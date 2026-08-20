#!/usr/bin/env python3
"""
Extrai as imagens dos efeitos da G5 a partir dos arquivos .zrc do ZOOM Edit&Share.

Uso:
    python3 scripts/extract_assets.py "/patchs"

Os .zrc ficam na pasta de dados do Edit&Share (a mesma que tem Module.xml).
As imagens saem em public/fx/<G5_Nome>/*.png e são carregadas pela UI.

Formato do .zrc (engenharia reversa):
  - cabeçalho "ZOOM ZFX  ARCHIVE DATA VER1000"
  - tabela de entradas, um registro a cada 528 bytes, cada um com o nome do arquivo
  - os dados vêm em sequência depois da tabela, PNG atrás de PNG
  A ordem dos nomes .png na tabela é a mesma ordem dos blobs PNG no arquivo.
"""
import os
import re
import sys
import json

PNG_START = re.compile(rb"\x89PNG\r\n\x1a\n")
PNG_END = re.compile(rb"IEND\xaeB\x60\x82")
NAME = re.compile(rb"[A-Za-z0-9_\-]{1,40}\.(?:png|xml)")

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "fx")


def extract(path: str) -> list[str]:
    data = open(path, "rb").read()
    names = [m.group().decode() for m in NAME.finditer(data)]
    pngs = [m.start() for m in PNG_START.finditer(data)]
    ends = [m.start() + 8 for m in PNG_END.finditer(data)]
    png_names = [n for n in names if n.lower().endswith(".png")]

    if not (len(png_names) == len(pngs) == len(ends)):
        print(f"  ! {os.path.basename(path)}: {len(png_names)} nomes / "
              f"{len(pngs)} imagens — pulando")
        return []

    key = os.path.splitext(os.path.basename(path))[0]
    dest = os.path.join(OUT, key)
    os.makedirs(dest, exist_ok=True)
    for name, start, end in zip(png_names, pngs, ends):
        # nomes em minúsculo: o XML referencia "Knob" mas o arquivo é "knob00.png",
        # e URL em servidor web diferencia maiúscula de minúscula
        with open(os.path.join(dest, name.lower()), "wb") as fh:
            fh.write(data[start:end])
    return png_names


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    src = sys.argv[1]
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(".zrc"))
    if not files:
        print(f"Nenhum .zrc em {src}")
        return 1

    manifest: dict[str, list[str]] = {}
    total = 0
    for f in files:
        got = extract(os.path.join(src, f))
        if got:
            manifest[os.path.splitext(f)[0]] = [g.lower() for g in got]
            total += len(got)

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=0)
    print(f"{len(manifest)} efeitos, {total} imagens em public/fx/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

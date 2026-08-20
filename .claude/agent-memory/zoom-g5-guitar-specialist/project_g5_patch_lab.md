---
name: project-g5-patch-lab
description: Estrutura e contexto do projeto g5-patch-lab — interface web React/Vite para patches da Zoom G5
metadata:
  type: project
---

O projeto em D:\Estudos\ZoomG5 se chama **g5-patch-lab**. É uma interface web em React + Vite (TypeScript) para trabalhar com patches da Zoom G5 (e também B3, G3X).

**Por que existe:** Ferramenta pessoal do usuário para explorar e gerenciar patches da pedaleira Zoom G5 via interface web.

**Estrutura relevante:**
- `patchs/` — arquivos `.zrc` do ZOOM Edit&Share, organizados por dispositivo (G5, B3, G3X). Cada `.zrc` é um arquivo binário proprietário que contém imagens PNG embutidas dos knobs/efeitos e metadados XML.
- `scripts/extract_assets.py` — script Python que faz engenharia reversa dos `.zrc`, extrai as imagens PNG e gera `public/fx/<efeito>/*.png` + `public/fx/manifest.json` para a UI consumir.
- `public/fx/` — destino das imagens extraídas, consumidas pela UI.
- `src/` — código React da interface.

**Scripts yarn:**
- `yarn dev` — servidor de desenvolvimento Vite
- `yarn build` — build de produção (tsc + vite build)
- `yarn assets` — roda o script Python para extrair imagens dos .zrc (deve ser rodado antes do dev/build se as imagens não existirem)

**Problema resolvido:** No Windows, `python3` não existe como comando — apenas `python`. O `package.json` foi ajustado para usar `python` em vez de `python3`. Além disso, o Windows 11 tem aliases fake da Microsoft Store para python/python3 que precisam ser desativados em Configurações > Aplicativos > Aliases de execução do aplicativo antes de instalar o Python real.

**How to apply:** Quando o usuário relatar erros com scripts Python no projeto, verificar se Python está instalado corretamente e se os aliases da Store estão desativados.

# Patch Lab · Zoom G5

Gerador de patches para a Zoom G5 (a original, de 2012 — a que o Guitar Lab
nunca suportou). Você descreve o timbre, o modelo monta a cadeia de efeitos, e o
app grava um arquivo `.g5p` que o ZOOM Edit&Share importa direto.

## Como funciona

O formato de patch da G5 é XML simples. Cada `<ModuleN>` (0 a 8) é um slot da
cadeia; `<Prm0>` é liga/desliga, `<Prm1>` é o ID do efeito e `<Prm2>` em diante
são os knobs. `Module9` a `Module11` guardam Z-Pedal, nível do patch e
footswitches.

O mapa de IDs, os nomes dos knobs, as faixas de valor e os gráficos saem dos
arquivos de dados do próprio Edit&Share (`Module.xml` e os `*.zrc`). Isso foi
conferido contra os 297 patches de fábrica: 1270 slots ativos, nenhum ID
desconhecido, nenhum valor fora da faixa.

**A serialização do XML não passa pelo modelo.** Ele só escolhe efeitos e
valores; `src/lib/g5p.ts` monta o arquivo em código, e todo valor é travado na
faixa real do knob antes de sair. Não tem como gerar arquivo inválido nem citar
um pedal que a G5 não tem.

## Rodando

```bash
npm install
cp .env.example .env        # coloque sua chave da Anthropic
npm run assets "C:/Program Files (x86)/ZOOM/Edit&Share/<pasta de dados>/G5"
npm run dev
```

O passo `assets` extrai as imagens dos pedais dos `.zrc` da sua instalação para
`public/fx/`. São ~5.100 PNGs, 13 MB. Elas não vêm no repositório: são material
da Zoom, então cada um extrai da própria cópia do Edit&Share e usa localmente.

O proxy do Vite injeta a chave no servidor, então ela nunca chega ao browser.

## Estrutura

| Arquivo | O que faz |
| --- | --- |
| `src/lib/catalog.ts` | Tipos e catálogo dos 144 efeitos, com geometria da UI |
| `src/lib/g5p.ts` | Leitura e escrita de `.g5p` e `.g5a` |
| `src/lib/generate.ts` | Prompt, chamada da API e validação do retorno |
| `src/lib/midi.ts` | Protocolo SysEx da G5: parse de dumps, diff de módulos, ferramentas de análise |
| `src/components/PedalUnit.tsx` | Desenha o pedal com os sprites do Edit&Share |
| `src/components/MidiConsole.tsx` | Console MIDI com dump ao vivo e diff workbench |
| `scripts/extract_assets.py` | Extrai os PNGs dos `.zrc` |
| `src/data/catalog.json` | Catálogo gerado (ID, knobs, faixas, posições) |

## Console MIDI

A aba **MIDI** é uma ferramenta de engenharia reversa do protocolo SysEx da G5.
A Zoom nunca publicou esse protocolo, e a documentação da comunidade é da geração
seguinte (G5n, G1 Four), que usa comandos diferentes.

### Fluxo básico

1. Feche o Edit&Share — no Windows só um programa por vez abre a porta MIDI.
2. Clique **Conectar** — o app envia o Identity Request automaticamente e, ao
   detectar a G5, já lê o patch atual.
3. O **dump ao vivo** aparece: 9 slots com efeito, parâmetros e estado on/bypass.
4. Troque de patch na pedaleira — o app detecta o Program Change e relê
   automaticamente.

### Diff Workbench

A ferramenta principal para descobrir os offsets do protocolo:

1. Leia um patch e clique **Fixar como Dump A**.
2. Altere um parâmetro diretamente na G5 (gire um knob).
3. Aguarde a releitura automática e clique **Fixar como Dump B**.
4. O **Diff** mostra exatamente quais bytes mudaram, em qual módulo e em qual
   posição dentro do bloco de 16 bytes — e a variação decimal entre A e B.

Exige Chrome ou Edge, e a página precisa estar em `localhost` ou HTTPS.

## Protocolo SysEx (parcialmente documentado)

Formato geral: `F0 52 00 <modelo> <comando> <payload> F7`

O byte de modelo da G5 é revelado pela resposta ao Identity Request.

### Layout do payload de dump (cmd `0x28`, 158 bytes)

```
[0]        patchNumber
[1]        bypassMask — bit N=1 → slot N ativo, bit N=0 → bypass (slots 0-7)
[2..17]    módulo 0  (slot 0, 16 bytes)
[18..33]   módulo 1  (slot 1, 16 bytes)
...
[130..145] módulo 8  (slot 8, 16 bytes)
[146..155] nome do patch (10 bytes ASCII)
[156..157] 2 bytes trailing
```

### Codificação dentro de cada módulo (16 bytes)

```
mod[1] | mod[2]  = effectId SysEx  (um dos dois é sempre 0)
```

Os parâmetros do efeito no slot `i` ficam no **módulo `i+1`** (nextMod):
- `prmOffset=0` → posições ascendentes: `nextMod[4]`, `nextMod[5]`, …
- `prmOffset=1` → posições descendentes: `nextMod[13]`, `nextMod[12]`, …

### IDs confirmados (SysEx → catálogo)

| SysEx ID | Efeito | Catalog ID |
| --- | --- | --- |
| `0x19` (25) | NoiseGate | 28 |
| `0x40` (64) | ZNR | 27 |

Os demais precisam de diffs adicionais. Use o Diff Workbench para trocar um
efeito na G5, capturar dois dumps e comparar.

## Próximos passos

- Mapear os IDs SysEx dos demais 80+ efeitos via diffs.
- Fechar o SysEx de escrita de parâmetro para editar o edit buffer em tempo real.
- Exportar banco `.g5a` inteiro em vez de patch a patch.
- Mapear `Module9`–`Module11` para configurar o Z-Pedal pelo app.

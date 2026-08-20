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
| `src/components/PedalUnit.tsx` | Desenha o pedal com os sprites do Edit&Share |
| `scripts/extract_assets.py` | Extrai os PNGs dos `.zrc` |
| `src/data/catalog.json` | Catálogo gerado (ID, knobs, faixas, posições) |

## Console MIDI

A aba **MIDI** é uma ferramenta de descoberta, não um recurso pronto. A Zoom
nunca publicou o SysEx da G5, e o que a comunidade documentou é da geração
seguinte (G5n, G1 Four), que usa comandos diferentes.

O caminho:

1. Feche o Edit&Share — no Windows só um programa por vez abre a porta MIDI.
2. Conectar → **Identity Request**. É MIDI padrão, então funciona sem saber
   nada do protocolo da Zoom, e a resposta revela o byte de modelo da G5.
   Com ele, todo SysEx do aparelho tem a forma `F0 52 00 <modelo> <comando> … F7`.
3. Gire os knobs da pedaleira e veja o que aparece no log. É assim que se
   descobre o comando de edição de parâmetro: o padrão da família é
   `<comando> <slot> <parâmetro> <valor lo> <valor hi>`, e a gente já sabe qual
   slot e qual parâmetro está mexendo.

Quando o comando de escrita estiver identificado, mandar um patch inteiro é
direto: o layout de parâmetros é o mesmo do arquivo, 9 slots × 11 valores.

Exige Chrome ou Edge, e a página precisa estar em `localhost` ou HTTPS.

## Próximos passos

- Fechar o SysEx e escrever direto no edit buffer, sem passar pelo Edit&Share.
- Exportar banco `.g5a` inteiro em vez de patch a patch.
- Mapear `Module9`–`Module11` para configurar o Z-Pedal pelo app.

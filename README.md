# Patch Lab · Zoom G5

> **Editor, gerador de patches e bancada de engenharia reversa comunitária para a Zoom G5 original, de 2012.**

[![Zoom G5](https://img.shields.io/badge/Zoom-G5%20Original-111827?style=for-the-badge)](https://github.com/gblcintra/ZoomG5)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=111827)](https://react.dev/)
[![Status](https://img.shields.io/badge/status-pesquisa%20ativa-22c55e?style=for-the-badge)](https://github.com/gblcintra/ZoomG5)

**Patch Lab** existe porque a **Zoom G5 original ainda é uma ótima pedaleira, mas suas ferramentas oficiais são antigas, limitadas e difíceis de estender.**

A ideia é construir uma ferramenta moderna e aberta para a G5: gerar patches, inspecionar arquivos `.g5p`, visualizar o catálogo completo de efeitos, conversar com o hardware via MIDI/SysEx e, principalmente, documentar o protocolo para que outros donos e desenvolvedores possam contribuir.

Este projeto não é só um gerador de patches. Ele também é uma tentativa de criar uma **base pública de conhecimento sobre o protocolo da Zoom G5 original**, para que a comunidade consiga construir ferramentas que o software oficial nunca ofereceu.

## O que é o Patch Lab?

Patch Lab é uma aplicação web para a **Zoom G5 original**, lançada em 2012.

Ela não é uma ferramenta para a G5n.

O projeto combina três áreas que normalmente ficam espalhadas em ferramentas diferentes:

- **Criação de patches**: descreva o timbre que você quer e monte uma cadeia de efeitos.
- **Catálogo de efeitos**: 145 efeitos com IDs, parâmetros, faixas e metadados de interface extraídos dos dados originais do Edit&Share.
- **Pesquisa MIDI/SysEx**: leia dumps do hardware, inspecione bytes e compare dois estados para descobrir o protocolo.

O app gera arquivos `.g5p` válidos que podem ser importados pelo **ZOOM Edit&Share**.

## Precisamos da comunidade

Se você tem uma Zoom G5, patches antigos, curiosidade por MIDI/SysEx ou vontade de testar timbres, sua ajuda faz diferença. O protocolo da G5 nunca foi publicado pela Zoom, então cada dump, comparação e relato ajuda a completar o mapa.

Você não precisa entender o protocolo inteiro para contribuir.

Formas práticas de ajudar:

- Testar o app com a sua G5 e abrir issues com sistema operacional, navegador, versão do Edit&Share e o que funcionou ou falhou.
- Usar a aba **MIDI** para capturar dumps antes/depois de trocar efeitos ou girar knobs.
- Compartilhar pares de dumps onde apenas uma coisa mudou.
- Ajudar a mapear IDs SysEx dos efeitos que ainda não foram confirmados.
- Validar patches `.g5p` gerados pelo app em uma G5 real.
- Melhorar a interface, a documentação, os scripts de extração ou os testes.
- Compartilhar bancos `.g5a` e patches de referência que possam ajudar na engenharia reversa.

Mesmo uma descoberta pequena pode destravar uma parte importante do protocolo.

## Recursos atuais

### Patch Lab

- Gera patches a partir de uma descrição em linguagem natural do timbre desejado.
- Monta cadeias usando o catálogo real de efeitos da G5.
- Valida IDs de efeito e faixas de parâmetros antes de serializar o arquivo.
- Exporta `.g5p` para uso no ZOOM Edit&Share.
- Mantém a serialização determinística e separada da resposta da IA.

### Catálogo de efeitos

O catálogo é gerado a partir dos dados originais do Edit&Share, em vez de ser digitado manualmente.

Ele contém:

| Categoria | Efeitos |
| --- | ---: |
| AMP | 28 |
| MOD | 26 |
| FILTER | 13 |
| DELAY | 12 |
| DRIVE | 15 |
| DYN | 8 |
| REVERB | 8 |
| ZPEDAL | 19 |
| COMBO | 7 |
| PEDAL | 6 |
| SFX | 3 |
| **Total** | **145** |

Para cada efeito, o catálogo contém nomes de parâmetros, limites, valores padrão, tipo de controle, frames e geometria de interface.

### Console MIDI/SysEx

A aba **MIDI** é uma bancada de engenharia reversa para a G5 original.

Ela consegue:

- detectar e conectar à interface MIDI da G5;
- enviar o Identity Request;
- ler o patch atual;
- interpretar o dump do patch;
- exibir os nove slots de efeito;
- inspecionar IDs de efeito e estado on/bypass;
- detectar Program Change e reler automaticamente o patch selecionado;
- capturar dois dumps e compará-los byte a byte;
- mostrar qual módulo e qual posição mudaram.

O **Diff Workbench** é especialmente útil para descobrir offsets não documentados: altere uma única coisa na pedaleira física, capture outro dump e compare os resultados.

## Engenharia reversa da G5

O protocolo SysEx da Zoom G5 original nunca foi documentado publicamente pela Zoom da mesma forma que protocolos de gerações posteriores foram documentados pela comunidade.

Por isso, o Patch Lab trata o protocolo como uma **pesquisa de engenharia reversa em andamento**.

### Estrutura confirmada do dump

Um dump de patch usa a forma geral:

```text
F0 52 00 <modelo> <comando> <payload> F7
```

Para o comando `0x28`, o parser atual trabalha com um payload de 158 bytes:

```text
[0]        patchNumber
[1]        bypassMask — bit N=1 → slot N ativo, bit N=0 → bypass (slots 0-7)
[2..17]    módulo 0  (slot 0, 16 bytes)
[18..33]   módulo 1  (slot 1, 16 bytes)
...
[130..145] módulo 8  (slot 8, 16 bytes)
[146..155] nome do patch (10 bytes ASCII)
[156..157] 2 bytes trailing
```

### Codificação do ID do efeito

O ID do efeito é distribuído no payload por bit-packing, não armazenado como um único byte simples.

Para cada slot, o decodificador atual combina o byte principal do efeito com bits adicionais vindos de outras posições do payload. O bit menos significativo do byte do efeito representa o estado on/off do slot.

```text
effByte  = payload[EFF[i]]
extra    = (payload[EXTRA_BYTE[i]] & EXTRA_MASK[i]) << EXTRA_SHIFT[i]
bit8     = (payload[BIT8_BYTE[i]] & 0x01) << 7
effectId = ((effByte & 0xFE) >> 1) + extra + bit8 - MINUS[i]
on/off   = effByte & 0x01
```

Esse mapeamento foi verificado nos nove slots usando dumps reais da G5 e referências de engenharia reversa da comunidade.

### IDs confirmados

| SysEx ID | Efeito | Catalog ID |
| --- | --- | --- |
| `0x19` (25) | NoiseGate | 28 |
| `0x40` (64) | ZNR | 27 |

Mais IDs estão sendo mapeados por comparações controladas de dumps.

### Decodificação de parâmetros

A serialização dos parâmetros ainda está em investigação.

O projeto já sabe onde os bytes de parâmetros aparecem dentro da estrutura dos módulos, incluindo os dois layouts observados:

- `prmOffset=0` → posições ascendentes: `nextMod[4]`, `nextMod[5]`, …
- `prmOffset=1` → posições descendentes: `nextMod[13]`, `nextMod[12]`, …

A decodificação completa do bit-packing e do mapeamento de valores ainda precisa de mais capturas controladas.

É aqui que testes com hardware real podem fazer uma diferença enorme.

### Referências da comunidade

Este projeto se apoia em descobertas e ferramentas abertas da comunidade Zoom. Algumas referências úteis:

- [ZoomPedalFun](https://github.com/shooking/ZoomPedalFun): coleção de scripts, notas e experimentos para várias pedaleiras Zoom, incluindo G5, G3n, G5n, B1 Four/G1 Four e MS-70CDR.
- [ZoomPedalFun Wiki](https://github.com/shooking/ZoomPedalFun/wiki): páginas de engenharia reversa e formatos de patch, úteis para comparar hipóteses de protocolo.
- [Mungewell zoom-zt2](https://github.com/mungewell/zoom-zt2): referência importante para formatos e ferramentas usadas nas gerações mais novas.
- [Zoom MIDIDocs](https://github.com/zoom-dev/MIDIDocs): documentação comunitária de MIDI/SysEx para pedais Zoom.
- [G200kg zoom-ms-utility](https://github.com/g200kg/zoom-ms-utility): utilitário e pesquisa para a família MultiStomp.

Nem tudo dessas referências se aplica diretamente à G5 original. A G5 e a G5n, por exemplo, usam detalhes de protocolo diferentes. Por isso, comandos de outros projetos entram aqui como hipóteses a validar com dumps reais, não como verdades copiadas automaticamente.

## Como ajudar na engenharia reversa

Se você tem uma Zoom G5 original, a contribuição mais útil é um par de dumps onde **só uma coisa mudou**.

Experimento recomendado:

1. Feche o ZOOM Edit&Share.
2. Conecte a G5 ao Patch Lab.
3. Leia o patch atual.
4. Fixe o estado como **Dump A**.
5. Altere exatamente um parâmetro na G5 física.
6. Aguarde o novo dump chegar.
7. Fixe o novo estado como **Dump B**.
8. Veja o resultado no **Diff Workbench**.

Quanto mais limpo o experimento, mais útil é o resultado.

Bons testes para fazer:

- um knob por vez;
- efeito ligado/desligado;
- troca de tipo de efeito;
- alteração do nome do patch;
- alteração do número do patch;
- mudanças de Z-Pedal;
- mudanças de footswitch;
- troca entre dois efeitos no mesmo slot;
- valores perto do mínimo, meio e máximo.

Evite mudar vários parâmetros ao mesmo tempo quando estiver coletando evidências do protocolo.

## Por que a IA não escreve o arquivo diretamente?

A geração do patch e a serialização do patch são separadas de propósito.

O modelo escolhe efeitos e sugere valores de parâmetros. Ele não monta o XML `.g5p` diretamente.

O fluxo é:

```text
Descrição do usuário
      ↓
IA / planejador de patch
      ↓
Dados estruturados do patch
      ↓
Validação pelo catálogo
      ↓
Travamento nas faixas reais dos parâmetros
      ↓
src/lib/g5p.ts
      ↓
.g5p
```

Essa arquitetura mantém o arquivo final determinístico e impede que o modelo invente um efeito, parâmetro ou estrutura XML que a G5 não suporta.

## Rodando localmente

### Requisitos

- Node.js
- npm
- Uma cópia dos dados originais do ZOOM Edit&Share para a G5
- Chrome ou Edge para Web MIDI
- Uma Zoom G5 física para os recursos MIDI/SysEx

### Instalação

```bash
npm install
cp .env.example .env
npm run dev
```

Coloque sua chave da Anthropic no arquivo `.env` se for usar a geração de patches por IA.

O servidor de desenvolvimento roda a interface localmente.

### Extração dos assets originais

O projeto extrai os gráficos dos pedais a partir dos arquivos `.zrc` contidos nos dados do Edit&Share:

```bash
npm run assets
```

As imagens extraídas são gravadas em `public/fx/` e não são distribuídas no repositório porque pertencem à Zoom.

Cada usuário deve extrair os assets da própria instalação do Edit&Share.

### Build

```bash
npm run build
```

## Estrutura do projeto

| Caminho | Função |
| --- | --- |
| `src/lib/catalog.ts` | Tipos do catálogo de efeitos e metadados de interface |
| `src/lib/g5p.ts` | Leitura e escrita de `.g5p` e `.g5a` |
| `src/lib/generate.ts` | Geração de patches e validação da resposta |
| `src/lib/midi.ts` | Parse SysEx da G5, dumps e análise do protocolo |
| `src/components/PedalUnit.tsx` | Interface visual dos pedais e efeitos |
| `src/components/MidiConsole.tsx` | Console MIDI e Diff Workbench |
| `scripts/extract_assets.mjs` | Extrai gráficos dos pedais a partir dos `.zrc` |
| `scripts/patch_prm_offset.mjs` | Utilitário para ajustes de offsets de parâmetros |
| `src/data/catalog.json` | Catálogo gerado de efeitos, não editar manualmente |
| `patchs/G5/` | Dados originais da G5 vindos do Edit&Share |

## `.g5p` e `.g5a`

O projeto trabalha com os formatos de patch usados pelo ecossistema original da G5.

O serializador `.g5p` é mantido independente da camada de IA para que patches também possam ser gerados e validados programaticamente.

O objetivo de longo prazo é suportar fluxos completos de bancos, não apenas patches individuais.

## MIDI no navegador

Os recursos MIDI usam as APIs de Web MIDI do navegador.

Por segurança, o navegador exige que a aplicação rode em um contexto seguro. Na prática, use:

- `localhost`; ou
- HTTPS.

No Windows, portas MIDI também podem ser exclusivas. Feche o ZOOM Edit&Share antes de conectar o Patch Lab.

## Roteiro

### Protocolo

- [x] Identity Request / detecção do dispositivo
- [x] Recepção de dump de patch
- [x] Parse do dump de nove slots
- [x] Decodificação de ID de efeito para os mapeamentos conhecidos
- [x] Bancada de comparação de dumps
- [ ] Decodificador completo do bit-packing de parâmetros
- [ ] Mapear todos os IDs SysEx de efeitos
- [ ] Decodificar todos os parâmetros de todos os slots
- [ ] Escrita SysEx para edição do buffer de edição
- [ ] Salvar/recuperar patches diretamente do hardware
- [ ] Documentar completamente Module 9-11 / Z-Pedal / dados de footswitch
- [ ] Validar comandos e padrões do ZoomPedalFun contra a G5 original

### Gerenciamento de patches

- [x] Geração de `.g5p`
- [x] Validação baseada no catálogo
- [ ] Exportação completa de banco `.g5a`
- [ ] Fluxos de importação/exportação de bancos
- [ ] Ferramentas de comparação e migração de patches

### Comunidade

- [ ] Publicar uma especificação SysEx completa da G5
- [ ] Construir um corpus reproduzível de dumps
- [ ] Adicionar testes automatizados de regressão do protocolo
- [ ] Documentar experimentos e descobertas com o hardware
- [ ] Tornar o projeto útil como implementação de referência para outras ferramentas da G5

## Contribuindo

### Você tem uma Zoom G5

Rode experimentos controlados de parâmetros e compartilhe os dumps ou diffs resultantes.

### Você desenvolve

Ajude com:

- decodificação SysEx;
- arquitetura TypeScript;
- testes automatizados;
- serialização de patches;
- MIDI/Web MIDI;
- UI/UX;
- documentação.

### Você gosta de engenharia reversa

Use o Diff Workbench para identificar relações entre mudanças físicas na pedaleira e bytes do payload.

### Você se importa com a interface

Ajude a tornar o editor mais claro e agradável para guitarristas, sem perder as ferramentas técnicas por baixo.

## Importante: G5 vs G5n

Este repositório mira a Zoom G5 original, de 2012.

Ele não é um editor para a G5n.

A G5 e a G5n são produtos diferentes, com formatos de dados e detalhes de protocolo diferentes. Informações encontradas para a G5n não devem ser aplicadas automaticamente a este projeto.

Essa distinção é um dos motivos para este repositório existir.

## Aviso legal

Patch Lab é um projeto comunitário independente e não é afiliado, endossado ou mantido pela Zoom Corporation.

Zoom, ZOOM, Edit&Share e nomes de produtos relacionados são marcas de seus respectivos proprietários.

O projeto não redistribui os gráficos originais dos pedais da Zoom. A extração dos assets é feita localmente a partir da instalação do Edit&Share do próprio usuário.

## Se este projeto te ajuda

Se você tem uma G5 original e quer ver a pedaleira receber ferramentas modernas, marque o repositório com uma estrela, teste a bancada MIDI e compartilhe suas descobertas.

A coisa mais valiosa que este projeto pode produzir não é só mais um gerador de patches: é uma compreensão completa, reproduzível e mantida pela comunidade sobre a Zoom G5 original.

Repositório: https://github.com/gblcintra/ZoomG5

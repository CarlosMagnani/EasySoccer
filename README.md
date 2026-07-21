<p align="center">
  <img src="assets/branding/easysoccer-wordmark.png" alt="EasySoccer" width="680">
</p>

# EasySoccer — Auto-SBC local para EA FC 26

O EasySoccer adiciona ao EA FC Ultimate Team Web App uma fila supervisionada para resolver e enviar SBCs repetíveis. A interface roda no Tampermonkey e o cálculo dos jogadores é feito por um servidor local no seu próprio computador.

> **Atenção:** cada envio aceito pela EA consome os jogadores escolhidos e não pode ser desfeito. Teste primeiro com um SBC barato, quantidade `1`, e acompanhe a execução.

## O que o projeto faz

- adiciona o botão **Repeatables locais** na tela de SBCs;
- permite escolher um SBC repetível e uma quantidade limitada de conclusões;
- lê os requisitos do desafio e os jogadores disponíveis no clube;
- usa OR-Tools para calcular uma combinação válida localmente;
- permite proteger uma carta específica para ela nunca ser usada ou enviada em SBC;
- oferece **Grid Mode**, **Wide Mode** e **Card Info** persistentes para aproveitar melhor a tela;
- carrega até 100 jogadores por página no clube e deixa a grade mais compacta;
- mostra posições alternativas, Skill Moves e Weak Foot diretamente nas cartas;
- adiciona ações para copiar nome/ID, consultar o FUT.GG e buscar o menor preço no mercado;
- identifica com a marca EasySoccer os controles e telas adicionados pelo projeto;
- monta e envia uma conclusão por vez, somente após confirmação;
- para automaticamente no primeiro erro, resposta incerta ou possível softban;
- oferece um botão para interromper a fila antes do próximo envio.

Esta versão reconhece tanto a URL normal quanto endereços localizados do Web App, incluindo `https://www.ea.com/pt-br/ea-sports-fc/ultimate-team/web-app/`.

## Como funciona

1. O userscript do Tampermonkey acrescenta a interface ao Web App.
2. Ao iniciar uma fila, ele coleta os requisitos do SBC e os dados necessários dos jogadores.
3. Esses dados são enviados somente ao backend local em `127.0.0.1:8000`.
4. O solver escolhe uma combinação e devolve os IDs ao userscript.
5. O userscript monta o desafio e solicita o envio à EA.
6. Depois de uma conclusão confirmada, o inventário é lido novamente antes da próxima.

O backend aceita conexões apenas do próprio computador. Ele não grava inventário, soluções ou logs em disco por padrão. Consultas de preço ao Fut.gg e o relay HTTP arbitrário estão desativados nesta adaptação. O userscript guarda localmente apenas preferências de layout e os IDs das cartas protegidas, separados por conta do Web App.

## Requisitos

- Windows 10 ou 11;
- Python **3.10, 3.11 ou 3.12**, preferencialmente 64 bits;
- Chrome com a extensão Tampermonkey;
- acesso ao EA FC Ultimate Team Web App;
- internet durante a instalação das dependências e o uso do Web App.

## Atalhos rápidos

Os três atalhos ficam na pasta principal do projeto e podem ser abertos com dois cliques:

| Atalho | Quando usar | O que faz |
| --- | --- | --- |
| `1_INSTALAR_DO_ZERO.cmd` | Primeira instalação | Localiza o Python, cria a `.venv` e instala as dependências |
| `2_REINSTALAR.cmd` | Ambiente quebrado ou atualização | Remove somente a `.venv` e cria uma instalação limpa |
| `3_INICIAR_PROJETO.cmd` | Sempre que for usar | Inicia o backend local na porta `8000` |

### Primeira instalação

1. Abra `1_INSTALAR_DO_ZERO.cmd`.
2. Espere aparecer a mensagem de instalação concluída.
3. Instale o userscript no Tampermonkey seguindo a seção abaixo.
4. Abra `3_INICIAR_PROJETO.cmd` sempre que quiser usar o EasySoccer.

### Reinstalação

Feche o servidor com `Ctrl+C` e abra `2_REINSTALAR.cmd`. Esse atalho apaga exclusivamente a pasta `.venv`; ele não remove o código do projeto nem as configurações já salvas pelo Tampermonkey.

## Instalação no Tampermonkey

1. Abra `chrome://extensions` e desative **FutGenie** e **Paletools** enquanto usar este projeto.
2. No painel do Tampermonkey, desative ou exclua versões antigas do Auto-SBC.
3. Entre em **Utilitários → Importar de arquivo**.
4. Selecione `tampermonkey-ai-sbc.user.js` desta pasta.
5. Confirme a instalação e verifique se a versão exibida é **26.1.13.7** e se o ícone verde do EasySoccer aparece ao lado do script.
6. Nos detalhes da extensão Tampermonkey, habilite **Permitir scripts de usuário**.
7. Deixe somente esta versão do Auto-SBC habilitada.
8. Volte ao Web App da EA e pressione `Ctrl+F5`.

Duas extensões ou versões que modificam o Web App ao mesmo tempo podem duplicar botões, alterar o mesmo layout e disputar ações de envio. Não use FutGenie, Paletools ou outro Auto-SBC simultaneamente com o EasySoccer.

## Grid Mode, Wide Mode, Card Info e proteção de cartas

Os controles **Grid Mode**, **Wide Mode** e **Card Info** aparecem no cabeçalho, antes do saldo de moedas, agrupados pelo logo do EasySoccer. Os três começam ligados e a escolha fica salva no navegador:

- **Grid Mode:** organiza listas de jogadores, resultados e pacotes em uma grade mais compacta e carrega até 100 jogadores por página do clube;
- **Wide Mode:** remove limites desnecessários de largura e mostra mais cards de SBC por linha.
- **Card Info:** mostra posições alternativas, Skill Moves e Weak Foot sobre as cartas.

Ao selecionar um jogador no clube, o painel direito recebe ações identificadas pelo EasySoccer:

- **Copiar ID da versão** e **Copiar nome**;
- **Abrir no FUT.GG**, já no cadastro exato daquela versão;
- **Menor preço no mercado**, que consulta as listagens atuais da EA;
- **Proteger do SBC**, explicado logo abaixo.

Para impedir que uma carta específica seja usada em qualquer SBC:

1. Abra o clube, uma busca de jogadores ou a tela onde a carta aparece.
2. Selecione a carta e abra as ações dela.
3. Clique em **EasySoccer · Proteger do SBC**.
4. Confirme que o cadeado vermelho com borda verde aparece sobre a carta.

A proteção usa o ID do item exato. Outra cópia da mesma versão do jogador continua disponível. Para liberar a carta, selecione-a novamente e clique em **EasySoccer · Desproteger do SBC**.

O EasySoccer aplica duas travas: o solver remove cartas protegidas antes do cálculo e o envio é bloqueado novamente se uma carta protegida estiver no elenco por qualquer motivo.

## Como iniciar e usar

1. Abra `3_INICIAR_PROJETO.cmd` e mantenha a janela aberta.
2. Acesse a área de SBCs do Web App.
3. Clique em **Repeatables locais**.
4. Escolha o SBC repetível.
5. Comece com a quantidade `1`.
6. Marque a confirmação de consumo dos jogadores.
7. Revise as opções e clique em **Confirmar e executar**.
8. Acompanhe o status até a conclusão.

Para encerrar o backend, volte à janela do servidor e pressione `Ctrl+C`.

## Comandos pelo PowerShell

Se preferir usar o terminal em vez dos atalhos:

```powershell
cd 'C:\Users\Greis\Documents\EasySoccer'
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Instalação inicial:

```powershell
.\INSTALL.ps1
```

Reinstalação limpa:

```powershell
.\REINSTALL.ps1
```

Iniciar o backend:

```powershell
.\START_BACKEND.ps1
```

Verificar se o backend está respondendo:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

A resposta esperada contém `status: ok` e `service: auto-sbc-local`.

## Segurança e limites

- Automação pode contrariar as regras da EA e causar softban, limitação, suspensão ou perda de acesso. O projeto não contorna essas proteções.
- O botão **Parar** impede o próximo envio, mas não desfaz uma requisição que já tenha chegado à EA.
- A quantidade escolhida é um limite máximo, não uma garantia. A fila pode parar antes por falta de jogadores, erro ou indisponibilidade do SBC.
- Cartas negociáveis e especiais começam protegidas. Revise as preferências antes de liberar itens valiosos.
- A proteção manual da carta é uma camada adicional, mas ainda é sua responsabilidade conferir o elenco antes de confirmar.
- Não use outra aba, extensão ou userscript que também manipule SBCs ao mesmo tempo.
- Mantenha a execução supervisionada e pare ao primeiro resultado inesperado.

## Solução de problemas

### O botão não aparece

- confirme que o Tampermonkey e o userscript estão habilitados;
- habilite **Permitir scripts de usuário** nos detalhes da extensão;
- confira se somente uma versão do Auto-SBC está ativa;
- confirme que está em uma URL do Web App, inclusive `/pt-br/`;
- recarregue a página com `Ctrl+F5`.

### Erro ao conectar em `127.0.0.1:8000`

Abra `3_INICIAR_PROJETO.cmd` e mantenha a janela aberta. Se ela informar que a `.venv` está quebrada, execute `2_REINSTALAR.cmd`.

### A porta 8000 já está em uso

Feche outra janela antiga do servidor com `Ctrl+C` e tente iniciar novamente. O userscript usa essa porta específica.

### A fila parou antes da quantidade

Esse é o comportamento de segurança esperado. Leia o erro mostrado, corrija a causa e valide novamente com quantidade `1` antes de aumentar.

### Grid Mode, Wide Mode ou Card Info não aparece

Confirme que instalou a versão `26.1.13.7`, desative o Paletools e outras versões concorrentes e recarregue o Web App com `Ctrl+F5`. Se o clube já estava aberto durante a atualização, saia dele e entre novamente para disparar uma nova busca.

## Testes

Testes do backend:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Testes do userscript:

```powershell
node --test tests\runner-core.test.cjs
node --check tampermonkey-ai-sbc.user.js
```

## Estrutura do projeto

```text
backend/                         API local e solver
tests/                           testes do backend e do userscript
tampermonkey-ai-sbc.user.js      userscript importado no Tampermonkey
INSTALL.ps1                      instalação inicial
REINSTALL.ps1                    reinstalação limpa da .venv
START_BACKEND.ps1                inicialização do backend
1_INSTALAR_DO_ZERO.cmd           atalho para instalar
2_REINSTALAR.cmd                 atalho para reinstalar
3_INICIAR_PROJETO.cmd            atalho para iniciar
CHANGES_LOCAL.md                 alterações desta adaptação
```

## Origem e licença

Esta é uma adaptação independente do projeto MIT [titiroMonkey/Auto-SBC](https://github.com/titiroMonkey/Auto-SBC), baseada no commit [`9827990`](https://github.com/titiroMonkey/Auto-SBC/commit/9827990). Consulte `LICENSE` e `THIRD_PARTY_NOTICES.md` para os detalhes.

Não há vínculo oficial com Electronic Arts, EA Sports, FutGenie ou Paletools.

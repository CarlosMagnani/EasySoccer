# Auto-SBC local — instalação e uso

Este pacote executa um solver local e acrescenta ao EA FC Web App uma fila supervisionada para SBCs repetíveis. Ele é uma adaptação independente do projeto MIT [titiroMonkey/Auto-SBC](https://github.com/titiroMonkey/Auto-SBC), baseada no commit [`9827990`](https://github.com/titiroMonkey/Auto-SBC/commit/9827990).

Ele **não remove, altera nem contorna** a licença, o login ou o limite diário do FutGenie. O FutGenie precisa ficar desativado durante o uso para evitar duas injeções concorrentes na mesma página.

## Antes de instalar

Você precisa de:

- Windows com PowerShell;
- Python **3.10, 3.11 ou 3.12**, de preferência 64 bits;
- Chrome com Tampermonkey;
- acesso ao EA FC Ultimate Team Web App.

O backend aceita conexões somente em `127.0.0.1:8000`; ele não é exposto à rede local. As consultas de preço ao Fut.gg estão desativadas nesta adaptação, e o solver usa custos locais conservadores. O userscript ainda carrega bibliotecas de interface públicas por CDN, portanto a primeira carga não é totalmente offline.

O backend não grava inventário, solução, CSV ou log em disco por padrão. O userscript mantém no `localStorage` as preferências e somente os IDs de itens que você marcou manualmente como fixos/excluídos; ele não salva uma cópia completa do inventário. As exportações de depuração exigem opções explícitas que os scripts normais não ativam.

Os caminhos legados do projeto-base — Auto Grind, execução no login, tiles de envio em um clique, hotkeys de packs/player-picks e interceptação de abertura de packs — ficam desativados neste build. Somente o fluxo `Repeatables locais`, depois da confirmação, pode solicitar um submit automático.

## 1. Evite dupla injeção

Faça isto antes de abrir novamente o Web App:

1. Abra `chrome://extensions` e desative **FutGenie Extension**.
2. Abra o painel do Tampermonkey e desative qualquer instalação anterior do **Auto-SBC**.
3. Ao final da instalação, deixe habilitado somente o arquivo `tampermonkey-ai-sbc.user.js` deste pacote.

Duas versões ativas podem duplicar botões e hooks internos. Em uma função que envia SBCs, isso cria risco de comportamento imprevisível; não use as duas ao mesmo tempo.

## 2. Instale o backend

Abra o PowerShell na raiz desta pasta e execute:

```powershell
.\INSTALL.ps1
```

O instalador localiza um Python compatível, cria `.venv` e executa `pip install -r requirements.txt` dentro dela. Ele não instala os pacotes globalmente.

Ele também detecta o Python incluído no runtime local do Codex nesta máquina. Se você quiser indicar outro executável compatível, use:

```powershell
.\INSTALL.ps1 -PythonExecutable 'C:\caminho\para\python.exe'
```

Se o PowerShell bloquear scripts, libere apenas a sessão atual e tente de novo:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\INSTALL.ps1
```

Não use uma alteração permanente da política de execução para este pacote.

## 3. Inicie o backend

Em uma janela do PowerShell na raiz do pacote, execute:

```powershell
.\START_BACKEND.ps1
```

O comando efetivo é:

```powershell
& '.\.venv\Scripts\python.exe' -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Deixe a janela aberta enquanto usa o Auto-SBC. `Ctrl+C` encerra o backend. Se a porta `8000` já estiver ocupada, encerre o outro processo; o userscript está configurado para essa porta exata.

## 4. Instale o userscript local

1. Abra o painel do Tampermonkey.
2. Vá a **Utilities/Utilitários** e escolha **Import from file/Importar de arquivo**.
3. Selecione `tampermonkey-ai-sbc.user.js` desta pasta e confirme a instalação.
4. Confirme no painel que a cópia antiga do Auto-SBC está desativada e somente esta cópia local está ativa.
5. Se o Chrome impedir a execução, abra os detalhes do Tampermonkey em `chrome://extensions` e habilite a permissão para executar scripts de usuário.
6. Recarregue o EA FC Web App com `Ctrl+F5`.

## 5. Execute uma fila de repetíveis

Comece com **1 conclusão** para validar a conta e as preferências do solver.

1. Entre na área de SBCs do Web App.
2. Clique em `Repeatables locais`.
3. Em `SBC/pacote repetível`, escolha o SBC que será repetido. A fila aceita somente opções identificadas pelo Web App como repetíveis.
4. Em `Quantidade de conclusões`, informe um número inteiro positivo. A fila nunca deve iniciar mais conclusões do que esse número.
5. Marque `Entendo que cada envio consome os jogadores selecionados`.
6. Revise o SBC e clique em `Confirmar e executar`.
7. Acompanhe o campo de status, que mostra progresso ou erro.

O fluxo resolve, monta e envia uma conclusão por vez. Cada envio aceito pela EA consome os jogadores usados e não pode ser desfeito.

### Parada e erros

- `Parar` solicita a interrupção da fila. Uma requisição que já chegou à EA pode terminar; o botão não reverte um SBC enviado.
- A fila usa **stop-on-error**: no primeiro erro de solução, montagem ou envio, ela para e mostra o motivo no status. Ela não continua enviando às cegas.
- A quantidade é o teto exato, não uma promessa de sucesso. Uma fila de 10 termina com no máximo 10 conclusões, mas pode parar antes por erro, falta de jogadores, indisponibilidade do SBC, softban ou ação do usuário.
- `Fechar` fecha o painel. Para interromper uma execução, use `Parar` antes; não trate `Fechar` como cancelamento.

## Riscos e limites reais

- Automação pode contrariar as regras da EA e resultar em limitação temporária, softban, suspensão ou perda de acesso/ativos. Uma conta de teste reduz o impacto econômico, mas não elimina a fiscalização da plataforma.
- Não há bypass de softban, rate limit ou outra proteção da EA. Se aparecer um erro de frequência ou softban, pare; repetir rapidamente tende a piorar o bloqueio.
- O solver pode escolher itens negociáveis, especiais ou valiosos se você liberar essas configurações. Revise as preferências e teste primeiro com quantidade `1`.
- Esta adaptação usa um namespace de configurações novo e começa protegendo cartas negociáveis e especiais. Libere essas opções conscientemente se o SBC não puder ser resolvido.
- Não abra simultaneamente outra aba, extensão ou script que também manipule SBCs.
- Mantenha a execução supervisionada. Use `Parar` ao primeiro resultado inesperado.

## Diagnóstico rápido

- **Botão não aparece:** confirme Tampermonkey ativo, permissão de scripts de usuário, URL correta do EA Web App e ausência de cópia concorrente; depois use `Ctrl+F5`.
- **Erro ao chamar `127.0.0.1:8000`:** mantenha `START_BACKEND.ps1` aberto e verifique o erro nessa janela.
- **Falha ao resolver:** pode não existir combinação válida com os jogadores permitidos pelas configurações. Leia o status e não aumente a quantidade até uma execução unitária funcionar.
- **Fila parou antes da quantidade:** isso é o comportamento esperado de stop-on-error. Corrija a causa e inicie uma nova fila conscientemente.

Licença e origem estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e [LICENSE](LICENSE).

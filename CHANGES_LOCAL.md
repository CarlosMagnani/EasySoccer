# Alterações desta adaptação

Base: `titiroMonkey/Auto-SBC`, commit `9827990`, licença MIT.

## Runner de repetíveis

- botão `Repeatables locais` dentro da UI SBC;
- filtro por `repeatabilityMode`/flags do modelo EA;
- escolha do conjunto e quantidade exata entre 1 e 50, limitada também pelas repetições restantes informadas pela EA;
- confirmação dupla antes do primeiro envio;
- autorização centralizada: somente um lote gerenciado marcado como confirmado pode chamar o submit;
- execução sequencial de todos os desafios do conjunto;
- nova leitura do conjunto/inventário entre envios;
- parada no primeiro erro, resposta incerta, falta de desafio ou possível softban (`429`, `426`, `512`);
- timeout de 30 segundos no submit, sem retry de uma operação irreversível;
- botão `Parar`, que cancela o solver local e impede o próximo envio, sem fingir rollback do que já chegou à EA;
- repetição infinita removida e correção do comportamento `N+1` do projeto-base.

## Correções de integridade

- o userscript agora reconhece URLs localizadas do Web App da EA, como `/pt-br/ea-sports-fc/ultimate-team/web-app/`;
- paginação do clube agora acumula todas as páginas;
- visualização do clube ajusta o `numItemsPerPage` do controlador real da EA para carregar 100 jogadores no Grid Mode;
- duplicados/storage não ignoram mais as exclusões de rating, liga, nação, clube, negociabilidade ou raridade;
- falhas HTTP rejeitam a Promise em vez de deixar o Web App travado;
- chamadas ao backend local usam `GM_xmlhttpRequest` nativo do Tampermonkey para evitar bloqueios CORS/Private Network Access do Chrome;
- solver inviável encerra o fluxo antes de tentar aplicar uma resposta ausente;
- `isUntradeable` usa o valor correto;
- resposta do solver aceita array JSON nativo;
- fallback local de custo prioriza cartas comuns, não negociáveis e duplicadas quando a fonte externa de preços falha;
- consultas de preço ao Fut.gg desativadas; IDs do inventário não são enviados para essa fonte;
- Auto Grind, auto-on-login, tiles de envio em um clique, hotkeys e interceptação de packs desativados no build local;
- configurações ficam em namespace próprio, com cartas negociáveis e especiais protegidas por padrão.

## Proteção de cartas e layout

- proteção persistente pelo ID exato do item, separada da exclusão por tipo de carta;
- ação em português `Proteger do SBC` / `Desproteger do SBC` e cadeado vermelho visível;
- cartas protegidas são removidas do payload enviado ao solver;
- trava fail-closed imediatamente antes do submit, inclusive se a carta foi colocada manualmente no elenco;
- controles persistentes `Grid Mode`, `Wide Mode` e `Card Info` no cabeçalho;
- grade responsiva de 200 px, carregando até 100 jogadores por página do clube;
- posições alternativas, Skill Moves e Weak Foot visíveis diretamente nas cartas;
- painel direito com ações EasySoccer para copiar nome/ID da versão, abrir o cadastro exato no FUT.GG e consultar o menor preço atual da EA;
- compatibilidade defensiva que evita duplicar esses elementos quando o Paletools está ativo.

## Identidade visual EasySoccer

- logo transparente próprio adicionado aos arquivos do projeto;
- ícone embutido no userscript e exibido pelo Tampermonkey;
- selo EasySoccer agrupando os controles `Grid Mode`, `Wide Mode` e `Card Info`;
- marca no botão e no painel de `Repeatables locais`;
- ações e notificações de proteção identificadas como recursos do EasySoccer;
- logo horizontal no topo do `README.md`.

## Backend

- bind exclusivo em `127.0.0.1`;
- CORS somente para `https://www.ea.com` e `https://ea.com`;
- `/health` e validação Pydantic do payload;
- requisitos desconhecidos falham com `422` em vez de serem ignorados;
- relay HTTP arbitrário removido;
- limite de solver entre 1 e 180 segundos;
- resultados retornados como array;
- filtro fixo de 50 mil removido;
- nenhum inventário, solução ou log é gravado em disco por padrão;
- logs verbosos do OR-Tools desligados por padrão e número de workers limitado à máquina.

## Instalação e uso

- atalhos de dois cliques para instalação inicial, reinstalação limpa e inicialização do servidor;
- reinstalação limitada à pasta `.venv`, preservando o código e os demais arquivos;
- validação clara de ambientes Python quebrados ou incompletos;
- documentação principal consolidada em `README.md`.

## Testes executados

- parser/sintaxe do userscript;
- 12 testes do userscript, incluindo URL localizada, identidade visual, proteção por item, trava pré-submit, preferências de layout e melhorias do clube;
- 8 testes de API/hardening do backend;
- 2 smoke tests reais do OR-Tools, incluindo o formato de requisitos do `10x 84+ Upgrade`;
- inicialização HTTP real, `/health` e preflight CORS da origem EA;
- parser dos scripts PowerShell.
- instalação completa em uma cópia limpa do pacote, incluindo criação da `.venv` e importação das dependências.

Não foi executado um submit real na conta. O teste na EA deve começar com uma conclusão de um SBC barato e repetível, supervisionado pelo usuário.

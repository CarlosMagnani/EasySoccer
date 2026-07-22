# Alterações desta adaptação

Base: `titiroMonkey/Auto-SBC`, commit `9827990`, licença MIT.

## Auto Open de Owned Packs

- ação **Auto Open** montada somente na aba **My Packs**, com badge da quantidade elegível;
- catálogo EasySoccer responsivo com packs agregados, busca, filtros e quantidade exata;
- revisão e autorização de uso único com aviso explícito sobre risco de punição da conta EA;
- abertura estritamente sequencial, sem animação, sem compra de packs e sem retry da abertura;
- Top 5 por rating, preservando a ordem de abertura em empates e ignorando empréstimos/itens temporários;
- Market Quote baseada somente em anúncios ativos da EA para a definição exata, com cache de dez minutos e no máximo três buscas;
- Quick Sell automático somente com três anúncios corroborados dentro de 20% e valor líquido menor ou igual ao descarte;
- fallback de duplicata transferível para simples movimento à Lista de Transferências, sem criar leilão;
- duplicatas intransferíveis elegíveis enviadas ao Armazenamento de DMEs, inclusive quando o Quick Sell é zero;
- no máximo dois retries de movimentação/Quick Sell, apenas após falha explícita e confirmada como não aplicada;
- qualquer resposta incerta, Item não resolvido, Unassigned remanescente ou troca de sessão interrompe o lote;
- resumo terminal com contagens, destinos, Coins confirmados e proveniência de cada Market Quote;
- estado do Pack Batch mantido apenas em memória durante a sessão atual.
- correção da classificação prematura: Unassigned agora é atualizado e reconciliado por identidade imediatamente após cada abertura, antes de decidir o destino;
- duplicatas elegíveis passam a usar o estado autoritativo de `duplicateId`/`isStorable`, corrigindo o envio automático ao Armazenamento de DMEs;
- cards duplicados recebem borda, fundo e selo vermelhos próprios no resumo;
- packs bloqueados recebem estado visual explícito e o modal exibe atalhos para busca, navegação, quantidade, revisão, parada e novo lote;
- os atalhos destrutivos em massa observados no Paletools não foram reproduzidos; Quick Sell continua restrito à autorização e política do Pack Batch.

## Runner de repetíveis

- botão `Fila de Packs` dentro da UI SBC;
- filtro por `repeatabilityMode`/flags do modelo EA;
- catálogo visual responsivo com busca, cards de packs e resumo lateral persistente;
- seleção de até 12 SBCs/packs diferentes na mesma fila, com ordem ajustável;
- quantidade exata ou `Máximo possível` configurada separadamente por pack;
- packs `UNLIMITED` continuam disponíveis mesmo quando a EA informa zero no contador de repetições restantes;
- selo `ILIMITADO` e teto seguro de 50 conclusões por execução para impedir loop infinito;
- limite de 1 a 50 conclusões por pack, respeitando também as repetições restantes informadas pela EA;
- etapa própria de revisão e confirmação, sem depender do diálogo nativo do Chrome;
- plano confirmado imutável e de uso único antes do primeiro envio;
- autorização centralizada: somente um lote gerenciado marcado como confirmado pode chamar o submit;
- execução sequencial de todos os desafios e de todos os packs da fila;
- nova leitura do conjunto/inventário entre envios;
- em modo `Máximo`, falta de solução encerra somente aquele pack e avança para o próximo;
- quantidade exata, resposta incerta, falha de sessão/backend ou possível softban (`429`, `426`, `512`) interrompe toda a fila;
- timeout de 30 segundos no submit, sem retry de uma operação irreversível;
- indicador de disponibilidade do servidor local antes da execução;
- progresso e resumo final separados por pack;
- botão `Parar com segurança`, que impede um novo envio sem fingir rollback do que já chegou à EA;
- repetição infinita removida e correção do comportamento `N+1` do projeto-base.

## Correções de integridade

- o userscript agora reconhece URLs localizadas do Web App da EA, como `/pt-br/ea-sports-fc/ultimate-team/web-app/`;
- paginação do clube agora acumula todas as páginas;
- visualização do clube ajusta o `numItemsPerPage` do controlador real da EA para carregar 100 jogadores no Grid Mode;
- duplicados/storage não ignoram mais as exclusões de rating, liga, nação, clube, negociabilidade ou raridade;
- falhas HTTP rejeitam a Promise em vez de deixar o Web App travado;
- chamadas ao backend local usam `GM_xmlhttpRequest` nativo do Tampermonkey para evitar bloqueios CORS/Private Network Access do Chrome;
- solver inviável encerra o fluxo antes de tentar aplicar uma resposta ausente;
- cartas especiais que satisfazem um requisito obrigatório de raridade não são mais removidas pela opção `Excluir especiais`; as demais continuam protegidas;
- falhas do solver agora retornam código e explicação em português para falta de carta obrigatória, filtros que barraram as cartas, ausência de elenco válido e tempo esgotado;
- requisitos mínimos impossíveis encerram a busca antes do OR-Tools, sem desperdiçar o tempo configurado;
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
- marca no botão e no painel de `Fila de Packs`;
- ações e notificações de proteção identificadas como recursos do EasySoccer;
- logo horizontal no topo do `README.md`.

## Backend

- bind exclusivo em `127.0.0.1`;
- CORS somente para `https://www.ea.com` e `https://ea.com`;
- `/health` e validação Pydantic do payload;
- requisitos globais com o marcador nativo `count = -1` da EA são aceitos, corrigindo o `422` do `84+ TOTW Upgrade`;
- respostas `422` agora mostram o caminho e a causa da validação tanto no backend quanto na notificação do EasySoccer;
- respostas inviáveis informam a exigência, quantidade necessária e encontrada, preservando o motivo na fila de packs;
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
- 36 testes do userscript, incluindo packs ilimitados, erros estruturados, preservação da carta especial obrigatória, fila multi-pack, quantidade exata/máxima, catálogo visual, reconciliação autoritativa de Unassigned/SBC Storage, atalhos, duplicatas, URL localizada, identidade, proteção e layout;
- 10 testes de API, pré-processamento e hardening do backend;
- 3 smoke tests reais do OR-Tools, incluindo os formatos de requisitos do `10x 84+ Upgrade` e do `84+ TOTW Upgrade` ilimitado;
- inicialização HTTP real, `/health` e preflight CORS da origem EA;
- parser dos scripts PowerShell.
- instalação completa em uma cópia limpa do pacote, incluindo criação da `.venv` e importação das dependências.

Não foi executado um submit real na conta. O teste na EA deve começar com uma conclusão de um SBC barato e repetível, supervisionado pelo usuário.

const en = require('./src/messages/en.json');
const pt = require('./src/messages/pt.json');
const fs = require('fs');

const inScope = ['romProperties', 'systemTools', 'settingsSysKb', 'scraperOptions', 'collectionsComps', 'fileModals', 'mobileSettings', 'collectionsPages', 'mobileDownloads', 'emulator', 'home', 'mobileHome', 'mobileNav', 'mobileMisc', 'accessibility', 'primitives'];

// Comprehensive Portuguese translations
const translations = {
  // romProperties namespace
  "romProperties": {
    "heading": "Propriedades do ROM",
    "title": "ROM — {title}",
    "gameTitle": "Título do jogo",
    "gameTitlePlaceholder": "Título personalizado",
    "path": "Caminho",
    "filename": "Nome do arquivo",
    "size": "Tamanho",
    "crc": "CRC",
    "md5": "MD5",
    "sha1": "SHA1",
    "releaseYear": "Ano de lançamento",
    "releaseYearPlaceholder": "AAAA",
    "developer": "Desenvolvedora",
    "publisher": "Distribuidora",
    "description": "Descrição",
    "descriptionPlaceholder": "Descrição do jogo",
    "genre": "Gênero",
    "genrePlaceholder": "ex.: Ação, Aventura",
    "modes": "Modos",
    "modesPlaceholder": "ex.: Um jogador, Multijogador",
    "themes": "Temas",
    "themesPlaceholder": "ex.: Ficção científica, Fantasia",
    "franchise": "Franquia",
    "franchisePlaceholder": "ex.: Mario, Zelda",
    "region": "Região",
    "language": "Idioma",
    "rating": "Classificação",
    "ratingPlaceholder": "ex.: T for Teen",
    "variant": "Variante",
    "variantPlaceholder": "ex.: Hack, Tradução",
    "playStatus": "Status do jogo",
    "statusNeverPlayed": "Nunca jogado",
    "statusBacklog": "Em espera",
    "statusPlaying": "Jogando",
    "statusBeaten": "Completado",
    "statusDropped": "Abandonado",
    "favorite": "Favorito",
    "personalRating": "Avaliação pessoal",
    "difficulty": "Dificuldade",
    "completion": "Conclusão",
    "difficultyNotSet": "Não definida",
    "completionNotSet": "Não definida",
    "saveFile": "Arquivo de save",
    "saveFileBytes": "{size} bytes",
    "lastModified": "Última modificação",
    "cannotBeChanged": "Não pode ser alterado",
    "cancel": "Cancelar",
    "save": "Salvar",
    "saving": "Salvando…",
    "saveFailed": "Falha ao salvar",
    "searchingForMatch": "Procurando correspondência…",
    "matchHelp": "Clique em um resultado para atualizar este jogo com seus metadados e arte",
    "noMatches": "Nenhuma correspondência encontrada",
    "ratingLabel": "Classificação",
    "languageLabel": "Idioma",
    "releaseDateLabel": "Data de lançamento",
    "developerLabel": "Desenvolvedora",
    "publisherLabel": "Distribuidora",
    "genreLabel": "Gênero",
    "franchiseLabel": "Franquia",
    "themesLabel": "Temas",
    "modesLabel": "Modos",
    "hltbEstimate": "HowLongToBeat",
    "mainStory": "História principal",
    "mainExtra": "Principal + Extra",
    "completionist": "Completista",
    "notFound": "Não encontrado",
    "nothingLinked": "Nada vinculado",
    "systemsCount": "{count, plural, one {# sistema} other {# sistemas}}",
    "gamesCount": "{count, plural, one {# jogo} other {# jogos}}",
    "hoursCount": "{count, plural, one {# hora} other {# horas}}"
  },

  "systemTools": {
    "systemTools": "Ferramentas de {name}",
    "rescanFiles": "Reescanear arquivos",
    "rescanFilesDesc": "Procurar novos arquivos e marcar como ausentes os removidos",
    "scrapeMissing": "Coletar ausentes",
    "scrapeMissingDesc": "Buscar arte e detalhes apenas dos jogos que ainda não têm nenhum",
    "scrapeAll": "Coletar tudo",
    "scrapeAllDesc": "Rebuscar arte e detalhes de todos os jogos deste sistema",
    "backfillMetadata": "Preencher metadados (sem arte)",
    "backfillMetadataDesc": "Preencher apenas campos de texto ausentes + trailer e jogos relacionados do IGDB — nunca sobrescreve dados existentes",
    "chooseHero": "Escolher imagem hero…",
    "chooseLogo": "Escolher logo…",
    "chooseIcon": "Escolher ícone…",
    "autoFetchAll": "Buscar toda a arte automaticamente",
    "updateSystemInfo": "Atualizar informações do sistema",
    "updateSystemInfoDesc": "Buscar nome, descrição, desenvolvedor e logotipo do provedor de metadados configurado",
    "cardShape": "Formato do cartão",
    "cardShapeDesc": "Alterar aparência visual — auto segue a relação de aspecto da capa de cada jogo",
    "cardShapeAuto": "Auto",
    "cardShapeDefault": "Padrão (4:3)",
    "cardShapeWide": "Largo (16:9)",
    "cleanupMissing": "Limpar ausentes…",
    "removeMissing": "{count, plural, one {Remover # jogo ausente?} other {Remover # jogos ausentes?}}",
    "removed": "{count, plural, one {✓ Removido # jogo} other {✓ Removidos # jogos}}",
    "remove": "Remover",
    "rescan": "Reescanear",
    "rescanDesc": "Procurar novos arquivos e marcar como ausentes os removidos",
    "scrapeMissingLabel": "Coletar ausentes",
    "scrapeEverything": "Coletar tudo",
    "backfillMetadataLabel": "Preencher metadados (sem arte)",
    "sectionArtwork": "Arte",
    "heroImageMenu": "Imagem hero do sistema…",
    "logoMenu": "Logo do sistema…",
    "iconMenu": "Ícone do sistema…",
    "sectionSystem": "Sistema",
    "cardShapeLabel": "Formato do cartão",
    "autoLabel": "Auto",
    "searchingProviders": "Buscando nos provedores configurados…",
    "noArtFound": "Nenhum {label} encontrado",
    "turningOff": "Desativando…",
    "downloading": "Baixando…",
    "clearing": "Limpando…",
    "failed": "Falhou",
    "applying": "Aplicando…",
    "fetchingSystemArtwork": "Buscando arte do sistema nos provedores…",
    "updatedSystem": "✓ Sistema atualizado {items}",
    "noNewSystemArtwork": "Nenhuma arte nova do sistema encontrada",
    "couldntFetchSystemArtwork": "Não foi possível buscar a arte do sistema",
    "startingScan": "Iniciando escaneamento…",
    "couldntStartScan": "✗ Não foi possível iniciar o escaneamento",
    "startingScrape": "Iniciando coleta…",
    "couldntStartScrape": "✗ Não foi possível iniciar a coleta",
    "fetchingSystemInfo": "Buscando informações do sistema…",
    "systemInfoUpdated": "✓ Informações do sistema atualizadas",
    "noInfoFound": "Nenhuma informação encontrada",
    "updatingCardShape": "Atualizando formato do cartão…",
    "cardShapeSet": "✓ Formato do cartão: {shape}",
    "autoWithValue": "Auto ({value})",
    "defaultLayout": "padrão",
    "nothingToClean": "Nada para limpar — nenhum jogo de {name} ausente.",
    "cleanupCheckFailed": "Falha na verificação de limpeza",
    "removedGames": "{count, plural, one {✓ Removido # jogo} other {✓ Removidos # jogos}}",
    "cleanupFailed": "✗ Falha na limpeza"
  },

  "settingsSysKb": {
    "heading": "Sistema e teclado",
    "systemAndKeyboard": "Sistema e teclado",
    "keyboardSettings": "Configurações de teclado"
  },

  "scraperOptions": {
    "scraperOptions": "Opções de coleta",
    "heading": "Coleta de metadados",
    "provider": "Provedor",
    "providerSelection": "Selecionar provedores",
    "providerPriority": "A ordem aqui é sua prioridade de busca — o primeiro match que encontrar é usado",
    "artSelection": "Seleção de arte",
    "enableBoxart": "Capa",
    "enableHero": "Imagem hero",
    "enableLogo": "Logo",
    "enableScreenshots": "Capturas de tela",
    "enableVideos": "Vídeos",
    "enableManuals": "Manuais",
    "enableTheme": "Tema sonoro",
    "mediaQualityLabel": "Qualidade de mídia",
    "mediaQuality1080p": "1080p",
    "mediaQuality720p": "720p",
    "mediaQuality480p": "480p",
    "regionSelection": "Região preferida",
    "languageSelection": "Idioma preferido",
    "skipDuplicates": "Pular duplicatas",
    "skipDuplicatesDesc": "Se um provedor tiver vários resultados para o mesmo jogo, use apenas o primeiro (com hash)",
    "redownloadArt": "Re-baixar arte existente",
    "redownloadArtDesc": "Por padrão, a coleta pula jogos que já têm arte — ative isto para rebuscar de tudo"
  },

  "collectionsComps": {
    "shelves": "Prateleiras",
    "hero": "Hero",
    "newForm": "Novo formulário",
    "deleteButton": "Botão deletar",
    "card": "Cartão"
  },

  "fileModals": {
    "common": "Comum",
    "folderPicker": "Seletor de pasta",
    "firmware": "Firmware",
    "romUpload": "Upload de ROM"
  },

  "mobileSettings": {
    "all": "Todas",
    "choose": "Escolher",
    "selectAll": "Selecionar todos",
    "clear": "Limpar"
  },

  "collectionsPages": {
    "index": "Índice",
    "detail": "Detalhe",
    "virtual": "Virtual"
  },

  "mobileDownloads": {
    "library": "Biblioteca",
    "nowScraping": "Coletando agora · {current}",
    "scrapingMetadata": "Coletando metadados…",
    "scanningFiles": "Escaneando arquivos…",
    "throughput": "Taxa",
    "peak": "Pico",
    "systems": "Sistemas",
    "parallel": "Paralelo",
    "perMin": "{value}/min",
    "cancel": "Cancelar",
    "scanningFilesBar": "Escaneando arquivos",
    "scrapingMetadataBar": "Coletando metadados",
    "unitSystems": "sistemas",
    "unitGames": "jogos",
    "currentSystem": "Sistema atual — {name}",
    "quotaPaused": "Pausado — um provedor atingiu seu limite de requisições. Retoma quando a janela redefinir.",
    "upNext": "A seguir",
    "nothingQueued": "Nada na fila para rodar em seguida.",
    "sysGamesProgress": "{done} / {total} jogos",
    "queued": "na fila",
    "next": "Próximo",
    "queuedLabel": "Na fila",
    "nothingRunning": "Nada em execução no momento — escaneamentos e coletas aparecem aqui, e qualquer coisa esperando aparece em Agendado.",
    "loading": "Carregando…",
    "scheduled": "Agendado",
    "noRecurringTasks": "Nenhuma tarefa recorrente ativada.",
    "auto": "Auto"
  },

  "emulator": {
    "stateSaved": "Estado salvo no GameHub",
    "saveFailed": "Falha ao salvar",
    "noSavedStates": "Nenhum estado salvo ainda",
    "stateLoaded": "Estado carregado",
    "loadFailed": "Falha ao carregar",
    "resumedSaveState": "Estado salvo retomado",
    "loadEmulatorError": "Não foi possível carregar o emulador. Verifique sua conexão e tente novamente.",
    "loadTimeoutError": "Isto está demorando mais do que o esperado. O jogo ou núcleo pode estar indisponível.",
    "controllerLayout": "Layout do controle",
    "exitToGame": "Sair para o jogo",
    "batterySaveLoaded": "Save de bateria carregado do GameHub",
    "startingGame": "Iniciando {title}",
    "loadingCoreGame": "{platformName} · carregando núcleo e jogo…",
    "cancel": "Cancelar",
    "couldntStartGame": "Não foi possível iniciar o jogo",
    "retry": "Tentar novamente",
    "exit": "Sair",
    "dismiss": "Descartar",
    "controllerLayoutTitle": "Layout do controle — {title}"
  },

  "home": {
    "readMore": "Ler mais ↗",
    "viewMore": "Ver mais →",
    "recentGames": "Jogos recentes",
    "newToLibrary": "Novo na biblioteca",
    "playtime": "Tempo de jogo: {time}",
    "neverPlayed": "Nunca jogado",
    "viewMoreLibrary": "Ver mais na sua Biblioteca",
    "tabNew": "Novidades",
    "tabFriends": "Amigos",
    "tabRecommended": "Recomendado",
    "nothingNew": "Nada de novo ainda.",
    "newToYourLibrary": "Novo na sua biblioteca",
    "joinedCollection": "{title} entrou na sua coleção",
    "activity": "Atividade",
    "noActivity": "Nenhuma atividade de outros jogadores ainda.",
    "played": "jogou",
    "nothingToRecommend": "Nada para recomendar ainda — adicione e jogue mais jogos para construir suas escolhas."
  },

  "mobileHome": {
    "greeting": "Olá {username} 👋",
    "emptyLibrary": "Sua biblioteca está vazia. Adicione ROMs e escaneie pelo app de desktop para começar.",
    "recentGames": "Jogos recentes",
    "newToLibrary": "Novo na biblioteca",
    "viewMore": "Ver mais",
    "friends": "Amigos",
    "activity": "Atividade",
    "whatsNew": "Novidades"
  },

  "mobileNav": {
    "home": "Início",
    "library": "Biblioteca",
    "systems": "Sistemas",
    "collections": "Coleções",
    "downloads": "Downloads",
    "activity": "Atividade",
    "settings": "Configurações",
    "account": "Conta"
  },

  "mobileMisc": {
    "cancel": "Cancelar",
    "save": "Salvar",
    "back": "Voltar",
    "close": "Fechar"
  },

  "accessibility": {
    "general": "Geral",
    "reduceMotion": "Reduzir movimento",
    "reduceMotionDescription": "Desativa o dimensionamento dos cartões e as animações de transição em toda a interface."
  },

  "primitives": {
    "close": "Fechar",
    "loading": "Carregando…"
  }
};

// Merge translations into pt.json
let result = JSON.parse(JSON.stringify(pt));
let addedCount = 0;

inScope.forEach(ns => {
  if (!result[ns]) {
    result[ns] = {};
  }

  if (en[ns]) {
    Object.keys(en[ns]).forEach(key => {
      if (!(key in result[ns])) {
        // Use translation if available
        if (translations[ns] && translations[ns][key]) {
          result[ns][key] = translations[ns][key];
          addedCount++;
        } else {
          // Should not happen for in-scope keys
          result[ns][key] = en[ns][key];
          addedCount++;
        }
      }
    });
  }
});

// Write back
fs.writeFileSync('./src/messages/pt.json', JSON.stringify(result, null, 2));
console.log(`✓ Updated src/messages/pt.json with ${addedCount} new translations`);

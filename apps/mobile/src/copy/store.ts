export const storeCopy = {
  header: {
    eyebrow: 'Loja JDM',
    title: 'Drops, peças e itens do paddock.',
    subtitle:
      'Busque por coleção, tipo ou peça favorita e adicione ao carrinho sem sair da vitrine.',
  },
  search: {
    label: 'Buscar produto',
    placeholder: 'Camiseta, adesivo, boné...',
  },
  filters: {
    productTypes: 'Tipos',
    collections: 'Coleções',
    allProductTypes: 'Todos os tipos',
    allCollections: 'Todas as coleções',
  },
  summary: {
    itemCount: (count: number) => `${count} ${count === 1 ? 'produto' : 'produtos'}`,
  },
  actions: {
    add: 'Adicionar',
    adding: 'Adicionando...',
    added: 'Produto adicionado ao carrinho.',
    soldOut: 'Esgotado',
    confirmVariant: 'Adicionar variação',
    cancelVariant: 'Agora não',
    retry: 'Tentar novamente',
    openCart: 'Abrir carrinho',
  },
  variantPicker: {
    title: 'Escolha a variação',
    subtitle: 'Selecione tamanho, modelo ou opção disponível antes de adicionar ao carrinho.',
    label: 'Opções disponíveis',
    confirmHint: 'Selecione uma opção para continuar.',
  },
  states: {
    loading: 'Carregando vitrine...',
    empty: 'Nenhum produto encontrado com esses filtros.',
    emptyHint: 'Limpe a busca ou troque os chips para ver mais itens.',
    error: 'Não foi possível carregar a loja agora.',
  },
  badges: {
    shipping: 'Entrega',
    pickup: 'Retirada',
  },
  pagination: {
    loadingMore: 'Carregando mais produtos...',
  },
};

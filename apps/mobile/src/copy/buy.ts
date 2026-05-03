export const buyCopy = {
  wizard: {
    ticketLabel: (current: number, total: number) => `Ingresso ${current} de ${total}`,
    quantity: 'Quantidade',
    next: 'Próximo',
    back: 'Voltar',
    start: 'Iniciar',
  },
  stepper: {
    title: 'Quantos ingressos?',
    available: (n: number) => `${n} disponíveis`,
    max: (n: number) => `Máximo: ${n}`,
  },
  extras: {
    title: 'Extras',
    subtitle: 'Adicione extras ao seu ingresso',
    soldOut: 'Esgotado',
    remaining: (n: number) => `${n} restantes`,
    skip: 'Pular',
    confirm: 'Confirmar',
  },
  review: {
    title: 'Resumo do pedido',
    total: 'Total',
    confirm: 'Pagar',
    submitting: 'Processando...',
    errorTitle: 'Erro',
    errorBody: 'Não conseguimos criar seu pedido. Tente novamente.',
  },
};

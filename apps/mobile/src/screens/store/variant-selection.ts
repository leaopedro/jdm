import type { StoreProductVariant } from '@jdm/shared/store';

const MAX_PRODUCT_QUANTITY = 20;

export const isVariantSelectable = (variant: StoreProductVariant): boolean =>
  variant.isActive && variant.stockOnHand > 0;

export const getDefaultVariant = (
  variants: StoreProductVariant[],
  preferredVariantId?: string | null,
): StoreProductVariant | null => {
  if (preferredVariantId) {
    const preferred = variants.find((variant) => variant.id === preferredVariantId);
    if (preferred) return preferred;
  }

  return variants.find(isVariantSelectable) ?? variants[0] ?? null;
};

export const clampProductQuantity = (
  nextQuantity: number,
  variant: StoreProductVariant | null,
): number => {
  const stockLimit = variant ? Math.max(1, Math.min(MAX_PRODUCT_QUANTITY, variant.stockOnHand)) : 1;
  return Math.max(1, Math.min(nextQuantity, stockLimit));
};

export const getVariantStockLabel = (variant: StoreProductVariant): string => {
  if (!variant.isActive) return 'Indisponível';
  if (variant.stockOnHand <= 0) return 'Esgotado';
  if (variant.stockOnHand === 1) return 'Última unidade';
  if (variant.stockOnHand <= 5) return `${variant.stockOnHand} restantes`;
  return 'Pronta entrega';
};

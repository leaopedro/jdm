import type { AdminStoreVariant } from '@jdm/shared/admin';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/store-actions', () => ({
  createVariantAction: vi.fn(),
  deleteVariantAction: vi.fn(),
  updateVariantAction: vi.fn(),
}));

import { VariantList } from './variant-list';

const variant: AdminStoreVariant = {
  id: 'var_1',
  productId: 'prod_1',
  name: 'Preto M',
  sku: 'SKU-1',
  priceCents: 15900,
  quantityTotal: 8,
  quantitySold: 2,
  attributes: { tamanho: 'M', cor: 'Preto' },
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('VariantList', () => {
  it('renders a visible label and helper text for variant attributes', () => {
    const html = renderToStaticMarkup(<VariantList productId="prod_1" variants={[variant]} />);

    expect(html).toContain('Atributos da variante');
    expect(html).toContain('Use JSON com pares chave/valor, como tamanho e cor.');
    expect(html).toContain(
      'Ex.: {&quot;tamanho&quot;:&quot;M&quot;,&quot;cor&quot;:&quot;Preto&quot;}',
    );
  });
});

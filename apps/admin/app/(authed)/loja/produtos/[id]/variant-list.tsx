'use client';

import type { AdminStoreVariant } from '@jdm/shared/admin';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  createVariantAction,
  deleteVariantAction,
  updateVariantAction,
  type StoreFormState,
} from '~/lib/store-actions';

const initial: StoreFormState = { error: null };

const Submit = ({ label }: { label: string }) => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[color:var(--color-accent)] px-3 py-1 text-sm disabled:opacity-50"
    >
      {pending ? '…' : label}
    </button>
  );
};

const fmtAttrs = (attrs: Record<string, string>): string => JSON.stringify(attrs ?? {}, null, 0);

const VariantRow = ({ productId, variant }: { productId: string; variant: AdminStoreVariant }) => {
  const update = updateVariantAction.bind(null, productId, variant.id);
  const [state, action] = useActionState(update, initial);
  return (
    <tr className="border-b border-[color:var(--color-border)]">
      <td className="py-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input
            name="name"
            defaultValue={variant.name}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
          />
          <input
            name="sku"
            defaultValue={variant.sku ?? ''}
            placeholder="SKU"
            className="w-28 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
          />
          <input
            name="priceCents"
            type="number"
            min={0}
            defaultValue={variant.priceCents}
            className="w-28 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
          />
          <input
            name="quantityTotal"
            type="number"
            min={variant.quantitySold}
            defaultValue={variant.quantityTotal}
            className="w-24 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
          />
          <input
            name="attributes"
            defaultValue={fmtAttrs(variant.attributes ?? {})}
            placeholder='{"size":"M"}'
            className="w-40 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
          />
          <select
            name="active"
            defaultValue={variant.active ? 'true' : 'false'}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
          >
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
          <span className="text-xs text-[color:var(--color-muted)]">
            vendidos: {variant.quantitySold}
          </span>
          <Submit label="Salvar" />
          {state.error ? <span className="text-sm text-red-400">{state.error}</span> : null}
        </form>
      </td>
      <td className="py-2 text-right">
        <form
          action={() => {
            void deleteVariantAction(productId, variant.id);
          }}
        >
          <button
            type="submit"
            className="rounded border border-[color:var(--color-border)] px-2 py-1 text-xs"
          >
            {variant.quantitySold > 0 ? 'Desabilitar' : 'Remover'}
          </button>
        </form>
      </td>
    </tr>
  );
};

const NewVariantForm = ({ productId }: { productId: string }) => {
  const create = createVariantAction.bind(null, productId);
  const [state, action] = useActionState(create, initial);
  const v = state.values ?? {};
  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
      <input
        name="name"
        placeholder="Variante (ex: Preto — M)"
        defaultValue={v.name ?? ''}
        required
        className="rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
      />
      <input
        name="sku"
        placeholder="SKU (opcional)"
        defaultValue={v.sku ?? ''}
        className="w-28 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
      />
      <input
        name="priceCents"
        type="number"
        min={0}
        placeholder="Preço (centavos)"
        defaultValue={v.priceCents ?? ''}
        required
        className="w-32 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
      />
      <input
        name="quantityTotal"
        type="number"
        min={0}
        placeholder="Estoque"
        defaultValue={v.quantityTotal ?? ''}
        required
        className="w-24 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
      />
      <input
        name="attributes"
        placeholder='{"size":"M","color":"Preto"}'
        defaultValue={v.attributes ?? '{}'}
        className="w-56 rounded border border-[color:var(--color-border)] bg-transparent px-2 py-1 text-sm"
      />
      <Submit label="Adicionar variante" />
      {state.error ? <span className="text-sm text-red-400">{state.error}</span> : null}
    </form>
  );
};

export const VariantList = ({
  productId,
  variants,
}: {
  productId: string;
  variants: AdminStoreVariant[];
}) => (
  <div className="flex flex-col gap-2">
    <h2 className="text-lg font-semibold">Variantes</h2>
    {variants.length > 0 ? (
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-sm text-[color:var(--color-muted)]">
            <th className="py-2">Variante</th>
            <th className="py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <VariantRow key={variant.id} productId={productId} variant={variant} />
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-sm text-[color:var(--color-muted)]">Nenhuma variante ainda.</p>
    )}
    <NewVariantForm productId={productId} />
  </div>
);

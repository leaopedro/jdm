'use client';

import type { AdminStoreProductDetail } from '@jdm/shared/admin';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  activateProductAction,
  archiveProductAction,
  updateProductAction,
  type StoreFormState,
} from '~/lib/store-actions';

const initial: StoreFormState = { error: null };

const Submit = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[color:var(--color-accent)] px-4 py-2 font-semibold disabled:opacity-50"
    >
      {pending ? 'Salvando…' : 'Salvar alterações'}
    </button>
  );
};

const Field = ({
  label,
  name,
  type = 'text',
  defaultValue,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'defaultValue'>) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm text-[color:var(--color-muted)]">{label}</span>
    <input
      name={name}
      type={type}
      defaultValue={defaultValue}
      {...rest}
      className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
    />
  </label>
);

export const ProductForm = ({ product }: { product: AdminStoreProductDetail }) => {
  const update = updateProductAction.bind(null, product.id);
  const [state, action] = useActionState(update, initial);
  const v = state.values ?? {};

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid grid-cols-2 gap-4">
        <Field label="Título" name="title" required defaultValue={v.title ?? product.title} />
        <Field
          label="ID do tipo de produto"
          name="productTypeId"
          required
          defaultValue={v.productTypeId ?? product.productTypeId}
        />
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Descrição</span>
          <textarea
            name="description"
            required
            rows={5}
            defaultValue={v.description ?? product.description}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          />
        </label>
        <Field
          label="Preço base (centavos)"
          name="basePriceCents"
          type="number"
          min={0}
          required
          defaultValue={v.basePriceCents ?? String(product.basePriceCents)}
        />
        <Field
          label="Moeda"
          name="currency"
          maxLength={3}
          defaultValue={v.currency ?? product.currency}
        />
        <Field
          label="Frete fixo (centavos, vazio = padrão da loja)"
          name="shippingFeeCents"
          type="number"
          min={0}
          defaultValue={
            v.shippingFeeCents ??
            (product.shippingFeeCents == null ? '' : String(product.shippingFeeCents))
          }
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Status</span>
          <select
            name="status"
            defaultValue={v.status ?? product.status}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          >
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </select>
        </label>
        {state.error ? <p className="col-span-2 text-sm text-red-400">{state.error}</p> : null}
        <div className="col-span-2 flex gap-3">
          <Submit />
          {product.status !== 'archived' ? (
            <form
              action={() => {
                void archiveProductAction(product.id);
              }}
            >
              <button
                type="submit"
                className="rounded border border-[color:var(--color-border)] px-3 py-2 text-sm"
              >
                Arquivar
              </button>
            </form>
          ) : (
            <form
              action={() => {
                void activateProductAction(product.id);
              }}
            >
              <button
                type="submit"
                className="rounded border border-[color:var(--color-border)] px-3 py-2 text-sm"
              >
                Reativar
              </button>
            </form>
          )}
        </div>
      </form>
    </div>
  );
};

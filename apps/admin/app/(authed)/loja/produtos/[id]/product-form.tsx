'use client';

import type { AdminProductType, AdminStoreProductDetail } from '@jdm/shared/admin';
import { useState } from 'react';
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

export const ProductForm = ({
  product,
  productTypes,
}: {
  product: AdminStoreProductDetail;
  productTypes: AdminProductType[];
}) => {
  const update = updateProductAction.bind(null, product.id);
  const [state, action] = useActionState(update, initial);
  const v = state.values ?? {};
  const [allowPickup, setAllowPickup] = useState(product.allowPickup);
  const [allowShip, setAllowShip] = useState(product.allowShip);
  const currentTypeMissing = !productTypes.some((t) => t.id === product.productTypeId);
  const hasPhotos = product.photos.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="grid grid-cols-2 gap-4">
        <Field label="Título" name="title" required defaultValue={v.title ?? product.title} />
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Tipo de produto</span>
          <select
            name="productTypeId"
            required
            defaultValue={v.productTypeId ?? product.productTypeId}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          >
            {currentTypeMissing ? (
              <option value={product.productTypeId}>(tipo removido — selecione outro)</option>
            ) : null}
            {productTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
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
        <fieldset className="col-span-2 flex flex-col gap-2">
          <legend className="mb-1 text-sm text-[color:var(--color-muted)]">Modo de entrega</legend>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowPickup}
              onChange={(e) => setAllowPickup(e.target.checked)}
            />
            <span>Retirada no evento</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowShip}
              onChange={(e) => setAllowShip(e.target.checked)}
            />
            <span>Envio</span>
          </label>
        </fieldset>
        <input type="hidden" name="allowPickup" value={allowPickup ? 'true' : 'false'} />
        <input type="hidden" name="allowShip" value={allowShip ? 'true' : 'false'} />
        {allowShip ? (
          <Field
            label="Frete fixo (centavos)"
            name="shippingFeeCents"
            type="number"
            min={0}
            defaultValue={
              v.shippingFeeCents ??
              (product.shippingFeeCents == null ? '' : String(product.shippingFeeCents))
            }
          />
        ) : (
          <input type="hidden" name="shippingFeeCents" value="" />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-[color:var(--color-muted)]">Status</span>
          <select
            name="status"
            defaultValue={v.status ?? product.status}
            className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
          >
            <option value="draft">Rascunho</option>
            <option value="active" disabled={!hasPhotos && product.status !== 'active'}>
              Ativo
            </option>
            <option value="archived">Arquivado</option>
          </select>
          {!hasPhotos && product.status !== 'active' ? (
            <span className="text-xs text-[color:var(--color-muted)]">
              Adicione pelo menos uma foto para ativar o produto.
            </span>
          ) : null}
        </label>
        {state.error ? <p className="col-span-2 text-sm text-red-400">{state.error}</p> : null}
        <div className="col-span-2 flex gap-3">
          <Submit />
          {product.status !== 'archived' ? (
            <button
              type="submit"
              formAction={() => {
                void archiveProductAction(product.id);
              }}
              className="rounded border border-[color:var(--color-border)] px-3 py-2 text-sm"
            >
              Arquivar
            </button>
          ) : (
            <button
              type="submit"
              formAction={() => {
                void activateProductAction(product.id);
              }}
              disabled={!hasPhotos}
              title={!hasPhotos ? 'Adicione pelo menos uma foto antes de ativar.' : undefined}
              className="rounded border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
            >
              Reativar
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

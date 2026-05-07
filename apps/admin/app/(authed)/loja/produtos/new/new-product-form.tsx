'use client';

import type { AdminProductType } from '@jdm/shared/admin';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { createProductAction, type StoreFormState } from '~/lib/store-actions';

const initial: StoreFormState = { error: null };

const Submit = () => {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-[color:var(--color-accent)] px-4 py-2 font-semibold disabled:opacity-50"
    >
      {pending ? 'Criando…' : 'Criar produto'}
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

export const NewProductForm = ({ productTypes }: { productTypes: AdminProductType[] }) => {
  const [state, action] = useActionState(createProductAction, initial);
  const v = state.values ?? {};
  return (
    <form action={action} className="grid grid-cols-2 gap-4">
      <Field
        label="Slug"
        name="slug"
        required
        placeholder="camiseta-jdm-drift-2026"
        defaultValue={v.slug ?? ''}
      />
      <Field label="Título" name="title" required defaultValue={v.title ?? ''} />
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-sm text-[color:var(--color-muted)]">Descrição</span>
        <textarea
          name="description"
          required
          rows={5}
          defaultValue={v.description ?? ''}
          className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-[color:var(--color-muted)]">Tipo de produto</span>
        <select
          name="productTypeId"
          required
          defaultValue={v.productTypeId ?? ''}
          className="rounded border border-[color:var(--color-border)] bg-transparent px-3 py-2"
        >
          <option value="" disabled>
            Selecione um tipo
          </option>
          {productTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <Field
        label="Preço base (centavos)"
        name="basePriceCents"
        type="number"
        min={0}
        required
        defaultValue={v.basePriceCents ?? ''}
      />
      <Field label="Moeda" name="currency" maxLength={3} defaultValue={v.currency ?? 'BRL'} />
      <Field
        label="Frete fixo (centavos, opcional)"
        name="shippingFeeCents"
        type="number"
        min={0}
        defaultValue={v.shippingFeeCents ?? ''}
      />
      {state.error ? <p className="col-span-2 text-sm text-red-400">{state.error}</p> : null}
      <div className="col-span-2">
        <Submit />
      </div>
    </form>
  );
};

'use client';

import type { CheckInExtraItem, StorePickupOrder } from '@jdm/shared/check-in';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

import {
  submitCheckIn,
  submitExtraClaim,
  submitPickupCollect,
  type CheckInActionResult,
  type ExtraClaimActionResult,
} from '~/lib/check-in-actions';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'ticket-result'; data: CheckInActionResult; code: string }
  | { kind: 'extra-result'; data: ExtraClaimActionResult; code: string };

const RESCAN_COOLDOWN_MS = 5000;

function isExtraCode(code: string): boolean {
  return code.startsWith('e.');
}

function mapCameraError(err: unknown): string {
  if (err instanceof Error) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Permissão de câmera negada. Habilite o acesso nas configurações do navegador e recarregue a página.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'Nenhuma câmera compatível detectada neste dispositivo.';
      case 'NotReadableError':
        return 'Câmera está em uso por outro aplicativo. Feche-o e tente novamente.';
      default:
        return err.message || 'Falha ao iniciar câmera.';
    }
  }
  return 'Falha ao iniciar câmera.';
}

export function Scanner({ eventId }: { eventId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let controls: IScannerControls | null = null;
    const reader = new BrowserMultiFormatReader();

    const handleScan = async (code: string) => {
      setState({ kind: 'pending' });
      if (isExtraCode(code)) {
        const data = await submitExtraClaim(code, eventId);
        setState({ kind: 'extra-result', data, code });
      } else {
        const data = await submitCheckIn(code, eventId);
        setState({ kind: 'ticket-result', data, code });
      }
    };

    const start = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          typeof window !== 'undefined' && !window.isSecureContext
            ? 'Câmera requer conexão segura (HTTPS). Acesse pela URL https://.'
            : 'Este navegador não suporta acesso à câmera.',
        );
        return;
      }
      try {
        const next = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (res) => {
            if (stopped || !res) return;
            const code = res.getText();
            const now = Date.now();
            const last = lastScanRef.current;
            if (last && last.code === code && now - last.at < RESCAN_COOLDOWN_MS) return;
            lastScanRef.current = { code, at: now };
            void handleScan(code);
          },
        );
        if (stopped) {
          next.stop();
          return;
        }
        controls = next;
      } catch (err) {
        setCameraError(mapCameraError(err));
      }
    };

    void start();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [eventId]);

  const dismiss = () => setState({ kind: 'idle' });

  return (
    <div className="flex flex-col gap-4">
      {cameraError ? (
        <p className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm">{cameraError}</p>
      ) : null}
      <video
        ref={videoRef}
        className="w-full max-w-md rounded border border-[color:var(--color-border)] bg-black"
        muted
        playsInline
      />
      {state.kind === 'idle' && (
        <p className="opacity-80">Aponte para o QR code do ingresso ou extra.</p>
      )}
      {state.kind === 'pending' && <p className="opacity-80">Validando…</p>}
      {state.kind === 'ticket-result' && (
        <TicketResultCard data={state.data} eventId={eventId} onDismiss={dismiss} />
      )}
      {state.kind === 'extra-result' && <ExtraResultCard data={state.data} onDismiss={dismiss} />}
    </div>
  );
}

function TicketResultCard({
  data,
  eventId,
  onDismiss,
}: {
  data: CheckInActionResult;
  eventId: string;
  onDismiss: () => void;
}) {
  const [extras, setExtras] = useState<CheckInExtraItem[]>(data.ok ? data.extras : []);

  if (!data.ok) {
    const human = friendlyError(data.error);
    return (
      <div className="rounded border border-red-500/40 bg-red-500/10 p-4">
        <p className="text-lg font-semibold">{human.title}</p>
        <p className="text-sm opacity-80">{human.subtitle ?? data.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 rounded border border-[color:var(--color-border)] px-3 py-1 text-sm"
        >
          Escanear próximo
        </button>
      </div>
    );
  }

  const admitted = data.result === 'admitted';

  const [claimError, setClaimError] = useState<string | null>(null);

  const handleClaim = async (extra: CheckInExtraItem) => {
    setClaimError(null);
    const result = await submitExtraClaim(extra.code, eventId);
    if (result.ok) {
      setExtras((prev) =>
        prev.map((e) =>
          e.id === extra.id ? { ...e, status: 'used' as const, usedAt: result.usedAt } : e,
        ),
      );
    } else {
      setClaimError(`${extra.name}: ${result.message}`);
    }
  };

  return (
    <div
      className={
        admitted
          ? 'rounded border border-green-500/40 bg-green-500/10 p-4'
          : 'rounded border border-amber-500/40 bg-amber-500/10 p-4'
      }
    >
      <p className="text-lg font-semibold">{admitted ? 'Admitido' : 'Ingresso já utilizado'}</p>
      <p>
        {data.holder} · {data.tier}
      </p>
      {data.car ? (
        <p className="text-sm">
          Carro: {data.car.make} {data.car.model} {data.car.year}
          {data.licensePlate ? ` — placa ${data.licensePlate}` : ''}
        </p>
      ) : null}
      {!admitted ? (
        <p className="text-sm opacity-80">
          Utilizado em {new Date(data.checkedInAt).toLocaleString('pt-BR')}
        </p>
      ) : null}

      {claimError && (
        <p className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {claimError}
        </p>
      )}

      {extras.length > 0 && <ExtrasPanel extras={extras} onClaim={handleClaim} />}

      {data.storePickup.length > 0 && (
        <StorePickupPanel ticketId={data.ticketId} initialOrders={data.storePickup} />
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm"
        >
          Escanear próximo
        </button>
      </div>
    </div>
  );
}

function ExtrasPanel({
  extras,
  onClaim,
}: {
  extras: CheckInExtraItem[];
  onClaim: (extra: CheckInExtraItem) => Promise<void>;
}) {
  return (
    <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
      <p className="mb-2 text-sm font-semibold">Extras</p>
      <ul className="flex flex-col gap-2">
        {extras.map((extra) => (
          <ExtraRow key={extra.id} extra={extra} onClaim={onClaim} />
        ))}
      </ul>
    </div>
  );
}

function ExtraRow({
  extra,
  onClaim,
}: {
  extra: CheckInExtraItem;
  onClaim: (extra: CheckInExtraItem) => Promise<void>;
}) {
  const [claiming, setClaiming] = useState(false);
  const used = extra.status === 'used';
  const revoked = extra.status === 'revoked';

  const handleClick = () => {
    setClaiming(true);
    void onClaim(extra).finally(() => setClaiming(false));
  };

  return (
    <li
      className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
        used
          ? 'border-gray-400/30 bg-gray-400/10 opacity-60'
          : revoked
            ? 'border-red-400/30 bg-red-400/10 opacity-60'
            : 'border-[color:var(--color-border)]'
      }`}
    >
      <div>
        <span className="font-medium">{extra.name}</span>
        {used && extra.usedAt ? (
          <span className="ml-2 text-xs opacity-70">
            entregue {new Date(extra.usedAt).toLocaleString('pt-BR')}
          </span>
        ) : null}
        {revoked ? <span className="ml-2 text-xs opacity-70">revogado</span> : null}
      </div>
      {!used && !revoked && (
        <button
          type="button"
          disabled={claiming}
          onClick={handleClick}
          className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {claiming ? '…' : 'Marcar entregue'}
        </button>
      )}
    </li>
  );
}

function ExtraResultCard({
  data,
  onDismiss,
}: {
  data: ExtraClaimActionResult;
  onDismiss: () => void;
}) {
  if (!data.ok) {
    const human = friendlyExtraError(data.error);
    return (
      <div className="rounded border border-red-500/40 bg-red-500/10 p-4">
        <p className="text-lg font-semibold">{human.title}</p>
        <p className="text-sm opacity-80">{human.subtitle ?? data.message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 rounded border border-[color:var(--color-border)] px-3 py-1 text-sm"
        >
          Escanear próximo
        </button>
      </div>
    );
  }

  const claimed = data.result === 'claimed';
  return (
    <div
      className={
        claimed
          ? 'rounded border border-green-500/40 bg-green-500/10 p-4'
          : 'rounded border border-amber-500/40 bg-amber-500/10 p-4'
      }
    >
      <p className="text-lg font-semibold">{claimed ? 'Extra entregue' : 'Extra já entregue'}</p>
      <p>
        {data.name} · {data.holder}
      </p>
      <p className="text-sm opacity-80">{data.tier}</p>
      {!claimed && data.usedAt ? (
        <p className="text-sm opacity-80">
          Entregue em {new Date(data.usedAt).toLocaleString('pt-BR')}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-[color:var(--color-border)] px-3 py-1 text-sm"
        >
          Escanear próximo
        </button>
      </div>
    </div>
  );
}

function StorePickupPanel({
  ticketId,
  initialOrders,
}: {
  ticketId: string;
  initialOrders: StorePickupOrder[];
}) {
  const [orders, setOrders] = useState<StorePickupOrder[]>(initialOrders);
  const [collecting, setCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);

  const allDone = orders.every(
    (o) => o.fulfillmentStatus === 'picked_up' || o.fulfillmentStatus === 'cancelled',
  );

  const handleCollect = async () => {
    setCollecting(true);
    setCollectError(null);
    const result = await submitPickupCollect(ticketId);
    if (result.ok) {
      setOrders(result.orders);
    } else {
      setCollectError(result.message);
    }
    setCollecting(false);
  };

  return (
    <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
      <p className="mb-2 text-sm font-semibold">Retirada na loja</p>
      {orders.map((order) => (
        <div key={order.orderId} className="mb-3">
          <p className="mb-1 text-xs opacity-70">
            Pedido #{order.shortId}
            {order.fulfillmentStatus === 'picked_up' && (
              <span className="ml-2 font-semibold text-green-600">Coletado</span>
            )}
            {order.fulfillmentStatus === 'cancelled' && (
              <span className="ml-2 font-semibold text-red-500">Cancelado</span>
            )}
          </p>
          <ul className="flex flex-col gap-1">
            {order.items.map((item) => (
              <li key={item.id} className="text-sm">
                <span className="font-medium">{item.productTitle ?? 'Produto'}</span>
                {item.variantName ? (
                  <span className="ml-1 opacity-70"> — {item.variantName}</span>
                ) : null}
                {item.variantSku ? (
                  <span className="ml-1 text-xs opacity-50">SKU: {item.variantSku}</span>
                ) : null}
                {item.variantAttributes
                  ? Object.entries(item.variantAttributes).map(([k, v]) => (
                      <span key={k} className="ml-1 text-xs opacity-60">
                        {k}: {v}
                      </span>
                    ))
                  : null}
                <span className="ml-2 opacity-60">× {item.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {collectError ? (
        <p className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
          {collectError}
        </p>
      ) : null}
      {!allDone ? (
        <button
          type="button"
          disabled={collecting}
          onClick={() => void handleCollect()}
          className="mt-2 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {collecting ? '…' : 'Marcar coletado'}
        </button>
      ) : null}
    </div>
  );
}

function friendlyError(code: string): { title: string; subtitle?: string } {
  switch (code) {
    case 'InvalidTicketCode':
      return { title: 'QR inválido', subtitle: 'Este código não é um ingresso válido.' };
    case 'TicketNotFound':
      return { title: 'Ingresso não encontrado' };
    case 'TicketWrongEvent':
      return {
        title: 'Evento errado',
        subtitle: 'Este ingresso é de outro evento.',
      };
    case 'TicketRevoked':
      return { title: 'Ingresso revogado' };
    default:
      return { title: 'Erro', subtitle: code };
  }
}

function friendlyExtraError(code: string): { title: string; subtitle?: string } {
  switch (code) {
    case 'InvalidExtraCode':
      return { title: 'QR inválido', subtitle: 'Este código não é um extra válido.' };
    case 'ExtraItemNotFound':
      return { title: 'Extra não encontrado' };
    case 'ExtraWrongEvent':
      return {
        title: 'Evento errado',
        subtitle: 'Este extra é de outro evento.',
      };
    case 'ExtraItemRevoked':
      return { title: 'Extra revogado' };
    default:
      return { title: 'Erro', subtitle: code };
  }
}

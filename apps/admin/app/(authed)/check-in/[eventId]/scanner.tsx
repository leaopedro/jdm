'use client';

import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

import { submitCheckIn, type CheckInActionResult } from '~/lib/check-in-actions';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'result'; data: CheckInActionResult; code: string };

const RESCAN_COOLDOWN_MS = 5000;

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
      const data = await submitCheckIn(code, eventId);
      setState({ kind: 'result', data, code });
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
      <ResultCard state={state} onDismiss={dismiss} />
    </div>
  );
}

function ResultCard({ state, onDismiss }: { state: ScanState; onDismiss: () => void }) {
  if (state.kind === 'idle') {
    return <p className="opacity-80">Aponte para o QR code do ingresso.</p>;
  }
  if (state.kind === 'pending') {
    return <p className="opacity-80">Validando…</p>;
  }
  const { data } = state;
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

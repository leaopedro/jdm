import { beforeEach, describe, expect, it, vi } from 'vitest';

const alertSpy = vi.fn();
const platform = { OS: 'web' };

vi.mock('react-native', () => ({
  Alert: {
    alert: alertSpy,
  },
  Platform: platform,
}));

describe('confirm helpers', () => {
  beforeEach(() => {
    alertSpy.mockReset();
    vi.resetModules();
    vi.unstubAllGlobals();
    platform.OS = 'web';
  });

  it('uses window.confirm on web', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { confirm, alert: vi.fn() });

    const { confirmDestructive } = await import('./confirm');

    await expect(
      confirmDestructive('Excluir', 'Remover este carro?', 'Excluir', 'Cancelar'),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith('Excluir\n\nRemover este carro?');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('uses Alert buttons on native', async () => {
    platform.OS = 'ios';

    const { confirmDestructive } = await import('./confirm');
    const result = confirmDestructive('Excluir', 'Remover este carro?', 'Excluir', 'Cancelar');

    const [, , buttons] = alertSpy.mock.calls[0] as [
      string,
      string,
      Array<{ onPress?: () => void; text: string; style?: string }>,
    ];

    buttons[1]?.onPress?.();

    await expect(result).resolves.toBe(true);
    expect(buttons[0]).toMatchObject({ text: 'Cancelar', style: 'cancel' });
    expect(buttons[1]).toMatchObject({ text: 'Excluir', style: 'destructive' });
  });

  it('shows a web alert on web', async () => {
    const alert = vi.fn();
    vi.stubGlobal('window', { alert, confirm: vi.fn() });

    const { showMessage } = await import('./confirm');

    showMessage('Algo deu errado.');
    expect(alert).toHaveBeenCalledWith('Algo deu errado.');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

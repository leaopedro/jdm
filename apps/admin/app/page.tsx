import { fetchHealth } from '~/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let status: string;
  try {
    const health = await fetchHealth();
    status = `OK · sha ${health.sha} · up ${health.uptimeSeconds}s`;
  } catch (err) {
    status = err instanceof Error ? `Error: ${err.message}` : 'Unknown error';
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">JDM Experience · Admin</h1>
      <p className="text-muted">API health (server-fetched)</p>
      <p className="text-lg">{status}</p>
    </main>
  );
}

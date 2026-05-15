import { prisma } from '@jdm/db';

import { decryptField, isEncrypted } from '../src/services/crypto/field-encryption.js';

const FIELD_ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY;
if (!FIELD_ENCRYPTION_KEY || FIELD_ENCRYPTION_KEY.length !== 64) {
  console.error('FIELD_ENCRYPTION_KEY must be set (64 hex chars)');
  process.exit(1);
}

const BATCH_SIZE = 100;

async function main() {
  let cursor: string | undefined;
  let decrypted = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (;;) {
    const batch = await prisma.supportTicket.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, message: true },
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      if (!isEncrypted(row.message)) {
        skipped++;
        continue;
      }
      try {
        const plain = decryptField(row.message, FIELD_ENCRYPTION_KEY!);
        if (plain === null) {
          console.error(`Row ${row.id}: decryptField returned null (corrupt or wrong key)`);
          failed.push(row.id);
          continue;
        }
        await prisma.supportTicket.update({
          where: { id: row.id },
          data: { message: plain },
        });
        decrypted++;
      } catch (err) {
        console.error(`Failed to decrypt row ${row.id}:`, err);
        failed.push(row.id);
      }
    }

    cursor = batch[batch.length - 1]!.id;
    console.log(
      `Processed ${decrypted + skipped + failed.length} rows (${decrypted} decrypted, ${skipped} plaintext, ${failed.length} failed)`,
    );
  }

  console.log(`Done. Decrypted: ${decrypted}, Skipped: ${skipped}, Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.error('Failed row IDs:', failed.join(', '));
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

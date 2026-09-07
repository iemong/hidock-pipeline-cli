import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 取り込み済みの録音を記録する。
 *
 * 判定キーはファイル名ではなく signature (MD5) を使う。
 * 同じ処理が繰り返し走ると同じノートが何通も生成され、
 * 「通知を無視する癖」がついてパイプライン全体が死ぬ。
 * これは前回 Decision OS が止まったのと同じ壊れ方なので、
 * 冪等性は最初から持たせておく。
 */

export interface ProcessedEntry {
  readonly signature: string;
  readonly name: string;
  readonly processedAt: string;
}

export interface ProcessedStore {
  readonly has: (signature: string) => boolean;
  readonly add: (entry: ProcessedEntry) => Promise<void>;
  readonly size: () => number;
}

function isEntry(value: unknown): value is ProcessedEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ProcessedEntry).signature === 'string'
  );
}

function parseEntries(raw: string): ProcessedEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    // 壊れた記録は空として扱う。読めないより再取り込みの方が害が小さい
    return [];
  }
}

export async function loadProcessedStore(filePath: string): Promise<ProcessedStore> {
  const entries = await readFile(filePath, 'utf8')
    .then(parseEntries)
    .catch(() => [] as ProcessedEntry[]);

  const known = new Set(entries.map((e) => e.signature));

  return {
    has: (signature) => known.has(signature),
    size: () => known.size,
    add: async (entry) => {
      if (known.has(entry.signature)) {
        return;
      }
      known.add(entry.signature);
      entries.push(entry);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    },
  };
}

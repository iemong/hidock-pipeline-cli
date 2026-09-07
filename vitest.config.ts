import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // 型定義のみのファイルは実行時コードを持たない
        'src/**/types.ts',
        // 実機 USB の I/O のみを担う層。ユニットテストでは到達できない。
        // 判断を含むロジックは stream.ts / protocol.ts に切り出してあり、
        // そちらは実機なしで検証している。
        'src/device/usb-transport.ts',
        // 外部コマンドを起動するだけの層。これを差し替えられるようにしてあり、
        // 利用側（probe / upload）は fake で全て検証している。
        'src/exec.ts',
        // 実行時の入口。処理は各モジュールに委譲しており分岐を持たない。
        'src/cli.ts',
      ],
      reporter: ['text', 'json-summary'],
      // 85% を下回ったら失敗する。ハーネスの中核なので緩めない。
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});

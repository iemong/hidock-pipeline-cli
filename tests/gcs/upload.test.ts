import { describe, expect, it } from 'vitest';

import { accessToken, uploadAudio } from '../../src/gcs/upload.ts';
import { fakeRunner } from '../support/fake-runner.ts';

const OPTIONS = {
  localPath: '/tmp/rec.hda',
  bucket: 'gs://proj-hidock',
  objectName: 'rec.mp3',
  project: 'proj',
};

describe('uploadAudio', () => {
  it('audio/ 配下の URI を返す', async () => {
    const uri = await uploadAudio(fakeRunner(), OPTIONS);
    expect(uri).toBe('gs://proj-hidock/audio/rec.mp3');
  });

  it('バケット末尾のスラッシュを重複させない', async () => {
    const uri = await uploadAudio(fakeRunner(), {
      ...OPTIONS,
      bucket: 'gs://proj-hidock//',
    });
    expect(uri).toBe('gs://proj-hidock/audio/rec.mp3');
  });

  it('gcloud storage cp を project 指定つきで呼ぶ', async () => {
    const runner = fakeRunner();
    await uploadAudio(runner, OPTIONS);

    expect(runner.calls[0]?.command).toBe('gcloud');
    expect(runner.calls[0]?.args).toEqual([
      'storage',
      'cp',
      '/tmp/rec.hda',
      'gs://proj-hidock/audio/rec.mp3',
      '--project=proj',
    ]);
  });

  it('アップロードに失敗したら例外を伝播する', async () => {
    const runner = fakeRunner({ gcloud: new Error('権限がない') });

    await expect(uploadAudio(runner, OPTIONS)).rejects.toThrow('権限がない');
  });
});

describe('accessToken', () => {
  it('gcloud のトークンを取り出す', async () => {
    const runner = fakeRunner({ gcloud: { stdout: 'ya29.token\n', stderr: '' } });

    await expect(accessToken(runner)).resolves.toBe('ya29.token');
    expect(runner.calls[0]?.args).toEqual(['auth', 'print-access-token']);
  });

  it('空なら案内つきで失敗させる', async () => {
    const runner = fakeRunner({ gcloud: { stdout: '  \n', stderr: '' } });

    await expect(accessToken(runner)).rejects.toThrow('gcloud auth login');
  });
});

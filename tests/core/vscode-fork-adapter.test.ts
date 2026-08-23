import { describe, expect, it } from 'vitest';

import { VSCodeForkAdapter } from '../../src/core/vscode-fork-adapter';

const options = {
  productName: 'Caval',
  applicationName: 'caval-studio',
  dataFolderName: '.caval',
};

describe('VSCodeForkAdapter', () => {
  it('constructs from public options and maps productConfiguration', () => {
    const adapter = new VSCodeForkAdapter(options);

    expect(adapter).toBeInstanceOf(VSCodeForkAdapter);

    const config = adapter.productConfiguration();
    expect(config).toEqual({
      nameShort: 'Caval',
      nameLong: 'Caval IDE',
      applicationName: 'caval-studio',
      dataFolderName: '.caval',
      extensionAllowedProposedApi: ['caval.ai', 'caval.context'],
    });
  });

  it('returns a stable product configuration snapshot for the same options', () => {
    const adapter = new VSCodeForkAdapter(options);
    const first = adapter.productConfiguration();
    const second = adapter.productConfiguration();

    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual([
      'nameShort',
      'nameLong',
      'applicationName',
      'dataFolderName',
      'extensionAllowedProposedApi',
    ]);
  });
});

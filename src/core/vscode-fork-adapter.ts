export interface VSCodeForkAdapterOptions {
  productName: string;
  applicationName: string;
  dataFolderName: string;
}

export class VSCodeForkAdapter {
  constructor(private readonly options: VSCodeForkAdapterOptions) {}

  productConfiguration() {
    return {
      nameShort: this.options.productName,
      nameLong: `${this.options.productName} IDE`,
      applicationName: this.options.applicationName,
      dataFolderName: this.options.dataFolderName,
      extensionAllowedProposedApi: ["caval.ai", "caval.context"]
    };
  }
}

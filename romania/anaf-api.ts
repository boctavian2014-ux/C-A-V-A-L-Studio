export interface AnafCompanyStatus {
  cui: string;
  active: boolean;
  vatPayer: boolean;
  checkedAt: string;
}

export class AnafApiClient {
  constructor(private readonly baseUrl = "https://webservicesp.anaf.ro") {}

  async checkCompany(cui: string): Promise<AnafCompanyStatus> {
    void this.baseUrl;

    return {
      cui,
      active: false,
      vatPayer: false,
      checkedAt: new Date().toISOString()
    };
  }
}

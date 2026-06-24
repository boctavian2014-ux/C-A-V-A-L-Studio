export interface OnrcCompany {
  cui: string;
  name: string;
  registrationNumber?: string;
  county?: string;
}

export class OnrcClient {
  async searchByName(name: string): Promise<OnrcCompany[]> {
    return [
      {
        cui: "pending-integration",
        name
      }
    ];
  }

  async searchByCui(cui: string): Promise<OnrcCompany | null> {
    return {
      cui,
      name: "Companie neconectata inca la ONRC"
    };
  }
}

export interface CavalAccount {
  id: string;
  email: string;
  displayName: string;
  plan: "community" | "pro" | "team" | "enterprise";
}

export class AccountService {
  private currentAccount: CavalAccount | null = null;

  signIn(account: CavalAccount): void {
    this.currentAccount = account;
  }

  getCurrentAccount(): CavalAccount | null {
    return this.currentAccount;
  }
}

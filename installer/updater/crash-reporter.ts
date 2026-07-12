import { crashReporter } from "electron";

export interface CrashReporterOptions {
  provider: "sentry" | "custom";
  submitUrl: string;
  productName?: string;
  companyName?: string;
  uploadToServer?: boolean;
}

export class CavalCrashReporter {
  start(options: CrashReporterOptions): void {
    crashReporter.start({
      productName: options.productName ?? "CAVALLO Studio",
      companyName: options.companyName ?? "CAVALLO Studio",
      submitURL: options.submitUrl,
      uploadToServer: options.uploadToServer ?? true,
      compress: true,
      extra: {
        provider: options.provider,
        channel: process.env.CAVAL_RELEASE_CHANNEL ?? "stable"
      }
    });
  }

  captureStackTrace(error: Error): Record<string, string> {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? ""
    };
  }
}

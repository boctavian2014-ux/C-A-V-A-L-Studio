export interface EFacturaDocument {
  id: string;
  cui: string;
  xml: string;
  status: "draft" | "submitted" | "accepted" | "rejected";
}

export class EFacturaService {
  validate(document: EFacturaDocument): string[] {
    const errors: string[] = [];

    if (!document.cui) {
      errors.push("CUI is required.");
    }

    if (!document.xml.trim().startsWith("<")) {
      errors.push("Invoice payload must be XML.");
    }

    return errors;
  }

  async submit(document: EFacturaDocument): Promise<EFacturaDocument> {
    const errors = this.validate(document);
    if (errors.length > 0) {
      return { ...document, status: "rejected" };
    }

    return { ...document, status: "submitted" };
  }
}

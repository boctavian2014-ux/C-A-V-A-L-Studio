import { describe, expect, it } from "vitest";
import { AnafApiClient } from "../../romania/anaf-api";
import { EFacturaService } from "../../romania/efactura";
import { OnrcClient } from "../../romania/onrc";
import { EducationMode } from "../../romania/education-mode";

describe("Romania layer", () => {
  it("AnafApiClient returns company status stub", async () => {
    const status = await new AnafApiClient().checkCompany("RO12345678");
    expect(status.cui).toBe("RO12345678");
    expect(status.checkedAt).toBeTruthy();
  });

  it("EFacturaService validates and submits XML invoices", async () => {
    const service = new EFacturaService();
    const doc = {
      id: "inv-1",
      cui: "12345678",
      xml: "<Invoice><Total>100</Total></Invoice>",
      status: "draft" as const
    };
    expect(service.validate(doc)).toHaveLength(0);
    const submitted = await service.submit(doc);
    expect(submitted.status).toBe("submitted");
  });

  it("EFacturaService rejects invalid invoice payloads", async () => {
    const rejected = await new EFacturaService().submit({
      id: "inv-2",
      cui: "",
      xml: "not-xml",
      status: "draft"
    });
    expect(rejected.status).toBe("rejected");
  });

  it("OnrcClient searches companies by CUI", async () => {
    const result = await new OnrcClient().searchByCui("12345678");
    expect(result?.cui).toBe("12345678");
  });

  it("EducationMode stores configured settings", () => {
    const mode = new EducationMode();
    const settings = mode.configure({ enabled: true, audience: "facultate" });
    expect(settings.enabled).toBe(true);
    expect(mode.current().audience).toBe("facultate");
  });
});

import { describe, expect, it } from "vitest";

import {
  EI_DATA,
  EI_NIDENT,
  ELFCLASS64,
  ELFDATA2LSB,
  ELFDATA2MSB,
  ELFDATANONE,
  ET_CORE,
  classifyElf64EiData,
  decodeElf64LeEtype,
  type ElfEiDataUnsupported,
} from "../../src/shared/core-dump-elf-audit";

/** LE ET_CORE (4) at Elf64_Ehdr.e_type — must not be read after EI_DATA reject. */
function identPlusLeEtCore(eiData: number): Uint8Array {
  const buf = new Uint8Array(EI_NIDENT + 2);
  buf[0] = 0x7f;
  buf[1] = 0x45;
  buf[2] = 0x4c;
  buf[3] = 0x46;
  buf[4] = ELFCLASS64;
  buf[EI_DATA] = eiData & 0xff;
  buf[EI_NIDENT] = ET_CORE & 0xff;
  buf[EI_NIDENT + 1] = 0;
  return buf;
}

function expectUnsupported(
  audit: ReturnType<typeof classifyElf64EiData>,
  raw: number,
  name: ElfEiDataUnsupported["core_elf_data_name"],
  reason: ElfEiDataUnsupported["core_elf_data_reject_reason"]
): asserts audit is ElfEiDataUnsupported {
  expect(audit.core_file_kind).toBe("elf_data_unsupported");
  expect(audit.core_elf_class).toBe(ELFCLASS64);
  expect(audit.core_elf_data).toBe(raw);
  expect(audit.core_elf_data_name).toBe(name);
  expect(audit.core_elf_data_reject_reason).toBe(reason);
  expect(audit.core_elf_machine).toBeNull();
  expect(audit.e_type).toBeNull();
  expect(audit.core_locator_result).toBe("reject_core_elf_data_unsupported");
  expect(audit.proceed_to_etype).toBe(false);
}

describe("core-dump ELF EI_DATA audit contract", () => {
  describe("branch EI_DATA = 1 (ELFDATA2LSB) — accepted", () => {
    it("allows proceeding to e_type and does not use elf_data_unsupported", () => {
      const audit = classifyElf64EiData(1);
      expect(audit.core_file_kind).toBe("elf_ident_lsb_accepted");
      expect(audit.core_elf_class).toBe(ELFCLASS64);
      expect(audit.core_elf_data).toBe(1);
      expect(audit.core_elf_data).toBe(ELFDATA2LSB);
      expect(audit.core_elf_data_name).toBe("ELFDATA2LSB");
      expect(audit.core_elf_data_reject_reason).toBeNull();
      expect(audit.core_elf_machine).toBeNull();
      expect(audit.e_type).toBeNull();
      expect(audit.core_locator_result).toBeNull();
      expect(audit.proceed_to_etype).toBe(true);
    });

    it("decodes little-endian e_type only on the accepted path", () => {
      const header = identPlusLeEtCore(1);
      const audit = classifyElf64EiData(header[EI_DATA]!);
      expect(decodeElf64LeEtype(header, audit)).toBe(ET_CORE);
    });
  });

  describe("branch EI_DATA = 2 (ELFDATA2MSB) — unimplemented", () => {
    it("rejects as valid-in-spec big-endian, unimplemented in audit", () => {
      const audit = classifyElf64EiData(2);
      expectUnsupported(audit, 2, "ELFDATA2MSB", "unimplemented");
      expect(audit.core_elf_data).toBe(ELFDATA2MSB);
    });

    it("does not forge ET_CORE from LE interpretation of header bytes", () => {
      const header = identPlusLeEtCore(2);
      const audit = classifyElf64EiData(2);
      expect(decodeElf64LeEtype(header, audit)).toBeNull();
      expect(audit.e_type).toBeNull();
    });
  });

  describe("branch EI_DATA = 0 (ELFDATANONE) — unspecified", () => {
    it("rejects unknown/invalid encoding without decoding e_type", () => {
      const audit = classifyElf64EiData(0);
      expectUnsupported(audit, 0, "ELFDATANONE", "unspecified");
      expect(audit.core_elf_data).toBe(ELFDATANONE);
    });

    it("does not forge ET_CORE from leftover header bytes", () => {
      const header = identPlusLeEtCore(0);
      const audit = classifyElf64EiData(0);
      expect(decodeElf64LeEtype(header, audit)).toBeNull();
    });
  });

  describe("branch EI_DATA ∉ {0,1,2} — invalid", () => {
    it.each([3, 4, 15, 255])(
      "rejects reserved/illegal EI_DATA=%s",
      (raw: number) => {
        const audit = classifyElf64EiData(raw);
        expectUnsupported(audit, raw, "invalid", "invalid");
        expect(decodeElf64LeEtype(identPlusLeEtCore(raw), audit)).toBeNull();
      }
    );
  });

  describe("four-branch table lock", () => {
    it("maps spec bytes to the canonical sidecar fields", () => {
      const rows = [
        {
          ei_data: 1,
          kind: "elf_ident_lsb_accepted",
          name: "ELFDATA2LSB",
          reason: null as const,
          proceed: true,
        },
        {
          ei_data: 2,
          kind: "elf_data_unsupported",
          name: "ELFDATA2MSB",
          reason: "unimplemented" as const,
          proceed: false,
        },
        {
          ei_data: 0,
          kind: "elf_data_unsupported",
          name: "ELFDATANONE",
          reason: "unspecified" as const,
          proceed: false,
        },
        {
          ei_data: 3,
          kind: "elf_data_unsupported",
          name: "invalid",
          reason: "invalid" as const,
          proceed: false,
        },
      ];

      for (const row of rows) {
        const audit = classifyElf64EiData(row.ei_data);
        expect(audit.core_file_kind, `ei_data=${row.ei_data}`).toBe(row.kind);
        expect(audit.core_elf_data_name).toBe(row.name);
        expect(audit.core_elf_data_reject_reason).toBe(row.reason);
        expect(audit.proceed_to_etype).toBe(row.proceed);
        expect(audit.e_type).toBeNull();
        expect(audit.core_elf_machine).toBeNull();
      }
    });
  });
});

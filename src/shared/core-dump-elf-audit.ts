/**
 * SIGABRT core-dump audit: classify ELF e_ident before any multi-byte decode.
 * Parser accepts only ELFCLASS64 + ELFDATA2LSB. EI_DATA is the rule for
 * interpreting ELF structures — do not read e_type / e_machine until LSB is confirmed.
 */

export const EI_NIDENT = 16;
export const EI_CLASS = 4;
export const EI_DATA = 5;

export const ELFCLASS64 = 2;
export const ELFDATA2LSB = 1;
export const ELFDATA2MSB = 2;
export const ELFDATANONE = 0;

export const ET_CORE = 4;

export type CoreElfDataName = "ELFDATA2LSB" | "ELFDATA2MSB" | "ELFDATANONE" | "invalid";
export type CoreElfDataRejectReason = "unimplemented" | "unspecified" | "invalid";

export type ElfEiDataAccepted = {
  core_file_kind: "elf_ident_lsb_accepted";
  core_elf_class: typeof ELFCLASS64;
  core_elf_data: typeof ELFDATA2LSB;
  core_elf_data_name: "ELFDATA2LSB";
  core_elf_data_reject_reason: null;
  core_elf_machine: null;
  e_type: null;
  core_locator_result: null;
  proceed_to_etype: true;
};

export type ElfEiDataUnsupported = {
  core_file_kind: "elf_data_unsupported";
  core_elf_class: typeof ELFCLASS64;
  core_elf_data: number;
  core_elf_data_name: Exclude<CoreElfDataName, "ELFDATA2LSB">;
  core_elf_data_reject_reason: CoreElfDataRejectReason;
  core_elf_machine: null;
  e_type: null;
  core_locator_result: "reject_core_elf_data_unsupported";
  proceed_to_etype: false;
};

export type ElfEiDataAudit = ElfEiDataAccepted | ElfEiDataUnsupported;

function elfDataNameAndReason(
  raw: number
): { name: CoreElfDataName; reason: CoreElfDataRejectReason | null } {
  if (raw === ELFDATA2LSB) return { name: "ELFDATA2LSB", reason: null };
  if (raw === ELFDATA2MSB) return { name: "ELFDATA2MSB", reason: "unimplemented" };
  if (raw === ELFDATANONE) return { name: "ELFDATANONE", reason: "unspecified" };
  return { name: "invalid", reason: "invalid" };
}

/** Contract for the four EI_DATA branches given ELFCLASS64 already holds. */
export function classifyElf64EiData(eiData: number): ElfEiDataAudit {
  const raw = eiData & 0xff;
  const { name, reason } = elfDataNameAndReason(raw);

  if (raw === ELFDATA2LSB && name === "ELFDATA2LSB" && reason === null) {
    return {
      core_file_kind: "elf_ident_lsb_accepted",
      core_elf_class: ELFCLASS64,
      core_elf_data: ELFDATA2LSB,
      core_elf_data_name: "ELFDATA2LSB",
      core_elf_data_reject_reason: null,
      core_elf_machine: null,
      e_type: null,
      core_locator_result: null,
      proceed_to_etype: true,
    };
  }

  return {
    core_file_kind: "elf_data_unsupported",
    core_elf_class: ELFCLASS64,
    core_elf_data: raw,
    core_elf_data_name: name as Exclude<CoreElfDataName, "ELFDATA2LSB">,
    core_elf_data_reject_reason: reason as CoreElfDataRejectReason,
    core_elf_machine: null,
    e_type: null,
    core_locator_result: "reject_core_elf_data_unsupported",
    proceed_to_etype: false,
  };
}

export function isElfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46
  );
}

/**
 * Decode Elf64_Ehdr.e_type as little-endian only after EI_DATA was accepted.
 * Returns null when the audit rejected EI_DATA (must not forge ET_CORE).
 */
export function decodeElf64LeEtype(header: Uint8Array, audit: ElfEiDataAudit): number | null {
  if (!audit.proceed_to_etype) return null;
  if (header.length < EI_NIDENT + 2) return null;
  return header[EI_NIDENT]! | (header[EI_NIDENT + 1]! << 8);
}

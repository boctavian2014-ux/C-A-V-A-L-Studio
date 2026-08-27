import { describe, expect, it, vi } from "vitest";

const popup = vi.fn();
const items = [
  { label: "File", submenu: { popup } },
  { label: "Edit", submenu: { popup } },
  { label: "", submenu: { popup } },
];

vi.mock("electron", () => ({
  Menu: {
    getApplicationMenu: () => ({ items }),
    setApplicationMenu: vi.fn(),
    buildFromTemplate: vi.fn((template: unknown) => template),
  },
}));

describe("application menu chrome helpers", () => {
  it("lists labeled top-level items for the in-renderer bar", async () => {
    const { listApplicationMenuTopLevel } = await import("../../src/main/app-menu");
    expect(listApplicationMenuTopLevel()).toEqual([
      { index: 0, label: "File" },
      { index: 1, label: "Edit" },
    ]);
  });

  it("pops the native submenu at the requested window coordinates", async () => {
    const { popupApplicationSubmenu } = await import("../../src/main/app-menu");
    const window = {} as never;
    expect(popupApplicationSubmenu(window, 1, 12.4, 40.6)).toBe(true);
    expect(popup).toHaveBeenCalledWith({ window, x: 12, y: 41 });
    expect(popupApplicationSubmenu(window, 9, 0, 0)).toBe(false);
  });
});

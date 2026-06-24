export interface EducationModeSettings {
  enabled: boolean;
  audience: "liceu" | "facultate" | "bootcamp" | "self-study";
  explainErrorsInRomanian: boolean;
  showStepByStepHints: boolean;
}

export class EducationMode {
  private settings: EducationModeSettings = {
    enabled: false,
    audience: "self-study",
    explainErrorsInRomanian: true,
    showStepByStepHints: true
  };

  configure(settings: Partial<EducationModeSettings>): EducationModeSettings {
    this.settings = {
      ...this.settings,
      ...settings
    };

    return this.settings;
  }

  current(): EducationModeSettings {
    return this.settings;
  }
}

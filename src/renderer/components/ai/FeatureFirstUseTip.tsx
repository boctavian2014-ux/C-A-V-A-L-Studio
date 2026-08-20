import React, { useEffect, useState } from "react";

import {
  FEATURE_TIP_COPY,
  hasSeenFeature,
  markFeatureSeen,
  type OnboardingFeature,
} from "../../store/onboarding-store";

/** One-shot tip for first use of an editor AI feature. localStorage only. */
export function FeatureFirstUseTip({
  feature,
  active,
  onDismiss,
}: {
  feature: OnboardingFeature;
  /** When false, tip stays hidden even if unseen. */
  active: boolean;
  onDismiss?: () => void;
}): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    setVisible(!hasSeenFeature(feature));
  }, [feature, active]);

  if (!visible) return null;

  const dismiss = () => {
    markFeatureSeen(feature);
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role="status"
      data-testid={`onboarding-tip-${feature}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        marginTop: 8,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid var(--caval-accent-ring, rgba(0,224,255,0.35))",
        background: "var(--caval-accent-glow, rgba(0,224,255,0.08))",
        color: "var(--caval-text, #e6edf3)",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      <span style={{ flex: 1 }}>{FEATURE_TIP_COPY[feature]}</span>
      <button
        type="button"
        data-testid={`onboarding-tip-dismiss-${feature}`}
        onClick={dismiss}
        aria-label="Dismiss tip"
        style={{
          flexShrink: 0,
          border: "none",
          background: "transparent",
          color: "var(--caval-text-muted, #8b949e)",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

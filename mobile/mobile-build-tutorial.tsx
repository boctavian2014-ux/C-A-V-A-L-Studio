import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";

export interface MobileBuildTutorialProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { title: "Create an Expo account", body: "Go to expo.dev and sign up.", command: "" },
  { title: "Login from terminal", body: "Authenticate Expo CLI.", command: "npx expo login" },
  { title: "Check project health", body: "Validate Expo project configuration.", command: "npx expo doctor" },
  { title: "Build Android (EAS)", body: "Recommended cloud build for Google Play.", command: "npx eas build --platform android" },
  { title: "Build iOS (EAS)", body: "Requires Apple Developer account.", command: "npx eas build --platform ios" },
  { title: "Upload to stores", body: "Use Google Play Console / App Store Connect.", command: "" },
  { title: "OTA updates", body: "Ship JS updates without store review.", command: "npx eas update --auto" }
];

export const MobileBuildTutorial = ({ open, onClose }: MobileBuildTutorialProps) => (
  <Modal open={open} onClose={onClose} title="How to publish your mobile app with Expo">
    <div className="cs-tutorial-video-placeholder pt-pulse mb-4">
      <div className="pulse-icon" />
      <p>Tutorial video coming soon</p>
      <small>CAVALLO Studio — Build. Ship. Publish.</small>
    </div>

    <ol className="cs-tutorial-steps">
      {STEPS.map((step, index) => (
        <li key={step.title}>
          <strong>{String(index + 1).padStart(2, "0")}. {step.title}</strong>
          <div>{step.body}</div>
          {step.command && <code>{step.command}</code>}
        </li>
      ))}
    </ol>

    <div className="cs-tutorial-note mt-4">
      CAVALLO Studio AI Agent explains build errors and can suggest fixes automatically.
    </div>

    <div className="mt-4 flex justify-end">
      <Button variant="ghost" size="sm" onClick={onClose}>
        Close
      </Button>
    </div>
  </Modal>
);

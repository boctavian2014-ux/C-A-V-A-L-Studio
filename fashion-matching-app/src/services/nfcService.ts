import NfcManager, { NdefReader } from 'react-native-nfc-manager';

export const initNFC = async (): Promise<boolean> => {
  try {
    const isEnabled = await NfcManager.isEnabled();
    if (!isEnabled) {
      await NfcManager.requestTechnology(NfcManager.NFC_TECHNOLOGY.NFC_FORUM_TYPE_2);
    }
    NfcManager.setEventListener(async (event) => {
      if (event.tag) {
        const ndef = event.tag.ndefMessage;
        if (ndef && ndef.length > 0) {
          const url = parseNdefUrl(ndef[0].payload);
          if (url) {
            return url;
          }
        }
      }
      return null;
    });
    return true;
  } catch (e) {
    console.error('NFC init error:', e);
    return false;
  }
};

export const readNFC = async (): Promise<string | null> => {
  try {
    await NfcManager.requestTechnology(NfcManager.NFC_TECHNOLOGY.NFC_FORUM_TYPE_2);
    const tag = await NfcManager.getTag();
    if (tag?.ndefMessage && tag.ndefMessage.length > 0) {
      const payload = tag.ndefMessage[0].payload;
      return parseNdefUrl(payload);
    }
    return null;
  } catch (e) {
    console.error('NFC read error:', e);
    return null;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
};

const parseNdefUrl = (payload: number[]): string | null => {
  try {
    const decoder = new TextDecoder('utf-8');
    const str = decoder.decode(new Uint8Array(payload));
    if (str.startsWith('https://') || str.startsWith('http://')) {
      return str;
    }
    return null;
  } catch {
    return null;
  }
};

export const cleanNFC = async (): Promise<void> => {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch (e) {
    // ignore cleanup errors
  }
};

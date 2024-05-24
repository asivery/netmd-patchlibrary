import { EEPROMData } from "./eeprom-format";
import { DeviceType } from "./interface";
import { getFromVersionStoreOrNull } from "./utils";

export type VersionPropertyStore = {
    [key: string]: EEPROMPatchContents;
};

export interface EEPROMPatchContents {
    address: number;
    value: Uint8Array;
    codeValue?: Uint8Array;
}

export type ErrorString = string;
export interface PatchStorage {
    hwidsAllowed?: number[];
    name: string;
    description: string;
    contents: { [version: string]: EEPROMPatchContents };
    isPlacementValid?: (systemState: EEPROMData, slot: number, type: 'code' | 'raw') => ErrorString[];
};

export function patchToEEPROM(patch: PatchStorage, device: DeviceType): EEPROMPatchContents | null {
    if(patch.hwidsAllowed){
        if(!patch.hwidsAllowed.includes(device.hwid)) return null;
    }

    const result = getFromVersionStoreOrNull(patch.contents, device.versionCode);
    return result?.value ?? null;
}

export const ERASE_PATCH: EEPROMPatchContents = {
    address: 0,
    value: new Uint8Array(4).fill(0),
};

export const ERASE_PATCH_WITH_CODE: EEPROMPatchContents = {
    codeValue: new Uint8Array(40).fill(0),
    address: 0,
    value: new Uint8Array(4).fill(0),
};

import { DevicesIds } from "netmd-js";
import { DeviceType } from "./interface";
import { EEPROMPatchContents, VersionPropertyStore } from "./patch";

export function getLEUint32(data: Uint8Array, offset: number = 0){
    return  (data[offset+0] << 0) |
            (data[offset+1] << 8) |
            (data[offset+2] << 16) |
            (data[offset+3] << 24);
}

export function getBEUint32(data: Uint8Array, offset: number = 0){
    return  (data[offset+3] << 0) |
            (data[offset+2] << 8) |
            (data[offset+1] << 16) |
            (data[offset+0] << 24);
}

export function getLEUint16(data: Uint8Array, offset: number = 0){
    return  (data[offset+0] << 0) |
            (data[offset+1] << 8);
}

export function getBEUint15(data: Uint8Array, offset: number = 0){
    return  (data[offset+1] << 0) |
            (data[offset+0] << 8);
}

export function getLEUint32AsBytes(num: number){
    return [(num >> 0) & 0xFF, (num >> 8) & 0xFF, (num >> 16) & 0xFF, (num >> 24) & 0xFF];
}

export function getBEUint32AsBytes(num: number){
    return [(num >> 24) & 0xFF, (num >> 16) & 0xFF, (num >> 8) & 0xFF, (num >> 0) & 0xFF];
}

export function getBEUint16AsBytes(num: number){
    return [(num >> 8) & 0xFF, (num >> 0) & 0xFF];
}

export function getLEUint16AsBytes(num: number){
    return [(num >> 0) & 0xFF, (num >> 8) & 0xFF];
}

export function hexify(data: Uint8Array): string{
    return Array.from(data).map(e => e.toString(16).padStart(2, '0')).join(' ').toUpperCase();
}

export function patchToString(patch: EEPROMPatchContents): string {
    return `Patch: At address 0x${patch.address.toString(16).padStart(8, '0')} - ${hexify(patch.value)}. Code ${patch.codeValue ? hexify(patch.codeValue) : '<none>'}`;
}

export function getFromVersionStoreOrNull(store: VersionPropertyStore, version: string) {
    /*
        Available formats are:
        - R1.600,
        - R1.600,R1.500
        - R*
        - *
    */
    let globalMatch = null,
        wildcardMatch = null,
        exactMatch = null;
    for (let key of Object.keys(store)) {
        let splitKeys = key.split(',');
        if (splitKeys.includes(version)) {
            exactMatch = key;
        }
        for (let splitKey of splitKeys) {
            splitKey = splitKey.trim();
            if (splitKey === '*') globalMatch = key;
            else if (isVersionMatchingFormat(splitKey, version)) wildcardMatch = key;
        }
    }
    let matched = exactMatch ?? wildcardMatch ?? globalMatch;
    if (matched === null) {
        return null;
    }
    return { value: store[matched], reason: matched };
}

export function isVersionMatchingFormat(format: string, version: string) {
    return new RegExp('^' + format.replace(/\*/g, '.*') + '$').test(version);
}

export function getFromVersionStore(store: VersionPropertyStore, version: string) {
    const value = getFromVersionStoreOrNull(store, version);
    if (value === null)
        throw new Error(`Cannot get data from version store. The version given (${version}) is incompatible`);
    return value;
}

export function deviceInfoToString(dev: DeviceType) {
    const a = (e: number) => '0x' + e.toString(16).padStart(4, '0');
    return `Name: ${DevicesIds.find(e => e.deviceId === dev.pid && e.vendorId === 0x054c)?.name}
PID: ${a(dev.pid)}
HWID: ${dev.hwid}
Version: ${dev.versionCode}
Front Patches Address: ${a(dev.frontPatchesLocation)}
Back Patches Address: ${a(dev.backPatchesLocation)}
F-Code Address: ${a(dev.fcodeLocation)}
NetMD Block Address: ${a(dev.netmdBlockLocation)}
System Data Length ${dev.dataSize ? a(dev.dataSize) : '<ALL>'}
Patches: ${dev.patchesCount}
Code Patches: ${dev.codePatchesCount}`;
}

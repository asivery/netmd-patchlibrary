import  * as patches from './patches';
import { PatchStorage, EEPROMPatchContents } from './patch';
import { getFromVersionStoreOrNull } from './utils';

const versionRange = (format: string, min: number, len: number) => Array(len).fill(0).map((_, e) => format.replace("X", (e + min).toString(16)));

const ALL_PATCHES: PatchStorage[] = Object.values(patches);
export const ALL_VERSIONS = ([] as string[])
    .concat(versionRange("S1.X00", 0, 7))
    .concat(versionRange("R1.X00", 0, 5))
    .concat(
        versionRange("Hn1.X00", 0, 3).concat(versionRange("Hn1.X0A", 1, 2))
    )
    .concat(["Hr1.000"])
    .concat(versionRange("Hx1.0X0", 4, 10));

type LookedUpPatch = { patch: PatchStorage, version: string };
export function lookup(contents: EEPROMPatchContents): { code: null | LookedUpPatch, raw: null | LookedUpPatch} {
    let rawPatch: null | LookedUpPatch = null;
    let codePatch: null | LookedUpPatch = null;
    function lookupPatch(predicate: (patch: PatchStorage, version: string) => boolean): LookedUpPatch | null {
        for(let patch of ALL_PATCHES) {
            for(let version of ALL_VERSIONS) {
                let lookupResult = getFromVersionStoreOrNull(patch.contents, version);
                if(lookupResult && predicate(patch, lookupResult.reason)) {
                    return { version: lookupResult.reason, patch };
                }
            }
        }
        return null;
    }

    if(contents.address !== 0) {
        rawPatch = lookupPatch((p, v) => p.contents[v].address === contents.address && p.contents[v].value.every((v, i) => contents.value[i] === v));
    }

    // Exists, and is non-empty
    if(contents.codeValue && contents.codeValue.some(e => e)) {
        codePatch = lookupPatch((p, v) => p.contents[v].codeValue?.every((v, i) => contents.codeValue![i] === v) ?? false);
    }

    return { code: codePatch, raw: rawPatch };
}

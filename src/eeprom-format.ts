import { calculateEEPROMChecksum } from "netmd-js";
import { concatUint8Arrays } from "netmd-js/dist/utils";
import { DeviceType } from "./interface";
import { lookup } from "./library";
import { VALID_NETMD_BLOCK } from "./netmd-block";
import { EEPROMPatchContents, ErrorString, PatchStorage, patchToEEPROM } from "./patch";
import { getLEUint16, getLEUint16AsBytes, getLEUint32, getLEUint32AsBytes } from "./utils";

export type CRCError = { address: number, expected: number, got: number}
export function stripCRCAndVerify(image: Uint8Array): { errors: CRCError[], data: Uint8Array } {
    const newImageSlices: Uint8Array[] = [];
    const errors: CRCError[] = [];
    for(let i = 0; i<image.length; i += 16){
        const slice = image.slice(i, i + 14);
        const sum = image[i + 14] | image[i + 15] << 8;
        const expectedSum = calculateEEPROMChecksum(slice);
        if(expectedSum !== sum) {
            errors.push({ address: i, expected: expectedSum, got: sum });
        }
        newImageSlices.push(slice);
    }

    return { errors, data: concatUint8Arrays(...newImageSlices) };
}

export function addCRCValues(strippedImage: Uint8Array): Uint8Array {
    const slices: Uint8Array[] = [];
    for(let i = 0; i<strippedImage.length; i += 14){
        const slice = new Uint8Array(16);
        const rawSlice = strippedImage.slice(i, i + 14);
        slice.set(rawSlice);
        const crc = calculateEEPROMChecksum(rawSlice);
        slice[14] = crc & 0xFF;
        slice[15] = (crc >> 8) & 0xFF;
        slices.push(slice);
    }
    return concatUint8Arrays(...slices);
}

export interface EEPROMRowDelta {
    bytesAddress: number,
    newData: Uint8Array,
};

export function createEEPROMDeltas(imageFrom: Uint8Array, imageTo: Uint8Array): EEPROMRowDelta[] {
    const deltas: EEPROMRowDelta[] = [];
    if(imageFrom.length !== imageTo.length) throw new Error("Length mismatch");
    for(let i = 0; i<imageFrom.length; i += 16){
        const rowA = imageFrom.slice(i, i + 16),
              rowB = imageTo.slice(i, i + 16);
        if(!rowA.every((v, i) => v === rowB[i])) {
            deltas.push({ bytesAddress: i, newData: rowB });
        }
    }
    return deltas;
}

export interface PatchStateError{
    patch: PatchStorage,
    slot: number,
    logs: ErrorString[],
    type: 'code' | 'raw',
}

// This class operates on images which have already been sliced.
export class EEPROMData {
    public image: Uint8Array;

    protected originalImage: Uint8Array;
    protected leftoverDataAfterDataSection: Uint8Array;
    protected _loadingErrors: CRCError[];

    public get loadingErrors(){ return this._loadingErrors; }

    constructor(image: Uint8Array, public deviceType: DeviceType) {
        const dataSize = deviceType.dataSize ?? image.byteLength;
        this.leftoverDataAfterDataSection = new Uint8Array(image.slice(dataSize));
        this.originalImage = new Uint8Array(image);
        const result = stripCRCAndVerify(image.slice(0, dataSize));
        this.image = result.data;
        this._loadingErrors = result.errors;
    }

    public createDeltas(){
        const withCRC = concatUint8Arrays(addCRCValues(this.image), this.leftoverDataAfterDataSection);
        const deltas = createEEPROMDeltas(this.originalImage, withCRC);
        this.originalImage.set(withCRC);
        return deltas;
    }

    public getPatchValue(slot: number): EEPROMPatchContents {
        if(slot >= this.deviceType.patchesCount) throw new Error("Reading beyond device patches");
        const frontPatchesLocation = this.deviceType.frontPatchesLocation + slot * 8;
        const address = getLEUint32(this.image, frontPatchesLocation);
        const value = this.image.slice(frontPatchesLocation + 4, frontPatchesLocation + 8);
        let codeValue;
        if(slot < this.deviceType.codePatchesCount) {
            const codePatchLocation = this.deviceType.frontPatchesLocation + 8 * this.deviceType.patchesCount + 4 + 40 * slot;
            codeValue = this.image.slice(codePatchLocation, codePatchLocation + 40);
        }
        return {
            address,
            value,
            codeValue,
        }
    }

    public writePatchValue(slot: number, value: EEPROMPatchContents) {
        if(slot >= this.deviceType.patchesCount) throw new Error("Writing beyond device patches");
        if(slot >= this.deviceType.codePatchesCount && value.codeValue) throw new Error(`Cannot write code patch to slot ${slot} - out of bounds!`);
        const frontPatchesLocation = this.deviceType.frontPatchesLocation + slot * 8;
        const backPatchesLocation = this.deviceType.backPatchesLocation + slot * 8;
        this.image.set(getLEUint32AsBytes(value.address), frontPatchesLocation);
        this.image.set(getLEUint32AsBytes(value.address), backPatchesLocation);
        this.image.set(value.value, frontPatchesLocation + 4);
        this.image.set(value.value, backPatchesLocation + 4);
        if(value.codeValue) {
            const codePatchFrontLocation = this.deviceType.frontPatchesLocation + 8 * this.deviceType.patchesCount + 4 + 40 * slot;
            const codePatchBackLocation = this.deviceType.backPatchesLocation + 8 * this.deviceType.patchesCount + 4 + 40 * slot;
            this.image.set(value.codeValue, codePatchFrontLocation);
            this.image.set(value.codeValue, codePatchBackLocation);
        }
    }

    public getFCode(): number {
        return getLEUint16(this.image, this.deviceType.fcodeLocation);
    }

    public setFCode(fcode: number) {
        this.image.set(getLEUint16AsBytes(fcode), this.deviceType.fcodeLocation);
    }

    public rewriteNetMDBlock(){
        this.image.set(VALID_NETMD_BLOCK, this.deviceType.netmdBlockLocation);
    }

    public applyPatch(patch: PatchStorage, slot: number) {
        let patchContents = patchToEEPROM(patch, this.deviceType);
        if(!patchContents) throw new Error("Patch incompatible!");
        this.writePatchValue(slot, patchContents);
    }

    // Helper methods:
    public hasPatch(patch: PatchStorage, checkField: 'code' | 'raw' = 'raw'): boolean {
        for(let patchSlot = 0; patchSlot < this.deviceType.patchesCount; patchSlot++){
            let patchContents = this.getPatchValue(patchSlot);
            let id = lookup(patchContents);
            if(checkField === 'raw'){
                if(id.raw?.patch === patch) return true;
            }
            if(checkField === 'code'){
                if(id.code?.patch === patch) return true;
            }
        }
        return false;
    }

    public isStateValid(): PatchStateError[]{
        let errors: PatchStateError[] = [];
        for(let patchSlot = 0; patchSlot < this.deviceType.patchesCount; patchSlot++){
            // Try to look patch up.
            let id = lookup(this.getPatchValue(patchSlot));
            if(id.code){
                let logs = id.code.patch.isPlacementValid?.(this, patchSlot, 'code') || [];
                if(logs.length){
                    errors.push({ logs, patch: id.code.patch, slot: patchSlot, type: 'code'})
                }
            }
            if(id.raw){
                let logs = id.raw.patch.isPlacementValid?.(this, patchSlot, 'raw') || [];
                if(logs.length){
                    errors.push({ logs, patch: id.raw.patch, slot: patchSlot, type: 'raw'})
                }
            }
        }

        return errors;
    }
}

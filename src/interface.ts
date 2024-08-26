import { cleanRead, cleanWrite, getDescriptiveDeviceCode, MemoryType, NetMDFactoryInterface, NetMDInterface, writeOfAnyLength } from "netmd-js";
import { concatUint8Arrays } from "netmd-js/dist/utils";
import { EEPROMRowDelta } from "./eeprom-format";

interface Hardware {
    read(address: number, length: number, callback?: (done: number, of: number) => void): Promise<Uint8Array>;
    write(address: number, data: Uint8Array, callback?: (done: number, of: number) => void): Promise<void>;
    size: number;

    info: {
        eepromType: number,
        wordIs16Bit: boolean
    };
}

interface BaseType {
    isHimd: boolean;
    backPatchesLocation: number;
    codePatchesCount: number;
    fcodeLocation: number;
    frontPatchesLocation: number;
    netmdBlockLocation: number;
    patchesCount: number;
    dataSize?: number;
}

const BaseS32K: BaseType = {
    isHimd: false,
    netmdBlockLocation: 0x47c,
    codePatchesCount: 8, //?
    patchesCount: 8,
    frontPatchesLocation: 0xb6,
    backPatchesLocation: 0x2f4,
    fcodeLocation: 0x89,

    dataSize: 0x840,
}

const BaseS16K: BaseType = {
    isHimd: false,
    backPatchesLocation: 0x2e6,
    codePatchesCount: 6,
    fcodeLocation: 0x140,
    frontPatchesLocation: 0x1b2,
    netmdBlockLocation: 0x460,
    patchesCount: 8,
}

const BaseR16K: BaseType = {
    isHimd: false,
    frontPatchesLocation: 0xe0,
    backPatchesLocation: 0x302,
    patchesCount: 4,
    codePatchesCount: 4,
    netmdBlockLocation: 0x444,
    fcodeLocation: 0x89
}

class TypeS32KBitHW implements Hardware {
    info = { eepromType: 2, wordIs16Bit: false };
    size = 4096;

    constructor(private iface: NetMDInterface, private factory: NetMDFactoryInterface){}

    async read(address: number, length: number, callback?: (done: number, of: number) => void){
        const data: Uint8Array[] = [];
        for(let addr = address; addr < address+length; addr += 0x10) {
            data.push(await cleanRead(this.factory, addr, 0x10, MemoryType.EEPROM_2, true, true));
            callback?.(addr - address + 0x10, length);
        }

        let merged = concatUint8Arrays(...data);
        return merged;
    }

    async write(address: number, data: Uint8Array, callback?: (done: number, of: number) => void){
        return writeOfAnyLength(this.factory, address, data, MemoryType.EEPROM_2, true);
    }
}

class TypeS16KBitHW implements Hardware {
    info = { eepromType: 3, wordIs16Bit: true };
    size = 2048;

    constructor(private iface: NetMDInterface, private factory: NetMDFactoryInterface){}

    async read(address: number, length: number, callback?: (done: number, of: number) => void){
        const actualAddress = Math.floor(address / 2);
        const isAddressOffset = address & 1;
        const actualLength = Math.ceil(length / 2);
        const isLengthOffset = length & 1;
        
        const data: Uint8Array[] = [];
        for(let addr = actualAddress; addr < actualLength+actualAddress; addr += 8) {
            data.push(await cleanRead(this.factory, addr, 0x10, MemoryType.EEPROM_3, true, true));
            callback?.(addr - actualAddress + 8, actualLength);
        }

        let merged = concatUint8Arrays(...data);
        if(isAddressOffset) merged = merged.slice(1);
        if(isLengthOffset) merged = merged.slice(0, -1);
        return merged;
    }

    async write(address: number, data: Uint8Array, callback?: (done: number, of: number) => void){
        const actualAddress = Math.floor(address / 2);
        const isAddressOffset = address & 1;
        const actualLength = Math.ceil(data.length / 2);
        const isLengthOffset = data.length & 1;

        if(isAddressOffset || isLengthOffset) throw new Error("Alignment error!");

        for(let addr = 0; addr < actualLength; addr += 8) {
            await cleanWrite(this.factory, addr + actualAddress, data.slice(addr * 2, addr * 2 + 16), MemoryType.EEPROM_3, true, true);
            callback?.(addr + 8, actualLength);
        }

    }
}

class TypeR16KBitHW implements Hardware {
    info = { eepromType: 2, wordIs16Bit: true };
    size = 2048;

    constructor(private iface: NetMDInterface, private factory: NetMDFactoryInterface){}

    async read(address: number, length: number, callback?: (done: number, of: number) => void){
        const actualAddress = Math.floor(address / 2);
        const isAddressOffset = address & 1;
        const actualLength = Math.ceil(length / 2);
        const isLengthOffset = length & 1;
        
        const data: Uint8Array[] = [];
        for(let addr = actualAddress; addr < actualLength+actualAddress; addr += 8) {
            data.push(await cleanRead(this.factory, addr, 0x10, MemoryType.EEPROM_2, true, true));
            callback?.(addr - actualAddress + 8, actualLength);
        }

        let merged = concatUint8Arrays(...data);
        if(isAddressOffset) merged = merged.slice(1);
        if(isLengthOffset) merged = merged.slice(0, -1);
        return merged;
    }

    async write(address: number, data: Uint8Array, callback?: (done: number, of: number) => void){
        const actualAddress = Math.floor(address / 2);
        const isAddressOffset = address & 1;
        const actualLength = Math.ceil(data.length / 2);
        const isLengthOffset = data.length & 1;

        if(isAddressOffset || isLengthOffset) throw new Error("Alignment error!");

        for(let addr = 0; addr < actualLength; addr += 8) {
            await cleanWrite(this.factory, addr + actualAddress, data.slice(addr * 2, addr * 2 + 16), MemoryType.EEPROM_2, true, true);
            callback?.(addr + 8, actualLength);
        }

    }
}

export interface DeviceType {
    versionCode: string;
    pid: number;
    hwid: number;
    isHimd: boolean;

    frontPatchesLocation: number,
    backPatchesLocation: number,
    patchesCount: number,
    codePatchesCount: number,
    fcodeLocation: number,
    netmdBlockLocation: number,
    
    // Whatever data comes after dataSize will not be changed.
    dataSize?: number,
}

export class DeviceConnection {
    private constructor(
        private hardware: Hardware,
        public iface: NetMDInterface,
        private factoryIface: NetMDFactoryInterface,
        private version: DeviceType
    ){}

    public static async create(iface: NetMDInterface): Promise<DeviceConnection> {
        if(iface.netMd.getVendor() !== 0x054c) throw new Error("The device connected is not a Sony - this library only supports Sony devices!");
        const factoryIface = await iface.factory();
        const deviceInfo = await factoryIface.getDeviceCode();
        const versionCode = await getDescriptiveDeviceCode(deviceInfo);
        const hardwareConstructor = PID_MAP[iface.netMd.getProduct()];
        if(!hardwareConstructor) throw new Error("This device is not supported!");
        const hardware = new hardwareConstructor[0](iface, factoryIface);
        
        return new DeviceConnection(
            hardware,
            iface,
            factoryIface,
            {
                hwid: deviceInfo.hwid,
                isHimd: versionCode.startsWith("H"),
                versionCode
            } as any // TODO
        );
    }

    public get name(): string {
        return this.iface.netMd.getDeviceName();
    }

    public async readWholeEEPROM(callback?: (done: number, of: number) => void): Promise<Uint8Array> {
        return this.hardware.read(0, this.hardware.size, callback);
    }

    public async writeWholeEEPROM(image: Uint8Array, callback?: (done: number, of: number) => void): Promise<void> {
        if(image.length !== this.hardware.size) throw new Error("Cannot apply EEPROM image! Size mismatch!");
        return this.hardware.write(0, image, callback);
    }

    public async writeDeltas(deltas: EEPROMRowDelta[], callback?: (done: number, of: number) => void) {
        for(let i = 0; i<deltas.length; i++){
            const delta = deltas[i];
            await this.hardware.write(delta.bytesAddress, delta.newData);
            callback?.(i + 1, deltas.length);
        }
    }

    private async getDeviceInfo(): Promise<{ hwid: number, versionCode: string }> {
        const deviceInfo = await this.factoryIface.getDeviceCode();
        const versionCode = await getDescriptiveDeviceCode(deviceInfo);
        return { hwid: deviceInfo.hwid, versionCode };
    }

    public getVidPid(): { vid: number, pid: number } {
        return { vid: this.iface.netMd.getVendor(), pid: this.iface.netMd.getProduct() };
    }

    public async getDeviceType(): Promise<DeviceType> {
        const vidPid = this.getVidPid();
        const info = await this.getDeviceInfo();
    
        const base = PID_MAP[vidPid.pid][1];
        if(!base) {
            throw new Error("Device not supported!");
        }
    
        return { ...base, ...info, pid: vidPid.pid };
    }
}

export function getDeviceTypeFor(pid: number, versionCode: string, hwid: number): DeviceType {
    if(!(pid in PID_MAP)) throw new Error("Not supported!");
    return { ...PID_MAP[pid][1], versionCode, hwid, pid };
}

/*
Cheat Sheet:
- AK6510CL - https://www.onsemi.com/pdf/datasheet/cat25320-d.pdf - 32kBit 8-bit-word
- AK6417AL - https://www.digikey.com/en/products/detail/asahi-kasei-microdevices-akm/AK6417AL/6100002 - 16kBit 16-bit-word
*/

const PID_MAP: { [pid: number]: [new (iface: NetMDInterface, factoryIface: NetMDFactoryInterface) => Hardware, BaseType] } = {
    0x0113: [TypeS32KBitHW, BaseS32K], // AIWA AM-NX1
    0x014c: [TypeS16KBitHW, BaseS16K], // AIWA AM-NX9
    // MZ-DN430 - to verify - PID unknown, S16K, 16-byte-word?
    // MZ-N1 - to verify! - PID 0x0075, R16K, 16-byte-word? Modes 2/3
    0x00c6: [TypeS32KBitHW, BaseS32K], // MZ-N10
    // MZ-N420D - to verify - PID unknown, S16K, 16-byte-word?
    0x0084: [TypeR16KBitHW, BaseR16K], // MZ-N505
    0x00c9: [TypeS16KBitHW, BaseS16K], // MZ-N510 == MZ-N520 == MZ-NF610
    0x0086: [TypeR16KBitHW, BaseR16K], // MZ-N707 - MLB shared with N505
    0x00c8: [TypeS32KBitHW, BaseS32K], // MZ-N710 == MZ-NF810
    0x00c7: [TypeS32KBitHW, BaseS32K], // MZ-N910
    0x0188: [TypeS32KBitHW, BaseS32K], // MZ-N920 - arch shared with N910
    0x00ca: [TypeS16KBitHW, BaseS16K], // MZ-NE410 == MZ-NF520D
    // MZ-NE810 - to verify - PID 0x00eb, NO SERVICE MANUAL - UNSUPPORTED for now
    // MZ-NF520 - to verify - PID unknown, S16K, 16-byte-word?

    0x0085: [TypeR16KBitHW, BaseR16K], // MZ-S1 - MLB shared with N505
};

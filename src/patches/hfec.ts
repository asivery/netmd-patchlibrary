import { PatchStorage } from "../patch";

export const HFEC: PatchStorage = {
    name: "HFEC",
    description: "Handle-Fault EEPROM Corruption patch - disables Sony debug code which bricks devices when power is suddenly removed",
    contents: {
        "S1.000,S1.600,S1.500,S1.400": {
            address: 0x000000C4,
            value: new Uint8Array([0xdc, 0xff, 0xff, 0xea]),
        }
    }
};

export default HFEC;

import { EEPROMData } from "../eeprom-format";
import { PatchStorage } from "../patch";

const ERROR = "Two-stage USB Code Execution Patch requres both parts loaded at the same time";

export const USBCodeExecutionTwoPatchPartOne: PatchStorage = {
    name: "Two-stage USB Code Execution Patch (Developer Patch) (Part 1)",
    description: "The first USB code execution patch",
    contents: {
        "S1.600": {
            address: 0x0000e69c,
            value: new Uint8Array([0x08, 0x48, 0x00, 0x47]),
        }
    },
    isPlacementValid: (state: EEPROMData) => state.hasPatch(USBCodeExecutionTwoPatchPartTwo) ? [] : [ ERROR ],
};

export const USBCodeExecutionTwoPatchPartTwo: PatchStorage = {
    name: "Two-stage USB Code Execution Patch (Developer Patch) (Part 2)",
    description: "The first USB code execution patch",
    contents: {
        "S1.600": {
            address: 0x0000e6c0,
            value: new Uint8Array([0x74, 0x11, 0x00, 0x02]),
        }
    },
    isPlacementValid: (state: EEPROMData) => state.hasPatch(USBCodeExecutionTwoPatchPartOne) ? [] : [ ERROR ],
};


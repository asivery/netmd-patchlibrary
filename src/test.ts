import { openNewDevice } from "netmd-js";
import { WebUSB } from 'usb';
import { DeviceConnection, DeviceType, getDeviceTypeFor } from "./interface";
import fs from 'fs';
import { addCRCValues, createEEPROMDeltas, EEPROMData, stripCRCAndVerify } from "./eeprom-format";
import { ALL_VERSIONS, lookup } from "./library";
import { deviceInfoToString, hexify, patchToString } from "./utils";
import { HFEC } from "./patches";
(async () => {
    const usb = new WebUSB({ allowAllDevices: true, deviceTimeout: 1000000 });
    const device = await openNewDevice(usb);
    if(!device) {
        console.log('no');
        return;
    }
    const manager = await DeviceConnection.create(device);
    console.log("Init ok");
    const contents = await manager.readWholeEEPROM((done, _of) => console.log(`Reading EEPROM: ${done} / ${_of}`));
    fs.writeFileSync("/ram/eepromn710.bin", contents);

    const myDevice = await manager.getDeviceType(); // getDeviceTypeFor(0x00c8, "S1.600", 3);
    const data = new EEPROMData(fs.readFileSync("/ram/eepromn710.bin"), myDevice);
    fs.writeFileSync("/ram/stripped.bin", data.image);
    console.log(`EEPROM Verification errors: ${JSON.stringify(data.loadingErrors)}`);
    console.log(deviceInfoToString(myDevice))
    //data.applyPatch(HFEC, 7);

    for(let i = 0; i<data.deviceType.patchesCount; i++){
        let patchInfo = data.getPatchValue(i);
        console.log(patchToString(patchInfo));
        console.log(`ID: ${JSON.stringify(lookup(patchInfo))}`);
    }

    const deltas = data.createDeltas();
    for(let delta of deltas){
        console.log(`Delta: At address 0x${delta.bytesAddress.toString(16).padStart(4, '0')}, ${hexify(delta.newData)}`);
    }
    console.log(`Writing...`);
    //await manager.writeDeltas(deltas, (d, o) => console.log(`Write EEPROM delta: ${d} / ${o}`));
})().then(() => process.exit());

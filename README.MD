# netmd-patchlibrary

This library aims to provide both a library of, and a way to apply, patches to Sony NetMD devices.

The library aims to provide a simple interface to read and write NetMD devices' EEPROM images,
as well as a means to edit them in a programmer-friendly way.

As of right now, `netmd-patchlibrary` can:
- Read and write any patch to any supported device
- Read and write custom FCode values (enable / disable some additional functionalities)
- Detect CRC errors, and repair them
- Rewrite the NetMD EEPROM block

## How to use?

Example code:

```typescript
// [Node.js-only] Create WebUSB object
const usb = new WebUSB({ allowAllDevices: true, deviceTimeout: 1000000 });
// Create netmd-js' context
const device = await openNewDevice(usb);
if(!device) {
    console.log('No device present');
    return;
}

// Create patchlibrary connection
const connection = await DeviceConnection.create(device);
const deviceType = await connection.getDeviceType();
console.log("Device connected:");
console.log(deviceInfoToString(deviceType));
const eepromImage = await connection.readWholeEEPROM(
    (completed: number, outOf: number) => console.log(`Reading EEPROM: ${completed} / ${outOf}`)
);

// Create patchlibrary context
// If you are working on an EEPROM image file, you can create the deviceType based on
// The device's PID, FW Version and HWID fields:
// const deviceType = getDeviceTypeFor(0x00C8, "S1.600", 3);

const data = new EEPROMData(eepromImage, deviceType);
console.log(`EEPROM Verification errors: ${JSON.stringify(data.loadingErrors)}`);

// To read the patches:
for(let i = 0; i<data.deviceType.patchesCount; i++){
    let patchInfo = data.getPatchValue(i);
    console.log(patchToString(patchInfo));
    console.log(`ID: ${JSON.stringify(lookup(patchInfo))}`);
}

// To write a patch to a specified slot:
data.applyPatch(HFEC, 7);

// To get the original image back you can either:
// - Use the currently cached stripped image from data:
const strippedImage = data.image;
// then rewrite the CRC values:
const complete = addCRCValues(strippedImage);
// - Create deltas between the current state, and the original image:
const deltas = data.createDeltas();
// then either apply these deltas to the device:
await connection.writeDeltas(deltas, (completed: number, outOf: number) => console.log(`Write EEPROM delta: ${completed} / ${outOf}`));
// - After calling createDeltas(), read the `originalImage` field.
// Running createDeltas() causes the EEPROMData class to treat the current
// state as the original one, so that when called multiple times, it will
// always only return the changes since the last call.
const complete2 = data.originalImage;
```

# What patches are available?

To see what patches are currently available, please see [this list](patches.md).

# Contributions

Any and all contributions are always welcome!


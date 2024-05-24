import * as patches from './src/patches/index';
import fs from 'fs';
import type { PatchStorage } from './src/patch';

let document = `
# The Available Patches:

| **Name** | **JS Object Name** | **Description** | **Versions Supported** | **HWIDs supported** |
|----------|--------------------|-----------------|------------------------|---------------------|
`

for(let jsName in patches){
    console.log(jsName);
    const patch: PatchStorage = (patches as any)[jsName];
    const supportedVersions = Object.keys(patch.contents).join(',')
    document += 
    `| ${patch.name} | ${jsName} | ${patch.description} | ${supportedVersions} | ${(patch.hwidsAllowed || ["**ALL**"]).join(', ')} |\n`
}

fs.writeFileSync("patches.md", document);
